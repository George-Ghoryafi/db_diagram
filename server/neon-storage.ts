import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { SchemaError, parseSchema } from "./schema.js";
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
      name: row.id,
      dbml: row.dbml,
      revision: row.revision,
      layout: row.layout,
      storage: "cloud",
    };
  }
  async list() {
    const rows = await this
      .sql`SELECT id, revision FROM diagram_documents ORDER BY id`;
    return rows.map((row) => ({
      id: row.id,
      name: row.id,
      revision: row.revision,
      storage: "cloud",
    }));
  }
  async read(id: string) {
    validateId(id);
    const rows = await this
      .sql`SELECT id, dbml, revision, layout FROM diagram_documents WHERE id=${id}`;
    if (!rows.length) throw new SchemaError("Schema not found.", 404);
    return this.document(rows[0]);
  }
  async write(id: string, dbml: string, expectedRevision?: string) {
    validateId(id);
    parseSchema(dbml);
    const next = hash(dbml);
    // Each successful write records its version in the same SQL statement.
    const rows = expectedRevision
      ? await this.sql`WITH written AS (
     UPDATE diagram_documents SET dbml=${dbml},revision=${next},updated_at=now()
     WHERE id=${id} AND revision=${expectedRevision} RETURNING id,dbml,revision,layout
    ), version AS (
     INSERT INTO diagram_versions(id,revision,dbml) SELECT id,revision,dbml FROM written
     ON CONFLICT(id,revision) DO NOTHING
    ) SELECT * FROM written`
      : await this.sql`WITH written AS (
     INSERT INTO diagram_documents(id,dbml,revision) VALUES(${id},${dbml},${next})
     ON CONFLICT(id) DO NOTHING RETURNING id,dbml,revision,layout
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
      .sql`UPDATE diagram_documents SET layout=${JSON.stringify(layout)}::jsonb,updated_at=now() WHERE id=${id} RETURNING id,dbml,revision,layout`;
    if (!rows.length) throw new SchemaError("Schema not found.", 404);
    return this.document(rows[0]);
  }
}
