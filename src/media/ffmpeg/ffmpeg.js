export class FFmpeg {
  constructor({ runner, timeout }) {
    this.runner = runner;
    this.timeout = timeout;
  }

  #validateStreamIndex(streamIndex) {
    if (!Number.isInteger(streamIndex) || streamIndex < 0) {
      throw new Error(`Invalid stream index: ${streamIndex}`);
    }
  }

  async extractWav({ inputPath, outputPath, streamIndex }) {
    this.#validateStreamIndex(streamIndex);

    await this.runner.run(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",

        "-i",
        inputPath,

        "-map",
        `0:${streamIndex}`,

        "-vn",

        "-ac",
        "1",

        "-ar",
        "48000",

        "-c:a",
        "pcm_s16le",

        "-y",
        outputPath,
      ],
      {
        timeout: this.timeout,
      }
    );
  }

  async extractMp3({ inputPath, outputPath, streamIndex }) {
    this.#validateStreamIndex(streamIndex);

    await this.runner.run(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",

        "-i",
        inputPath,

        "-map",
        `0:${streamIndex}`,

        "-vn",

        "-c:a",
        "libmp3lame",

        "-q:a",
        "2",

        "-y",
        outputPath,
      ],
      {
        timeout: this.timeout,
      }
    );
  }

  async extractVideo({ inputPath, outputPath, streamIndex }) {
    this.#validateStreamIndex(streamIndex);

    await this.runner.run(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",

        "-i",
        inputPath,

        "-map",
        `0:${streamIndex}`,

        "-an",

        "-c:v",
        "copy",

        "-y",
        outputPath,
      ],
      {
        timeout: this.timeout,
      }
    );
  }

  async extractSubtitle({ inputPath, outputPath, streamIndex }) {
    this.#validateStreamIndex(streamIndex);

    await this.runner.run(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",

        "-i",
        inputPath,

        "-map",
        `0:${streamIndex}`,

        "-c:s",
        "srt",

        "-y",
        outputPath,
      ],
      {
        timeout: this.timeout,
      }
    );
  }
}
