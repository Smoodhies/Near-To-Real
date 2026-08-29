import MediaAsset from "../models/MediaAsset.js";

import MediaJob from "../models/MediaJob.js";

import { ProcessingResult } from "./processingResult.js";

export class MediaWorker {
  constructor({ processor, workspace }) {
    if (!processor) {
      throw new Error("MediaWorker requires MediaProcessor");
    }

    if (!workspace) {
      throw new Error("MediaWorker requires JobWorkspace");
    }

    this.processor = processor;

    this.workspace = workspace;
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

    await MediaJob.updateOne(
      {
        jobId: job.jobId,
      },
      {
        $set: {
          status: "PROCESSING",
          startedAt: new Date(),
          workspacePath: workspace.root,
        },
      }
    );

    await MediaAsset.updateOne(
      {
        assetId: job.assetId,
      },
      {
        $set: {
          status: "PROCESSING",
          processingJobId: job.jobId,
        },
      }
    );

    job.status = "PROCESSING";

    try {
      const processorResult = await this.processor.process({
        inputPath: job.source.path,

        jobId: job.jobId,

        assetId: job.assetId,

        source: job.sourceMetadata ?? null,
      });

      job.status = "COMPLETED";

      await MediaJob.updateOne(
        {
          jobId: job.jobId,
        },
        {
          $set: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        }
      );

      await MediaAsset.updateOne(
        {
          assetId: job.assetId,
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
      job.status = "FAILED";

      await MediaJob.updateOne(
        {
          jobId: job.jobId,
        },
        {
          $set: {
            status: "FAILED",

            completedAt: new Date(),

            error: {
              message: error?.message ?? "Unknown processing error",

              stack: error?.stack ?? null,
            },
          },
        }
      );

      await MediaAsset.updateOne(
        {
          assetId: job.assetId,
        },
        {
          $set: {
            status: "FAILED",
          },
        }
      );

      throw error;
    }
  }
}
