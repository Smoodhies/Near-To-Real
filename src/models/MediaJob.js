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
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },

  {
    timestamps: true,
  }
);

MediaJobSchema.index({
  assetId: 1,
  status: 1,
});

/*
 * Same asset + same source object
 * should not create multiple active jobs.
 */
MediaJobSchema.index(
  {
    assetId: 1,
    "source.objectKey": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: ["QUEUED", "PROCESSING", "COMPLETED"],
      },
    },
  }
);

export default mongoose.models.MediaJob || mongoose.model("MediaJob", MediaJobSchema);
