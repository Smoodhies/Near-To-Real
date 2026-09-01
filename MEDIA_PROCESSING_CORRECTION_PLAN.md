# Near to Real — Media Processing Correction & Architecture Plan

**Document:** `MEDIA_PROCESSING_CORRECTION_PLAN.md`  
**Purpose:** Source of truth for future development sessions  
**Project:** Near to Real — Media Processing Service  
**Current architecture:** Node.js + AWS S3 + AWS SQS + FFmpeg + FFProbe + MongoDB

---

# 1. Objective

The media-processing pipeline must work as:

```text
Client
  ↓
Upload API
  ↓
MongoDB Asset
  ↓
S3 Input
  ↓
SQS
  ↓
SqsConsumer
  ↓
Validate / Verify SQS event against MongoDB
  ↓
Create / identify Job
  ↓
S3 streaming download
  ↓
Temporary Workspace
  ↓
MediaWorker
  ↓
MediaProcessor
  ├── FFProbe
  └── FFmpeg
  ↓
Final Artifacts
  ↓
Destination S3
  ↓
MongoDB Job + Artifact metadata
  ↓
SQS message delete
  ↓
Temporary workspace cleanup
```

The system must be reliable, idempotent, traceable, and suitable for later Docker/production deployment.

---

# 2. IDENTITY MODEL

There are three IDs currently being confused.

## 2.1 Asset ID

`assetId` identifies the original uploaded media.

Example:

```text
assetId:
3b1554db-ab45-419c-ac90-af8a721901e8
```

It is created when the video is uploaded.

MongoDB Asset:

```json
{
  "assetId": "3b1554db-ab45-419c-ac90-af8a721901e8",
  "originalName": "chai_pe_charcha-1080.mp4",
  "contentType": "video/mp4",
  "bucket": "near2real",
  "objectKey": "input/3b1554db-ab45-419c-ac90-af8a721901e8/chai_pe_charcha-1080.mp4",
  "etag": "\"95fe6b449a74ed5ed18cfbd4fadd103a\"",
  "size": 6933351,
  "status": "UPLOADED"
}
```

The `assetId` represents the source/original media.

---

# 3. JOB ID

`jobId` identifies one processing execution.

Example:

```text
jobId:
a9c15fb9-6950-4b77-8e3c-0fdd05aa4933
```

A job must reference its asset:

```text
assetId
   ↓
jobId
```

Example:

```json
{
  "jobId": "a9c15fb9-6950-4b77-8e3c-0fdd05aa4933",
  "assetId": "3b1554db-ab45-419c-ac90-af8a721901e8",
  "status": "PROCESSING"
}
```

One asset may eventually have multiple processing jobs if re-processing is required.

Therefore:

```text
Asset
 ├── Job 1
 ├── Job 2
 └── Job 3
```

is valid.

---

# 4. OUTPUT ID

Do NOT introduce a third random UUID merely for the output directory.

Current observed problem:

```text
assetId = 3b1554db-...
jobId   = a9c15fb9-...
outputId = c651622c-...
```

This creates unnecessary identity confusion.

The final output directory should use the `jobId`:

```text
output/
└── a9c15fb9-6950-4b77-8e3c-0fdd05aa4933/
    ├── audio.wav
    ├── audio.mp3
    ├── video-only.mp4
    ├── ffprobe.json
    ├── manifest.json
    └── subtitles/
```

Therefore:

```text
assetId = original media
jobId   = processing execution
outputId = not required for output folder
```

---

# 5. SECURITY / INTEGRITY VERIFICATION

The SQS event must NOT be blindly trusted.

The worker receives an SQS message containing S3 information.

Before processing:

```text
SQS message
     ↓
extract bucket + objectKey
     ↓
identify asset
     ↓
MongoDB lookup
     ↓
verify asset
```

The worker should verify:

```text
SQS bucket
    ==
MongoDB bucket

SQS objectKey
    ==
MongoDB objectKey
```

Where available, also verify:

```text
ETag
size
content type
```

The important principle is:

```text
SQS → MongoDB verification → processing
```

not:

```text
SQS → FFmpeg directly
```

---

# 6. IMPORTANT SECURITY CLARIFICATION

This verification is NOT a replacement for user authentication.

Authentication belongs at the API/client boundary.

The worker verification provides:

