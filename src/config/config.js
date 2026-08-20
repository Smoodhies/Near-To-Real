import "dotenv/config";

import path from "node:path";

export class Config {
  constructor() {
    this.processing = {
      generateWav: process.env.GENERATE_WAV !== "false",

      generateMp3: process.env.GENERATE_MP3 !== "false",

      generateVideoOnly: process.env.GENERATE_VIDEO_ONLY !== "false",

      extractSubtitles: process.env.EXTRACT_SUBTITLES !== "false",

      timeoutMs: Number(process.env.FFMPEG_TIMEOUT_MS ?? 1800000),
    };

    this.paths = {
      output: process.env.OUTPUT_DIR ?? path.resolve("output"),
    };
  }
}
