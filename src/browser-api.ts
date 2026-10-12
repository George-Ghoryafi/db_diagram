import { exampleDocument } from "./example";
import { parseSchema, exportSchema, SchemaError } from "./schema";
const storageKey = "dbdiagram.schemas.v1";
type Doc = typeof exampleDocument;
async function revision(text: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function readAll(): Doc[] {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return [];
  const docs = JSON.parse(saved);
  if (
    !Array.isArray(docs) ||
    docs.some(
      (d) =>
        !d ||
        typeof d.id !== "string" ||
        typeof d.dbml !== "string" ||
        typeof d.revision !== "string" ||
        !d.layout,
    )
  )
    throw new Error(
      "Browser storage is invalid. Export your work before clearing site data.",
    );
  return docs;
}
function persist(docs: Doc[]) {
  localStorage.setItem(storageKey, JSON.stringify(docs));
}
export async function browserApi(path: string, body: any, method: string) {
  if (path === "/parse") return parseSchema(body?.dbml);
  if (path === "/export")
    return { sql: exportSchema(body?.dbml, body?.format) };
  let docs = readAll();
  if (!docs.length) {
    const hash=await revision(exampleDocument.dbml);docs=readAll();
    if(!docs.length){docs=[{...exampleDocument,revision:hash}];persist(docs);}
  }
  if (path === "/schemas" && method === "GET")
    return docs.map((d) => ({
      id: d.id,
      name: d.name,
      revision: d.revision,
      storage: "browser",
    }));
  if (path === "/schemas" && method === "POST") {
    const name = body?.name?.trim(),
      id = name?.toLowerCase().replace(/\s+/g, "-");
    if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))
      throw new SchemaError(
        "Use letters, numbers, spaces, underscores or hyphens for the diagram name.",
      );
    if (docs.some((d) => d.id === id))
      throw new SchemaError("A diagram with this name already exists.");
    parseSchema(body.dbml);
    const d: Doc = {
      id,
      name,
      dbml: body.dbml,
      revision: await revision(body.dbml),
      layout: {},
      storage: "browser",
    };
    docs=readAll();if(docs.some(d=>d.id===id))throw new SchemaError('A diagram with this name already exists.');
    docs.push(d);
    persist(docs);
    return d;
  }
  const match = path.match(/^\/schemas\/([^/]+)(\/layout)?$/);
  if (!match) throw new SchemaError("Endpoint not found.");
  const id = match[1],
    d = docs.find((d) => d.id === id);
  if (!d) throw new SchemaError("Schema not found.");
  if (method === "GET") return d;
  if (method !== "PUT") throw new SchemaError("Method not supported.");
  if (match[2]) {
    const layout = body?.layout;
    if (
      !layout ||
      typeof layout !== "object" ||
      Array.isArray(layout) ||
      Object.values(layout).some(
        (p: any) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y),
      )
    )
      throw new SchemaError("Invalid layout.");
    d.layout = layout;
  } else {
    if (d.revision !== body?.revision)
      throw new SchemaError(
        "Schema changed. Read its latest revision before saving.",
        409,
      );
    parseSchema(body.dbml);
    const hash = await revision(body.dbml);
    // Re-read after hashing so another tab cannot be overwritten by a stale save.
    docs = readAll();
    const current = docs.find((d) => d.id === id);
    if (!current || current.revision !== body.revision)
      throw new SchemaError(
        "Schema changed in another tab. Reload before saving.",
        409,
      );
    current.dbml = body.dbml;
    current.revision = hash;
    persist(docs);
    return current;
  }
  persist(docs);
  return d;
}
