# Local schema workspace

React/TypeScript frontend and loopback Node backend. `schemas/*.dbml` are authoritative, using the official DBML v2 syntax from dbdiagram. Use local-diagram MCP tools when available; read current revision before writing. Preserve unrelated tables, references, indexes, and groups. Validate changes with `validate_schema` or `npm test`; `npm run build` checks TypeScript and builds the UI.

Direct file edits appear in the browser within two seconds. Write atomically. Do not edit `.layout.json` unless layout changes are requested. Previous API/MCP saves are retained in `schemas/.backups`. Do not upload schemas or add cloud/collaboration features.
