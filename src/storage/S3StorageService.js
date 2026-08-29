import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

import { pipeline } from "node:stream/promises";

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

    const response = await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType ?? "application/octet-stream",
      })
    );

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
