import MediaArtifact from "../models/MediaArtifact.js";

export class ArtifactUploadService {
  constructor({ storage, outputBucket }) {
    if (!storage) {
      throw new Error("ArtifactUploadService requires storage");
    }

    if (!outputBucket) {
      throw new Error("ArtifactUploadService requires outputBucket");
    }

    this.storage = storage;
    this.outputBucket = outputBucket;
  }

  async upload({ artifact, assetId, jobId, filename }) {
    if (!artifact) {
      throw new Error("ArtifactUploadService requires artifact");
    }

    if (!assetId) {
      throw new Error("ArtifactUploadService requires assetId");
    }

    if (!jobId) {
      throw new Error("ArtifactUploadService requires jobId");
    }

    if (!filename) {
      throw new Error("ArtifactUploadService requires filename");
    }

    if (!artifact.localPath) {
      throw new Error("ArtifactUploadService requires artifact.localPath");
    }

    const normalizedFilename = filename.replace(/\\/g, "/").replace(/^\/+/, "");

    const objectKey = `output/${assetId}/${jobId}/${normalizedFilename}`;

    try {
      const uploaded = await this.storage.upload({
        bucket: this.outputBucket,
        key: objectKey,
        filePath: artifact.localPath,
        contentType: artifact.contentType,
      });

      const updated = await MediaArtifact.findOneAndUpdate(
        {
          artifactId: artifact.artifactId,
        },
        {
          $set: {
            storage: "S3",
            bucket: uploaded.bucket,
            objectKey: uploaded.key,
            size: uploaded.size,
            status: "UPLOADED",
          },
        },
        {
          new: true,
        }
      );

      if (!updated) {
        throw new Error(`Artifact not found after upload: ${artifact.artifactId}`);
      }

      return {
        artifactId: updated.artifactId,
        jobId: updated.jobId,
        assetId: updated.assetId,
        type: updated.type,
        storage: "S3",
        bucket: uploaded.bucket,
        objectKey: uploaded.key,
        contentType: updated.contentType,
        sizeBytes: uploaded.size,
        status: "UPLOADED",
        filename: updated.filename,
        etag: uploaded.etag,
      };
    } catch (error) {
      await MediaArtifact.updateOne(
        {
          artifactId: artifact.artifactId,
        },
        {
          $set: {
            status: "FAILED",
          },
        }
      );

      throw error;
    }
  }
}
