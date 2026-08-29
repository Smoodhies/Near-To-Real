import "dotenv/config";
import path from "node:path";

export class Config {
  constructor() {
    this.api = {
      host: process.env.API_HOST ?? "0.0.0.0",
      port: Number(process.env.API_PORT ?? 3000),
    };

    this.aws = {
      region: process.env.AWS_REGION ?? "ap-south-1",

      inputBucket: process.env.INPUT_S3_BUCKET ?? null,

      outputBucket: process.env.OUTPUT_S3_BUCKET ?? null,

      sqsQueueUrl: process.env.SQS_QUEUE_URL ?? null,
    };

    this.processing = {
      generateWav: process.env.GENERATE_WAV !== "false",

      generateMp3: process.env.GENERATE_MP3 !== "false",

      generateVideoOnly: process.env.GENERATE_VIDEO_ONLY !== "false",

      extractSubtitles: process.env.EXTRACT_SUBTITLES !== "false",

      ffmpegTimeoutMs: Number(process.env.FFMPEG_TIMEOUT_MS ?? 1800000),
    };

    this.paths = {
      output: path.resolve(process.env.OUTPUT_DIR ?? "./output"),

      temp: path.resolve(process.env.TEMP_DIR ?? "./output/tmp"),

      workspace: path.resolve(process.env.WORKSPACE_DIR ?? "./workspace"),
    };

    this.worker = {
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),

      sqsVisibilityTimeout: Number(process.env.SQS_VISIBILITY_TIMEOUT ?? 1800),
    };
  }

  validate() {
    if (!this.aws.region) {
      throw new Error("AWS_REGION is required");
    }

    if (!this.aws.inputBucket) {
      throw new Error("INPUT_S3_BUCKET is required");
    }

    if (!this.aws.outputBucket) {
      throw new Error("OUTPUT_S3_BUCKET is required");
    }

    if (this.aws.inputBucket === this.aws.outputBucket) {
      throw new Error("INPUT_S3_BUCKET and OUTPUT_S3_BUCKET must be different");
    }

    if (!this.aws.sqsQueueUrl) {
      throw new Error("SQS_QUEUE_URL is required");
    }

    if (!Number.isInteger(this.api.port) || this.api.port < 1 || this.api.port > 65535) {
      throw new Error("API_PORT must be a valid port");
    }

    if (!Number.isFinite(this.processing.ffmpegTimeoutMs) || this.processing.ffmpegTimeoutMs <= 0) {
      throw new Error("FFMPEG_TIMEOUT_MS must be greater than 0");
    }

    if (!Number.isInteger(this.worker.concurrency) || this.worker.concurrency < 1) {
      throw new Error("WORKER_CONCURRENCY must be >= 1");
    }

    if (
      !Number.isInteger(this.worker.sqsVisibilityTimeout) ||
      this.worker.sqsVisibilityTimeout < 30
    ) {
      throw new Error("SQS_VISIBILITY_TIMEOUT must be >= 30");
    }

    return this;
  }
}
