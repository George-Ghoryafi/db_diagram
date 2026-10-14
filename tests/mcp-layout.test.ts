import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SchemaStore, layoutRevision } from '../server/storage';
import { createSchemaMcp } from '../server/mcp-server';
const dbml=`Table ingest {\n id int [pk]\n}\nTable documents {\n id int [pk]\n}\nRef: ingest.id > documents.id\nTableGroup Input {\n ingest\n documents\n}\n/* @schemadb-storage\n{"version":1,"units":[{"id":"search","kind":"vector","name":"Search","items":[{"id":"chunks","name":"chunks","dimensions":3}]}],"links":[]}\n*/`;
const value=(result:any)=>{assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);};
test('MCP arranges semantic data flow, previews, positions groups, preserves DBML and rejects stale layouts',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'layout-mcp-')),store=new SchemaStore(directory),server=createSchemaMcp(store),client=new Client({name:'layout-test',version:'1'});
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(serverTransport);await client.connect(clientTransport);
  await store.write('flow',dbml);
  const read=()=>client.callTool({name:'read_schema',arguments:{id:'flow'}}).then(value);
  const original=await read(),args={id:'flow',revision:original.revision,layout_revision:original.layout_revision,mode:'left-right',flows:[{from:'public.ingest',to:'public.documents'},{from:'public.documents',to:'storage:search'}]};
  const preview=value(await client.callTool({name:'arrange_diagram',arguments:{...args,dry_run:true}}));
  assert.ok(preview.layout['public.ingest'].x<preview.layout['public.documents'].x);
  assert.ok(preview.layout['public.documents'].x<preview.layout['storage:search'].x);
  assert.deepEqual(store.read('flow').layout,{});
  const arranged=value(await client.callTool({name:'arrange_diagram',arguments:args}));
  assert.equal(store.read('flow').dbml,dbml);assert.equal(arranged.revision,original.revision);
  assert.notEqual(arranged.layout_revision,original.layout_revision);
  assert.equal((await client.callTool({name:'write_layout',arguments:{id:'flow',revision:original.revision,layout_revision:original.layout_revision,positions:{'public.ingest':{x:0,y:0}}}})).isError,true);
  const before=await read();
  const moved=value(await client.callTool({name:'write_layout',arguments:{id:'flow',revision:before.revision,layout_revision:before.layout_revision,group_positions:{Input:{x:1200,y:350}}}}));
  const a=before.layout['public.ingest'],b=before.layout['public.documents'],c=moved.layout['public.ingest'],d=moved.layout['public.documents'];
  assert.equal(d.x-c.x,b.x-a.x);assert.equal(d.y-c.y,b.y-a.y);
  assert.equal(Math.min(c.x,d.x)-22,1200);assert.equal(Math.min(c.y,d.y)-38,350);
  assert.deepEqual(moved.layout['storage:search'],before.layout['storage:search']);
  const latest=await read();
  const partial=value(await client.callTool({name:'write_layout',arguments:{id:'flow',revision:latest.revision,layout_revision:latest.layout_revision,positions:{'storage:search':{x:2000,y:100}}}}));
  assert.deepEqual(partial.layout['public.ingest'],c);
  assert.equal((await client.callTool({name:'write_layout',arguments:{id:'flow',revision:latest.revision,layout_revision:partial.layout_revision,positions:{unknown:{x:1,y:2}}}})).isError,true);
  assert.equal((await client.callTool({name:'arrange_diagram',arguments:{...args,layout_revision:partial.layout_revision,flows:[{from:'missing',to:'public.documents'}]}})).isError,true);
  const restored=value(await client.callTool({name:'write_layout',arguments:{id:'flow',revision:latest.revision,layout_revision:partial.layout_revision,positions:arranged.previous_layout,replace:true}}));
  assert.deepEqual(restored.layout,arranged.previous_layout);
  assert.equal(store.read('flow').dbml,dbml);
 }finally{await client.close();await server.close();rmSync(directory,{recursive:true,force:true});}
});
test('layout revisions are canonical and local CAS prevents concurrent overwrites',async()=>{
 assert.equal(layoutRevision({a:{x:1,y:2},b:{x:3,y:4}}),layoutRevision({b:{x:3,y:4},a:{x:1,y:2}}));
 const directory=mkdtempSync(join(tmpdir(),'layout-cas-')),store=new SchemaStore(directory);
 try{
  const original=await store.write('flow',dbml),expected={revision:original.revision,layout_revision:original.layout_revision};
  const results=await Promise.allSettled([store.saveLayout('flow',{'public.ingest':{x:1,y:2}},expected),store.saveLayout('flow',{'public.ingest':{x:3,y:4}},expected)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.deepEqual(Object.keys(store.readLayout('flow')).sort(),['layout','layout_revision']);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
