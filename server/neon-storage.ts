import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { SchemaError, parseSchema } from "./schema.js";
import {
  defaultBundle,
  bundleDetails,
  type Bundle,
  type DiagramMetadata,
} from "../src/bundles.js";
import { randomUUID } from "node:crypto";
import type { Layout } from "./storage.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function validateId(id: string) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))
    throw new SchemaError("Invalid schema ID.");
}
type Document = {
  id: string;
  name: string;
  dbml: string;
  revision: string;
  layout: Layout;
  storage: "cloud";
  bundle_id: string;
};
export class NeonSchemaStore {
  private sql;
  constructor(
    url = process.env.DATABASE_URL || process.env.db_diagram_DATABASE_URL,
  ) {
    if (!url)
      throw new SchemaError("Neon DATABASE_URL is not configured.", 503);
    this.sql = neon(url);
  }
  private document(row: Record<string, any>): Document {
    return {
      id: row.id,
      name: row.name || row.id,
      bundle_id: row.bundle_id,
      dbml: row.dbml,
      revision: row.revision,
      layout: row.layout,
      storage: "cloud",
    };
  }
  async list() {
    const rows = await this
      .sql`SELECT id, name, bundle_id, revision FROM diagram_documents ORDER BY lower(coalesce(name,id)),id`;
    return rows.map((row) => ({
      id: row.id,
      name: row.name || row.id,
      bundle_id: row.bundle_id,
      revision: row.revision,
      storage: "cloud",
    }));
  }
  async read(id: string) {
    validateId(id);
    const rows = await this
      .sql`SELECT id, name, bundle_id, dbml, revision, layout FROM diagram_documents WHERE id=${id}`;
    if (!rows.length) throw new SchemaError("Schema not found.", 404);
    return this.document(rows[0]);
  }
  async write(
    id: string,
    dbml: string,
    expectedRevision?: string,
    metadata: DiagramMetadata = {},
  ) {
    validateId(id);
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
    const next = hash(dbml);
    const bundleId = metadata.bundle_id || defaultBundle.id;
    if (
      !expectedRevision &&
      !(await this.listBundles()).some((b) => b.id === bundleId)
    )
      throw new SchemaError("Bundle not found.", 404);
    // Each successful write records its version in the same SQL statement.
    const rows = expectedRevision
      ? await this.sql`WITH written AS (
     UPDATE diagram_documents SET dbml=${dbml},revision=${next},updated_at=now()
     WHERE id=${id} AND revision=${expectedRevision} RETURNING id,name,bundle_id,dbml,revision,layout
    ), version AS (
     INSERT INTO diagram_versions(id,revision,dbml) SELECT id,revision,dbml FROM written
     ON CONFLICT(id,revision) DO NOTHING
    ) SELECT * FROM written`
      : await this.sql`WITH written AS (
     INSERT INTO diagram_documents(id,name,bundle_id,dbml,revision) VALUES(${id},${metadata.name || id},${bundleId},${dbml},${next})
     ON CONFLICT(id) DO NOTHING RETURNING id,name,bundle_id,dbml,revision,layout
    ), version AS (
     INSERT INTO diagram_versions(id,revision,dbml) SELECT id,revision,dbml FROM written
     ON CONFLICT(id,revision) DO NOTHING
    ) SELECT * FROM written`;
    if (!rows.length) {
      if (expectedRevision) await this.read(id);
      throw new SchemaError(
        "Schema changed. Read its latest revision before saving.",
        409,
      );
    }
    return this.document(rows[0]);
  }
  async listBundles(): Promise<Bundle[]> {
    const rows = await this
      .sql`SELECT id,name,color FROM diagram_bundles ORDER BY created_at,id`;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
    }));
  }
  async createBundle(name: string, color: string) {
    const details = bundleDetails(name, color);
    const id = randomUUID();
    await this
      .sql`INSERT INTO diagram_bundles(id,name,color) VALUES(${id},${details.name},${details.color})`;
    return { id, ...details };
  }
  async moveSchema(id: string, bundleId: string) {
    validateId(id);
    validateId(bundleId);
    if (!(await this.listBundles()).some((b) => b.id === bundleId))
      throw new SchemaError("Bundle not found.", 404);
    const rows = await this
      .sql`UPDATE diagram_documents SET bundle_id=${bundleId},updated_at=now() WHERE id=${id} RETURNING id,name,bundle_id,dbml,revision,layout`;
    if (!rows.length) throw new SchemaError("Schema not found.", 404);
    return this.document(rows[0]);
  }
  async saveLayout(id: string, layout: Layout) {
    validateId(id);
    if (
      !layout ||
      typeof layout !== "object" ||
      Array.isArray(layout) ||
      Object.keys(layout).length > 10000 ||
      Object.values(layout).some(
        (p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y),
      )
    )
      throw new SchemaError(
        "Layout must map table IDs to finite x/y coordinates.",
      );
    const rows = await this
      .sql`UPDATE diagram_documents SET layout=${JSON.stringify(layout)}::jsonb,updated_at=now() WHERE id=${id} RETURNING id,name,bundle_id,dbml,revision,layout`;
    if (!rows.length) throw new SchemaError("Schema not found.", 404);
    return this.document(rows[0]);
  }
}