- message integrity
- job authorization
- protection against arbitrary S3 objects being submitted for processing
- protection against unauthorized use of expensive FFmpeg resources
- consistency between the database asset and S3 event

If an SQS message points to an object that does not correspond to a valid asset/job:

```text
REJECT
DO NOT DOWNLOAD
DO NOT RUN FFMPEG
```

---

# 7. SQS CONSUMER

The `SqsConsumer` is responsible for:

1. Long polling
2. Receiving messages
3. Filtering invalid messages
4. Controlled concurrency
5. Creating/identifying jobs
6. Calling S3 download
7. Calling MediaWorker
8. Handling failures
9. Deleting SQS messages only after success

Current desired configuration:

```text
concurrency = 2
waitTimeSeconds = 20
```

The consumer must never delete a valid message before successful processing.

---

# 8. S3 EVENT FILTERING

S3 sends events such as:

```json
{
  "Event": "s3:TestEvent"
}
```

This is NOT a media processing event.

It must be ignored/deleted from the queue.

Only relevant S3 object-created events should continue.

Expected event:

```text
eventSource = aws:s3
eventName = ObjectCreated:Put
```

The object should then be checked for a supported video extension/content type.

Examples:

```text
.mp4
.mov
.mkv
.webm
```

The exact supported formats should remain controlled by the media validation layer.

---

# 9. S3 DOWNLOAD

S3 download must be streaming.

Do NOT load the complete video into memory.

Desired flow:

```text
S3 GetObject
      ↓
stream
      ↓
local file
```

For example:

```text
workspace/{jobId}/input/video.mp4
```

The `S3StorageService.download()` method must work correctly with the AWS SDK response body used by the current Node.js runtime.

Current known problem:

```text
response.Body.pipeTo is not a function
```

Therefore the implementation must use the correct Node.js/AWS SDK stream handling rather than assuming Web `ReadableStream.pipeTo()`.

---

# 10. TEMPORARY WORKSPACE

Workspace is only for temporary processing files.

Correct structure:

```text
workspace/
└── {jobId}/
    └── input/
        └── video.mp4
```

Do NOT create:

```text
workspace/
└── {jobId}/
    ├── input/
    └── output/
```

if the output is actually being written to the root `output/` directory.

The previous structure caused unnecessary directories.

---

# 11. LOCAL OUTPUT

The existing `output/` directory is the local-processing artifact area.

It is separate from the temporary workspace.

Correct:

```text
workspace/
└── {jobId}/
    └── input/
        └── video.mp4
```

and:

```text
output/
└── {jobId}/
    ├── audio.wav
    ├── audio.mp3
    ├── video-only.mp4
    ├── ffprobe.json
    ├── manifest.json
    └── subtitles/
```

The same `jobId` should connect the two.

---

# 12. WHY THE DUPLICATE WORKSPACE FOLDERS OCCURRED

Previously the system had two separate concepts:

```text
JobWorkspace
```

and:

```text
ArtifactManager
```

Both were creating job-specific directories.

This resulted in structures such as:

```text
workspace/{jobId}/
    input/
    output/
```

while:

```text
output/{anotherId}/
```

was also created.

This is unnecessary.

Ownership must be clear:

```text
JobWorkspace
    ↓
temporary input

ArtifactManager
    ↓
final artifacts
```

No duplicate output location.

---

# 13. MEDIA WORKER

`MediaWorker` should receive a local input path after S3 download.

Flow:

```text
S3
 ↓
workspace/{jobId}/input/video.mp4
 ↓
MediaWorker
 ↓
MediaProcessor
```

The MediaWorker should not be responsible for downloading S3 objects.

That responsibility belongs to:

```text
S3StorageService
```

---

# 14. MEDIA PROCESSOR

The current FFProbe/FFmpeg core is already working and should NOT be unnecessarily rewritten.

Current successful artifacts have been observed:

```text
audio.mp3
audio.wav
video-only.mp4
ffprobe.json
manifest.json
subtitles/
```

Therefore preserve the working processing logic.

Only modify it when required to connect:

```text
jobId
assetId
artifact metadata
DB status
S3 output
```

---

# 15. DATABASE JOB LIFECYCLE

The job should have a persistent lifecycle.

Recommended:

```text
QUEUED
   ↓
PROCESSING
   ↓
COMPLETED
```

Failure:

