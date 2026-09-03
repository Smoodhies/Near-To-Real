import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { Upload } from "@aws-sdk/lib-storage";

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

export class S3StorageService {
  constructor({ region }) {
    if (!region) {
      throw new Error("S3StorageService requires region");
    }

    this.client = new S3Client({
      region,
    });
  }

  async head({ bucket, key }) {
    if (!bucket) {
      throw new Error("S3 head requires bucket");
    }

    if (!key) {
      throw new Error("S3 head requires key");
    }

    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    return {
      bucket,
      key,
      etag: response.ETag ?? null,
      size: response.ContentLength ?? null,
      contentType: response.ContentType ?? null,
      lastModified: response.LastModified ?? null,
    };
  }

  async download({ bucket, key, destination }) {
    if (!bucket) {
      throw new Error("S3 download requires bucket");
    }

    if (!key) {
      throw new Error("S3 download requires key");
    }

    if (!destination) {
      throw new Error("S3 download requires destination");
    }

    await fsPromises.mkdir(path.dirname(destination), {
      recursive: true,
    });

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error(`S3 object has no body: ${bucket}/${key}`);
    }

    const fileStream = fs.createWriteStream(destination);

    await pipeline(response.Body, fileStream);

    return {
      bucket,
      key,
      path: destination,
      size: response.ContentLength ?? null,
      contentType: response.ContentType ?? null,
    };
  }

  /*
   * --------------------------------------------------
   * DIRECT STREAM UPLOAD
   * --------------------------------------------------
   *
   * Multipart video is streamed directly into S3.
   *
   * API does NOT:
   *
   * request
   *   ↓
   * local disk
   *   ↓
   * S3
   *
   * Instead:
   *
   * request stream
   *   ↓
   * S3 multipart upload
   *
   * This is significantly better for large videos.
   */

  async uploadStream({ bucket, key, stream, contentType, maxBytes }) {
    if (!bucket) {
      throw new Error("S3 upload requires bucket");
    }

    if (!key) {
      throw new Error("S3 upload requires key");
    }

    if (!stream) {
      throw new Error("S3 upload requires stream");
    }

    const counter = new Transform({
      transform(chunk, encoding, callback) {
        this.bytesReceived += chunk.length;

        if (maxBytes && this.bytesReceived > maxBytes) {
          callback(
            new Error(
              `Uploaded file exceeds the maximum allowed size of ${Math.floor(
                maxBytes / (1024 * 1024)
              )} MB.`
            )
          );

          return;
        }

        callback(null, chunk);
      },
    });

    counter.bytesReceived = 0;

    /*
     * Abort the multipart upload if the stream fails.
     */

    const upload = new Upload({
      client: this.client,

      params: {
        Bucket: bucket,

        Key: key,

        Body: stream.pipe(counter),

        ContentType: contentType ?? "application/octet-stream",
      },

      /*
       * Multipart upload settings.
       *
       * Larger parts reduce request overhead for
       * large media files.
       */

      partSize: 10 * 1024 * 1024,

      queueSize: 4,

      leavePartsOnError: false,
    });

    const response = await upload.done();

    if (counter.bytesReceived <= 0) {
      throw new Error("Uploaded video file is empty.");
    }

    return {
      bucket,

      key,

      etag: response.ETag ?? null,

      size: counter.bytesReceived,

      contentType: contentType ?? "application/octet-stream",
    };
  }

  /*
   * --------------------------------------------------
   * LEGACY FILE UPLOAD
   * --------------------------------------------------
   *
   * Kept for existing processing code that may still
   * use filePath-based uploads.
   */

  async upload({ bucket, key, filePath, contentType }) {
    if (!bucket) {
      throw new Error("S3 upload requires bucket");
    }

    if (!key) {
      throw new Error("S3 upload requires key");
    }

    if (!filePath) {
      throw new Error("S3 upload requires filePath");
    }

    const body = fs.createReadStream(filePath);

    const upload = new Upload({
      client: this.client,

      params: {
        Bucket: bucket,

        Key: key,

        Body: body,

        ContentType: contentType ?? "application/octet-stream",
      },

      partSize: 10 * 1024 * 1024,

      queueSize: 4,

      leavePartsOnError: false,
    });

    const response = await upload.done();

    const stats = await fsPromises.stat(filePath);

    return {
      bucket,

      key,

      etag: response.ETag ?? null,

      size: stats.size,

      contentType: contentType ?? "application/octet-stream",
    };
  }
}
