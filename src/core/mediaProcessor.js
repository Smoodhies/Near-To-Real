import path from "node:path";

export class MediaProcessor {
  constructor({
    probe,
    ffmpeg,
    validator,
    artifacts,
    manifestWriter,
    config,
    artifactService,
    artifactUploadService,
  }) {
    if (!probe) {
      throw new Error("MediaProcessor requires FFProbe");
    }

    if (!ffmpeg) {
      throw new Error("MediaProcessor requires FFmpeg");
    }

    if (!validator) {
      throw new Error("MediaProcessor requires MediaValidator");
    }

    if (!artifacts) {
      throw new Error("MediaProcessor requires ArtifactManager");
    }

    if (!manifestWriter) {
      throw new Error("MediaProcessor requires ManifestWriter");
    }

    if (!config) {
      throw new Error("MediaProcessor requires Config");
    }

    if (!artifactService) {
      throw new Error("MediaProcessor requires ArtifactService");
    }

    if (!artifactUploadService) {
      throw new Error("MediaProcessor requires ArtifactUploadService");
    }

    this.probe = probe;
    this.ffmpeg = ffmpeg;
    this.validator = validator;
    this.artifacts = artifacts;
    this.manifestWriter = manifestWriter;
    this.config = config;
    this.artifactService = artifactService;
    this.artifactUploadService = artifactUploadService;
  }

