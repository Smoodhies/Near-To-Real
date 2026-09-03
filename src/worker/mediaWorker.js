import MediaAsset from "../models/MediaAsset.js";
import MediaJob from "../models/MediaJob.js";

import { ProcessingResult } from "./processingResult.js";

export class MediaWorker {
  constructor({ processor, workspace, processingLeaseTimeoutMs = 3600000, maxAttempts = 3 }) {
    if (!processor) {
      throw new Error("MediaWorker requires MediaProcessor");
    }

    if (!workspace) {
      throw new Error("MediaWorker requires JobWorkspace");
    }

    this.processor = processor;
    this.workspace = workspace;

    this.processingLeaseTimeoutMs = Number(processingLeaseTimeoutMs);
    this.maxAttempts = Number(maxAttempts);

    if (!Number.isFinite(this.processingLeaseTimeoutMs) || this.processingLeaseTimeoutMs <= 0) {
      throw new Error("processingLeaseTimeoutMs must be greater than 0");
    }

    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error("maxAttempts must be >= 1");
    }
  }

  async execute(job, workspace) {
    if (!job?.jobId) {
      throw new Error("MediaWorker requires jobId");
    }

    if (!job?.assetId) {
      throw new Error("MediaWorker requires assetId");
    }

    if (!workspace?.root) {
      throw new Error("MediaWorker requires workspace");
    }

    /*
     * --------------------------------------------------
     * CLAIM JOB
     * --------------------------------------------------
     *
     * Only one worker is allowed to claim the job.
     *
     * QUEUED:
     *     normal first attempt
     *
     * FAILED:
     *     retry
     *
     * PROCESSING + stale lease:
     *     recover crashed worker
     */

    const staleBefore = new Date(Date.now() - this.processingLeaseTimeoutMs);

    const claimedJob = await MediaJob.findOneAndUpdate(
      {
        jobId: job.jobId,

        $or: [
          {
            status: "QUEUED",
          },

          {
            status: "FAILED",

            attemptCount: {
              $lt: this.maxAttempts,
            },
          },

          {
            status: "PROCESSING",

            processingLeaseAt: {
              $lt: staleBefore,
            },
          },
        ],
      },
      {
        $set: {
          status: "PROCESSING",

          startedAt: new Date(),

          processingLeaseAt: new Date(),

          workspacePath: workspace.root,

          maxAttempts: this.maxAttempts,

          error: {
            message: null,
            stack: null,
            code: null,
            retryable: true,
            attempt: 0,
          },
        },

        $inc: {
          attemptCount: 1,
        },
      },
      {
        returnDocument: "after",
      }
    );

    /*
     * Another worker already owns this job.
     */

    if (!claimedJob) {
      const currentJob = await MediaJob.findOne({
        jobId: job.jobId,
      }).lean();

      if (!currentJob) {
        throw new Error(`Media job not found: ${job.jobId}`);
      }

      if (currentJob.status === "COMPLETED") {
        return new ProcessingResult({
          jobId: currentJob.jobId,

          status: "COMPLETED",

          manifestPath: null,

          ffprobePath: null,

          outputs: [],

          media: null,

          workspace: workspace.root,
        });
      }

      throw new Error(`JOB_ALREADY_CLAIMED:${job.jobId}:${currentJob.status}`);
    }

    const attempt = claimedJob.attemptCount;

    job.status = "PROCESSING";

    /*
     * Keep the actual attempt count available to the
     * processor/result layer.
     */

    job.attemptCount = attempt;

    try {
      /*
       * ------------------------------------------------
       * ASSET → PROCESSING
       * ------------------------------------------------
       */

      await MediaAsset.updateOne(
        {
          assetId: job.assetId,

          /*
           * Do not overwrite a deleted asset.
           */
          status: {
            $ne: "DELETED",
          },
        },
        {
          $set: {
            status: "PROCESSING",

            processingJobId: job.jobId,
          },
        }
      );

      /*
       * ------------------------------------------------
       * PROCESS
       * ------------------------------------------------
       */

      const processorResult = await this.processor.process({
        inputPath: job.source.path,

        jobId: job.jobId,

        assetId: job.assetId,

        source: job.sourceMetadata ?? null,
      });

      /*
       * ------------------------------------------------
       * SUCCESS
       * ------------------------------------------------
       */

      job.status = "COMPLETED";

      await MediaJob.updateOne(
        {
          jobId: job.jobId,

          status: "PROCESSING",
        },
        {
          $set: {
            status: "COMPLETED",

            completedAt: new Date(),

            processingLeaseAt: null,

            error: {
              message: null,
              stack: null,
              code: null,
              retryable: false,
              attempt,
            },
          },
        }
      );

      await MediaAsset.updateOne(
        {
          assetId: job.assetId,

          status: {
            $ne: "DELETED",
          },
        },
        {
          $set: {
            status: "READY",
          },
        }
      );

      return new ProcessingResult({
        jobId: job.jobId,

        status: job.status,

        manifestPath: processorResult.manifestPath,

        ffprobePath: processorResult.ffprobePath,

        outputs: processorResult.outputs,

        media: processorResult.media,

        workspace: workspace.root,
      });
    } catch (error) {
      /*
       * ------------------------------------------------
       * PROCESSING FAILURE
       * ------------------------------------------------
       */

      const currentAttempt = attempt;

      const reachedMaxAttempts = currentAttempt >= this.maxAttempts;

      const errorMessage = error?.message ?? "Unknown processing error";

      const errorStack = error?.stack ?? null;

      const errorCode = error?.code ?? null;

      /*
       * ------------------------------------------------
       * RETRYABLE
       * ------------------------------------------------
       *
       * We deliberately treat processing exceptions
       * as retryable by default.
       *
       * Permanent validation errors should eventually
       * reach maxAttempts and become FAILED.
       */

      if (reachedMaxAttempts) {
        job.status = "FAILED";

        await MediaJob.updateOne(
          {
            jobId: job.jobId,

            status: "PROCESSING",
          },
          {
            $set: {
              status: "FAILED",

              completedAt: new Date(),

              processingLeaseAt: null,

              error: {
                message: errorMessage,

                stack: errorStack,

                code: errorCode,

                retryable: false,

                attempt: currentAttempt,
              },
            },
          }
        );

        await MediaAsset.updateOne(
          {
            assetId: job.assetId,

            status: {
              $ne: "DELETED",
            },
          },
          {
            $set: {
              status: "FAILED",
            },
          }
        );
      } else {
        /*
         * ------------------------------------------------
         * RETRY
         * ------------------------------------------------
         *
         * Keep the job QUEUED.
         *
         * The SQS message is NOT deleted by the consumer.
         *
         * SQS therefore redelivers it.
         */

        job.status = "QUEUED";

        await MediaJob.updateOne(
          {
            jobId: job.jobId,

            status: "PROCESSING",
          },
          {
            $set: {
              status: "QUEUED",

              processingLeaseAt: null,

              error: {
                message: errorMessage,

                stack: errorStack,

                code: errorCode,

                retryable: true,

                attempt: currentAttempt,
              },
            },
          }
        );

        await MediaAsset.updateOne(
          {
            assetId: job.assetId,

            status: "PROCESSING",
          },
          {
            $set: {
              status: "UPLOADED",
            },
          }
        );

        console.warn("Media processing failed; job will retry:", {
          jobId: job.jobId,

          assetId: job.assetId,

          attempt: currentAttempt,

          maxAttempts: this.maxAttempts,

          error: errorMessage,
        });
      }

      throw error;
    }
  }
}
