import crypto from "crypto";
import S3ServiceObject from "../services/aws/aws_S3_Service.js";
import ParseVideoUpload from "../utils/multiPartFormUpload.js";
import ApiErrorObject from "../utils/ApiError.js";
import ApiResponseObject from "../utils/ApiRespone.js";
import { API_ERROR } from "../constants/ApiErrorBible.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";
import MediaAsset from "../models/mediaAssset.model.js";

const SanitizeFileName = (fileName) => {
  if (!fileName) {
    throw ApiErrorObject.SendError({
      statusCode: 400,
      message: "File name is required",
    });
  }

  const sanitized = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "_");

  if (!sanitized) {
    throw ApiErrorObject.SendError({
      statusCode: 400,
      message: "Invalid file name",
    });
  }

  return sanitized;
};

/*
|--------------------------------------------------------------------------
| get Video File
|--------------------------------------------------------------------------
*/

const GetVideo = async (req, res) => {
  /*
   * -------------------------------------------------------
   * Extract values
   * Priority:
   *
   * params → body → query
   * -------------------------------------------------------
   */

  const assetId = req.params?.assetId ?? req.body?.assetId ?? req.query?.assetId;

  const originalName =
    req.params?.originalName ?? req.body?.originalName ?? req.query?.originalName;

  /*
   * -------------------------------------------------------
   * Validate input
   * -------------------------------------------------------
   */

  if (!assetId && !originalName) {
    throw ApiErrorObject.SendError({
      statusCode: 400,
      message: "Asset ID or original name is required",
    });
  }

  /*
   * -------------------------------------------------------
   * Build MongoDB query
   * -------------------------------------------------------
   */

  const conditions = [];

  if (assetId) {
    conditions.push({
      assetId,
    });
  }

  if (originalName) {
    conditions.push({
      originalName,
    });
  }

  /*
   * -------------------------------------------------------
   * Find asset
   * -------------------------------------------------------
   */

  const asset = await MediaAsset.findOne({
    $or: conditions,

    status: {
      $ne: "DELETED",
    },
  });



  /*
   * -------------------------------------------------------
   * Asset doesn't exist in DB
   * -------------------------------------------------------
   */

  if (!asset) {
    throw ApiErrorObject.SendError({
      statusCode: 404,
      message: "Video asset not found in database",
      errors: [
        {
          assetId,
          originalName,
        },
      ],
    });
  }

  /*
   * -------------------------------------------------------
   * Validate S3 key
   * -------------------------------------------------------
   */

  if (!asset.objectKey) {
    throw ApiErrorObject.SendError({
      statusCode: 500,
      message: "Video asset does not have an S3 object key",
      errors: [
        {
          assetId: asset.assetId,
        },
      ],
    });
  }

  /*
   * -------------------------------------------------------
   * Generate S3 signed URL
   * -------------------------------------------------------
   */

  const file = await S3ServiceObject.getSignedUrlForFile({
    key: asset.objectKey,

    expiresIn: 900,
  });

  /*
   * -------------------------------------------------------
   * Response
   * -------------------------------------------------------
   */

  return res.status(200).json(
    ApiResponseObject.SendResponse({
      statusCode: 200,

      message: "Video URL generated successfully",

      data: {
        assetId: asset.assetId,

        originalName: asset.originalName,

        contentType: asset.contentType,

        bucket: asset.bucket,

        objectKey: asset.objectKey,

        status: asset.status,

        url: file.url,

        expiresIn: file.expiresIn,

        size: file.size,

        etag: file.etag,
      },
    })
  );
};

/*
|--------------------------------------------------------------------------
| Upload Video
|--------------------------------------------------------------------------
*/

