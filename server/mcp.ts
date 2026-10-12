import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SchemaStore } from "./storage.js";
import { createSchemaMcp } from "./mcp-server.js";

const store = new SchemaStore();
await store.seed();
await createSchemaMcp(store).connect(new StdioServerTransport());
