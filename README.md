# schemaDB

A React + TypeScript schema workspace, based on dbdiagram's editor/canvas layout. Node/Express backend, official `@dbml/core` DBML v2 parser, CodeMirror editor, React Flow canvas. Runs locally or on Vercel with Neon and public bundles.

Select a table to reveal records and color buttons in its title bar. Clicking a relationship reveals a gear above the clicked point; color controls open only when the gear is pressed. Presets and custom hex colors write standard DBML settings. The compact records grid supports adding/editing rows, key and related-column hover details, and CSV download; sample data is stored in DBML `records` blocks. Foreign-key values open the parent table and highlight the matching record, with Back navigation and composite-key support. Apply changes, then Save the diagram to persist them. Edges route around table bounds and update when tables move.

## Run

Node 24.16+ recommended.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. For production locally: `npm run build && npm start`, then http://127.0.0.1:4318. Both servers bind only to loopback. `npm test` runs parser, edit insertion, storage, and HTTP safety tests.

## Schemas

`schemas/*.dbml` are the source of truth. Import/export the same DBML used by dbdiagram.io. The editor previews changes live; Save or Cmd/Ctrl+S writes to disk. Valid updates retain previous versions under `schemas/.backups`. Invalid DBML remains in the editor and cannot replace a saved schema. Revert reloads the current disk version. The app polls disk every two seconds and refuses to overwrite conflicting agent edits. Export unsaved changes as DBML before reverting a conflict.

Use the Indexes tab or select a table to create single/composite and unique indexes. Use Groups to organize tables and choose their colors. Drag tables, zoom/pan, fit the canvas, and use the minimap. Coordinates are kept separately in `.layout.json`; they are not embedded in DBML exports. Auto arrange offers left–right, pipeline, snowflake, and compact layouts. Layout saves use last writer wins. SQL export supports PostgreSQL, MySQL and SQL Server. SQL import isn't implemented; import DBML.

Complex constructs (expression indexes, partials, enums, notes, checks, quoted identifiers, cross-schema/composite relationships) can be authored in DBML with the official parser. Composite relationships draw a single edge anchored to the first column; all columns remain intact in DBML/SQL and the MCP model. Group outlines follow their member tables, but are not draggable as a unit. Tables and columns are created and edited in DBML; relationships can also be created by dragging between fields. The index form may not locate complex quoted schema/table identifiers: use DBML in that case.

## Codex and Claude Code

REA 6.4.0 is installed at `/Users/george/.local/share/rea` and registered for Codex and Claude Code. Restart these clients to load newly registered servers. Reference observations from REA are in `evidence/`.

The `local-diagram` stdio MCP server is registered in both clients. It works without the web server running and provides:

- `list_schemas`
- `read_schema` — DBML, revision, layout, normalized tables/groups/indexes/references
- `write_schema` — validates and saves; pass the last read revision when updating
- `validate_schema`
- `export_schema`

Configuration for another client:

```json
{
  "mcpServers": {
    "local-diagram": {
      "command": "/Users/george/Documents/diagram/node_modules/.bin/tsx",
      "args": ["/Users/george/Documents/diagram/server/mcp.ts"],
      "env": {"SCHEMA_DIR": "/Users/george/Documents/diagram/schemas"}
    }
  }
}
```

Or have an agent edit `schemas/commerce.dbml` directly; the browser refreshes its model automatically. Atomic replacement is recommended for direct file edits; filesystem writes bypass MCP's version conflict checks. Example prompt: “Read commerce with local-diagram, add a unique email index, validate, and write using the current revision.”

The schema directory is configurable with `SCHEMA_DIR`. No database engine is required: this designs database schemas rather than executing SQL against a database.

## Reference and verification

The public dbdiagram editor was inspected through REA's browser target listing, passive page inspection, and screenshot capture. `evidence/dbdiagram-page.json` records captured DOM/accessibility information and limitations; `evidence/dbdiagram-screenshot.json` contains the screenshot and digest. This informed the dark editor, light canvas, blue headers, and controls. This is a focused local reconstruction, not a claim of pixel-perfect or complete commercial feature parity. UI testing uses a disposable schema and verifies index/group creation and saving; automated tests cover DBML portability, invalid input, optimistic writes, backups, traversal and hostile browser origins. Qodo remote review cannot run here because there is no remote repository/base commit.

