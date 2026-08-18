import mongoose from "mongoose";

const MediaAssetSchema = new mongoose.Schema(
  {
    assetId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    contentType: {
      type: String,
      required: true,
    },

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

    status: {
      type: String,
      enum: ["UPLOADING", "UPLOADED", "PROCESSING", "READY", "FAILED", "DELETED"],
      default: "UPLOADING",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const MediaAsset = mongoose.model("MediaAsset", MediaAssetSchema);

export default MediaAsset;
