import { randomUUID } from "node:crypto";

export class ProcessingJob {
  constructor({ jobId, assetId, source, options = {}, metadata = {} }) {
    if (!source?.type) {
      throw new Error("ProcessingJob requires source.type");
    }

    this.jobId = jobId ?? randomUUID();

    this.assetId = assetId ?? null;

    this.source = source;

    this.options = options;

    this.metadata = metadata;

    this.status = "PENDING";

    this.createdAt = new Date().toISOString();
  }
}
