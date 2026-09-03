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

    /*
     * --------------------------------------------------
     * PROCESSING TIER
     * --------------------------------------------------
     *
     * This metadata is ready for the future
     * separate FREE/PAID queue architecture.
     */

    this.tier = metadata?.tier === "PAID" ? "PAID" : "FREE";

    this.priority = metadata?.priority ?? (this.tier === "PAID" ? "HIGH" : "NORMAL");

    this.status = "PENDING";

    this.createdAt = new Date().toISOString();
  }
}
