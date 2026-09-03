import mongoose from "mongoose";

const MediaJobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    assetId: {
      type: String,
      required: true,
      index: true,
    },

    clientId: {
      type: String,
      default: null,
      index: true,
    },

    source: {
      bucket: {
        type: String,
        required: true,
      },

      objectKey: {
        type: String,
        required: true,
      },

      etag: {
        type: String,
        default: null,
      },

      size: {
        type: Number,
        default: null,
      },
    },

    status: {
      type: String,
      enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"],
      default: "QUEUED",
      index: true,
    },

    options: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    workspacePath: {
      type: String,
      default: null,
    },

    error: {
      message: {
        type: String,
        default: null,
      },

      stack: {
        type: String,
        default: null,
      },

      code: {
        type: String,
        default: null,
      },

      retryable: {
        type: Boolean,
        default: true,
      },

      attempt: {
        type: Number,
        default: 0,
      },
    },

    /*
     * Number of actual worker processing attempts.
     */
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    /*
     * Maximum number of application-level attempts.
     */
    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
    },

    /*
     * Last time a worker successfully claimed the job.
     *
     * Used to recover jobs stuck in PROCESSING
     * after worker/API crashes.
     */
    processingLeaseAt: {
      type: Date,
      default: null,
      index: true,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    trigger: {
      type: String,
      enum: ["API", "S3_EVENT"],
      default: "API",
      index: true,
    },

    idempotencyKey: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * --------------------------------------------------
 * ASSET + STATUS
 * --------------------------------------------------
 */

MediaJobSchema.index({
  assetId: 1,
  status: 1,
});

/*
 * --------------------------------------------------
 * SOURCE LOOKUP
 * --------------------------------------------------
 */

MediaJobSchema.index({
  assetId: 1,
  "source.objectKey": 1,
});

/*
 * --------------------------------------------------
 * SOURCE + STATUS
 * --------------------------------------------------
 *
 * Important for S3-event duplicate detection.
 */

MediaJobSchema.index({
  "source.objectKey": 1,
  status: 1,
});

/*
 * --------------------------------------------------
 * API IDEMPOTENCY
 * --------------------------------------------------
 */

MediaJobSchema.index(
  {
    trigger: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      trigger: "API",
      idempotencyKey: {
        $type: "string",
      },
    },
  }
);

/*
 * --------------------------------------------------
 * CLIENT + JOB
 * --------------------------------------------------
 */

MediaJobSchema.index({
  clientId: 1,
  jobId: 1,
});

/*
 * --------------------------------------------------
 * CLIENT + STATUS
 * --------------------------------------------------
 */

MediaJobSchema.index({
  clientId: 1,
  status: 1,
});

/*
 * --------------------------------------------------
 * PROCESSING LEASE
 * --------------------------------------------------
 */

MediaJobSchema.index({
  status: 1,
  processingLeaseAt: 1,
});

export default mongoose.models.MediaJob || mongoose.model("MediaJob", MediaJobSchema);
