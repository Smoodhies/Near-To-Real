import "dotenv/config";
import autocannon from "autocannon";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

function getEnv(name, fallback = undefined) {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return fallback;
  }

  return value;
}

function getNumberEnv(name, fallback) {
  const value = Number(getEnv(name, fallback));

  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number`);
  }

  return value;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "0 B";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  }

  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) {
    return "N/A";
  }

  if (ms < 1000) {
    return `${ms.toFixed(2)} ms`;
  }

  return `${(ms / 1000).toFixed(2)} s`;
}

function percent(value, total) {
  if (!total) {
    return 0;
  }

  return (value / total) * 100;
}

function getSystemSnapshot() {
  const memory = process.memoryUsage();

  return {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cpuCount: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    processRssBytes: memory.rss,
    processHeapUsedBytes: memory.heapUsed,
    processHeapTotalBytes: memory.heapTotal,
    processExternalBytes: memory.external,
  };
}

function getVideoContentType(filename) {
  const extension = path.extname(filename).toLowerCase();

  switch (extension) {
    case ".mp4":
      return "video/mp4";

    case ".mov":
      return "video/quicktime";

    case ".webm":
      return "video/webm";

    case ".mkv":
      return "video/x-matroska";

    case ".avi":
      return "video/x-msvideo";

    default:
      return "application/octet-stream";
  }
}

function buildMultipartBody(videoBuffer, filename, contentType) {
  const boundary = `----Near2RealLoadTest${randomUUID().replaceAll("-", "")}`;

  const header = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="video"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    "utf8"
  );

  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");

  return {
    body: Buffer.concat([header, videoBuffer, footer]),
    boundary,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function main() {
  // ============================================================
  // TEST CONFIG
  // ============================================================

  const testName = getEnv("LOAD_TEST_NAME", "video-baseline");

  const description = getEnv("LOAD_TEST_DESCRIPTION", "Near2Real multipart video upload baseline");

  const environment = getEnv("LOAD_TEST_ENVIRONMENT", "local");

  const service = getEnv("LOAD_TEST_SERVICE", "n2r_mediaprocessing");

  // ============================================================
  // API CONFIG
  // ============================================================

  const url = getEnv("LOAD_TEST_URL", "http://localhost:3000/media/jobs");

  const method = getEnv("LOAD_TEST_METHOD", "POST").toUpperCase();

  // ============================================================
  // VIDEO CONFIG
  // ============================================================

  const videoPath = path.resolve(
    getEnv("LOAD_TEST_VIDEO", "./test-media/chai_pe_charcha-1080.mp4")
  );

  // ============================================================
  // LOAD CONFIG
  // ============================================================

  const connections = getNumberEnv("LOAD_TEST_CONNECTIONS", 1);

  const duration = getNumberEnv("LOAD_TEST_DURATION_SECONDS", 30);

  const pipelining = getNumberEnv("LOAD_TEST_PIPELINING", 1);

  const timeout = getNumberEnv("LOAD_TEST_TIMEOUT_MS", 120000);

  // ============================================================
  // AUTH CONFIG
  // ============================================================

  const apiKey = getEnv("LOAD_TEST_API_KEY", "");

  if (!apiKey) {
    throw new Error("LOAD_TEST_API_KEY is required for video load testing");
  }

  // ============================================================
  // IDEMPOTENCY CONFIG
  // ============================================================

  const idempotencyMode = getEnv("LOAD_TEST_IDEMPOTENCY_MODE", "unique").toLowerCase();

  if (idempotencyMode !== "unique" && idempotencyMode !== "fixed") {
    throw new Error("LOAD_TEST_IDEMPOTENCY_MODE must be either 'unique' or 'fixed'");
  }

  // ============================================================
  // WORKER CONFIG
  // ============================================================

  const workerEnabled = getEnv("LOAD_TEST_WORKER_ENABLED", "true").toLowerCase() === "true";

  const workerConcurrency = getNumberEnv("LOAD_TEST_WORKER_CONCURRENCY", 2);

  const workerType = getEnv("LOAD_TEST_WORKER_TYPE", "media-worker");

  // ============================================================
  // THRESHOLDS
  // ============================================================

  const maxErrorRate = getNumberEnv("LOAD_TEST_MAX_ERROR_RATE", 0);

  const maxTimeouts = getNumberEnv("LOAD_TEST_MAX_TIMEOUTS", 0);

  const maxP99 = getNumberEnv("LOAD_TEST_MAX_P99_MS", 5000);

  // ============================================================
  // REPORT
  // ============================================================

  const reportPath = path.resolve(getEnv("LOAD_TEST_REPORT", "docs/video-load-test-results.md"));

  // ============================================================
  // VALIDATION
  // ============================================================

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  if (method !== "POST") {
    throw new Error(`Video load test requires POST. Current method: ${method}`);
  }

  if (pipelining !== 1) {
    console.warn(`WARNING: Recommended video pipelining is 1. Current: ${pipelining}`);
  }

  // ============================================================
  // LOAD VIDEO
  // ============================================================

  const videoBuffer = fs.readFileSync(videoPath);

  const filename = path.basename(videoPath);

  const videoContentType = getVideoContentType(filename);

  const multipart = buildMultipartBody(videoBuffer, filename, videoContentType);

  // ============================================================
  // HEADERS
  // ============================================================

  /*
   * IMPORTANT:
   *
   * X-API-Key
   *     -> authenticates the API client
   *
   * Idempotency-Key
   *     -> prevents accidental duplicate processing
   *
   * Content-Type
   *     -> tells Fastify this is multipart/form-data
   *
   * Content-Length
   *     -> tells server exact request size
   */

  const headers = {
    "X-API-Key": apiKey,
    Accept: "application/json",
    "Content-Type": multipart.contentType,
    "Content-Length": String(multipart.body.length),
  };

  // ============================================================
  // CONSOLE CONFIG
  // ============================================================

  console.log("");
  console.log("============================================================");
  console.log("Near2Real VIDEO PIPELINE LOAD TEST");
  console.log("============================================================");

  console.log("");
  console.log("TEST");
  console.log("----------------------------------------");
  console.log(`Name              : ${testName}`);
  console.log(`Description       : ${description}`);
  console.log(`Environment       : ${environment}`);
  console.log(`Service           : ${service}`);

  console.log("");
  console.log("API");
  console.log("----------------------------------------");
  console.log(`URL               : ${url}`);
  console.log(`Method            : ${method}`);
  console.log(`X-API-Key         : supplied`);
  console.log(`Idempotency       : ${idempotencyMode}`);

  console.log("");
  console.log("VIDEO");
  console.log("----------------------------------------");
  console.log(`File              : ${filename}`);
  console.log(`Video size        : ${formatBytes(videoBuffer.length)}`);
  console.log(`Multipart size    : ${formatBytes(multipart.body.length)}`);
  console.log(`Content-Type      : ${videoContentType}`);

  console.log("");
  console.log("LOAD");
  console.log("----------------------------------------");
  console.log(`Connections       : ${connections}`);
  console.log(`Duration          : ${duration}s`);
  console.log(`Pipelining        : ${pipelining}`);
  console.log(`Timeout           : ${timeout} ms`);

  console.log("");
  console.log("WORKER");
  console.log("----------------------------------------");
  console.log(`Enabled           : ${workerEnabled}`);
  console.log(`Concurrency       : ${workerConcurrency}`);
  console.log(`Type              : ${workerType}`);

  console.log("");
  console.log("THRESHOLDS");
  console.log("----------------------------------------");
  console.log(`Max error rate    : ${maxErrorRate}%`);
  console.log(`Max timeouts      : ${maxTimeouts}`);
  console.log(`Max p99           : ${maxP99} ms`);

  console.log("");
  console.log("============================================================");
  console.log("");

  // ============================================================
  // SYSTEM SNAPSHOT BEFORE
  // ============================================================

  const before = getSystemSnapshot();

  const startTime = Date.now();

  // ============================================================
  // AUTOCANNON
  // ============================================================

  const instance = autocannon(
    {
      url,
      method,

      connections,
      duration,
      pipelining,
      timeout,

      /*
       * Same multipart video body is reused for requests.
       *
       * Idempotency-Key is changed per request when mode=unique.
       */
      headers,

      body: multipart.body,

      setupClient(client) {
        if (idempotencyMode === "unique") {
          client.setHeaders({
            "X-API-Key": apiKey,
            "Idempotency-Key": `loadtest-${randomUUID()}`,
          });
        }

        if (idempotencyMode === "fixed") {
          client.setHeaders({
            "X-API-Key": apiKey,
            "Idempotency-Key": "loadtest-fixed-key",
          });
        }
      },
    },
    (error, result) => {
      if (error) {
        console.error("");
        console.error("VIDEO LOAD TEST FAILED");
        console.error(error);

        process.exitCode = 1;
        return;
      }

      finish(result);
    }
  );

  autocannon.track(instance, {
    renderProgressBar: true,
  });

  // ============================================================
  // RESULT PROCESSING
  // ============================================================

  async function finish(result) {
    const endTime = Date.now();

    const after = getSystemSnapshot();

    // ----------------------------------------------------------
    // REQUEST COUNTS
    // ----------------------------------------------------------

    const requestsSent = Number(result.requests?.sent ?? 0);

    const requestsCompleted = Number(result.requests?.total ?? 0);

    const errors = Number(result.errors ?? 0);

    const timeouts = Number(result.timeouts ?? 0);

    const resets = Number(result.resets ?? 0);

    const non2xx = Number(result.non2xx ?? 0);

    /*
     * IMPORTANT:
     *
     * requests.total can be 0 if requests fail before
     * receiving a successful response.
     *
     * Therefore requests.total MUST NOT be used alone
     * for error-rate calculation.
     */

    const attemptedRequests = Math.max(
      requestsSent,
      requestsCompleted + errors + timeouts + resets
    );

    const successful2xx = Math.max(requestsCompleted - non2xx, 0);

    const failedRequests = errors + timeouts + resets + non2xx;

    const errorRate = percent(failedRequests, attemptedRequests);

    // ----------------------------------------------------------
    // LATENCY
    // ----------------------------------------------------------

    const latencyAvg = Number(result.latency?.average ?? 0);

    const latencyP50 = Number(result.latency?.p50 ?? 0);

    const latencyP90 = Number(result.latency?.p90 ?? 0);

    const latencyP95 = Number(result.latency?.p95 ?? 0);

    const latencyP99 = Number(result.latency?.p99 ?? 0);

    const latencyMax = Number(result.latency?.max ?? 0);

    // ----------------------------------------------------------
    // THROUGHPUT
    // ----------------------------------------------------------

    const requestsPerSecond = Number(result.requests?.average ?? 0);

    const totalBytes = Number(result.throughput?.bytes ?? 0);

    const elapsedSeconds = (endTime - startTime) / 1000;

    const bytesPerSecond = elapsedSeconds > 0 ? totalBytes / elapsedSeconds : 0;

    const mbPerSecond = bytesPerSecond / 1024 / 1024;

    // ----------------------------------------------------------
    // PASS / FAIL
    // ----------------------------------------------------------

    const hasRequests = attemptedRequests > 0;

    const noErrors = errors === 0;

    const timeoutCheck = timeouts <= maxTimeouts;

    const errorRateCheck = errorRate <= maxErrorRate;

    const p99Check = latencyP99 <= maxP99;

    const pass = hasRequests && noErrors && timeoutCheck && errorRateCheck && p99Check;

    const status = pass ? "PASS" : "FAIL";

    // ----------------------------------------------------------
    // CONSOLE RESULT
    // ----------------------------------------------------------

    console.log("");
    console.log("============================================================");
    console.log("VIDEO LOAD TEST RESULT");
    console.log("============================================================");

    console.log("");
    console.log(`RESULT             : ${status}`);

    console.log("");
    console.log("REQUESTS");
    console.log("----------------------------------------");

    console.log(`Requests sent      : ${requestsSent.toLocaleString()}`);

    console.log(`Requests completed : ${requestsCompleted.toLocaleString()}`);

    console.log(`Successful 2xx     : ${successful2xx.toLocaleString()}`);

    console.log(`Errors             : ${errors.toLocaleString()}`);

    console.log(`Timeouts           : ${timeouts.toLocaleString()}`);

    console.log(`Resets             : ${resets.toLocaleString()}`);

    console.log(`Non-2xx            : ${non2xx.toLocaleString()}`);

    console.log(`Error rate         : ${errorRate.toFixed(4)}%`);

    console.log("");
    console.log("LATENCY");
    console.log("----------------------------------------");

    console.log(`Average            : ${latencyAvg.toFixed(2)} ms`);

    console.log(`P50                : ${latencyP50.toFixed(2)} ms`);

    console.log(`P90                : ${latencyP90.toFixed(2)} ms`);

    console.log(`P95                : ${latencyP95.toFixed(2)} ms`);

    console.log(`P99                : ${latencyP99.toFixed(2)} ms`);

    console.log(`Maximum            : ${latencyMax.toFixed(2)} ms`);

    console.log("");
    console.log("THROUGHPUT");
    console.log("----------------------------------------");

    console.log(`Requests/sec       : ${requestsPerSecond.toFixed(2)}`);

    console.log(`Bytes transferred  : ${formatBytes(totalBytes)}`);

    console.log(`Network throughput: ${mbPerSecond.toFixed(2)} MB/s`);

    console.log("");
    console.log("SYSTEM");
    console.log("----------------------------------------");

    console.log(`Free RAM before    : ${formatBytes(before.freeMemoryBytes)}`);

    console.log(`Free RAM after     : ${formatBytes(after.freeMemoryBytes)}`);

    console.log(`Process RSS        : ${formatBytes(after.processRssBytes)}`);

    console.log(`Heap used          : ${formatBytes(after.processHeapUsedBytes)}`);

    console.log("");
    console.log("============================================================");

    // ----------------------------------------------------------
    // REPORT
    // ----------------------------------------------------------

    fs.mkdirSync(path.dirname(reportPath), {
      recursive: true,
    });

    const report = `

## Video Load Test — ${new Date().toISOString()}

### Test Information

| Setting | Value |
|---|---|
| Name | ${testName} |
| Description | ${description} |
| Environment | ${environment} |
| Service | ${service} |
| URL | ${url} |
| Method | ${method} |
| Video | ${filename} |
| Video Size | ${formatBytes(videoBuffer.length)} |
| Multipart Size | ${formatBytes(multipart.body.length)} |
| Content-Type | ${videoContentType} |
| Connections | ${connections} |
| Duration | ${duration}s |
| Pipelining | ${pipelining} |
| Timeout | ${timeout} ms |
| API Authentication | X-API-Key |
| Idempotency Mode | ${idempotencyMode} |
| Worker Enabled | ${workerEnabled} |
| Worker Concurrency | ${workerConcurrency} |
| Worker Type | ${workerType} |

### Result

**${status}**

| Metric | Value |
|---|---:|
| Requests sent | ${requestsSent.toLocaleString()} |
| Requests completed | ${requestsCompleted.toLocaleString()} |
| Successful 2xx | ${successful2xx.toLocaleString()} |
| Errors | ${errors.toLocaleString()} |
| Timeouts | ${timeouts.toLocaleString()} |
| Resets | ${resets.toLocaleString()} |
| Non-2xx | ${non2xx.toLocaleString()} |
| Error rate | ${errorRate.toFixed(4)}% |
| Requests/sec | ${requestsPerSecond.toFixed(2)} |
| Average latency | ${latencyAvg.toFixed(2)} ms |
| P50 latency | ${latencyP50.toFixed(2)} ms |
| P90 latency | ${latencyP90.toFixed(2)} ms |
| P95 latency | ${latencyP95.toFixed(2)} ms |
| P99 latency | ${latencyP99.toFixed(2)} ms |
| Max latency | ${latencyMax.toFixed(2)} ms |
| Bytes transferred | ${formatBytes(totalBytes)} |
| Network throughput | ${mbPerSecond.toFixed(2)} MB/s |
| Test duration | ${formatDuration(endTime - startTime)} |

### Threshold Results

| Check | Expected | Actual | Result |
|---|---:|---:|---|
| Requests attempted | > 0 | ${attemptedRequests} | ${hasRequests ? "PASS" : "FAIL"} |
| Error count | 0 | ${errors} | ${noErrors ? "PASS" : "FAIL"} |
| Timeout count | <= ${maxTimeouts} | ${timeouts} | ${timeoutCheck ? "PASS" : "FAIL"} |
| Error rate | <= ${maxErrorRate}% | ${errorRate.toFixed(4)}% | ${
      errorRateCheck ? "PASS" : "FAIL"
    } |
| P99 latency | <= ${maxP99} ms | ${latencyP99.toFixed(2)} ms | ${p99Check ? "PASS" : "FAIL"} |

### System Snapshot

| Metric | Before | After |
|---|---:|---:|
| Free RAM | ${formatBytes(before.freeMemoryBytes)} | ${formatBytes(after.freeMemoryBytes)} |
| Process RSS | ${formatBytes(before.processRssBytes)} | ${formatBytes(after.processRssBytes)} |
| Heap Used | ${formatBytes(before.processHeapUsedBytes)} | ${formatBytes(
      after.processHeapUsedBytes
    )} |

### Authentication

The load test sends:

\`\`\`http
X-API-Key: <configured API key>
\`\`\`

The actual API key is intentionally not written into this report.

### Idempotency

Mode:

\`\`\`
${idempotencyMode}
\`\`\`

When using \`unique\`, every request receives a different:

\`\`\`http
Idempotency-Key: loadtest-<uuid>
\`\`\`

When using \`fixed\`, every request intentionally uses:

\`\`\`http
Idempotency-Key: loadtest-fixed-key
\`\`\`

### Multipart Request

The request contains:

\`\`\`
POST ${url}
Content-Type: multipart/form-data
X-API-Key: <api-key>
Idempotency-Key: <unique-key>

video = ${filename}
\`\`\`

### Scope

This benchmark measures the multipart HTTP upload path.

It does not by itself measure the complete media-processing duration.

For complete pipeline benchmarking, correlate the API result with:

- S3 upload completion
- SQS queue delay
- worker pickup time
- FFprobe duration
- FFmpeg processing duration
- output S3 upload
- MongoDB job completion
- retry count
- failed jobs
- DLQ messages
- workspace cleanup

### Raw Autocannon Result

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`

---

`;

    fs.appendFileSync(reportPath, report, "utf8");

    console.log("");
    console.log(`Report written to: ${reportPath}`);

    if (!pass) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error("");
  console.error("Video load test failed:");
  console.error(error);

  process.exitCode = 1;
});
