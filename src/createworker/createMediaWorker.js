import { Config } from "../config/config.js";
import { createMediaProcessor } from "../createmedia/createMediaProcessor.js";
import { JobWorkspace } from "../worker/jobWorkerSpace.js";
import { MediaWorker } from "../worker/mediaWorker.js";

export function createMediaWorker({ workspace, config } = {}) {
  const resolvedConfig = config ?? new Config();

  const processor = createMediaProcessor({
    config: resolvedConfig,
  });

  const jobWorkspace =
    workspace ??
    new JobWorkspace({
      rootDirectory: resolvedConfig.paths.workspace,
    });

  return new MediaWorker({
    processor,
    workspace: jobWorkspace,
  });
}