```text
QUEUED
   ↓
PROCESSING
   ↓
FAILED
```

Potential retry:

```text
FAILED
   ↓
RETRYING
   ↓
PROCESSING
```

The exact retry model can be implemented later.

---

# 16. DO NOT DELETE COMPLETED JOB HISTORY

Temporary files can be deleted.

Job history should generally remain in MongoDB.

Keep:

```text
assetId
jobId
status
timestamps
processing options
artifact metadata
output S3 location
```

Delete/cleanup:

```text
local workspace
temporary input files
temporary intermediate files
```

S3 input deletion should happen only according to the retention policy and only after successful output persistence.

---

# 17. OUTPUT ARTIFACT METADATA

MongoDB should retain enough information to locate the output later.

Example:

```json
{
  "jobId": "a9c15fb9-...",
  "assetId": "3b1554db-...",
  "status": "COMPLETED",
  "output": {
    "bucket": "near2real-output",
    "prefix": "output/a9c15fb9-...",
    "artifacts": [
      "audio.wav",
      "audio.mp3",
      "video-only.mp4",
      "ffprobe.json",
      "manifest.json"
    ]
  }
}
```

This makes future inspection possible without scanning the filesystem.

---

# 18. DESTINATION S3

Production flow:

```text
local output
      ↓
S3StorageService.upload()
      ↓
destination S3
```

Suggested logical structure:

```text
output/{jobId}/
    audio.wav
    audio.mp3
    video-only.mp4
    ffprobe.json
    manifest.json
    subtitles/
```

The destination bucket can be configured through environment variables.

---

# 19. IMPORTANT SUCCESS ORDER

Do NOT delete the SQS message immediately after FFmpeg finishes.

Correct order:

```text
1. Receive SQS message
2. Validate SQS event
3. Verify asset in MongoDB
4. Create/find processing job
5. Mark job PROCESSING
6. Download S3 input
7. Process media
8. Upload output to destination S3
9. Save output metadata in MongoDB
10. Mark job COMPLETED
11. Cleanup local workspace
12. Delete SQS message
```

The critical rule:

```text
SQS DELETE
must happen LAST
```

after successful processing/persistence.

---

# 20. IDEMPOTENCY

SQS may deliver the same message more than once.

Therefore the worker must check the job before processing.

Example:

```text
jobId
  ↓
MongoDB
  ↓
status?
```

If:

```text
COMPLETED
```

then do not process again.

This prevents:

```text
FFmpeg twice
S3 upload twice
CPU waste
duplicate artifacts
```

---

# 21. SQS VISIBILITY TIMEOUT

Current processing can take a long time.

If:

```text
SQS visibility timeout = 30 minutes
```

but processing takes longer than that, the same message may become visible again.

Future production implementation should use:

```text
ChangeMessageVisibility
```

as a heartbeat/extension while processing.

Otherwise:

```text
Worker A
    ↓
processing

visibility expires

Worker B
    ↓
same message
    ↓
same job
```

can happen.

---

# 22. CONFIGURATION

There must be one consistent configuration model.

Current `Config` contains:

```text
config.api
config.aws
config.processing
config.paths
```

Current known mismatches must be fixed.

Examples of previously used incorrect properties:

```text
config.aws.queueUrl
config.sqs.queueUrl
```

when the actual config uses:

```text
config.aws.sqsQueueUrl
```

Likewise:

```text
config.processing.timeoutMs
```

versus:

```text
config.processing.ffmpegTimeoutMs
```

and:

```text
config.paths.workspace
```

must match the actual Config implementation.

Do not invent configuration property names in consumers.

---

# 23. CONFIG SHOULD BE PASSED CONSISTENTLY

Avoid repeatedly constructing unrelated configuration objects deep inside factories.

Preferred architecture:

```text
index.js
   ↓
new Config()
   ↓
createMediaProcessor(config)
   ↓
createMediaWorker(config, processor)
   ↓
SqsConsumer
```

This reduces configuration mismatch.

---

# 24. JOB CREATION RESPONSIBILITY

Avoid having multiple independent parts of the system invent jobs.

Preferred model:

```text
Upload
  ↓
Asset
  ↓
S3
  ↓
SQS event
  ↓
Worker identifies verified Asset
  ↓
Job creation/lookup
  ↓
Processing
```

The worker should not blindly generate a random job ID for an arbitrary SQS event.

