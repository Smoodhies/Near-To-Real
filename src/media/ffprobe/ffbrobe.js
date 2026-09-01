export class FFProbe {
  constructor({ runner }) {
    this.runner = runner;
  }

  async inspect(inputPath) {
    const result = await this.runner.run("ffprobe", [
      "-v",
      "error",

      "-show_format",
      "-show_streams",
      "-show_chapters",

      "-of",
      "json",

      inputPath,
    ]);

    let raw;

    try {
      raw = JSON.parse(result.stdout);
    } catch {
      throw new Error("FFprobe returned invalid JSON");
    }

    return this.#normalize(raw, inputPath);
  }

  #toNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : null;
  }

  #parseFrameRate(value) {
    if (!value || !value.includes("/")) {
      return this.#toNumber(value);
    }

    const [numerator, denominator] = value.split("/").map(Number);

    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }

    return numerator / denominator;
  }

  #normalizeStream(stream) {
    const base = {
      index: stream.index,

      type: stream.codec_type ?? null,

      codec: stream.codec_name ?? null,

      codecLongName: stream.codec_long_name ?? null,

      language: stream.tags?.language ?? null,

      title: stream.tags?.title ?? null,

      bitrate: this.#toNumber(stream.bit_rate),

      duration: this.#toNumber(stream.duration),

      metadata: stream.tags ?? {},
    };

    if (stream.codec_type === "video") {
      return {
        ...base,

        width: stream.width ?? null,

        height: stream.height ?? null,

        frameRate: this.#parseFrameRate(stream.r_frame_rate),

        averageFrameRate: this.#parseFrameRate(stream.avg_frame_rate),

        pixelFormat: stream.pix_fmt ?? null,

        profile: stream.profile ?? null,

        level: this.#toNumber(stream.level),

        frames: this.#toNumber(stream.nb_frames),

        aspectRatio: stream.display_aspect_ratio ?? null,
      };
    }

    if (stream.codec_type === "audio") {
      return {
        ...base,

        sampleRate: this.#toNumber(stream.sample_rate),

        channels: stream.channels ?? null,

        channelLayout: stream.channel_layout ?? null,

        sampleFormat: stream.sample_fmt ?? null,

        bitsPerSample: this.#toNumber(stream.bits_per_sample),
      };
    }

    if (stream.codec_type === "subtitle") {
      return {
        ...base,

        subtitleCodec: stream.codec_name ?? null,
      };
    }

    return base;
  }

  #normalize(raw, inputPath) {
    const rawStreams = raw.streams ?? [];

    const streams = rawStreams.map((stream) => this.#normalizeStream(stream));

    const video = streams.filter((stream) => stream.type === "video");

    const audio = streams.filter((stream) => stream.type === "audio");

    const subtitles = streams.filter((stream) => stream.type === "subtitle");

    const duration = this.#toNumber(raw.format?.duration);

    if (duration === null || duration <= 0) {
      throw new Error("Unable to determine valid media duration");
    }

    if (streams.length === 0) {
      throw new Error("Media contains no streams");
    }

    return {
      raw,

      format: {
        filename: raw.format?.filename ?? inputPath,

        name: raw.format?.format_name ?? null,

        longName: raw.format?.format_long_name ?? null,

        duration,

        size: this.#toNumber(raw.format?.size),

        bitrate: this.#toNumber(raw.format?.bit_rate),

        startTime: this.#toNumber(raw.format?.start_time),

        metadata: raw.format?.tags ?? {},
      },

      streams,

      video,
      audio,
      subtitles,

      chapters: raw.chapters ?? [],

      streamCount: streams.length,

      videoStreamCount: video.length,

      audioStreamCount: audio.length,

      subtitleStreamCount: subtitles.length,

      hasVideo: video.length > 0,

      hasAudio: audio.length > 0,

      hasSubtitles: subtitles.length > 0,
    };
  }
}
