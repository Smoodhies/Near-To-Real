import crypto from "node:crypto";

function safeEqual(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftBuffer = Buffer.from(left);

  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createApiKeyAuth({ config }) {
  const freeKey = config.apiSecurity.freeApiKey;

  const paidKey = config.apiSecurity.paidApiKey;

  return {
    authenticate(request) {
      const rawKey = request.headers["x-api-key"]?.toString().trim();

      if (!rawKey) {
        return {
          authenticated: false,

          reason: "API_KEY_REQUIRED",
        };
      }

      if (freeKey && safeEqual(rawKey, freeKey)) {
        return {
          authenticated: true,

          clientId: "free-client",

          tier: "FREE",

          priority: "NORMAL",

          rateLimit: config.apiSecurity.freeRateLimitPerMinute,

          maxConcurrentUploads: config.apiSecurity.freeMaxConcurrentUploads,

          maxUploadBytes: config.apiSecurity.freeMaxUploadBytes,
        };
      }

      if (paidKey && safeEqual(rawKey, paidKey)) {
        return {
          authenticated: true,

          clientId: "paid-client",

          tier: "PAID",

          priority: "HIGH",

          rateLimit: config.apiSecurity.paidRateLimitPerMinute,

          maxConcurrentUploads: config.apiSecurity.paidMaxConcurrentUploads,

          maxUploadBytes: config.apiSecurity.paidMaxUploadBytes,
        };
      }

      return {
        authenticated: false,

        reason: "INVALID_API_KEY",
      };
    },
  };
}
