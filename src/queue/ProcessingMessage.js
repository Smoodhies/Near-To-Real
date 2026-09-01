export class ProcessingMessage {
  constructor({ job }) {
    if (!job?.jobId) {
      throw new Error("ProcessingMessage requires jobId");
    }

    if (!job?.source?.type) {
      throw new Error("ProcessingMessage requires source.type");
    }

    this.schemaVersion = "1.0";

    this.jobId = job.jobId;

    this.source = job.source;

    this.options = job.options ?? {};

    this.metadata = job.metadata ?? {};

    this.createdAt = job.createdAt;
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      jobId: this.jobId,
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
