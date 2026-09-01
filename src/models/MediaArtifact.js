import mongoose from "mongoose";

const MediaArtifactSchema = new mongoose.Schema(
  {
    artifactId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    jobId: {
      type: String,
      required: true,
      index: true,
    },

    assetId: {
      type: String,
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["AUDIO_WAV", "AUDIO_MP3", "VIDEO_ONLY", "SUBTITLE", "FFPROBE", "MANIFEST"],
      required: true,
    },

    filename: {
      type: String,
      default: null,
    },

    storage: {
      type: String,
      enum: ["LOCAL", "S3"],
      required: true,
    },

    bucket: {
      type: String,
      default: null,
    },

    objectKey: {
      type: String,
      default: null,
    },

    localPath: {
      type: String,
      default: null,
    },

    contentType: {
      type: String,
      default: null,
    },

    size: {
      type: Number,
      default: null,
    },

    status: {
      type: String,
      enum: ["CREATED", "UPLOADED", "FAILED"],
      default: "CREATED",
    },
  },
  {
    timestamps: true,
  }
);

MediaArtifactSchema.index({
  jobId: 1,
  type: 1,
});

MediaArtifactSchema.index({
  assetId: 1,
  type: 1,
});

export default mongoose.models.MediaArtifact ||
  mongoose.model("MediaArtifact", MediaArtifactSchema);