## Canvas controls

The bottom-left bar provides zoom out/in, a live percentage (click to reset to 100%), fit diagram, and hand/pan mode. The bottom-right bar provides:

- Four auto-arrange modes: left–right (Dagre foreign-key layout), pipeline (table-group stages), snowflake (most-connected table in the center), and compact. These match the reference's available choices; the algorithms are our implementation rather than identical recovered algorithms.
- Relationship highlighting for the selected table.
- Snap to a 20-unit grid.
- Sticky notes stored in portable DBML `Note` declarations. Double-click a note to edit it; remove it in DBML to delete it.
- All fields, keys only (including composite primary keys and relationship fields), and table names.
- Search tables, columns, relationships, groups, and notes, then focus the result.

Shortcuts outside text inputs: `1` fit, `2` layout choices, `3` highlight, `4` grid, `5` sticky note, Cmd/Ctrl+K search. Clicking an edge colors it blue, animates the line and a moving dot, highlights linked fields, and reveals the relationship name (or field endpoints for unnamed relationships), cardinality, and details. Motion respects the operating system's reduced-motion preference. Drag from a source field's right handle to another field's left handle to create a one-to-many relationship; DBML is validated before applying the edit. Save persists it. Diagram removal shortcuts are disabled: make destructive schema edits explicitly in DBML.

## Hosting direction for a 10-person team

Checked against provider documentation on 2026-10-12. No hosted deployment or storage migration has been performed yet.

**Lowest ongoing cost: Cloudflare Workers + D1 + Access.** Serve the React build and API from one Worker; keep DBML documents, layouts and version history in D1 (managed SQLite); protect the whole app and API with an email/team allowlist in Access. Workers Free includes 100,000 dynamic requests/day; static assets are free. D1 Free includes 5 million rows read/day, 100,000 rows written/day and 5 GB total storage (500 MB per database). Access is free for teams under 50 users. A team of 10 should fit after adapting polling and parsing, but this is an estimate rather than measured hosted usage. The current 2-second poll would generate about 144,000 requests/day if 10 people kept the app open for eight hours; hosted polling should be slowed to 15–30 seconds and paused for hidden tabs. Workers Paid starts at $5/month and has usage-based overages, so it is not a hard $5 cap. On Free, quota excess can stop requests rather than charge overages. A provider subdomain avoids needing to buy a domain.

The current backend is a conventional Node process with filesystem writes. Workers offers Node compatibility, not a persistent Node server/disk: storage, server entry point, Host/Origin checks and authentication must be adapted. The Free Worker CPU budget is 10 ms/request; DBML parsing and SQL export need profiling or a browser-side preview parser before promising it fits. Avoid uploading private schemas until access protection covers every API route. Hosted agents need authenticated remote MCP or an authenticated API bridge; local stdio MCP currently reads local files only. Keep optimistic revision checks for competing team/agent edits; real-time collaboration is unnecessary for this first hosted version.

