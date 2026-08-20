export class MediaValidator {
  validate(media) {
    const warnings = [];

    if (!media.hasVideo) {
      warnings.push("No video stream found");
    }

    if (!media.hasAudio) {
      warnings.push("No audio stream found");
    }

    for (const audio of media.audio) {
      if (!audio.sampleRate || audio.sampleRate <= 0) {
        warnings.push(`Audio stream ${audio.index} has invalid sample rate`);
      }
    }

    for (const video of media.video) {
      if (!video.width || !video.height) {
        warnings.push(`Video stream ${video.index} has invalid resolution`);
      }
    }

    return {
      mediaReadable: true,

      hasValidDuration: media.format.duration > 0,

      hasVideo: media.hasVideo,

      hasAudio: media.hasAudio,

      hasSubtitles: media.hasSubtitles,

      warnings,

      valid: warnings.length === 0,
    };
  }
}
