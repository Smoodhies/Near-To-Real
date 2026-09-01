import { ProcessingJob } from "./worker/processingJob.js";
import { createMediaWorker } from "./createworker/createMediaWorker.js";
import { Config } from "./config/config.js";
import { connectMongo } from "./database/mongo.js";

function getArgument(name) {
  const prefix = `${name}=`;

  const argument = process.argv.find((value) => value.startsWith(prefix));

  return argument ? argument.slice(prefix.length) : null;
}

async function main() {
  const input = getArgument("--input");

  if (!input) {
    throw new Error("Missing input. Usage: npm run local -- --input=./test-media/video.mp4");
  }

  const config = new Config().validate();

  await connectMongo();

  console.log(`Processing local file: ${input}`);

  const worker = createMediaWorker({
    config,
  });

  /*
   * Local testing does not have an S3 asset.
   * Generate a temporary assetId for local processing.
   */
  const job = new ProcessingJob({
    assetId: `local-${Date.now()}`,
    source: {
      type: "local",
      path: input,
    },
    options: {
      generateWav: true,
      generateMp3: true,
      generateVideoOnly: true,
      extractSubtitles: true,
    },
    metadata: {
      source: "local-cli",
    },
  });

  /*
   * Local CLI currently requires a workspace.
   */
  const workspace = await worker.workspace.create(job.jobId);

  try {
    const result = await worker.execute(job, workspace);

    console.log("\nProcessing completed:\n");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await worker.workspace.cleanup(workspace.root);
  }
}

main().catch((error) => {
  console.error("\nMedia processing failed:");
  console.error(error.message);

  if (error.stack) {
    console.error(error.stack);
  }

  process.exit(1);
});
