import path from "node:path";

import { createMediaProcessor } from "./createmedia/createMediaProcessor.js";

function getArgument(name) {
  const prefix = `${name}=`;

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return null;
  }

  return argument.slice(prefix.length);
}

async function main() {
  const input = getArgument("--input");

  if (!input) {
    throw new Error("Usage: npm run local -- --input=./test-media/video.mkv");
  }

  const inputPath = path.resolve(input);

  console.log(`Processing: ${inputPath}`);

  const processor = createMediaProcessor();

  const result = await processor.process(inputPath);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("\nMedia processing failed:");

  console.error(error.message);

  if (error.stderr) {
    console.error("\nFFmpeg/FFprobe error:");

    console.error(error.stderr);
  }

  process.exit(1);
});
