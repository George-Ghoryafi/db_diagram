import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SchemaStore } from './storage.js';
import { errorMessage, exportSchema, parseSchema } from './schema.js';

const store = new SchemaStore();
const server = new McpServer({name: 'local-dbdiagram', version: '1.0.0'});
function result(value: unknown) { return {content: [{type: 'text' as const, text: JSON.stringify(value, null, 2)}]}; }
async function run(action: () => unknown) {
  try { return result(await action()); }
  catch (error) { return {isError: true, content: [{type: 'text' as const, text: errorMessage(error)}]}; }
}
server.registerTool('list_schemas', {description: 'List local DBML schema IDs and current revisions.', inputSchema: {}}, () => run(() => store.list()));
server.registerTool('read_schema', {description: 'Read DBML, revision, saved layout, and normalized tables, relationships, indexes and groups.', inputSchema: {id: z.string()}}, ({id}) => run(() => { const schema = store.read(id); return {...schema, model: parseSchema(schema.dbml)}; }));
server.registerTool('write_schema', {description: 'Create or update a local schema. When updating, provide the revision returned by read_schema to prevent overwriting newer edits. DBML is validated before atomic save; previous versions are backed up.', inputSchema: {id: z.string(), dbml: z.string(), revision: z.string().optional()}}, ({id, dbml, revision}) => run(() => store.write(id, dbml, revision)));
server.registerTool('validate_schema', {description: 'Validate DBML and return its normalized visualization model without saving.', inputSchema: {dbml: z.string()}}, ({dbml}) => run(() => parseSchema(dbml)));
server.registerTool('export_schema', {description: 'Export a stored schema as PostgreSQL, MySQL, SQL Server SQL, or original portable DBML.', inputSchema: {id: z.string(), format: z.enum(['postgres', 'mysql', 'mssql', 'dbml'])}}, ({id, format}) => run(() => ({format, content: exportSchema(store.read(id).dbml, format)})));
await store.seed();
await server.connect(new StdioServerTransport());
