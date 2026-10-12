import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SchemaStore } from "../server/storage";
import { createHostedApp } from "../server/hosted";

test("hosted API and remote MCP protect and share the same schema store", async () => {
  const directory = mkdtempSync(join(tmpdir(), "hosted-diagram-"));
  const store = new SchemaStore(directory);
  const key = "test-workspace-key-which-is-long-enough";
  const server = createHostedApp(() => store, key).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const client = new Client({ name: "hosted-test", version: "1" });
  const headers = { Authorization: "Bearer " + key };
  try {
    assert.equal((await fetch(url + "/api/schemas")).status, 401);
    assert.equal(
      (await fetch(url + "/api/schemas", { headers: { Authorization: key } }))
        .status,
      401,
    );
    assert.equal(
      (
        await fetch(url + "/api/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(url + "/api/schemas", {
          headers: { ...headers, Origin: "https://attacker.example" },
        })
      ).status,
      403,
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url + "/api/mcp"), {
        requestInit: { headers },
      }),
    );
    assert.equal((await client.listTools()).tools.length, 5);
    const dbml = "Table remote_test { id integer [pk] }";
    assert.ok(
      !(
        await client.callTool({
          name: "write_schema",
          arguments: { id: "remote-test", dbml },
        })
      ).isError,
    );
    const read = await client.callTool({
      name: "read_schema",
      arguments: { id: "remote-test" },
    });
    const document = JSON.parse((read.content as { text: string }[])[0].text);
    assert.equal(document.dbml, dbml);
    assert.equal(
      (
        await (
          await fetch(url + "/api/schemas/remote-test", { headers })
        ).json()
      ).revision,
      document.revision,
    );
    const conflict = await client.callTool({
      name: "write_schema",
      arguments: { id: "remote-test", dbml, revision: "stale" },
    });
    assert.equal(conflict.isError, true);
    const invalid = await client.callTool({
      name: "write_schema",
      arguments: { id: "bad", dbml: "Table broken {" },
    });
    assert.equal(invalid.isError, true);
    assert.deepEqual(
      store.list().map((d) => d.id),
      ["remote-test"],
    );
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    rmSync(directory, { recursive: true, force: true });
  }
});
