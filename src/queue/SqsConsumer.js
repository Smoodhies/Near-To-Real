import { ProcessingJob } from "../worker/processingJob.js";
import { S3EventParser } from "./S3EventParser.js";
import MediaJob from "../models/MediaJob.js";

export class SqsConsumer {
  constructor({
    queueService,
    worker,
    storage,
    workspace,
    assetVerification,
    parser = new S3EventParser(),
    concurrency = 2,
    visibilityTimeout = 1800,
  }) {
    if (!queueService) {
      throw new Error("SqsConsumer requires queueService");
    }

    if (!worker) {
      throw new Error("SqsConsumer requires worker");
    }

    if (!storage) {
      throw new Error("SqsConsumer requires storage");
    }

    if (!workspace) {
      throw new Error("SqsConsumer requires workspace");
    }

    if (!assetVerification) {
      throw new Error("SqsConsumer requires assetVerification");
    }

    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("SqsConsumer concurrency must be >= 1");
    }

    if (!Number.isInteger(visibilityTimeout) || visibilityTimeout < 30) {
      throw new Error("visibilityTimeout must be >= 30 seconds");
    }

    this.queueService = queueService;
    this.worker = worker;
    this.storage = storage;
    this.workspace = workspace;
    this.assetVerification = assetVerification;
    this.parser = parser;

    this.concurrency = concurrency;
    this.visibilityTimeout = visibilityTimeout;

