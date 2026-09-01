import MediaAsset from "../models/MediaAsset.js";

export class AssetVerificationService {
  constructor({ storage }) {
    if (!storage) {
      throw new Error("AssetVerificationService requires storage");
    }

    this.storage = storage;
  }

  extractAssetId(objectKey) {
    if (!objectKey) {
      return null;
    }

    const match = objectKey.match(/^input\/([^/]+)\//);

    return match?.[1] ?? null;
  }

  async verify({ bucket, key }) {
    const assetId = this.extractAssetId(key);

    if (!assetId) {
      return {
        accepted: false,
        reason: "INVALID_ASSET_KEY",
      };
    }

    const asset = await MediaAsset.findOne({
      assetId,

      status: {
        $ne: "DELETED",
      },
    });

    if (!asset) {
      return {
        accepted: false,
        reason: "ASSET_NOT_FOUND",

        assetId,
      };
    }

    if (asset.bucket !== bucket) {
      return {
        accepted: false,
        reason: "BUCKET_MISMATCH",

        assetId,
      };
    }

    if (asset.objectKey !== key) {
      return {
        accepted: false,
        reason: "OBJECT_KEY_MISMATCH",

        assetId,
      };
    }

    if (asset.status !== "UPLOADED") {
      return {
        accepted: false,
        reason: "INVALID_ASSET_STATUS",

        assetId,

        status: asset.status,
      };
    }

    let s3Object;

    try {
      s3Object = await this.storage.head({
        bucket,
        key,
      });
    } catch (error) {
      return {
        accepted: false,
        reason: "S3_OBJECT_NOT_FOUND",

        assetId,

        error: error.message,
      };
    }

    if (
      asset.size !== null &&
      asset.size !== undefined &&
      s3Object.size !== null &&
      asset.size !== s3Object.size
    ) {
      return {
        accepted: false,
        reason: "SIZE_MISMATCH",

        assetId,
      };
    }

    return {
      accepted: true,

      asset: {
        assetId: asset.assetId,

        originalName: asset.originalName,

        contentType: asset.contentType,

        bucket: asset.bucket,

        objectKey: asset.objectKey,

        etag: asset.etag,

        size: asset.size,
      },

      s3: s3Object,
    };
  }
}
