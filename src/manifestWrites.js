export class ManifestWriter {
  constructor({ artifacts }) {
    this.artifacts = artifacts;
  }

  async write({ directory, manifest }) {
    const path = `${directory}/manifest.json`;

    await this.artifacts.writeJson(path, manifest);

    return path;
  }
}
