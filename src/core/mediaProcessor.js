export class MediaProcessor {
    constructor({
        probe,
        ffmpeg,
        validator,
        artifacts,
        manifestWriter,
        config,
    }) {
        this.probe = probe;
        this.ffmpeg = ffmpeg;
        this.validator =
            validator;
        this.artifacts =
            artifacts;
        this.manifestWriter =
            manifestWriter;
        this.config = config;
    }

    async process(inputPath) {
        const job =
            await this.artifacts.createJob();

        const media =
            await this.probe.inspect(
                inputPath,
            );

        const validation =
            this.validator.validate(
                media,
            );

        const ffprobePath =
            `${job.directory}/ffprobe.json`;

        await this.artifacts.writeJson(
            ffprobePath,
            media.raw,
        );

        const outputs = {
            wav: null,
            mp3: null,
            videoOnly: null,
            subtitles: [],
        };

        /*
         * Currently use first audio/video
         * stream as the default track.
         */
        const primaryAudio =
            media.audio[0] ?? null;

        const primaryVideo =
            media.video[0] ?? null;

        if (
            primaryAudio &&
            this.config.processing
                .generateWav
        ) {
            const outputPath =
                `${job.directory}/audio.wav`;

            await this.ffmpeg.extractWav({
                inputPath,
                outputPath,
                streamIndex:
                    primaryAudio.index,
            });

            outputs.wav =
                await this.#requireArtifact(
                    outputPath,
                );
        }

        if (
            primaryAudio &&
            this.config.processing
                .generateMp3
        ) {
            const outputPath =
                `${job.directory}/audio.mp3`;

            await this.ffmpeg.extractMp3({
                inputPath,
                outputPath,
                streamIndex:
                    primaryAudio.index,
            });

            outputs.mp3 =
                await this.#requireArtifact(
                    outputPath,
                );
        }

        if (
            primaryVideo &&
            this.config.processing
                .generateVideoOnly
        ) {
            const outputPath =
                `${job.directory}/video-only.mp4`;

            await this.ffmpeg.extractVideo({
                inputPath,
                outputPath,
                streamIndex:
                    primaryVideo.index,
            });

            outputs.videoOnly =
                await this.#requireArtifact(
                    outputPath,
                );
        }

        if (
            this.config.processing
                .extractSubtitles
        ) {
            for (
                let i = 0;
                i <
                media.subtitles.length;
                i++
            ) {
                const subtitle =
                    media.subtitles[i];

                const language =
                    subtitle.language ??
                    "und";

                const outputPath =
                    `${job.subtitlesDirectory}/${i}_${language}.srt`;

                await this.ffmpeg.extractSubtitle(
                    {
                        inputPath,
                        outputPath,
                        streamIndex:
                            subtitle.index,
                    },
                );

                const artifact =
                    await this.#requireArtifact(
                        outputPath,
                    );

                outputs.subtitles.push({
                    streamIndex:
                        subtitle.index,

                    language,

                    title:
                        subtitle.title,

                    codec:
                        subtitle.codec,

                    format: "srt",

                    ...artifact,
                });
            }
        }

        const manifest = {
            schemaVersion: "1.0",

            jobId: job.jobId,

            source: {
                type: "local",
                path: inputPath,
            },

            format:
                media.format,

            streams: {
                video:
                    media.video,

                audio:
                    media.audio,

                subtitles:
                    media.subtitles,
            },

            chapters:
                media.chapters,

            summary: {
                streamCount:
                    media.streamCount,

                videoStreamCount:
                    media.videoStreamCount,

                audioStreamCount:
                    media.audioStreamCount,

                subtitleStreamCount:
                    media.subtitleStreamCount,

                hasVideo:
                    media.hasVideo,

                hasAudio:
                    media.hasAudio,

                hasSubtitles:
                    media.hasSubtitles,
            },

            validation,

            processing: {
                primaryAudioStream:
                    primaryAudio?.index ??
                    null,

                primaryVideoStream:
                    primaryVideo?.index ??
                    null,

                outputs,
            },
        };

        const manifestPath =
            await this.manifestWriter.write(
                {
                    directory:
                        job.directory,

                    manifest,
                },
            );

        return {
            jobId: job.jobId,

            inputPath,

            manifestPath,

            ffprobePath,

            media: manifest,

            outputs,
        };
    }

    async #requireArtifact(
        outputPath,
    ) {
        const artifact =
            await this.artifacts.getFileInfo(
                outputPath,
            );

        if (!artifact) {
            throw new Error(
                `Expected output was not created: ${outputPath}`,
            );
        }

        return artifact;
    }
}