import mongoose, { Schema, model, models } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";


const VideoSchema = new Schema(
  {
    VideoFile: {
      type: String, //aws s3 video bucket url
      require: true,
    },
    Thumbnail: {
      type: String, //aws s3 video bucket url
      require: true,
    },
    Title: {
      type: String,
      require: true,
    },
    Description: {
      type: String,
      require: true,
    },
    Duration: {
      type: Number,
      default: 0,
    },
    Views: {
      type: Number,
      default: 0,
    },
    isPublihed: {
      type: Boolean,
      default: true,
      enum: ["public", "private"],
    },
    Owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

VideoSchema.plugin(mongooseAggregatePaginate)

const video = models("Video") || model("Video", VideoSchema);
