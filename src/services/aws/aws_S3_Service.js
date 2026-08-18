import { PutObjectCommand, DeleteObjectCommand, HeadObjectCommand ,GetObjectCommand } from "@aws-sdk/client-s3";

import { getSignedUrl  } from "@aws-sdk/s3-request-presigner";

import { Upload } from "@aws-sdk/lib-storage";

import { s3Client } from "../../config/awsClient.js";

import ApiErrorObject from "../../utils/ApiError.js";

import { API_ERROR } from "../../constants/ApiErrorBible.js";


class S3Service {
  constructor({ client, bucketName }) {
    if (!client) {
      throw new Error("S3 client is required");
    }

    if (!bucketName) {
      throw new Error("S3 bucket name is required");
    }

    this.client = client;
    this.bucketName = bucketName;
  }

  async getSignedUrlForFile({ key, expiresIn = 900 }) {
    try {
      if (!key) {
        throw ApiErrorObject.SendError({
          statusCode: 400,
          message: "S3 object key is required",
        });
      }

      /*
       * IMPORTANT:
       *
       * getSignedUrl() itself does NOT check
       * whether the object actually exists.
       *
       * So first check S3.
       */
      const metadata = await this.getObjectMetadata({
        key,
      });

      if (!metadata.exists) {
        throw ApiErrorObject.SendError({
          statusCode: 404,
          message: "S3 object not found",
          errors: [
            {
              key,
            },
          ],
        });
      }

      /*
       * Create GetObject command.
       */
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      /*
       * Generate temporary signed URL.
       */
      const signedUrl = await getSignedUrl(this.client, command, {
        expiresIn,
      });

      if (!signedUrl) {
        throw ApiErrorObject.SendError({
          statusCode: 500,
          message: "Failed to generate S3 signed URL",
        });
      }

      return {
        url: signedUrl,

        expiresIn,

        bucket: this.bucketName,

        key,

        contentType: metadata.contentType,

        size: metadata.contentLength,

        etag: metadata.etag,

        lastModified: metadata.lastModified,
      };
    } catch (error) {
      /*
       * Don't destroy an existing ApiError.
       */
      if (error?.statusCode) {
        throw error;
      }

      console.error("S3 signed URL generation failed:", error);

      throw ApiErrorObject.SendError({
        statusCode: 500,
        message: "Failed to generate S3 signed URL",
        errors: [
          {
            operation: "getSignedUrlForFile",

            originalMessage: error?.message,
          },
        ],
      });
    }
  }

  async uploadStream({ key, contentType, stream }) {
    try {
      if (!key) {
        throw ApiErrorObject.SendError({
          statusCode: 400,
          message: "S3 object key is required",
        });
      }

      if (!contentType) {
        throw ApiErrorObject.SendError({
          statusCode: 400,
          message: "Content type is required",
        });
      }

      if (!stream) {
        throw ApiErrorObject.SendError({
          statusCode: 400,
          message: "Upload stream is required",
        });
      }

      console.log("Starting S3 upload:", key);

      const upload = new Upload({
        client: this.client,

        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: stream,
          ContentType: contentType,
        },

        /*
         * 8 MB S3 multipart parts
         */
        partSize: 8 * 1024 * 1024,

        /*
         * Maximum concurrent parts
         */
        queueSize: 4,

        /*
         * Cleanup incomplete multipart
         * upload if something fails.
         */
        leavePartsOnError: false,
      });

      upload.on("httpUploadProgress", (progress) => {
        console.log("S3 upload progress:", {
          loaded: progress.loaded,
          total: progress.total,
        });
      });

      const result = await upload.done();

      console.log("S3 upload completed:", {
        key,
        etag: result.ETag,
      });

      return {
        bucket: this.bucketName,

        key,

        etag: result.ETag,

        location: result.Location,
      };
    } catch (error) {
      console.error("S3 upload failed:", error);

      if (error?.statusCode) {
        throw error;
      }

      throw ApiErrorObject.SendError({
        statusCode: 500,
        message: "Failed to upload file to S3",
        errors: [
          {
            service: "S3",
            operation: "uploadStream",
            originalMessage: error?.message,
          },
        ],
      });
    }
  }

  async getObjectMetadata({ key }) {
    try {
      if (!key) {
        throw ApiErrorObject.SendError({
          statusCode: 400,
          message: "S3 object key is required",
        });
      }

      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const result = await this.client.send(command);

      return {
        exists: true,

        contentLength: result.ContentLength,

        contentType: result.ContentType,

        etag: result.ETag,

        lastModified: result.LastModified,

        metadata: result.Metadata,
      };
    } catch (error) {
      if (
        error?.name === "NotFound" ||
        error?.name === "NoSuchKey" ||
        error?.$metadata?.httpStatusCode === 404
      ) {
        return {
          exists: false,
        };
      }

      throw ApiErrorObject.SendError({
        ...API_ERROR.CLIENT.NOT_FOUND,
        statusCode: 500,
        message: "Failed to get S3 object metadata",
        errors: [
          {
            operation: "getObjectMetadata",

            originalMessage: error?.message,
          },
        ],
      });
    }
  }

  async deleteObject({ key }) {
    try {
      if (!key) {
        throw ApiErrorObject.SendError({
          statusCode: 400,
          message: "S3 object key is required",
        });
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const result = await this.client.send(command);

      return {
        bucket: this.bucketName,
        key,
        deleteMarker: result.DeleteMarker ?? false,
        versionId: result.VersionId ?? null,
      };
    } catch (error) {
      console.error("S3 delete failed:", error);

      if (error?.statusCode) {
        throw error;
      }

      throw ApiErrorObject.SendError({
        statusCode: 500,
        message: "Failed to delete S3 object",
        errors: [
          {
            service: "S3",
            operation: "deleteObject",
            originalMessage: error?.message,
          },
        ],
      });
    }
  }
}

const S3ServiceObject = new S3Service({
  client: s3Client,
  bucketName: process.env.AWS_S3_BUCKET,
});

export default S3ServiceObject;
