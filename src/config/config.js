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

      sqsVisibilityTimeout: Number(
        process.env.SQS_VISIBILITY_TIMEOUT_SECONDS ?? process.env.SQS_VISIBILITY_TIMEOUT ?? 1800
      ),

      /*
       * Maximum application-level attempts
       * for a single processing job.
       */
      maxAttempts: Number(process.env.MEDIA_MAX_ATTEMPTS ?? 3),

      /*
       * If a worker dies while PROCESSING,
       * another worker may reclaim the job
       * after this period.
       */
      processingLeaseTimeoutMs: Number(process.env.PROCESSING_LEASE_TIMEOUT_MS ?? 3600000),
    };

    /*
     * --------------------------------------------------
     * API SECURITY
     * --------------------------------------------------
     */

    this.apiSecurity = {
      freeApiKey: process.env.FREE_API_KEY?.trim() ?? null,

      paidApiKey: process.env.PAID_API_KEY?.trim() ?? null,

      freeRateLimitPerMinute: Number(process.env.FREE_RATE_LIMIT_PER_MINUTE ?? 10),

      paidRateLimitPerMinute: Number(process.env.PAID_RATE_LIMIT_PER_MINUTE ?? 100),

      freeMaxConcurrentUploads: Number(process.env.FREE_MAX_CONCURRENT_UPLOADS ?? 1),

      paidMaxConcurrentUploads: Number(process.env.PAID_MAX_CONCURRENT_UPLOADS ?? 3),

      freeMaxUploadBytes: Number(process.env.FREE_MAX_UPLOAD_BYTES ?? 100 * 1024 * 1024),

      paidMaxUploadBytes: Number(process.env.PAID_MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024),
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
      throw new Error("SQS_VISIBILITY_TIMEOUT_SECONDS must be >= 30");
    }

    if (!Number.isInteger(this.worker.maxAttempts) || this.worker.maxAttempts < 1) {
      throw new Error("MEDIA_MAX_ATTEMPTS must be >= 1");
    }

    if (
      !Number.isFinite(this.worker.processingLeaseTimeoutMs) ||
      this.worker.processingLeaseTimeoutMs <= 0
    ) {
      throw new Error("PROCESSING_LEASE_TIMEOUT_MS must be greater than 0");
    }

    /*
     * --------------------------------------------------
     * API KEY VALIDATION
     * --------------------------------------------------
     */

    if (!this.apiSecurity.freeApiKey && !this.apiSecurity.paidApiKey) {
      throw new Error("At least one API key is required: FREE_API_KEY or PAID_API_KEY");
    }

    if (
      this.apiSecurity.freeApiKey &&
      this.apiSecurity.paidApiKey &&
      this.apiSecurity.freeApiKey === this.apiSecurity.paidApiKey
    ) {
      throw new Error("FREE_API_KEY and PAID_API_KEY must be different");
    }

    if (
      !Number.isInteger(this.apiSecurity.freeRateLimitPerMinute) ||
      this.apiSecurity.freeRateLimitPerMinute < 1
    ) {
      throw new Error("FREE_RATE_LIMIT_PER_MINUTE must be >= 1");
    }

    if (
      !Number.isInteger(this.apiSecurity.paidRateLimitPerMinute) ||
      this.apiSecurity.paidRateLimitPerMinute < 1
    ) {
      throw new Error("PAID_RATE_LIMIT_PER_MINUTE must be >= 1");
    }

    if (
      !Number.isInteger(this.apiSecurity.freeMaxConcurrentUploads) ||
      this.apiSecurity.freeMaxConcurrentUploads < 1
    ) {
      throw new Error("FREE_MAX_CONCURRENT_UPLOADS must be >= 1");
    }

    if (
      !Number.isInteger(this.apiSecurity.paidMaxConcurrentUploads) ||
      this.apiSecurity.paidMaxConcurrentUploads < 1
    ) {
      throw new Error("PAID_MAX_CONCURRENT_UPLOADS must be >= 1");
    }

    if (
      !Number.isInteger(this.apiSecurity.freeMaxUploadBytes) ||
      this.apiSecurity.freeMaxUploadBytes <= 0
    ) {
      throw new Error("FREE_MAX_UPLOAD_BYTES must be greater than 0");
    }

    if (
      !Number.isInteger(this.apiSecurity.paidMaxUploadBytes) ||
      this.apiSecurity.paidMaxUploadBytes <= 0
    ) {
      throw new Error("PAID_MAX_UPLOAD_BYTES must be greater than 0");
    }

    return this;
  }
}
