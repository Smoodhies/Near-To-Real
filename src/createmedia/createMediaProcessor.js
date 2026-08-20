import { Config } from "../config/config.js";
import { ProcessRunner } from "../utils/processRunner.js";

import { FFProbe } from "../media/ffprobe/ffbrobe.js";
import { FFmpeg } from "../media/ffmpeg/ffmpeg.js";
import { MediaValidator } from "../media/mediaValidator/mediaValidator.js";

import { ArtifactManager } from "../artifacts.js";
import { ManifestWriter } from "../manifestWrites.js";

import { MediaProcessor } from "../core/mediaProcessor.js";


export function createMediaProcessor() {
  const config = new Config();

  const runner = new ProcessRunner();

  const probe = new FFProbe({
    runner,
  });

  const ffmpeg = new FFmpeg({
    runner,
    timeout: config.processing.timeoutMs,
  });

  const validator = new MediaValidator();

  const artifacts = new ArtifactManager({
    outputDirectory: config.paths.output,
  });

  const manifestWriter = new ManifestWriter({
    artifacts,
  });

  return new MediaProcessor({
    probe,
    ffmpeg,
    validator,
    artifacts,
    manifestWriter,
    config,
  });
}
