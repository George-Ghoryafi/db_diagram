import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SchemaStore } from "../server/storage";
import { createHostedApp } from "../server/hosted";

test("hosted API and remote MCP publicly share the same schema store", async () => {
  const directory = mkdtempSync(join(tmpdir(), "hosted-diagram-"));
  const store = new SchemaStore(directory);
  const server = createHostedApp(() => store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const client = new Client({ name: "hosted-test", version: "1" });
  const headers = {};
  try {
    assert.equal((await fetch(url + "/api/schemas")).status, 200);
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
    assert.equal((await client.listTools()).tools.length, 11);
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
    const arranged = await client.callTool({name:'arrange_diagram',arguments:{id:'remote-test',revision:document.revision,layout_revision:document.layout_revision,mode:'compact'}});
    assert.ok(!arranged.isError,JSON.stringify(arranged));
    const layoutState = await (await fetch(url+'/api/schemas/remote-test/layout')).json();
    assert.ok(layoutState.layout['public.remote_test']);
    assert.ok(layoutState.layout_revision);
    assert.equal(layoutState.dbml,undefined);
    assert.equal((await fetch(url+"/api/schemas/remote-test/layout",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({layout:{},layout_revision:document.layout_revision,revision:document.revision})})).status,409);
    assert.deepEqual(store.read("remote-test").layout,layoutState.layout);

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
    const storage = { version: 1, units: [{ id: 'files', kind: 'blob', name: 'Original files', items: [{ id: 'originals', name: 'original-documents', access: 'private' }] }], links: [{ id: 'objects', from: { node: 'public.remote_test', port: 'id' }, to: { node: 'storage:files', port: 'originals' }, label: 'locates object' }] };
    const stored = await client.callTool({ name: 'write_storage', arguments: { id: 'remote-test', revision: document.revision, storage } });
    assert.ok(!stored.isError, JSON.stringify(stored));
    const mixedRead = await client.callTool({ name: 'read_schema', arguments: { id: 'remote-test' } });
    const mixedDocument = JSON.parse((mixedRead.content as { text: string }[])[0].text);
    assert.equal(mixedDocument.model.storage.units[0].kind, 'blob');
    assert.equal(mixedDocument.model.storage.links[0].to.port, 'originals');
    const vectorStorage = { ...mixedDocument.model.storage, units: [...mixedDocument.model.storage.units, { id: 'vectors', kind: 'vector', name: 'Semantic search', items: [{ id: 'chunks', name: 'document_chunks', dimensions: 3, metric: 'cosine', records: [{ id: 'chunk-1', vector: [0.1, 0, -0.2], metadata: { approved: false, score: 0, optional: null } }] }] }] };
    const vectorSave = await client.callTool({ name: 'write_storage', arguments: { id: 'remote-test', revision: mixedDocument.revision, storage: vectorStorage } });
    assert.ok(!vectorSave.isError, JSON.stringify(vectorSave));
    const vectorRead = JSON.parse(((await client.callTool({ name: 'read_schema', arguments: { id: 'remote-test' } })).content as { text: string }[])[0].text);
    assert.deepEqual(vectorRead.model.storage.units[1].items[0].records[0].metadata, { approved: false, score: 0, optional: null });
    assert.ok(mixedDocument.dbml.startsWith(dbml));
    assert.equal((await client.callTool({ name: 'write_storage', arguments: { id: 'remote-test', revision: document.revision, storage } })).isError, true);
    assert.equal((await client.callTool({ name: 'write_storage', arguments: { id: 'remote-test', revision: vectorRead.revision, storage: { ...storage, links: [{ ...storage.links[0], from: { node: 'public.remote_test', port: 'missing' } }] } } })).isError, true);
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
