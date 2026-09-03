import { Config } from "../config/config.js";

import { connectMongo } from "../database/mongo.js";

import { createMediaWorker } from "../createworker/createMediaWorker.js";

import { SqsQueueService } from "../queue/SqsQueueService.js";

import { SqsConsumer } from "../queue/SqsConsumer.js";

import { S3StorageService } from "../storage/S3StorageService.js";

import { AssetVerificationService } from "../services/AssetVerificationService.js";

import { JobWorkspace } from "./jobWorkerSpace.js";

const config = new Config().validate();

/*
 * --------------------------------------------------
 * MONGODB
 * --------------------------------------------------
 */

await connectMongo();

/*
 * --------------------------------------------------
 * WORKSPACE
 * --------------------------------------------------
 */

const workspace = new JobWorkspace({
  rootDirectory: config.paths.workspace,
});

/*
 * --------------------------------------------------
 * S3
 * --------------------------------------------------
 */

const storage = new S3StorageService({
  region: config.aws.region,
});

/*
 * --------------------------------------------------
 * ASSET VERIFICATION
 * --------------------------------------------------
 */

const assetVerification = new AssetVerificationService({
  storage,
});

/*
 * --------------------------------------------------
 * MEDIA WORKER
 * --------------------------------------------------
 *
 * createMediaWorker now receives:
 *
 * - maxAttempts
 * - processingLeaseTimeoutMs
 *
 * through the validated Config object.
 */

const worker = createMediaWorker({
  workspace,

  config,
});

/*
 * --------------------------------------------------
 * SQS
 * --------------------------------------------------
 */

const queueService = new SqsQueueService({
  region: config.aws.region,

  queueUrl: config.aws.sqsQueueUrl,
});

/*
 * --------------------------------------------------
 * SQS CONSUMER
 * --------------------------------------------------
 */

const consumer = new SqsConsumer({
  queueService,

  worker,

  storage,

  workspace,

  assetVerification,

  concurrency: config.worker.concurrency,

  visibilityTimeout: config.worker.sqsVisibilityTimeout,
});

/*
 * --------------------------------------------------
 * GRACEFUL SHUTDOWN
 * --------------------------------------------------
 */

let shuttingDown = false;

const shutdown = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log("Stopping SQS consumer...");

  consumer.stop();
};

process.on("SIGINT", shutdown);

process.on("SIGTERM", shutdown);

/*
 * --------------------------------------------------
 * START CONSUMER
 * --------------------------------------------------
 */

await consumer.start();
