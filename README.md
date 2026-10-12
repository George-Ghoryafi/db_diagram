# Local DB Diagram

A local React + TypeScript schema workspace, based on dbdiagram's editor/canvas layout. Node/Express backend, official `@dbml/core` DBML v2 parser, CodeMirror editor, React Flow canvas. No cloud services, account, or collaboration.

## Run

Node 24.16+ recommended.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. For production locally: `npm run build && npm start`, then http://127.0.0.1:4318. Both servers bind only to loopback. `npm test` runs parser, edit insertion, storage, and HTTP safety tests.

## Schemas

`schemas/*.dbml` are the source of truth. Import/export the same DBML used by dbdiagram.io. The editor previews changes live; Save or Cmd/Ctrl+S writes to disk. Valid updates retain previous versions under `schemas/.backups`. Invalid DBML remains in the editor and cannot replace a saved schema. Revert reloads the current disk version. The app polls disk every two seconds and refuses to overwrite conflicting agent edits. Export unsaved changes as DBML before reverting a conflict.

Use the Indexes tab or select a table to create single/composite and unique indexes. Use Groups to organize tables and choose their colors. Drag tables, zoom/pan, fit the canvas, and use the minimap. Coordinates are kept separately in `.layout.json`; they are not embedded in DBML exports. Auto arrange is a simple grid. Layout saves use last writer wins. SQL export supports PostgreSQL, MySQL and SQL Server. SQL import isn't implemented; import DBML.

Complex constructs (expression indexes, partials, enums, notes, checks, quoted identifiers, cross-schema/composite relationships) can be authored in DBML with the official parser. Composite relationships draw a single edge anchored to the first column; all columns remain intact in DBML/SQL and the MCP model. Group outlines follow their member tables, but are not draggable as a unit. Tables/columns/relationships are created and edited in DBML, rather than via separate form builders. The index form may not locate complex quoted schema/table identifiers: use DBML in that case.

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
