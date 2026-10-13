import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  lstatSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseSchema, SchemaError } from "./schema.js";
import {
  defaultBundle,
  bundleDetails,
  type Bundle,
  type DiagramMetadata,
} from "../src/bundles.js";
import { example, exampleLayout } from "./example.js";

export type Layout = Record<string, { x: number; y: number }>;
export const revision = (dbml: string) =>
  createHash("sha256").update(dbml).digest("hex");
export class SchemaStore {
  readonly directory: string;
  constructor(directory = process.env.SCHEMA_DIR || resolve("schemas")) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true });
  }
  private path(id: string, suffix = ".dbml") {
    if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))
      throw new SchemaError("Invalid schema ID.");
    const path = join(this.directory, id + suffix);
    if (existsSync(path) && lstatSync(path).isSymbolicLink())
      throw new SchemaError("Symlink schema paths are not supported.");
    return path;
  }
  private atomic(path: string, text: string) {
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, text, { mode: 0o600 });
      renameSync(temp, path);
    } finally {
      rmSync(temp, { force: true });
    }
  }
  private async lock<T>(id: string, action: () => T): Promise<T> {
    const path = this.path(id, ".lock");
    const deadline = Date.now() + 5000;
    while (true) {
      try {
        mkdirSync(path);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline)
          throw new SchemaError(
            "Schema is locked by another writer. Retry shortly; remove a stale .lock directory after a crashed writer.",
            409,
          );
        await delay(25);
      }
    }
    try {
      return action();
    } finally {
      rmSync(path, { recursive: true, force: true });
    }
  }
  list() {
    return readdirSync(this.directory)
      .filter((name) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.dbml$/.test(name))
      .map((name) => {
        const schema = this.read(name.slice(0, -5));
        return {
          id: schema.id,
          name: schema.name,
          revision: schema.revision,
          bundle_id: schema.bundle_id,
        };
      });
  }
  read(id: string) {
    const path = this.path(id);
    if (!existsSync(path)) throw new SchemaError("Schema not found.", 404);
    const dbml = readFileSync(path, "utf8");
    const layoutPath = this.path(id, ".layout.json");
    let layout: Layout = {};
    if (existsSync(layoutPath)) {
      try {
        layout = JSON.parse(readFileSync(layoutPath, "utf8"));
      } catch {
        throw new SchemaError(
          "Layout file is invalid JSON. Restore it from a backup.",
          500,
        );
      }
    }
    const metadataPath = this.path(id, ".meta.json");
    const metadata = existsSync(metadataPath)
      ? JSON.parse(readFileSync(metadataPath, "utf8"))
      : {};
    return {
      id,
      name: metadata.name || id,
      bundle_id: metadata.bundle_id || defaultBundle.id,
      dbml,
      revision: revision(dbml),
      layout,
    };
  }
  async write(
    id: string,
    dbml: string,
    expectedRevision?: string,
    metadata: DiagramMetadata = {},
  ) {
    this.path(id);
    parseSchema(dbml);
    if (
      metadata.name !== undefined &&
      (typeof metadata.name !== "string" ||
        !metadata.name.trim() ||
        metadata.name.trim().length > 120)
    )
      throw new SchemaError("Diagram names must contain 1–120 characters.");
    if (
      expectedRevision &&
      (metadata.name !== undefined || metadata.bundle_id !== undefined)
    )
      throw new SchemaError("Use move_schema to change a bundle.");
    if (
      !expectedRevision &&
      !this.listBundles().some(
        (b) => b.id === (metadata.bundle_id || defaultBundle.id),
      )
    )
      throw new SchemaError("Bundle not found.", 404);
    return this.lock(id, () => {
      const path = this.path(id);
      if (existsSync(path)) {
        const current = readFileSync(path, "utf8");
        if (!expectedRevision || expectedRevision !== revision(current))
          throw new SchemaError(
            "Schema changed. Read its latest revision before saving.",
            409,
          );
        mkdirSync(join(this.directory, ".backups"), { recursive: true });
        this.atomic(
          join(this.directory, ".backups", `${id}.${revision(current)}.dbml`),
          current,
        );
      } else if (expectedRevision)
        throw new SchemaError("Schema not found.", 404);
      this.atomic(path, dbml);
      if (!expectedRevision)
        this.atomic(
          this.path(id, ".meta.json"),
          JSON.stringify({
            name: metadata.name || id,
            bundle_id: metadata.bundle_id || defaultBundle.id,
          }),
        );
      return this.read(id);
    });
  }
  async saveLayout(id: string, layout: Layout) {
    if (
      !layout ||
      typeof layout !== "object" ||
      Array.isArray(layout) ||
      Object.keys(layout).length > 10000 ||
      Object.values(layout).some(
        (point) =>
          !point || !Number.isFinite(point.x) || !Number.isFinite(point.y),
      )
    )
      throw new SchemaError(
        "Layout must map table IDs to finite x/y coordinates.",
      );
    return this.lock(id, () => {
      this.read(id);
      this.atomic(
        this.path(id, ".layout.json"),
        JSON.stringify(layout, null, 2),
      );
      return this.read(id);
    });
  }
  listBundles(): Bundle[] {
    const path = this.path("workspace-bundles", ".json");
    return existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : [defaultBundle];
  }
  async createBundle(name: string, color: string) {
    const details = bundleDetails(name, color);
    return this.lock("workspace-bundles", () => {
      const bundles = this.listBundles();
      const bundle = { id: randomUUID(), ...details };
      bundles.push(bundle);
      this.atomic(
        this.path("workspace-bundles", ".json"),
        JSON.stringify(bundles),
      );
      return bundle;
    });
  }
  async moveSchema(id: string, bundleId: string) {
    if (!this.listBundles().some((b) => b.id === bundleId))
      throw new SchemaError("Bundle not found.", 404);
    return this.lock(id, () => {
      const document = this.read(id);
      this.atomic(
        this.path(id, ".meta.json"),
        JSON.stringify({ name: document.name, bundle_id: bundleId }),
      );
      return this.read(id);
    });
  }
  async seed() {
    if (this.list().length) return;
    try {
      await this.write("welcome", example);
      await this.saveLayout("welcome", exampleLayout);
    } catch (error) {
      if (!(error instanceof SchemaError && error.status === 409)) throw error;
    }
  }
}
