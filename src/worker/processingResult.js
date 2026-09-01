export class ProcessingResult {
  constructor({ jobId, status, manifestPath, ffprobePath, outputs, media, workspace }) {
    this.jobId = jobId;

    this.status = status;

    this.workspace = workspace;

    this.manifestPath = manifestPath;

    this.ffprobePath = ffprobePath;

    this.outputs = outputs;

    this.media = media;

    this.completedAt = new Date().toISOString();
  }
}