**If keeping a conventional Node server is a requirement: DigitalOcean's $4/month Basic Droplet + SQLite.** It includes 512 MiB RAM, one vCPU, 10 GiB disk and 500 GiB transfer. This preserves Node and provides persistent disk, but requires server updates, HTTPS, authentication, backups and memory monitoring. Build the frontend elsewhere to avoid stressing the small VM. Taxes, domains, backups and bandwidth overages are additional, so $4 is the base server charge rather than a guarantee of the entire bill. SQLite is sufficient for this small shared document app; store the DBML itself, not an executed copy of each designed database.

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Access pricing](https://www.cloudflare.com/plans/zero-trust-services/), [DigitalOcean pricing](https://www.digitalocean.com/pricing/droplets). Avoid storing schemas in the filesystem of a free Render service: it is ephemeral and loses edits on restart/redeploy/idle spin-down ([Render limits](https://render.com/docs/free)).

## Default showcase and static deployments

Fresh workspaces start with **Team workspace · example**: five tables, six named relationships, colored groups, an enum, a composite primary key, an index, defaults and an editable sticky note. Its DBML and curated coordinates live in `src/example.ts`. `npm run build` validates the DBML and generates the lightweight initial diagram model before building the frontend. Existing stored schemas are retained.

A static deployment with no `/api/schemas` endpoint uses browser storage. The example renders immediately; the official parser loads separately for editing/export. Saves, new diagrams and layouts stay in this browser, labeled **BROWSER**; they are not shared with teammates. Export DBML to keep an independent copy. Clearing site data removes browser saves. Server/API mode continues using the existing filesystem and MCP workflow. The browser's Agent access dialog offers a DBML download rather than implying a remote MCP connection exists.

## Public Neon bundles and remote MCP

Vercel serves the public API and MCP at `/api/mcp`; Neon provides `DATABASE_URL` or this integration's `db_diagram_DATABASE_URL`. Run the statements in `server/neon-setup.sql`, then `server/bundles-setup.sql`, separately in the integration's Query editor. The bundle migration preserves existing schema IDs, DBML, revisions, layouts, and version history, placing existing diagrams into **Shared diagrams**.

The header picker shows the current bundle and diagram, with colored bundle identities, diagram search, bundle creation, and diagram moves. Bundles organize diagrams; they are not private. Hosted diagrams are publicly readable and editable without a key. The last bundle/diagram selection is remembered in the browser. Diagrams can share a display name while retaining distinct IDs.

**Agent access → Download MCP config** provides a Streamable HTTP configuration without authentication headers. MCP exposes `list_bundles`, `create_bundle`, `move_schema`, `list_schemas`, `read_schema`, `write_schema`, `validate_schema`, and `export_schema`. Use `bundle_id` to filter `list_schemas` or place a new schema in a bundle; existing schema updates preserve their bundle. Use `move_schema` to move diagrams without changing their source revision or layout. Accepted source writes continue to retain versions in `diagram_versions`.

The local filesystem backend and local stdio MCP work independently. Browser-only fallback keeps its existing data and stores bundles on the same device; hosted MCP operates on Neon rather than local files.

The relationship highlight toggle shows all relationships and their endpoint fields when enabled. Selecting a table limits highlight mode to that table's relationships; highlighted named relationships show labels and animate. Clicking a table selects all of its incoming and outgoing edges even when global highlight mode is off. Explicit edge selection continues to work.


Table cards use compact `NN` badges for explicit not-null settings, monospace data types, and primary/foreign-key icons. Hover or keyboard-focus an attribute to inspect its constraints, referenced columns, and note. Table notes have a note icon in the header. **Attach note** writes standard DBML notes on the selected table or attribute; it uses the official parser's source locations and preserves unrelated source. Inherited TablePartial notes are edited in DBML on the partial. Standalone `Note` declarations remain in source/export for compatibility, but their floating canvas cards are hidden.

## Mixed SQL and NoSQL storage models

The **Storage** tab models object/BLOB stores, document stores and key-value stores on the SQL canvas. Add a store, choose its technology, then define buckets, collections or keyspaces. Buckets have access levels, object types and key patterns. Collections and KV values accept a JSON field map (for example `{"document_id":"uuid","metadata":{"language":"string"}}`) or JSON Schema; nested objects and arrays appear as separate field rows. These are diagram definitions, not infrastructure provisioning or enforcement of access rules.

Use **Storage → Connections → Connect** to link a SQL table or column to a bucket, collection field or keyspace. Connections can represent references, synchronization, caches or data flow, with one-way or bidirectional arrows. They use dashed teal lines rather than SQL foreign-key notation. Store nodes participate in drag, fit, search, minimap and every auto-layout. A connection whose table, column or storage item was removed remains visible as a broken connection in the Storage panel so it can be repaired or removed.

Definitions are retained in a single top-level DBML comment:

```dbml
/* @schemadb-storage
{
  "version": 1,
  "units": [{
    "id": "files", "kind": "blob", "name": "Application files", "provider": "S3",
    "items": [{"id":"originals","name":"original-documents","access":"private","keyPattern":"{org_id}/{document_id}.pdf","contentType":"application/pdf"}]
  }],
  "links": [{
    "id":"document-object", "kind":"reference", "label":"locates original file", "direction":"forward",
    "from":{"node":"public.documents","port":"object_key"},
    "to":{"node":"storage:files","port":"originals"}
  }]
}
*/
```

Store kinds are `blob`, `document` and `kv`. Item fields include `name`, `note`, `access`, `keyPattern`, `contentType`, `ttl` and `shape` (a JSON string). IDs are stable letters/numbers/hyphens/underscores. Storage node IDs are `storage:<unit-id>`; ports are item IDs or `<item-id>/<nested.field.path>` (arrays use `chunks[].text`). An empty port targets the whole node.

**MCP:** `read_schema` returns `model.storage` alongside SQL tables. `write_storage({id, revision, storage})` replaces only this structured storage model and preserves all surrounding DBML; use the revision from the latest read. It validates IDs, JSON shapes and connection endpoints and rejects stale writes. The existing `write_schema` and `validate_schema` also support the comment representation. DBML import/export and version history retain it; SQL export intentionally contains SQL only. Standard dbdiagram/DBML readers ignore the extension and display only SQL tables.

### Sample records and vector databases

Use the records grid icon in a storage card's header or next to a bucket, collection, keyspace or index to view sample data. The records window switches between items, previews nested JSON in hover popouts, expands complete documents and exports JSON. **Edit JSON** and **Add record** preserve JSON types; apply the records and save the diagram to persist them.

Each storage item has a `records` array of JSON objects. Document records can have any nested fields. KV records require a unique string `key` and a `value` of any JSON type. Object records require a unique string `key`; optional fields include `content_type`, non-negative integer `size_bytes`, and `metadata`. They describe sample objects, not uploaded files.

The `vector` store kind contains indexes with optional positive integer `dimensions`, `metric` (`cosine`, `dot`, `euclidean`), and a metadata `shape`. Sample vector records use unique string `id`, a numeric `vector` array and optional `metadata`. If dimensions are set, sample vector lengths must match. Vector nodes use the same connections, layouts and storage persistence as other non-SQL nodes.

MCP `read_schema` includes records and vector indexes in `model.storage`; `write_storage` validates and updates them with the current revision. Preserve existing item records when editing other properties. SQL exports remain unaffected.

### Checks, indexes and bounded relationships

Canvas attributes show a shield for SQL checks and an index marker for explicit indexes, including composite and expression indexes. Hover or keyboard-focus a row to see named constraints, recognized ranges, allowed values, character limits and CASE-based maxima, alongside the exact SQL. Unrecognized SQL stays visible without speculative translation.

Select an SQL edge, then its cardinality button to choose optional or custom endpoint bounds such as `0..1`, `1..*` or `2..5`. Native DBML `?` relationship operators remain portable. Additional numeric bounds live in a top-level `@schemadb-cardinality` JSON comment; other DBML tools ignore this metadata and SQL exports retain only the base relationship. Bounds describe the design and do not enforce counts in a database. Agents can read normalized relations and edit the DBML through `write_schema`, preserving both schemaDB metadata comments.

Composite foreign keys render as explicit ordered tuple rows at both tables, following dbdiagram.io: one edge connects the complete keys, and the hover popout lists each column pairing. Shared tuples reuse one row. Keys-only mode retains tuples; table-name mode uses headers. Routing and layout use tuple handles rather than the first member's attribute.

Relationships sharing an attribute, side and cardinality reuse a cable trunk and branch toward their destinations later. Other relationships retain separate lanes. Full obstacle routing and branch-label placement remain in the routing worker and pause during table dragging.

## Agent-controlled canvas layout

MCP `read_schema` includes `layout` and `layout_revision`. Both `arrange_diagram` and `write_layout` require the latest schema `revision` and `layout_revision`; stale writes are rejected. They change canvas positions only, preserving DBML and storage definitions. Open canvases pick up saved layout changes automatically when no local edit or drag is in progress.

- `arrange_diagram`: `left-right`, `pipeline`, `groups`, `compact`, or `snowflake`. Optional `flows: [{from, to}]` uses explicit application data direction instead of foreign-key dependencies. Node IDs are qualified table names or `storage:<unit-id>`.
- `write_layout`: partial `positions: {nodeId: {x, y}}` or `group_positions: {groupName: {x, y}}`. Group coordinates specify the group's outer top-left and translate its members together. Arrange unsaved members first. `replace: true` replaces the entire saved position map, useful for restoring a returned `previous_layout`; it cannot be combined with group moves.
- Both tools accept `dry_run: true` for a preview and return bounds and `previous_layout`. Previewing does not save.

Example request: “Arrange this diagram left to right following ingestion → document processing → publication → vector search. Read the current revisions, preview with explicit flow links, then save the layout. Preserve all DBML.” The agent must infer the intended application flow from your description; foreign keys alone do not describe it reliably. Refresh the agent's MCP connection to discover the new tools.
