import fs from "node:fs/promises";
import path from "node:path";

export class JobWorkspace {
  constructor({ rootDirectory }) {
    if (!rootDirectory) {
      throw new Error("JobWorkspace requires rootDirectory");
    }

    this.rootDirectory = rootDirectory;
  }

  async create(jobId) {
    if (!jobId) {
      throw new Error("JobWorkspace requires jobId");
    }

    const root = path.join(this.rootDirectory, jobId);

    await fs.mkdir(root, {
      recursive: true,
    });

    return {
      root,
    };
  }

  inputPath(workspace, extension = ".media") {
    return path.join(workspace.root, `input${extension}`);
  }

  async cleanup(workspacePath) {
    if (!workspacePath) {
      return;
    }

    await fs.rm(workspacePath, {
      recursive: true,
      force: true,
    });
  }
}
