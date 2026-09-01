import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

import { SqsQueueService } from "../../queue/SqsQueueService.js";
import { mediaRoutes } from "./mediaRoutes.js";

export function createApiServer({ config }) {
  const app = Fastify({
    logger: true,
    bodyLimit: 1024 * 1024,
  });

  const queue = new SqsQueueService({
    region: config.aws.region,
    queueUrl: config.aws.sqsQueueUrl,
  });

  app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  app.register(mediaRoutes, {
    queue,
  });

  app.get("/health", async () => ({
    status: "ok",
  }));

  return app;
}
