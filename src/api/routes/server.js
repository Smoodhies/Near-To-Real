import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";

import { connectMongo } from "../../database/mongo.js";
import { S3StorageService } from "../../storage/S3StorageService.js";
import { SqsQueueService } from "../../queue/SqsQueueService.js";

import { createApiKeyAuth } from "../auth/apiKeyAuth.js";

import { mediaRoutes } from "./mediaRoutes.js";

export function createApiServer({ config }) {
  const app = Fastify({
    logger: true,

    bodyLimit: 1024 * 1024,
  });

  const apiKeyAuth = createApiKeyAuth({
    config,
  });

  /*
   * --------------------------------------------------
   * REQUEST DECORATION
   * --------------------------------------------------
   */

  app.decorateRequest("apiClient", null);

  /*
   * --------------------------------------------------
   * API KEY AUTHENTICATION
   * --------------------------------------------------
   *
   * Every protected API request must contain:
   *
   * X-API-Key: ...
   *
   * Health endpoint is excluded below.
   */

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health") {
      return;
    }

    const result = apiKeyAuth.authenticate(request);

    if (!result.authenticated) {
      return reply.code(401).send({
        success: false,

        error: result.reason,

        message:
          result.reason === "API_KEY_REQUIRED"
            ? "X-API-Key header is required."
            : "The supplied API key is invalid.",
      });
    }

    request.apiClient = result;
  });

  /*
   * --------------------------------------------------
   * RATE LIMIT
   * --------------------------------------------------
   *
   * Rate-limit by API key, not by IP.
   *
   * This allows FREE and PAID clients to have
   * different limits.
   *
   * The plugin supports dynamic max values based
   * on the generated key.
   */

  app.register(rateLimit, {
    hook: "preHandler",

    keyGenerator(request) {
      const key = request.headers["x-api-key"]?.toString().trim();

      return key || request.ip;
    },

    max: async (request) => {
      /*
       * Health endpoint does not need API-key
       * rate limiting.
       */

      if (request.url === "/health") {
        return 1000000;
      }

      return request.apiClient?.rateLimit ?? config.apiSecurity.freeRateLimitPerMinute;
    },

    timeWindow: "1 minute",

    errorResponseBuilder: (_request, context) => {
      return {
        success: false,

        error: "RATE_LIMIT_EXCEEDED",

        message: `Too many requests. Retry after ${context.after}.`,

        retryAfterSeconds: context.ttl ? Math.ceil(context.ttl / 1000) : null,
      };
    },
  });

  /*
   * --------------------------------------------------
   * MULTIPART
   * --------------------------------------------------
   *
   * We stream video to disk.
   *
   * No toBuffer().
   */

  app.register(multipart, {
    limits: {
      files: 1,

      fields: 2,

      parts: 3,

      /*
       * The actual FREE/PAID upload limit is enforced
       * per request inside mediaRoutes.
       *
       * This global value is only a hard upper ceiling.
       */
      fileSize: config.apiSecurity.paidMaxUploadBytes,
    },

    throwFileSizeLimit: false,
  });

  /*
   * --------------------------------------------------
   * SHARED SERVICES
   * --------------------------------------------------
   */

  const storage = new S3StorageService({
    region: config.aws.region,
  });

  const queue = new SqsQueueService({
    region: config.aws.region,

    queueUrl: config.aws.sqsQueueUrl,
  });

  /*
   * --------------------------------------------------
   * MONGODB
   * --------------------------------------------------
   */

  app.addHook("onReady", async () => {
    await connectMongo();
  });

  /*
   * --------------------------------------------------
   * ROUTES
   * --------------------------------------------------
   */

  app.register(mediaRoutes, {
    queue,
    storage,
    config,
  });

  /*
   * --------------------------------------------------
   * HEALTH
   * --------------------------------------------------
   */

  app.get("/health", async () => {
    return {
      status: "ok",
      service: "media-api",
    };
  });

  return app;
}
