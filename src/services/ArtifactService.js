import { randomUUID } from "node:crypto";

import MediaArtifact from "../models/MediaArtifact.js";

export class ArtifactService {
  async create({
    jobId,
    assetId,
    type,
    storage = "LOCAL",
    localPath = null,
    bucket = null,
    objectKey = null,
    contentType = null,
    size = null,
    status = "CREATED",
    filename = null,
  }) {
    if (!jobId) {
      throw new Error("ArtifactService requires jobId");
    }

    if (!assetId) {
      throw new Error("ArtifactService requires assetId");
    }

    if (!type) {
      throw new Error("ArtifactService requires type");
    }

    const artifactId = randomUUID();

    return MediaArtifact.create({
      artifactId,
      jobId,
      assetId,
      type,
      storage,
      localPath,
      bucket,
      objectKey,
      contentType,
      size,
      status,
      filename,
    });
  }

  async markUploaded({ artifactId, bucket, objectKey, size = null }) {
    if (!artifactId) {
      throw new Error("ArtifactService.markUploaded requires artifactId");
    }

    const artifact = await MediaArtifact.findOneAndUpdate(
      {
        artifactId,
      },
      {
        $set: {
          storage: "S3",
          bucket,
          objectKey,
          size,
          status: "UPLOADED",
        },
      },
      {
        new: true,
      }
    );

    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    return artifact;
  }

  async markFailed(artifactId) {
    if (!artifactId) {
      return;
    }

    await MediaArtifact.updateOne(
      {
        artifactId,
      },
      {
        $set: {
          status: "FAILED",
        },
      }
    );
  }
}
