import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SchemaStore } from "../server/storage";
import { createSchemaMcp } from "../server/mcp-server";

test("MCP client discovers tools, creates and reads a schema, rejects stale writes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "diagram-mcp-"));
  const store = new SchemaStore(directory);
  const server = createSchemaMcp(store);
  const client = new Client({ name: "mcp-test", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    assert.equal((await client.listTools()).tools.length, 8);
    const dbml = "Table mcp_test { id integer [pk] }";
    const created = await client.callTool({
      name: "write_schema",
      arguments: { id: "mcp-test", dbml },
    });
    assert.ok(!created.isError);
    const read = await client.callTool({
      name: "read_schema",
      arguments: { id: "mcp-test" },
    });
    const result = JSON.parse((read.content as { text: string }[])[0].text);
    assert.equal(result.dbml, dbml);
    assert.equal(result.model.tables[0].name, "mcp_test");
    const rejected = await client.callTool({
      name: "write_schema",
      arguments: { id: "mcp-test", dbml: dbml + "\n", revision: "stale" },
    });
    assert.equal(rejected.isError, true);
    assert.equal(store.read("mcp-test").dbml, dbml);
  } finally {
    await client.close();
    await server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
