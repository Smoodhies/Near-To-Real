import "dotenv/config";
import autocannon from "autocannon";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function numberEnv(name, fallback) {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number`);
  }

  return parsed;
}

function booleanEnv(name, fallback) {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return fallback;
  }

  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

const config = {
  name: process.env.LOAD_TEST_NAME || "load-test",
  description: process.env.LOAD_TEST_DESCRIPTION || "Near2Real load test",

  url: process.env.LOAD_TEST_URL || "http://localhost:3000/health",
  method: process.env.LOAD_TEST_METHOD || "GET",

  connections: numberEnv("LOAD_TEST_CONNECTIONS", 1),
  duration: numberEnv("LOAD_TEST_DURATION_SECONDS", 30),
  pipelining: numberEnv("LOAD_TEST_PIPELINING", 1),
  timeout: numberEnv("LOAD_TEST_TIMEOUT_MS", 10000),

  apiKey: process.env.LOAD_TEST_API_KEY || "",
  idempotencyKey: process.env.LOAD_TEST_IDEMPOTENCY_KEY || "",

  workerEnabled: booleanEnv("LOAD_TEST_WORKER_ENABLED", true),
  workerConcurrency: numberEnv("LOAD_TEST_WORKER_CONCURRENCY", 2),
  workerType: process.env.LOAD_TEST_WORKER_TYPE || "media-worker",

  systemSampleMs: numberEnv("LOAD_TEST_SYSTEM_SAMPLE_MS", 1000),

  report: process.env.LOAD_TEST_REPORT || "docs/load-test-results.md",

  maxErrorRate: numberEnv("LOAD_TEST_MAX_ERROR_RATE", 0),
  maxP99Ms: numberEnv("LOAD_TEST_MAX_P99_MS", 100),
  maxTimeouts: numberEnv("LOAD_TEST_MAX_TIMEOUTS", 0),

  environment: process.env.LOAD_TEST_ENVIRONMENT || "local",

  service: process.env.LOAD_TEST_SERVICE || "n2r_mediaprocessing",
};

const reportPath = path.resolve(config.report);

fs.mkdirSync(path.dirname(reportPath), {
  recursive: true,
});

function getSystemSnapshot() {
  const cpus = os.cpus();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || "unknown",
    totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
    freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
    uptimeSeconds: Math.round(os.uptime()),
    nodeVersion: process.version,
  };
}

function formatNumber(value) {
  if (value === undefined || value === null) {
    return "N/A";
  }

  return Number(value).toLocaleString("en-US");
}

function formatMs(value) {
  if (value === undefined || value === null) {
    return "N/A";
  }

  return `${Number(value).toFixed(2)} ms`;
}

function calculateErrorRate(result) {
  const requests = result?.requests?.total || 0;
  const errors = result?.errors || 0;

  if (requests === 0) {
    return 0;
  }

  return (errors / requests) * 100;
}

function calculatePassFail(result) {
  const errorRate = calculateErrorRate(result);
  const p99 = result?.latency?.p99 || 0;
  const timeouts = result?.timeouts || 0;

  const errorsPassed = errorRate <= config.maxErrorRate;

  const latencyPassed = p99 <= config.maxP99Ms;

  const timeoutPassed = timeouts <= config.maxTimeouts;

  return {
    passed: errorsPassed && latencyPassed && timeoutPassed,

    errorRate,
    p99,
    timeouts,

    checks: {
      errorRate: errorsPassed,
      p99: latencyPassed,
      timeouts: timeoutPassed,
    },
  };
}

function generateMarkdown({ result, startedAt, finishedAt, systemBefore, systemAfter }) {
  const evaluation = calculatePassFail(result);

  const requestsTotal = result?.requests?.total || 0;

  const averageReqSec = result?.requests?.average || 0;

  const latency = result?.latency || {};

  const bytes = result?.throughput?.total || result?.bytes || 0;

  const statusCounts =
    result?.["1xx"] || result?.["2xx"] || result?.["3xx"] || result?.["4xx"] || result?.["5xx"]
      ? "See raw Autocannon result below."
      : "N/A";

  return `
# Near2Real Load Test Results

## Test Information

| Property | Value |
|---|---|
| Test | ${config.name} |
| Description | ${config.description} |
| Service | ${config.service} |
| Environment | ${config.environment} |
| Endpoint | \`${config.url}\` |
| Method | \`${config.method}\` |
| Connections | ${config.connections} |
| Duration | ${config.duration}s |
| Pipelining | ${config.pipelining} |
| Timeout | ${config.timeout} ms |
| Worker Enabled | ${config.workerEnabled} |
| Worker Type | ${config.workerType} |
| Worker Concurrency | ${config.workerConcurrency} |
| Started | ${startedAt.toISOString()} |
| Finished | ${finishedAt.toISOString()} |

---

## System

### Before Test

| Metric | Value |
|---|---|
| Hostname | ${systemBefore.hostname} |
| OS | ${systemBefore.platform} |
| Architecture | ${systemBefore.arch} |
| CPU Count | ${systemBefore.cpuCount} |
| CPU Model | ${systemBefore.cpuModel} |
| Total RAM | ${systemBefore.totalMemoryMB} MB |
| Free RAM | ${systemBefore.freeMemoryMB} MB |
| Node.js | ${systemBefore.nodeVersion} |

### After Test

| Metric | Value |
|---|---|
| Free RAM | ${systemAfter.freeMemoryMB} MB |
| Process RSS | ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB |
| Heap Used | ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB |

---

## Autocannon Results

| Metric | Result |
|---|---:|
| Total Requests | ${formatNumber(requestsTotal)} |
| Average Req/sec | ${formatNumber(averageReqSec)} |
| Latency p2.5 | ${formatMs(latency.p2_5)} |
| Latency p50 | ${formatMs(latency.p50)} |
| Latency p97.5 | ${formatMs(latency.p97_5)} |
| Latency p99 | ${formatMs(latency.p99)} |
| Average Latency | ${formatMs(latency.average)} |
| Maximum Latency | ${formatMs(latency.max)} |
| Errors | ${formatNumber(result?.errors || 0)} |
| Timeouts | ${formatNumber(result?.timeouts || 0)} |
| Status Results | ${statusCounts} |

---

## Reliability Evaluation

| Check | Result |
|---|---|
| Error Rate | ${evaluation.errorRate.toFixed(4)}% |
| Maximum Error Rate | ${config.maxErrorRate}% |
| Error Rate Check | ${evaluation.checks.errorRate ? "PASS" : "FAIL"} |
| p99 Latency | ${formatMs(evaluation.p99)} |
| Maximum p99 | ${formatMs(config.maxP99Ms)} |
| p99 Check | ${evaluation.checks.p99 ? "PASS" : "FAIL"} |
| Timeouts | ${evaluation.timeouts} |
| Maximum Timeouts | ${config.maxTimeouts} |
| Timeout Check | ${evaluation.checks.timeouts ? "PASS" : "FAIL"} |

### Overall Result

**${evaluation.passed ? "PASS" : "FAIL"}**

---

## Raw Autocannon Result

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`

---

## Scope

This test measures the configured HTTP endpoint.

For the current health-endpoint test, this validates the API/HTTP layer only.

It does not by itself measure:

- S3 upload throughput
- SQS processing throughput
- FFmpeg performance
- FFprobe performance
- MongoDB job lifecycle
- artifact generation
- worker retry behavior
- worker crash recovery
- end-to-end video processing

Those require dedicated media-pipeline load tests.

---

`;
}

async function main() {
  console.log("");
  console.log("============================================");
  console.log("Near2Real Load Test");
  console.log("============================================");
  console.log(`Name          : ${config.name}`);
  console.log(`URL           : ${config.url}`);
  console.log(`Method        : ${config.method}`);
  console.log(`Connections   : ${config.connections}`);
  console.log(`Duration      : ${config.duration}s`);
  console.log(`Pipelining    : ${config.pipelining}`);
  console.log(`Worker        : ${config.workerEnabled}`);
  console.log(`Worker Concur : ${config.workerConcurrency}`);
  console.log("============================================");
  console.log("");

  const systemBefore = getSystemSnapshot();

  const startedAt = new Date();

  const headers = {};

  if (config.apiKey) {
    headers["X-API-Key"] = config.apiKey;
  }

  if (config.idempotencyKey) {
    headers["Idempotency-Key"] = config.idempotencyKey;
  }

  const result = await autocannon({
    url: config.url,
    method: config.method,
    connections: config.connections,
    duration: config.duration,
    pipelining: config.pipelining,
    timeout: config.timeout,
    headers,
  });

  const finishedAt = new Date();

  const systemAfter = getSystemSnapshot();

  console.log("");
  console.log("============================================");
  console.log("Test Complete");
  console.log("============================================");

  console.log(`Requests      : ${formatNumber(result?.requests?.total)}`);

  console.log(`Req/sec       : ${formatNumber(result?.requests?.average)}`);

  console.log(`Avg latency   : ${formatMs(result?.latency?.average)}`);

  console.log(`p99 latency   : ${formatMs(result?.latency?.p99)}`);

  console.log(`Max latency   : ${formatMs(result?.latency?.max)}`);

  console.log(`Errors        : ${formatNumber(result?.errors)}`);

  console.log(`Timeouts      : ${formatNumber(result?.timeouts)}`);

  const evaluation = calculatePassFail(result);

  console.log(`Result        : ${evaluation.passed ? "PASS" : "FAIL"}`);

  console.log("============================================");
  console.log("");

  const markdown = generateMarkdown({
    result,
    startedAt,
    finishedAt,
    systemBefore,
    systemAfter,
  });

  let existing = "";

  if (fs.existsSync(reportPath)) {
    existing = fs.readFileSync(reportPath, "utf8");
  }

  if (!existing.trim()) {
    existing = `# Near2Real Load Test History\n\n`;
  }

  fs.writeFileSync(reportPath, existing + markdown, "utf8");

  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error("");
  console.error("LOAD TEST FAILED");
  console.error(error);
  process.exit(1);
});
