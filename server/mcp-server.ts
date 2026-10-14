import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  MetadataError,
  type Bundle,
  type DiagramMetadata,
} from "../src/bundles.js";
import { arrangedLayout, positionedLayout, layoutBounds, layoutModel } from "./layout.js";
import type { Layout, LayoutExpectation } from "./storage.js";
import type { SchemaStore } from "./storage.js";
import { storageModelSchema, writeStorageModel, storageLinkIssue, storageNodeId } from '../src/storage-model.js';
import {
  SchemaError,
  errorMessage,
  exportSchema,
  parseSchema,
} from "./schema.js";

type Awaitable<T> = T | Promise<T>;
export type McpSchemaStore = {
  list(): Awaitable<ReturnType<SchemaStore["list"]>>;
  read(id: string): Awaitable<ReturnType<SchemaStore["read"]>>;
  write(
    id: string,
    dbml: string,
    revision?: string,
    metadata?: DiagramMetadata,
  ): ReturnType<SchemaStore["write"]>;
  saveLayout(id:string,layout:Layout,expected?:LayoutExpectation):ReturnType<SchemaStore["saveLayout"]>;
  readLayout(id:string):Awaitable<{layout:Layout;layout_revision:string}>;
  listBundles(): Awaitable<Bundle[]>;
  createBundle(name: string, color: string): Promise<Bundle>;
  moveSchema(id: string, bundleId: string): ReturnType<SchemaStore["write"]>;
};
export function createSchemaMcp(store: McpSchemaStore) {
  const server = new McpServer({ name: "schemaDB", version: "1.6.0" });
  function result(value: unknown) {
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(value, null, 2) },
      ],
    };
  }
  async function run(action: () => unknown) {
    try {
      return result(await action());
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              error instanceof SchemaError || error instanceof MetadataError
                ? errorMessage(error)
                : "Schema storage is unavailable. Retry shortly.",
          },
        ],
      };
    }
  }
  const pointSchema = z.object({x:z.number().finite().min(-10000000).max(10000000),y:z.number().finite().min(-10000000).max(10000000)}).strict();
  const positionsSchema = z.record(z.string(),pointSchema).refine(value=>Object.keys(value).length<=10000,'Use at most 10,000 positions.');
  async function layoutChange(id:string,revision:string,layout_revision:string,dry_run:boolean,compute:(dbml:string,layout:Layout)=>Layout|Promise<Layout>) {
    const current=await store.read(id);
    if(current.revision!==revision || current.layout_revision!==layout_revision)throw new SchemaError('Diagram or layout changed. Read_schema again before arranging.',409);
    const layout=await compute(current.dbml,current.layout);
    const document=dry_run?current:await store.saveLayout(id,layout,{revision,layout_revision});
    return {id,layout,layout_revision:dry_run?current.layout_revision:document.layout_revision,revision:document.revision,dry_run,previous_layout:current.layout,bounds:layoutBounds(layoutModel(current.dbml).items,layout)};
  }
  server.registerTool('write_layout',{
    description:'Position SQL tables, storage nodes and table groups without editing DBML. Read_schema first; supply revision and layout_revision. positions is a partial map of qualified table IDs or storage:<store-id> to {x,y}; other saved positions are preserved. Set replace=true to replace the entire layout (including restoring previous_layout); do not combine replace with group_positions. group_positions maps group names to the desired top-left of the visible group box; all member tables move together, preserving relative offsets. Explicit node positions override group movement. Groups require existing saved member positions; use arrange_diagram first for a new diagram. dry_run previews without saving. Returns previous_layout for undo; refresh revisions before restoring it. Open canvases pick up saved layout changes automatically.',
    inputSchema:{id:z.string(),revision:z.string(),layout_revision:z.string(),positions:positionsSchema.default({}),group_positions:positionsSchema.default({}),dry_run:z.boolean().default(false),replace:z.boolean().default(false)}
  },({id,revision,layout_revision,positions,group_positions,dry_run,replace})=>run(()=>layoutChange(id,revision,layout_revision,dry_run,(dbml,layout)=>positionedLayout(dbml,layout,positions,group_positions,replace))));
  server.registerTool('arrange_diagram',{
    description:'Automatically arrange all SQL tables and non-SQL stores without changing DBML. Read_schema first; supply revision and layout_revision. mode left-right places upstream systems on the left; pipeline orders table groups by dependencies; groups packs members into separate blocks; compact and snowflake are also available. For application data flow, supply flows [{from,to}] using qualified table IDs or storage:<store-id>; these are layout-only flow directions, replacing inferred FK/storage dependencies. Example: documents -> processing -> vector index. Do not infer application flow solely from FK direction. Omit flows for the normal dependency layout. dry_run previews positions and bounds. Saved layouts appear in open canvases; groups wrap their member tables.',
    inputSchema:{id:z.string(),revision:z.string(),layout_revision:z.string(),mode:z.enum(['left-right','pipeline','groups','compact','snowflake']).default('left-right'),flows:z.array(z.object({from:z.string(),to:z.string()}).strict()).max(10000).optional(),dry_run:z.boolean().default(false)}
  },({id,revision,layout_revision,mode,flows,dry_run})=>run(()=>layoutChange(id,revision,layout_revision,dry_run,(dbml,layout)=>arrangedLayout(dbml,mode,flows).then(next=>({...layout,...next})))));
  server.registerTool(
    "list_schemas",
    {
      description: "List DBML schema IDs and current revisions.",
      inputSchema: { bundle_id: z.string().optional() },
    },
    ({ bundle_id }) =>
      run(async () =>
        (await store.list()).filter(
          (d) => !bundle_id || d.bundle_id === bundle_id,
        ),
      ),
  );
  server.registerTool(
    "read_schema",
    {
      description:
        "Read DBML, revision, layout_revision, saved layout, and normalized tables (including per-field checks, plain-language check summaries and indexes), relationships (including optional and bounded cardinalities), indexes, groups and model.storage (object/BLOB stores with buckets, document stores with collection shapes, key-value stores with keyspaces, vector databases with indexes, typed sample records, and cross-system links). Use write_storage to change storage definitions while preserving SQL DBML. Use arrange_diagram or write_layout to organize the canvas using the current revision and layout_revision.",
      inputSchema: { id: z.string() },
    },
    ({ id }) =>
      run(async () => {
        const schema = await store.read(id);
        return { ...schema, model: parseSchema(schema.dbml) };
      }),
  );
  server.registerTool(
    "write_schema",
    {
      description:
        "Create or update a schema. When updating, provide the revision returned by read_schema to prevent overwriting newer edits. Preserve existing SQL, @schemadb-cardinality and @schemadb-storage comments unless explicitly changing them; use write_storage for structured non-SQL edits. Optional relationships use native DBML ? operators (e.g. >?). For numeric bounds preserve a top-level /* @schemadb-cardinality {\"version\":1,\"relationships\":{...}} */ JSON comment; keys are JSON.stringify([fromTable,fromFields,toTable,toFields]) matching normalized read_schema endpoints, values are {from:\"1\",to:\"2..5\"}. Numeric bounds are diagram metadata, not SQL enforcement. DBML is validated before atomic save; previous versions are backed up. For creation, optionally provide bundle_id and name; otherwise use Shared diagrams. Use move_schema for existing diagrams.",
      inputSchema: {
        id: z.string(),
        dbml: z.string(),
        revision: z.string().optional(),
        bundle_id: z.string().optional(),
        name: z.string().trim().min(1).max(120).optional(),
      },
    },
    ({ id, dbml, revision, bundle_id, name }) =>
      run(() => store.write(id, dbml, revision, { bundle_id, name })),
  );
  server.registerTool(
    "write_storage",
    {
      description: "Replace the storage model of an existing diagram, preserving all SQL DBML. Read_schema first and supply its revision and model.storage. Storage model version is 1; units have stable IDs, kind blob/document/kv/vector, name, provider, note, and items (buckets/collections/keyspaces/indexes). Items have id, name, access private/public, keyPattern, contentType, ttl, note, shape (a JSON field map or JSON Schema string), and records (a JSON array of objects). Preserve records when editing other item properties. Documents accept nested JSON objects. KV records require key and value. BLOB records require key and can include content_type, size_bytes and metadata. Vector indexes may specify dimensions and metric cosine/dot/euclidean; vector records require unique id and a numeric vector matching dimensions, with optional metadata. Links have id, kind reference/sync/cache/flow, label, direction forward/both, from/to endpoints {node,port}. SQL nodes use qualified table IDs and column names; storage nodes use storage:<unit-id> and item IDs or <item-id>/<field.path> for nested document fields. Empty port targets the whole node. Non-SQL definitions persist in a portable @schemadb-storage DBML comment; SQL exports omit them. This models storage, it does not provision infrastructure.",
      inputSchema: { id: z.string(), revision: z.string(), storage: storageModelSchema },
    },
    ({ id, revision, storage }) => run(async () => {
      const document = await store.read(id);
      if (document.revision !== revision) throw new SchemaError('Schema changed. Read its latest revision before saving.', 409);
      const tables = parseSchema(document.dbml).tables;
      for (const link of storage.links) {
        const issue = storageLinkIssue(link, storage.units, tables);
        if (issue) throw new SchemaError(issue);
        if (![link.from, link.to].some(endpoint => storage.units.some(unit => storageNodeId(unit.id) === endpoint.node))) throw new SchemaError('Storage connections need at least one storage endpoint. Use DBML Ref for SQL foreign keys.');
      }
      try { return await store.write(id, writeStorageModel(document.dbml, storage), revision); }
      catch (error) { if (error instanceof SchemaError) throw error; throw new SchemaError(errorMessage(error)); }
    }),
  );
  server.registerTool(
    "validate_schema",
    {
      description:
        "Validate DBML and return its normalized visualization model without saving.",
      inputSchema: { dbml: z.string() },
    },
    ({ dbml }) => run(() => parseSchema(dbml)),
  );
  server.registerTool(
    "export_schema",
    {
      description:
        "Export a stored schema as PostgreSQL, MySQL, SQL Server SQL, or original portable DBML.",
      inputSchema: {
        id: z.string(),
        format: z.enum(["postgres", "mysql", "mssql", "dbml"]),
      },
    },
    ({ id, format }) =>
      run(async () => ({
        format,
        content: exportSchema((await store.read(id)).dbml, format),
      })),
  );
  server.registerTool(
    "list_bundles",
    {
      description: "List public diagram bundles, their IDs and colors.",
      inputSchema: {},
    },
    () => run(() => store.listBundles()),
  );
  server.registerTool(
    "create_bundle",
    {
      description:
        "Create a named, colored bundle. Bundles organize public diagrams; they do not restrict access.",
      inputSchema: { name: z.string(), color: z.string().default("#6288e8") },
    },
    ({ name, color }) => run(() => store.createBundle(name, color)),
  );
  server.registerTool(
    "move_schema",
    {
      description:
        "Move a diagram to another bundle without changing its ID, DBML, revision or saved layout.",
      inputSchema: { id: z.string(), bundle_id: z.string() },
    },
    ({ id, bundle_id }) => run(() => store.moveSchema(id, bundle_id)),
  );
  return server;
}
