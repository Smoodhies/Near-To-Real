export class S3EventParser {
  parse(body) {
    if (!body || typeof body !== "object") {
      return {
        accepted: false,

        reason: "INVALID_MESSAGE",
      };
    }

    /*
     * --------------------------------------------------
     * S3 TEST EVENT
     * --------------------------------------------------
     */

    if (body.Service === "Amazon S3" && body.Event === "s3:TestEvent") {
      return {
        accepted: false,

        reason: "S3_TEST_EVENT",
      };
    }

    /*
     * --------------------------------------------------
     * S3 EVENT
     * --------------------------------------------------
     */

    if (Array.isArray(body.Records)) {
      return this.#parseRecords(body.Records);
    }

    /*
     * --------------------------------------------------
     * API PROCESSING MESSAGE
     * --------------------------------------------------
     */

    if (body.schemaVersion === "1.0" && body.jobId && body.source) {
      if (body.trigger !== "API") {
        return {
          accepted: false,

          reason: "INVALID_API_TRIGGER",
        };
      }

      if (body.source.type !== "s3") {
        return {
          accepted: false,

          reason: "UNSUPPORTED_SOURCE",
        };
      }

      return {
        accepted: true,

        jobs: [body],
      };
    }

    return {
      accepted: false,

      reason: "UNKNOWN_MESSAGE_FORMAT",
    };
  }

  #parseRecords(records) {
    const jobs = [];

    for (const record of records) {
      if (!record.eventName?.startsWith("ObjectCreated:")) {
        continue;
      }

      const bucket = record.s3?.bucket?.name;

      const encodedKey = record.s3?.object?.key;

      if (!bucket || !encodedKey) {
        continue;
      }

      const key = decodeURIComponent(encodedKey.replace(/\+/g, " "));

      if (!this.#isVideo(key)) {
        continue;
      }

      jobs.push({
        schemaVersion: "1.0",

        trigger: "S3_EVENT",

        assetId: null,

        source: {
          type: "s3",

          bucket,

          key,
        },

        options: {
          generateWav: true,

          generateMp3: true,

          generateVideoOnly: true,

          extractSubtitles: true,
        },

        metadata: {
          source: "s3-event",

          eventName: record.eventName,
        },
      });
    }

    if (jobs.length === 0) {
      return {
        accepted: false,

        reason: "NO_SUPPORTED_VIDEO",
      };
    }

    return {
      accepted: true,

      jobs,
    };
  }

  #isVideo(key) {
    const extension = key.toLowerCase().split(".").pop();

    return ["mp4", "mkv", "mov", "avi", "webm", "m4v", "ts", "mts"].includes(extension);
  }
}