    this.running = false;
    this.activeJobs = 0;
  }

  async start() {
    if (this.running) {
      return;
    }

    this.running = true;

    console.log(`SQS consumer started. Concurrency: ${this.concurrency}`);

    while (this.running) {
      try {
        if (this.activeJobs >= this.concurrency) {
          await this.#sleep(100);

          continue;
        }

        const availableSlots = this.concurrency - this.activeJobs;

        const messages = await this.queueService.receive({
          maxNumberOfMessages: Math.min(availableSlots, 10),

          waitTimeSeconds: 20,

          visibilityTimeout: this.visibilityTimeout,
        });

        if (!messages?.length) {
          continue;
        }

        for (const message of messages) {
          if (this.activeJobs >= this.concurrency) {
            break;
          }

          this.activeJobs++;

          this.#handleMessage(message)
            .catch((error) => {
              console.error("Unhandled SQS message error:", error);
            })
            .finally(() => {
              this.activeJobs--;
            });
        }
      } catch (error) {
        console.error("SQS polling error:", error);

        await this.#sleep(2000);
      }
    }
  }

  stop() {
    if (!this.running) {
      return;
    }

    console.log("Stopping SQS consumer...");

    this.running = false;
  }

  async #handleMessage(message) {
    let body;

    try {
      body = JSON.parse(message.Body);
    } catch (error) {
      /*
       * Invalid JSON can never succeed.
       *
       * Delete it so poison messages don't loop forever.
       */

      console.error("Invalid SQS JSON; deleting poison message.");

      await this.queueService.delete(message);

      return;
    }

    const parsed = this.parser.parse(body);

    if (!parsed.accepted) {
      /*
       * Parser rejected the event permanently.
       */

      console.log(`Ignoring message: ${parsed.reason}`);

      await this.queueService.delete(message);

      return;
    }

    /*
     * --------------------------------------------------
     * IMPORTANT
     * --------------------------------------------------
     *
     * Message is deleted ONLY after every job succeeds.
     *
     * If #processJob throws:
     *
     *      no delete
     *          ↓
     *      SQS visibility expires
     *          ↓
     *      message redelivered
     */

    for (const jobData of parsed.jobs) {
      await this.#processJob(jobData);
    }

    await this.queueService.delete(message);
  }

  async #processJob(jobData) {
    if (jobData.source?.type !== "s3") {
      throw new Error("Worker currently supports only S3 source");
    }

    /*
     * --------------------------------------------------
     * VERIFY S3 ASSET
     * --------------------------------------------------
     */

    const verification = await this.assetVerification.verify({
      bucket: jobData.source.bucket,

      key: jobData.source.key,
    });

    if (!verification.accepted) {
      /*
       * These can be transient.
       *
       * Do NOT delete the SQS message.
       */

      if (["INVALID_ASSET_STATUS", "ASSET_NOT_FOUND"].includes(verification.reason)) {
        throw new Error(`Temporary asset verification failure: ${verification.reason}`);
      }

      /*
       * Other parser/verification failures are treated
       * as permanently rejected S3 events.
       */

      console.error("Rejected S3 processing event:", verification);

      return {
        accepted: false,

        reason: verification.reason,
      };
    }

    const asset = verification.asset;

    const assetId = asset.assetId;

    const trigger = jobData.trigger === "API" ? "API" : "S3_EVENT";

    let job;

    /*
     * ==================================================
     * EXISTING JOB LOOKUP
     * ==================================================
     *
     * IMPORTANT:
     *
     * Include FAILED.
     *
     * Otherwise a retry can create a brand-new S3_EVENT
     * job instead of retrying the original job.
     */

    const existingJob = await MediaJob.findOne({
      assetId,

      "source.objectKey": jobData.source.key,
    })
      .sort({
        createdAt: -1,
      })
      .lean();

    /*
     * ==================================================
     * API JOB EXISTS
     * ==================================================
     */

    if (existingJob && existingJob.trigger === "API") {
      /*
       * COMPLETED means the S3 event is duplicate.
       */

      if (existingJob.status === "COMPLETED") {
        console.log("Duplicate S3 event for completed API job:", {
          jobId: existingJob.jobId,
          assetId,
        });

        return {
          accepted: false,

          reason: "JOB_ALREADY_COMPLETED",

          jobId: existingJob.jobId,
        };
      }

      /*
       * PROCESSING:
       *
       * Pass it to MediaWorker.
       *
       * MediaWorker itself performs the atomic claim.
       *
       * If another worker owns it, it will throw and SQS
       * will retry later.
       */

      console.log("Processing API job from S3 event:", {
        jobId: existingJob.jobId,

        assetId,

        status: existingJob.status,

        tier: existingJob.metadata?.tier ?? "FREE",
      });

      job = this.#toProcessingJob(existingJob);
    }

    /*
     * ==================================================
     * EXISTING S3 EVENT JOB
     * ==================================================
     */
    else if (existingJob && existingJob.trigger === "S3_EVENT") {
      if (existingJob.status === "COMPLETED") {
        console.log("Duplicate S3 event ignored:", {
          assetId,

          jobId: existingJob.jobId,
        });

        return {
          accepted: false,

          reason: "JOB_ALREADY_COMPLETED",

          jobId: existingJob.jobId,
        };
      }

      /*
       * QUEUED / PROCESSING / FAILED:
       *
       * Reuse the same job.
       *
       * This is the critical retry fix.
       */

      console.log("Reusing existing S3_EVENT job:", {
        jobId: existingJob.jobId,

        assetId,

        status: existingJob.status,
      });

      job = this.#toProcessingJob(existingJob);
    }

    /*
     * ==================================================
     * NO EXISTING JOB
     * ==================================================
     */
    else {
      job = new ProcessingJob({
        assetId,

        source: {
          type: "s3",

          bucket: jobData.source.bucket,

          key: jobData.source.key,
        },

        options: jobData.options ?? {},

        metadata: {
          ...(jobData.metadata ?? {}),

          source: "s3-event",

          tier: "FREE",

          priority: "NORMAL",

          verified: true,

          verifiedAt: new Date().toISOString(),
        },
      });

      try {
        await MediaJob.create({
          jobId: job.jobId,

          assetId,

          clientId: null,

          source: {
            bucket: asset.bucket,

            objectKey: asset.objectKey,

            etag: asset.etag,

            size: asset.size,
          },

          status: "QUEUED",

          options: job.options,

          metadata: job.metadata,

          trigger: "S3_EVENT",

          attemptCount: 0,

          maxAttempts: this.worker.maxAttempts ?? 3,
        });
      } catch (error) {
        /*
         * Another worker may have created the job
         * between findOne() and create().
         */

        if (error?.code === 11000) {
          const racedJob = await MediaJob.findOne({
            assetId,

            "source.objectKey": asset.objectKey,
          })
            .sort({
              createdAt: -1,
            })
            .lean();

          if (!racedJob) {
            throw error;
          }

          if (racedJob.status === "COMPLETED") {
            return {
              accepted: false,

              reason: "JOB_ALREADY_COMPLETED",

              jobId: racedJob.jobId,
            };
          }

          console.log("Duplicate S3 job creation race resolved:", {
            assetId,

            jobId: racedJob.jobId,
          });

          job = this.#toProcessingJob(racedJob);
        } else {
          throw error;
        }
      }

      console.log("Created S3 event processing job:", {
        jobId: job.jobId,

        assetId,
      });
    }

    /*
     * --------------------------------------------------
     * CREATE WORKSPACE
     * --------------------------------------------------
     */

    const workspace = await this.workspace.create(job.jobId);

    try {
      /*
       * ------------------------------------------------
       * DOWNLOAD INPUT
       * ------------------------------------------------
       */

      const downloaded = await this.storage.download({
        bucket: job.source.bucket,

        key: job.source.key,

        destination: `${workspace.root}/input` + `${this.#extension(job.source.key)}`,
      });

      console.log("Downloaded source:", downloaded.path);

      /*
       * ------------------------------------------------
       * LOCAL SOURCE
       * ------------------------------------------------
       */

      job.source = {
        type: "local",

        path: downloaded.path,
      };

      job.sourceMetadata = {
        type: "s3",

        bucket: asset.bucket,

        objectKey: asset.objectKey,

        etag: asset.etag,

        size: asset.size,
      };

      /*
       * ------------------------------------------------
       * PROCESS
       * ------------------------------------------------
       */

      const result = await this.worker.execute(job, workspace);

      console.log("Processing completed:", {
        jobId: job.jobId,

        assetId,
      });

      /*
       * ------------------------------------------------
       * CLEAN WORKSPACE
       * ------------------------------------------------
       */

      await this.workspace.cleanup(workspace.root);

      console.log("Workspace cleaned:", workspace.root);

      return result;
    } catch (error) {
      console.error(`Processing failed/retry scheduled: ${job.jobId}`, error);

      try {
        await this.workspace.cleanup(workspace.root);
      } catch (cleanupError) {
        console.error("Workspace cleanup failed:", cleanupError);
      }

      /*
       * IMPORTANT:
       *
       * Throw.
       *
       * SQS message must NOT be deleted.
       */

      throw error;
    }
  }

  #toProcessingJob(mediaJob) {
    return new ProcessingJob({
      jobId: mediaJob.jobId,

      assetId: mediaJob.assetId,

      source: {
        type: "s3",

        bucket: mediaJob.source.bucket,

        key: mediaJob.source.objectKey,
      },

      options: mediaJob.options ?? {},

      metadata: mediaJob.metadata ?? {},
    });
  }

  #extension(key) {
    const match = key.match(/\.[^./\\]+$/);

    return match ? match[0] : ".media";
  }

  #sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
