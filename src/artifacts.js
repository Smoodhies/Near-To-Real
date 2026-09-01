import fs from "node:fs/promises";
import path from "node:path";

export class ArtifactManager {
  constructor({ outputDirectory }) {
    if (!outputDirectory) {
      throw new Error("ArtifactManager requires outputDirectory");
    }

    this.outputDirectory = outputDirectory;
  }

  async createJob(jobId) {
    if (!jobId) {
      throw new Error("ArtifactManager.createJob requires jobId");
    }

    const directory = path.join(this.outputDirectory, jobId);

    const subtitlesDirectory = path.join(directory, "subtitles");

    await fs.mkdir(subtitlesDirectory, {
      recursive: true,
    });

    return {
      jobId,
      directory,
      subtitlesDirectory,
    };
  }

  async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);

      if (!stats.isFile() || stats.size <= 0) {
        return null;
      }

      return {
        path: filePath,
        sizeBytes: stats.size,
      };
    } catch {
      return null;
    }
  }

  async writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  }
}
