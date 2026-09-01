import { Config } from "../config/config.js";
import { connectMongo } from "../database/mongo.js";
import { createMediaWorker } from "../createworker/createMediaWorker.js";
import { SqsQueueService } from "../queue/SqsQueueService.js";
import { SqsConsumer } from "../queue/SqsConsumer.js";
import { S3StorageService } from "../storage/S3StorageService.js";
import { AssetVerificationService } from "../services/AssetVerificationService.js";
import { JobWorkspace } from "./jobWorkerSpace.js";

const config = new Config().validate();

await connectMongo();

const workspace = new JobWorkspace({
  rootDirectory: config.paths.workspace,
});

const storage = new S3StorageService({
  region: config.aws.region,
});

const assetVerification = new AssetVerificationService({
  storage,
});

const worker = createMediaWorker({
  workspace,
  config,
});

const queueService = new SqsQueueService({
  region: config.aws.region,
  queueUrl: config.aws.sqsQueueUrl,
});

const consumer = new SqsConsumer({
  queueService,
  worker,
  storage,
  workspace,
  assetVerification,
  concurrency: config.worker.concurrency,
  visibilityTimeout: config.worker.sqsVisibilityTimeout,
});

const shutdown = () => {
  console.log("Stopping SQS consumer...");
  consumer.stop();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await consumer.start();
