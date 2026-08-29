import { Config } from "../config/config.js";
import { ProcessRunner } from "../utils/processRunner.js";
import { FFProbe } from "../media/ffprobe/ffbrobe.js";
import { FFmpeg } from "../media/ffmpeg/ffmpeg.js";
import { MediaValidator } from "../media/mediaValidator/mediaValidator.js";
import { ArtifactManager } from "../artifacts.js";
import { ManifestWriter } from "../manifestWrites.js";
import { ArtifactService } from "../services/ArtifactService.js";
import { ArtifactUploadService } from "../services/ArtifactUploadService.js";
import { S3StorageService } from "../storage/S3StorageService.js";
import { MediaProcessor } from "../core/mediaProcessor.js";

export function createMediaProcessor({ config } = {}) {
  const resolvedConfig = config ?? new Config();

  const runner = new ProcessRunner();

  const probe = new FFProbe({
    runner,
  });

  const ffmpeg = new FFmpeg({
    runner,
    timeout: resolvedConfig.processing.ffmpegTimeoutMs,
  });

  const validator = new MediaValidator();

  const artifacts = new ArtifactManager({
    outputDirectory: resolvedConfig.paths.output,
  });

  const manifestWriter = new ManifestWriter({
    artifacts,
  });

  const artifactService = new ArtifactService();

  const storage = new S3StorageService({
    region: resolvedConfig.aws.region,
  });

  const artifactUploadService = new ArtifactUploadService({
    storage,
    outputBucket: resolvedConfig.aws.outputBucket,
  });

  return new MediaProcessor({
    probe,
    ffmpeg,
    validator,
    artifacts,
    manifestWriter,
    artifactService,
    artifactUploadService,
    config: resolvedConfig,
  });
}
