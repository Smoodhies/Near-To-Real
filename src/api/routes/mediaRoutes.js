import MediaAsset from "../../models/MediaAsset.js";
import MediaJob from "../../models/MediaJob.js";

import { ProcessingJob } from "../../worker/processingJob.js";

import { randomUUID } from "node:crypto";
import path from "node:path";

export async function mediaRoutes(fastify, { storage, config }) {
  /*
   * --------------------------------------------------
   * LOCAL API INSTANCE THROTTLING
   * --------------------------------------------------
   *
   * This protects the API process itself.
   *
   * For multi-container production deployment,
   * move this to Redis later.
   */

  const activeUploads = new Map();

  /*
   * ==================================================
   * POST /media/jobs
   * ==================================================
   *
   * Customer sends:
   *
   * X-API-Key
   * Idempotency-Key (optional)
   * file
   *
   * Nothing else is required.
   *
   * Processing options are server controlled.
   */

  fastify.post("/media/jobs", async (request, reply) => {
    const client = request.apiClient;

    if (!client) {
      return reply.code(401).send({
        success: false,

        error: "UNAUTHORIZED",

        message: "Valid API key required.",
      });
    }

    /*
     * --------------------------------------------------
     * MULTIPART REQUIRED
     * --------------------------------------------------
     */

    if (!request.isMultipart()) {
      return reply.code(415).send({
        success: false,

        error: "MULTIPART_REQUIRED",

        message: "Use multipart/form-data with a video file.",
      });
    }

    /*
     * --------------------------------------------------
     * IDEMPOTENCY
     * --------------------------------------------------
     */

    const idempotencyKey = request.headers["idempotency-key"]?.toString().trim() || null;

    if (idempotencyKey) {
      const existing = await MediaJob.findOne({
        trigger: "API",

        idempotencyKey,
      }).lean();

      if (existing) {
        return reply.code(200).send({
          success: true,

          duplicate: true,

          message: "Existing idempotent job returned.",

          data: {
            assetId: existing.assetId,

            jobId: existing.jobId,

            status: existing.status,
          },
        });
      }
    }

    /*
     * --------------------------------------------------
     * CONCURRENT UPLOAD LIMIT
     * --------------------------------------------------
     */

    const currentUploads = activeUploads.get(client.clientId) ?? 0;

    if (currentUploads >= client.maxConcurrentUploads) {
      return reply.code(429).send({
        success: false,

        error: "UPLOAD_THROTTLED",

        message: "Too many media uploads are currently in progress for this API key.",

        tier: client.tier,

        maxConcurrentUploads: client.maxConcurrentUploads,
      });
    }

    activeUploads.set(client.clientId, currentUploads + 1);

    let assetId = null;

    let jobId = null;

    let objectKey = null;

    let assetCreated = false;

    let jobCreated = false;

    try {
      /*
       * --------------------------------------------------
       * PROCESSING OPTIONS
       * --------------------------------------------------
       *
       * Customer does NOT control these.
       */

      const options = {
        generateWav: config.processing.generateWav,

        generateMp3: config.processing.generateMp3,

        generateVideoOnly: config.processing.generateVideoOnly,

        extractSubtitles: config.processing.extractSubtitles,
      };

      /*
       * --------------------------------------------------
       * MULTIPART ITERATION
       * --------------------------------------------------
       *
       * We deliberately process the file stream directly.
       *
       * No temporary video file.
       */

      const parts = request.parts();

      let fileFound = false;

      for await (const part of parts) {
        /*
         * ------------------------------------------------
         * CUSTOMER MUST NOT SEND EXTRA FIELDS
         * ------------------------------------------------
         */

        if (part.type === "field") {
          throw new Error(
            `Unexpected form field '${part.fieldname}'. Only the video file is accepted.`
          );
        }

        if (part.type !== "file") {
          continue;
        }

        if (fileFound) {
          part.file.resume();

          throw new Error("Only one video file is allowed.");
        }

        fileFound = true;

        /*
         * ------------------------------------------------
         * VIDEO VALIDATION
         * ------------------------------------------------
         */

        if (!part.mimetype?.startsWith("video/")) {
          part.file.resume();

          return reply.code(415).send({
            success: false,

            error: "UNSUPPORTED_MEDIA_TYPE",

            message: "Only video files are supported.",

            contentType: part.mimetype ?? null,
          });
        }

        /*
         * ------------------------------------------------
         * SAFE ORIGINAL FILENAME
         * ------------------------------------------------
         */

        const originalName = path
          .basename(part.filename || "uploaded-video")
          .replace(/[^\w.\-() ]+/g, "_");

        const extension = path.extname(originalName).toLowerCase() || ".mp4";

        /*
         * ------------------------------------------------
         * IDENTIFIERS
         * ------------------------------------------------
         */

        assetId = randomUUID();

        jobId = randomUUID();

        objectKey = `input/${assetId}/${originalName}`;

        /*
         * ------------------------------------------------
         * CREATE ASSET BEFORE S3 UPLOAD
         * ------------------------------------------------
         *
         * S3 event can technically arrive immediately
         * after PutObject completes.
         *
         * Therefore the asset already exists before
         * the object can exist in S3.
         */

        const asset = await MediaAsset.create({
          assetId,

          originalName,

          contentType: part.mimetype,

          bucket: config.aws.inputBucket,

          objectKey,

          size: null,

          status: "UPLOADING",

          processingJobId: jobId,
        });

        assetCreated = true;

        /*
         * ------------------------------------------------
         * CREATE JOB BEFORE S3 UPLOAD
         * ------------------------------------------------
         *
         * The S3 event worker can then discover this
         * API-created job instead of creating another job.
         */

        await MediaJob.create({
          jobId,

          assetId,

          clientId: client.clientId,

          source: {
            bucket: config.aws.inputBucket,

            objectKey,

            etag: null,

            size: null,
          },

          status: "QUEUED",

          options,

          metadata: {
            source: "api-upload",

            clientId: client.clientId,

            tier: client.tier,

            priority: client.tier === "PAID" ? "HIGH" : "NORMAL",
          },

          trigger: "API",

          idempotencyKey,
        });

        jobCreated = true;

        /*
         * ------------------------------------------------
         * DIRECT STREAM → S3
         * ------------------------------------------------
         *
         * IMPORTANT:
         *
         * There is NO:
         *
         * request
         *   ↓
         * local file
         *   ↓
         * S3
         *
         * Instead:
         *
         * multipart stream
         *   ↓
         * S3
         */

        const uploaded = await storage.uploadStream({
          bucket: config.aws.inputBucket,

          key: objectKey,

          stream: part.file,

          contentType: part.mimetype,

          maxBytes: client.maxUploadBytes,
        });

        /*
         * ------------------------------------------------
         * S3 UPLOAD COMPLETED
         * ------------------------------------------------
         */

        if (!uploaded.size || uploaded.size <= 0) {
          throw new Error("Uploaded video file is empty.");
        }

        /*
         * ------------------------------------------------
         * MARK ASSET UPLOADED
         * ------------------------------------------------
         */

        await MediaAsset.updateOne(
          {
            assetId,
          },

          {
            $set: {
              size: uploaded.size,

              etag: uploaded.etag,

              status: "UPLOADED",
            },
          }
        );

        /*
         * ------------------------------------------------
         * UPDATE JOB SOURCE
         * ------------------------------------------------
         */

        await MediaJob.updateOne(
          {
            jobId,
          },

          {
            $set: {
              "source.etag": uploaded.etag,

              "source.size": uploaded.size,
            },
          }
        );

        /*
         * ------------------------------------------------
         * IMPORTANT
         * ------------------------------------------------
         *
         * DO NOT enqueue SQS here.
         *
         * S3 ObjectCreated is the canonical trigger.
         *
         * This prevents:
         *
         * API SQS message
         * +
         * S3 SQS message
         *
         * from creating duplicate processing.
         */

        return reply.code(202).send({
          success: true,

          status: 202,

          message: "Video uploaded and processing queued successfully",

          data: {
            assetId,

            jobId,

            originalName,

            contentType: part.mimetype,

            size: uploaded.size,

            status: "QUEUED",

            tier: client.tier,
          },
        });
      }

      /*
       * --------------------------------------------------
       * FILE NOT PROVIDED
       * --------------------------------------------------
       */

      if (!fileFound) {
        return reply.code(400).send({
          success: false,

          error: "VIDEO_FILE_REQUIRED",

          message: "A video file named 'file' is required.",
        });
      }
    } catch (error) {
      fastify.log.error(
        {
          error,

          assetId,

          jobId,

          clientId: client.clientId,

          tier: client.tier,
        },

        "Media API upload failed"
      );

      /*
       * --------------------------------------------------
       * MARK JOB FAILED
       * --------------------------------------------------
       */

      if (jobCreated && jobId) {
        try {
          await MediaJob.updateOne(
            {
              jobId,
            },

            {
              $set: {
                status: "FAILED",

                completedAt: new Date(),

                error: {
                  message: error?.message ?? "Media upload failed",

                  stack: error?.stack ?? null,
                },
              },
            }
          );
        } catch (jobError) {
          fastify.log.error(
            {
              error: jobError,

              jobId,
            },

            "Failed to mark media job as FAILED"
          );
        }
      }

      /*
       * --------------------------------------------------
       * MARK ASSET FAILED
       * --------------------------------------------------
       */

      if (assetCreated && assetId) {
        try {
          await MediaAsset.updateOne(
            {
              assetId,
            },

            {
              $set: {
                status: "FAILED",
              },
            }
          );
        } catch (assetError) {
          fastify.log.error(
            {
              error: assetError,

              assetId,
            },

            "Failed to mark media asset as FAILED"
          );
        }
      }

      const message = error?.message ?? "Failed to upload media";

      const tooLarge =
        message.toLowerCase().includes("maximum allowed size") ||
        message.toLowerCase().includes("exceeds");

      return reply.code(tooLarge ? 413 : 500).send({
        success: false,

        error: tooLarge ? "UPLOAD_TOO_LARGE" : "MEDIA_JOB_CREATION_FAILED",

        message,
      });
    } finally {
      /*
       * --------------------------------------------------
       * RELEASE CONCURRENT SLOT
       * --------------------------------------------------
       */

      const current = activeUploads.get(client.clientId) ?? 1;

      if (current <= 1) {
        activeUploads.delete(client.clientId);
      } else {
        activeUploads.set(client.clientId, current - 1);
      }
    }
  });

  /*
   * ==================================================
   * GET /media/jobs/:jobId
   * ==================================================
   */

  fastify.get("/media/jobs/:jobId", async (request, reply) => {
    const { jobId } = request.params;

    const client = request.apiClient;

    const job = await MediaJob.findOne({
      jobId,
    }).lean();

    if (!job) {
      return reply.code(404).send({
        success: false,

        error: "JOB_NOT_FOUND",

        message: "Processing job was not found.",

        jobId,
      });
    }

    /*
     * API customer can only see their own jobs.
     */

    if (job.trigger === "API" && job.clientId && job.clientId !== client.clientId) {
      return reply.code(404).send({
        success: false,

        error: "JOB_NOT_FOUND",

        message: "Processing job was not found.",

        jobId,
      });
    }

    const artifacts = await MediaArtifact.find({
      jobId,
    })
      .sort({
        createdAt: 1,
      })
      .lean();

    return reply.code(200).send({
      success: true,

      data: {
        jobId: job.jobId,

        assetId: job.assetId,

        status: job.status,

        trigger: job.trigger,

        tier: job.metadata?.tier ?? null,

        priority: job.metadata?.priority ?? null,

        options: job.options ?? {},

        error: job.status === "FAILED" ? job.error : null,

        processing: {
          startedAt: job.startedAt,

          completedAt: job.completedAt,

          createdAt: job.createdAt,

          updatedAt: job.updatedAt,
        },

        artifacts: artifacts.map(serializeArtifact),
      },
    });
  });

  /*
   * ==================================================
   * GET /media/assets/:assetId
   * ==================================================
   */

  fastify.get("/media/assets/:assetId", async (request, reply) => {
    const { assetId } = request.params;

    const client = request.apiClient;

    const asset = await MediaAsset.findOne({
      assetId,
    }).lean();

    if (!asset) {
      return reply.code(404).send({
        success: false,

        error: "ASSET_NOT_FOUND",

        message: "Media asset was not found.",

        assetId,
      });
    }

    /*
     * --------------------------------------------------
     * API OWNERSHIP
     * --------------------------------------------------
     */

    const apiJob = await MediaJob.findOne({
      assetId,

      trigger: "API",
    })
      .sort({
        createdAt: -1,
      })
      .lean();

    if (apiJob?.clientId && apiJob.clientId !== client.clientId) {
      return reply.code(404).send({
        success: false,

        error: "ASSET_NOT_FOUND",

        message: "Media asset was not found.",

        assetId,
      });
    }

    /*
     * --------------------------------------------------
     * RELATED JOBS
     * --------------------------------------------------
     */

    const jobs = await MediaJob.find({
      assetId,
    })
      .sort({
        createdAt: -1,
      })
      .lean();

    /*
     * --------------------------------------------------
     * ARTIFACTS
     * --------------------------------------------------
     */

    const artifacts = await MediaArtifact.find({
      assetId,
    })
      .sort({
        createdAt: 1,
      })
      .lean();

    return reply.code(200).send({
      success: true,

      data: {
        asset: {
          assetId: asset.assetId,

          originalName: asset.originalName,

          contentType: asset.contentType,

          size: asset.size,

          status: asset.status,

          createdAt: asset.createdAt,

          updatedAt: asset.updatedAt,
        },

        jobs: jobs.map(serializeJob),

        artifacts: artifacts.map(serializeArtifact),
      },
    });
  });
}

/*
 * ==================================================
 * SERIALIZERS
 * ==================================================
 */

function serializeArtifact(artifact) {
  return {
    artifactId: artifact.artifactId,

    jobId: artifact.jobId,

    assetId: artifact.assetId,

    type: artifact.type,

    filename: artifact.filename ?? null,

    storage: artifact.storage,

    bucket: artifact.bucket ?? null,

    objectKey: artifact.objectKey ?? null,

    contentType: artifact.contentType ?? null,

    size: artifact.size ?? null,

    status: artifact.status,

    createdAt: artifact.createdAt,

    updatedAt: artifact.updatedAt,
  };
}

function serializeJob(job) {
  return {
    jobId: job.jobId,

    assetId: job.assetId,

    status: job.status,

    trigger: job.trigger,

    tier: job.metadata?.tier ?? null,

    priority: job.metadata?.priority ?? null,

    options: job.options ?? {},

    error: job.status === "FAILED" ? job.error : null,

    processing: {
      startedAt: job.startedAt,

      completedAt: job.completedAt,

      createdAt: job.createdAt,

      updatedAt: job.updatedAt,
    },
  };
}