const UploadVideoToS3 = async (req, res) => {
  /*
   * Generate asset ID ONCE.
   */
  const assetId = crypto.randomUUID();

  let uploadedObjectKey = null;

  try {
    /*
     * Parse multipart upload.
     */
    const uploadResult = await ParseVideoUpload(req, {
      onFile: async ({ stream, originalName, contentType }) => {
        const safeFileName = SanitizeFileName(originalName);

        const key = `input/${assetId}/${safeFileName}`;

        console.log("Uploading asset:", {
          assetId,
          originalName,
          safeFileName,
          contentType,
          key,
        });

        /*
         * Upload to S3.
         */
        const s3Result = await S3ServiceObject.uploadStream({
          key,
          contentType,
          stream,
        });

        /*
         * Remember this so that if MongoDB
         * fails we can cleanup S3.
         */
        uploadedObjectKey = key;

        /*
         * Get metadata from S3.
         */
        const metadata = await S3ServiceObject.getObjectMetadata({
          key,
        });

        /*
         * Return ALL information required
         * by MongoDB.
         */
        return {
          ...s3Result,

          assetId,

          originalName: safeFileName,

          contentType,

          size: metadata.contentLength,
        };
      },
    });

    /*
     * S3 succeeded.
     *
     * Now create MongoDB record.
     */
    const mediaAsset = await MediaAsset.create({
      assetId,

      originalName: uploadResult.originalName,

      contentType: uploadResult.contentType,

      bucket: uploadResult.bucket,

      objectKey: uploadResult.key,

      etag: uploadResult.etag,

      size: uploadResult.size,

      status: "UPLOADED",
    });

    /*
     * Response.
     */
    return res.status(201).json(
      ApiResponseObject.SendResponse({
        statusCode: 201,

        message: "Video uploaded successfully",

        data: {
          assetId: mediaAsset.assetId,

          originalName: mediaAsset.originalName,

          contentType: mediaAsset.contentType,

          size: mediaAsset.size,

          bucket: mediaAsset.bucket,

          key: mediaAsset.objectKey,

          etag: mediaAsset.etag,

          status: mediaAsset.status,
        },
      })
    );
  } catch (error) {
    /*
     * If S3 succeeded but MongoDB failed,
     * cleanup S3.
     */
    if (uploadedObjectKey) {
      try {
        await S3ServiceObject.deleteObject({
          key: uploadedObjectKey,
        });

        console.log("Cleaned up S3 object:", uploadedObjectKey);
      } catch (cleanupError) {
        console.error("CRITICAL: S3 cleanup failed", {
          key: uploadedObjectKey,
          error: cleanupError?.message,
        });
      }
    }

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| Update Video
|--------------------------------------------------------------------------
*/

const UpdateVideo = async (req, res) => {
  const { assetId } = req.params;

  if (!assetId) {
    throw ApiErrorObject.SendError({
      statusCode: 400,
      message: "Asset ID is required",
    });
  }

  /*
   * Find existing asset.
   */
  const asset = await MediaAsset.findOne({
    assetId,
  });

  if (!asset) {
    throw ApiErrorObject.SendError({
      statusCode: 404,
      message: "Video asset not found",
    });
  }

  /*
   * Don't allow update while processing.
   */
  if (asset.status === "PROCESSING") {
    throw ApiErrorObject.SendError({
      statusCode: 409,
      message: "Cannot update video while it is being processed",
    });
  }

  const oldKey = asset.objectKey;

  let newKey = null;

  try {
    /*
     * Upload new video FIRST.
     */
    const uploadResult = await ParseVideoUpload(req, {
      onFile: async ({ stream, originalName, contentType }) => {
        const safeFileName = SanitizeFileName(originalName);

        newKey = `input/${assetId}/${safeFileName}`;

        /*
         * Upload new file.
         */
        const s3Result = await S3ServiceObject.uploadStream({
          key: newKey,
          contentType,
          stream,
        });

        /*
         * Get new metadata.
         */
        const metadata = await S3ServiceObject.getObjectMetadata({
          key: newKey,
        });

        return {
          ...s3Result,

          originalName: safeFileName,

          contentType,

          size: metadata.contentLength,
        };
      },
    });

    /*
     * New upload succeeded.
     *
     * Now remove old object.
     */
    if (oldKey && oldKey !== newKey) {
      await S3ServiceObject.deleteObject({
        key: oldKey,
      });
    }

    /*
     * Update MongoDB.
     */
    asset.originalName = uploadResult.originalName;

    asset.contentType = uploadResult.contentType;

    asset.objectKey = uploadResult.key;

    asset.etag = uploadResult.etag;

    asset.size = uploadResult.size;

    asset.status = "UPLOADED";

    await asset.save();

    return res.status(200).json(
      ApiResponseObject.SendResponse({
        statusCode: 200,

        message: "Video updated successfully",

        data: {
          assetId: asset.assetId,

          originalName: asset.originalName,

          contentType: asset.contentType,

          size: asset.size,

          bucket: asset.bucket,

          key: asset.objectKey,

          etag: asset.etag,

          status: asset.status,
        },
      })
    );
  } catch (error) {
    /*
     * If NEW upload succeeded but something
     * afterward failed, cleanup NEW object.
     *
     * Never delete the old object here.
     */
    if (newKey && newKey !== oldKey) {
      try {
        await S3ServiceObject.deleteObject({
          key: newKey,
        });
      } catch (cleanupError) {
        console.error("Failed to cleanup new S3 object", {
          key: newKey,
          error: cleanupError?.message,
        });
      }
    }

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| Delete Video
|--------------------------------------------------------------------------
*/

const DeleteVideo = async (req, res) => {
  const { assetId } = req.params;

  if (!assetId) {
    throw ApiErrorObject.SendError({
      statusCode: 400,
      message: "Asset ID is required",
    });
  }

  /*
   * Find asset.
   */
  const asset = await MediaAsset.findOne({
    assetId,
  });

  if (!asset) {
    throw ApiErrorObject.SendError({
      statusCode: 404,
      message: "Video asset not found",
    });
  }

  /*
   * Don't delete while processing.
   */
  if (asset.status === "PROCESSING") {
    throw ApiErrorObject.SendError({
      statusCode: 409,
      message: "Cannot delete video while it is being processed",
    });
  }

  /*
   * Delete S3 object.
   */
  await S3ServiceObject.deleteObject({
    key: asset.objectKey,
  });

  /*
   * Soft delete in MongoDB.
   */
  asset.status = "DELETED";

  await asset.save();

  return res.status(200).json(
    ApiResponseObject.SendResponse({
      statusCode: 200,

      message: "Video deleted successfully",

      data: {
        assetId: asset.assetId,

        key: asset.objectKey,

        status: asset.status,
      },
    })
  );
};

/*
|--------------------------------------------------------------------------
| Controller Object
|--------------------------------------------------------------------------
*/

const UploadController = {
  UploadVideoToS3,
  UpdateVideo,
  DeleteVideo,
  GetVideo,
};

export default UploadController;