  async process({ inputPath, jobId, assetId, source = null }) {
    if (!inputPath) {
      throw new Error("MediaProcessor requires inputPath");
    }

    if (!jobId) {
      throw new Error("MediaProcessor requires jobId");
    }

    if (!assetId) {
      throw new Error("MediaProcessor requires assetId");
    }

    const job = await this.artifacts.createJob(jobId);

    /*
     * --------------------------------------------------
     * FFPROBE
     * --------------------------------------------------
     */

    const media = await this.probe.inspect(inputPath);

    const validation = this.validator.validate(media);

    const ffprobePath = path.join(job.directory, "ffprobe.json");

    await this.artifacts.writeJson(ffprobePath, media.raw);

    const ffprobeArtifact = await this.#registerArtifact({
      jobId,
      assetId,
      type: "FFPROBE",
      filePath: ffprobePath,
      contentType: "application/json",
    });

    const uploadedFfprobe = await this.#uploadArtifact({
      artifact: ffprobeArtifact,
      assetId,
      jobId,
      filename: "ffprobe.json",
    });

    /*
     * --------------------------------------------------
     * OUTPUTS
     * --------------------------------------------------
     */

    const outputs = {
      wav: null,
      mp3: null,
      videoOnly: null,
      subtitles: [],
    };

    const primaryAudio = media.audio[0] ?? null;

    const primaryVideo = media.video[0] ?? null;

    /*
     * --------------------------------------------------
     * WAV
     * --------------------------------------------------
     */

    if (primaryAudio && this.config.processing.generateWav) {
      const outputPath = path.join(job.directory, "audio.wav");

      await this.ffmpeg.extractWav({
        inputPath,
        outputPath,
        streamIndex: primaryAudio.index,
      });

      const artifact = await this.#registerArtifact({
        jobId,
        assetId,
        type: "AUDIO_WAV",
        filePath: outputPath,
        contentType: "audio/wav",
      });

      outputs.wav = await this.#uploadArtifact({
        artifact,
        assetId,
        jobId,
        filename: "audio.wav",
      });
    }

    /*
     * --------------------------------------------------
     * MP3
     * --------------------------------------------------
     */

    if (primaryAudio && this.config.processing.generateMp3) {
      const outputPath = path.join(job.directory, "audio.mp3");

      await this.ffmpeg.extractMp3({
        inputPath,
        outputPath,
        streamIndex: primaryAudio.index,
      });

      const artifact = await this.#registerArtifact({
        jobId,
        assetId,
        type: "AUDIO_MP3",
        filePath: outputPath,
        contentType: "audio/mpeg",
      });

      outputs.mp3 = await this.#uploadArtifact({
        artifact,
        assetId,
        jobId,
        filename: "audio.mp3",
      });
    }

    /*
     * --------------------------------------------------
     * VIDEO ONLY
     * --------------------------------------------------
     */

    if (primaryVideo && this.config.processing.generateVideoOnly) {
      const outputPath = path.join(job.directory, "video-only.mp4");

      await this.ffmpeg.extractVideo({
        inputPath,
        outputPath,
        streamIndex: primaryVideo.index,
      });

      const artifact = await this.#registerArtifact({
        jobId,
        assetId,
        type: "VIDEO_ONLY",
        filePath: outputPath,
        contentType: "video/mp4",
      });

      outputs.videoOnly = await this.#uploadArtifact({
        artifact,
        assetId,
        jobId,
        filename: "video-only.mp4",
      });
    }

    /*
     * --------------------------------------------------
     * SUBTITLES
     * --------------------------------------------------
     */

    if (this.config.processing.extractSubtitles) {
      for (let i = 0; i < media.subtitles.length; i++) {
        const subtitle = media.subtitles[i];

        const language = subtitle.language ?? "und";

        const filename = `${i}_${language}.srt`;

        const outputPath = path.join(job.subtitlesDirectory, filename);

        await this.ffmpeg.extractSubtitle({
          inputPath,
          outputPath,
          streamIndex: subtitle.index,
        });

        const artifact = await this.#registerArtifact({
          jobId,
          assetId,
          type: "SUBTITLE",
          filePath: outputPath,
          contentType: "application/x-subrip",
        });

        const uploaded = await this.#uploadArtifact({
          artifact,
          assetId,
          jobId,
          filename: `subtitles/${filename}`,
        });

        outputs.subtitles.push({
          artifactId: uploaded.artifactId,

          streamIndex: subtitle.index,

          language,

          title: subtitle.title ?? null,

          codec: subtitle.codec ?? null,

          format: "srt",

          storage: "S3",

          bucket: uploaded.bucket,

          objectKey: uploaded.objectKey,

          contentType: uploaded.contentType,

          sizeBytes: uploaded.sizeBytes,
        });
      }
    }

    /*
     * --------------------------------------------------
     * MANIFEST
     * --------------------------------------------------
     *
     * Important:
     *
     * We create the manifest only after all other
     * artifacts have already been uploaded.
     *
     * Therefore the manifest can directly contain
     * the final S3 references.
     */

    const manifest = {
      schemaVersion: "1.0",

      jobId,

      assetId,

      source: source ?? {
        type: "s3",
        assetId,
      },

      format: media.format,

      streams: {
        video: media.video,

        audio: media.audio,

        subtitles: media.subtitles,
      },

      chapters: media.chapters,

      summary: {
        streamCount: media.streamCount,

        videoStreamCount: media.videoStreamCount,

        audioStreamCount: media.audioStreamCount,

        subtitleStreamCount: media.subtitleStreamCount,

        hasVideo: media.hasVideo,

        hasAudio: media.hasAudio,

        hasSubtitles: media.hasSubtitles,
      },

      validation,

      processing: {
        primaryAudioStream: primaryAudio?.index ?? null,

        primaryVideoStream: primaryVideo?.index ?? null,

        artifacts: {
          ffprobe: {
            artifactId: uploadedFfprobe.artifactId,

            storage: "S3",

            bucket: uploadedFfprobe.bucket,

            objectKey: uploadedFfprobe.objectKey,

            contentType: uploadedFfprobe.contentType,

            sizeBytes: uploadedFfprobe.sizeBytes,
          },
        },

        outputs,
      },
    };

    /*
     * --------------------------------------------------
     * WRITE LOCAL MANIFEST
     * --------------------------------------------------
     */

    const manifestPath = await this.manifestWriter.write({
      directory: job.directory,

      manifest,
    });

    /*
     * --------------------------------------------------
     * REGISTER MANIFEST
     * --------------------------------------------------
     */

    const manifestArtifact = await this.#registerArtifact({
      jobId,

      assetId,

      type: "MANIFEST",

      filePath: manifestPath,

      contentType: "application/json",
    });

    /*
     * --------------------------------------------------
     * UPLOAD MANIFEST
     * --------------------------------------------------
     *
     * No toObject() here.
     *
     * #registerArtifact() returns a plain object.
     */

    const uploadedManifest = await this.#uploadArtifact({
      artifact: manifestArtifact,

      assetId,

      jobId,

      filename: "manifest.json",
    });

    /*
     * --------------------------------------------------
     * FINAL RESULT
     * --------------------------------------------------
     */

    return {
      jobId,

      assetId,

      inputPath,

      manifestPath,

      ffprobePath,

      media: manifest,

      outputs,

      artifacts: {
        manifest: uploadedManifest,

        ffprobe: uploadedFfprobe,
      },
    };
  }

  async #registerArtifact({ jobId, assetId, type, filePath, contentType }) {
    const file = await this.#requireArtifact(filePath);

    const artifact = await this.artifactService.create({
      jobId,

      assetId,

      type,

      storage: "LOCAL",

      localPath: filePath,

      contentType,

      size: file.sizeBytes,

      status: "CREATED",

      filename: path.basename(filePath),
    });

    /*
     * Return a plain object intentionally.
     *
     * ArtifactUploadService only needs the artifact
     * information required for upload.
     */

    return {
      artifactId: artifact.artifactId,

      jobId,

      assetId,

      type,

      localPath: filePath,

      contentType,

      sizeBytes: file.sizeBytes,

      filename: path.basename(filePath),
    };
  }

  async #uploadArtifact({ artifact, assetId, jobId, filename }) {
    return this.artifactUploadService.upload({
      artifact,

      assetId,

      jobId,

      filename,
    });
  }

  async #requireArtifact(outputPath) {
    const artifact = await this.artifacts.getFileInfo(outputPath);

    if (!artifact) {
      throw new Error(`Expected output was not created: ${outputPath}`);
    }

    return artifact;
  }
}
