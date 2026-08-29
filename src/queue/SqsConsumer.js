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

        if (messages.length === 0) {
          continue;
        }

        for (const message of messages) {
          if (this.activeJobs >= this.concurrency) {
            break;
          }

          this.activeJobs++;

          this.#handleMessage(message)
            .catch((error) => {
              console.error("Unhandled message error:", error);
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
    } catch {
      console.error("Invalid SQS JSON");

      await this.queueService.delete(message);

      return;
    }

    const parsed = this.parser.parse(body);

    if (!parsed.accepted) {
      console.log(`Ignoring message: ${parsed.reason}`);

      await this.queueService.delete(message);

      return;
    }

    /*
     * Every job must succeed before
     * deleting the SQS message.
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
     * Verify asset
     * --------------------------------------------------
     */

    const verification = await this.assetVerification.verify({
      bucket: jobData.source.bucket,

      key: jobData.source.key,
    });

    if (!verification.accepted) {
      console.error("Rejected S3 processing event:", verification);

      /*
       * Invalid/stale event.
       * Delete message instead of retrying forever.
       */
      return {
        accepted: false,
        reason: verification.reason,
      };
    }

    const asset = verification.asset;

    const assetId = asset.assetId;

    /*
     * --------------------------------------------------
     * ATOMIC JOB CLAIM
     * --------------------------------------------------
     *
     * This is the important part.
     *
     * Two workers can receive the same event.
     *
     * Only one can create/claim the job.
     */

    const existingJob = await MediaJob.findOne({
      assetId,

      "source.objectKey": jobData.source.key,

      status: {
        $in: ["QUEUED", "PROCESSING", "COMPLETED"],
      },
    });

    if (existingJob) {
      console.log("Duplicate processing event ignored:", {
        assetId,
        jobId: existingJob.jobId,
        status: existingJob.status,
      });

      return {
        accepted: false,
        reason: "JOB_ALREADY_EXISTS",
        jobId: existingJob.jobId,
      };
    }

    /*
     * Create a unique job.
     *
     * jobId is generated ONCE.
     */

    const job = new ProcessingJob({
      assetId,

      source: {
        type: "s3",

        bucket: jobData.source.bucket,

        key: jobData.source.key,
      },

      options: jobData.options ?? {},

      metadata: {
        ...(jobData.metadata ?? {}),

        verified: true,

        verifiedAt: new Date().toISOString(),
      },
    });

    try {
      await MediaJob.create({
        jobId: job.jobId,

        assetId,

        source: {
          bucket: asset.bucket,

          objectKey: asset.objectKey,

          etag: asset.etag,

          size: asset.size,
        },

        status: "QUEUED",

        options: job.options,

        metadata: job.metadata,
      });
    } catch (error) {
      /*
       * Another worker may have won the race.
       *
       * Unique jobId protects us from duplicate
       * job creation by accident, but asset-level
       * uniqueness should also be enforced below
       * in the database.
       */

      if (error?.code === 11000) {
        console.log("Duplicate job creation race ignored:", assetId);

        return {
          accepted: false,
          reason: "JOB_ALREADY_EXISTS",
        };
      }

      throw error;
    }

    console.log("Creating processing job:", {
      jobId: job.jobId,

      assetId,
    });

    const workspace = await this.workspace.create(job.jobId);

    try {
      /*
       * ------------------------------------------------
       * Download input
       * ------------------------------------------------
       */

      const downloaded = await this.storage.download({
        bucket: job.source.bucket,

        key: job.source.key,

        destination: `${workspace.root}/input${this.#extension(job.source.key)}`,
      });

      console.log("Downloaded source:", downloaded.path);

      /*
       * ------------------------------------------------
       * Switch same job S3 → local
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
       * Worker
       * ------------------------------------------------
       */

      const result = await this.worker.execute(job, workspace);

      console.log("Processing completed:", {
        jobId: job.jobId,

        assetId,
      });

      /*
       * Workspace is temporary.
       */

      await this.workspace.cleanup(workspace.root);

      console.log("Workspace cleaned:", workspace.root);

      return result;
    } catch (error) {
      console.error(`Processing failed: ${job.jobId}`, error);

      /*
       * Do NOT delete SQS message.
       *
       * SQS will retry it.
       */

      try {
        await this.workspace.cleanup(workspace.root);
      } catch (cleanupError) {
        console.error("Workspace cleanup failed:", cleanupError);
      }

      throw error;
    }
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
