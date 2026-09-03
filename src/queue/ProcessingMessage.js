export class ProcessingMessage {
  constructor({ job, trigger = "API" }) {
    if (!job?.jobId) {
      throw new Error("ProcessingMessage requires jobId");
    }

    if (!job?.source?.type) {
      throw new Error("ProcessingMessage requires source.type");
    }

    if (!["API", "S3_EVENT"].includes(trigger)) {
      throw new Error(`Invalid processing trigger: ${trigger}`);
    }

    this.schemaVersion = "1.0";

    this.jobId = job.jobId;

    this.assetId = job.assetId ?? null;

    this.trigger = trigger;

    this.source = job.source;

    this.options = job.options ?? {};

    this.metadata = job.metadata ?? {};

    this.createdAt = job.createdAt;
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,

      jobId: this.jobId,

      assetId: this.assetId,

      trigger: this.trigger,

      source: this.source,

      options: this.options,

      metadata: this.metadata,

      createdAt: this.createdAt,
    };
  }

  serialize() {
    return JSON.stringify(this.toJSON());
  }
}
