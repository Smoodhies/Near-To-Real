export class SqsMessageFilter {
  filter(body) {
    if (!body || typeof body !== "object") {
      return {
        accepted: false,
        reason: "INVALID_MESSAGE",
      };
    }

    // AWS S3 test notification
    if (body.Service === "Amazon S3" && body.Event === "s3:TestEvent") {
      return {
        accepted: false,
        reason: "S3_TEST_EVENT",
      };
    }

    // Only accept our processing-job format
    if (body.schemaVersion !== "1.0" || !body.jobId || !body.source) {
      return {
        accepted: false,
        reason: "NOT_PROCESSING_JOB",
      };
    }

    if (body.source.type !== "s3") {
      return {
        accepted: false,
        reason: "UNSUPPORTED_SOURCE",
      };
    }

    if (
      typeof body.source.bucket !== "string" ||
      !body.source.bucket ||
      typeof body.source.key !== "string" ||
      !body.source.key
    ) {
      return {
        accepted: false,
        reason: "INVALID_S3_SOURCE",
      };
    }

    return {
      accepted: true,
      job: body,
    };
  }
}