A job must be associated with a known asset.

---

# 25. CURRENTLY KNOWN CODE ISSUES

These are known and must be checked during correction.

## Issue A — `JobWorkerSpace` naming

Actual class:

```js
export class JobWorkspace
```

Therefore imports must use:

```js
import { JobWorkspace } from "./jobWorkerSpace.js";
```

not:

```js
import { JobWorkerSpace } from "./jobWorkerSpace.js";
```

unless the class is deliberately renamed.

---

## Issue B — Config export/import

Current Config is:

```js
export class Config
```

Therefore:

```js
import { Config } from "../config/config.js";
```

and:

```js
const config = new Config();
```

Do not use:

```js
import { config } from "../config/config.js";
```

unless a singleton named `config` is actually exported.

---

## Issue C — S3 stream handling

Current error:

```text
TypeError:
response.Body.pipeTo is not a function
```

The S3 download implementation must use the Node.js-compatible stream API.

---

## Issue D — Local processing input variable

The local entry point previously had an incorrect variable reference around:

```text
inputPath
```

This must be checked so the local processing command uses the actual parsed input variable.

---

## Issue E — API package dependency

`@fastify/rate-limit` was imported by the API server but was missing from package.json.

It has now been installed.

Keep package.json and package-lock.json synchronized.

---

# 26. PACKAGE MANAGEMENT

Current project uses:

```text
Node.js
ES Modules
Fastify
AWS SDK
dotenv
uuid
nodemon
```

When adding a package:

```bash
npm install <package>
```

Do not manually edit only package.json while leaving package-lock inconsistent.

After changes verify:

```bash
npm install
```

and:

```bash
npm ls
```

---

# 27. ENVIRONMENT

Local development may use:

```text
AWS_REGION=ap-south-1
SQS_QUEUE_URL=...
```

AWS SDK credential resolution should be compatible with production.

Do not hard-code credentials into source code.

Production should preferably use:

```text
IAM Role
```

or the appropriate AWS credential provider mechanism.

Avoid committing:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

to Git.

---

# 28. CURRENT VERIFIED BEHAVIOR

The following has already been demonstrated successfully:

## API

API starts on:

```text
http://localhost:3000
```

and `/media/jobs` can enqueue a job.

---

## SQS

Queue exists:

```text
near2realsqs
```

in:

```text
ap-south-1
```

SQS messages can be received.

---

## S3

Input bucket:

```text
near2real
```

is working.

S3 objects are being created.

---

## S3 → Worker

The worker has successfully downloaded files:

```text
Downloaded:
L:\Near to Real\workspace\{jobId}\input.mp4
```

---

## FFmpeg / FFProbe

Processing has successfully generated:

```text
audio.mp3
audio.wav
video-only.mp4
ffprobe.json
manifest.json
subtitles/
```

Therefore the core media-processing engine should be treated as functional unless a new regression appears.

---

# 29. CURRENT TARGET

The target is NOT merely:

```text
SQS → FFmpeg
```

The target is:

```text
S3
 ↓
SQS
 ↓
SqsConsumer
 ↓
SQS event filter
 ↓
MongoDB asset verification
 ↓
assetId
 ↓
jobId
 ↓
S3 streaming download
 ↓
temporary workspace
 ↓
MediaWorker
 ↓
MediaProcessor
 ↓
FFProbe + FFmpeg
 ↓
final artifacts
 ↓
destination S3
 ↓
MongoDB artifact record
 ↓
COMPLETED
 ↓
workspace cleanup
 ↓
SQS delete
```

---

# 30. IMPLEMENTATION PHASES

## Phase 1 — Identity and DB

- [ ] Define Asset model/repository
- [ ] Define Job model/repository
- [ ] Link `assetId` → `jobId`
- [ ] Verify SQS event against MongoDB
- [ ] Persist job status
- [ ] Implement idempotency
- [ ] Handle FAILED state

---

## Phase 2 — Workspace

- [ ] Keep workspace temporary
- [ ] Remove unnecessary workspace/output directory
- [ ] Use jobId as workspace identifier
- [ ] Use jobId as local output identifier
- [ ] Remove unnecessary outputId
- [ ] Cleanup workspace after successful processing

---

## Phase 3 — S3

- [ ] Correct streaming S3 download
- [ ] Implement streaming upload
- [ ] Configure destination bucket
- [ ] Save destination artifact metadata
- [ ] Ensure output is successfully persisted before acknowledging SQS

---

## Phase 4 — Reliability

- [ ] SQS visibility extension
- [ ] Retry handling
- [ ] Idempotent processing
- [ ] Failure cleanup
- [ ] Better structured logging
- [ ] Job recovery after worker restart

---

## Phase 5 — Production

- [ ] Docker
- [ ] IAM role
- [ ] No static credentials
- [ ] S3 lifecycle policies
- [ ] SQS DLQ
- [ ] CloudWatch monitoring
- [ ] Metrics
- [ ] Horizontal worker scaling
- [ ] Concurrency configuration

---

# 31. DO NOT CHANGE UNNECESSARILY

The following already works and should not be rewritten without a reason:

```text
FFProbe
FFmpeg
MediaValidator
Artifact generation
Manifest generation
Existing media processing logic
```

Focus changes around:

```text
identity
DB
SQS
S3
workspace
job lifecycle
artifact persistence
cleanup
```

---

# 32. DEBUGGING METHOD

When a job fails, trace it using:

```text
assetId
```

first.

Then:

```text
assetId
  ↓
S3 objectKey
  ↓
SQS message
  ↓
jobId
  ↓
workspace
  ↓
output
  ↓
MongoDB
```

Every stage must be traceable.

Example:

```text
assetId:
3b1554db-...

objectKey:
input/3b1554db-.../chai_pe_charcha-1080.mp4

jobId:
a9c15fb9-...

workspace:
workspace/a9c15fb9-...

output:
output/a9c15fb9-...
```

This is the desired identity chain.

---

# 33. FINAL ARCHITECTURE

```text
                    CLIENT
                       │
                       ▼
                 UPLOAD API
                       │
                       ▼
                 MongoDB Asset
                 assetId = A
                       │
                       ▼
                      S3
                input/{A}/video.mp4
                       │
                       ▼
                      SQS
                       │
                       ▼
                SqsConsumer
                       │
                       ▼
             Filter S3 Event
                       │
                       ▼
            Verify MongoDB Asset
                       │
                       ▼
                  Create Job
                 jobId = J
                       │
                       ▼
             Mark PROCESSING
                       │
                       ▼
                  S3 Download
                       │
                       ▼
             workspace/{J}/input
                       │
                       ▼
                  MediaWorker
                       │
                       ▼
                MediaProcessor
                  /          \
             FFProbe         FFmpeg
                  \          /
                       │
                       ▼
                 output/{J}/
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
           WAV       MP3    Video-only
              │        │        │
              └────────┼────────┘
                       ▼
                  Destination S3
                       │
                       ▼
                 MongoDB Job
                  COMPLETED
                       │
              ┌────────┴────────┐
              ▼                 ▼
       Cleanup workspace    Keep metadata
              │                 │
              └────────┬────────┘
                       ▼
                  Delete SQS
```

---

# 34. GOLDEN RULES

1. `assetId` = uploaded media identity.
2. `jobId` = processing execution identity.
3. Do not create an unnecessary `outputId`.
4. Never trust arbitrary SQS S3 data without verification.
5. Verify SQS event against MongoDB asset.
6. Never load the complete video into memory.
7. Workspace is temporary.
8. Output is final artifact storage.
9. SQS deletion happens only after successful processing and persistence.
10. Keep completed job history in MongoDB.
11. Cleanup files, not audit history.
12. Protect against duplicate SQS delivery.
13. Do not rewrite the working FFmpeg/FFProbe core unnecessarily.
14. Keep configuration property names consistent.
15. Every processing execution must be traceable from `assetId → jobId → output`.

---

# 35. FUTURE SESSION RESUME INSTRUCTION

When continuing this project in a new conversation, provide this file/path:

```text
MEDIA_PROCESSING_CORRECTION_PLAN.md
```

Then ask to:

```text
Read MEDIA_PROCESSING_CORRECTION_PLAN.md and continue implementation from the next unchecked phase.
Do not redesign the architecture unless a concrete issue requires it.
```

Before changing code, inspect the current relevant files and compare them against this document.

Priority should always be:

```text
Correctness
→ Data integrity
→ Idempotency
→ Security
→ Resource efficiency
→ Performance
→ Production scaling
```