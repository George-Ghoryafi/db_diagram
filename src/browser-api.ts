import { defaultBundle, bundleDetails, type Bundle } from "./bundles";
import { exampleDocument } from "./example";
import { parseSchema, exportSchema, SchemaError } from "./schema";
const storageKey = "dbdiagram.schemas.v1";
type Doc = typeof exampleDocument & { bundle_id?: string };
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
        typeof d.name !== "string" ||
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
function bundles(): Bundle[] {
  const value = localStorage.getItem("dbdiagram.bundles.v1");
  return value ? JSON.parse(value) : [defaultBundle];
}
export async function browserApi(path: string, body: any, method: string) {
  if (path === "/bundles" && method === "GET") return bundles();
  if (path === "/bundles" && method === "POST") {
    const details = bundleDetails(body?.name, body?.color);
    const bundle = { id: crypto.randomUUID(), ...details };
    localStorage.setItem(
      "dbdiagram.bundles.v1",
      JSON.stringify([...bundles(), bundle]),
    );
    return bundle;
  }
  if (path === "/parse") return parseSchema(body?.dbml);
  if (path === "/export")
    return { sql: exportSchema(body?.dbml, body?.format) };
  let docs = readAll();
  if (!docs.length) {
    const hash = await revision(exampleDocument.dbml);
    docs = readAll();
    if (!docs.length) {
      docs = [{ ...exampleDocument, revision: hash }];
      persist(docs);
    }
  }
  if (path === "/schemas" && method === "GET")
    return docs.map((d) => ({
      id: d.id,
      name: d.name,
      revision: d.revision,
      bundle_id: d.bundle_id || defaultBundle.id,
      storage: "browser",
    }));
  if (path === "/schemas" && method === "POST") {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120)
      throw new SchemaError("Diagram names must contain 1–120 characters.");
    const stem =
      name
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "diagram";
    const id = stem + "-" + crypto.randomUUID().slice(0, 8);
    const bundle_id = body.bundle_id || defaultBundle.id;
    if (!bundles().some((b) => b.id === bundle_id))
      throw new SchemaError("Bundle not found.");
    parseSchema(body.dbml);
    const d: Doc = {
      id,
      name,
      dbml: body.dbml,
      revision: await revision(body.dbml),
      layout: {},
      storage: "browser",
      bundle_id,
    };
    docs = readAll();
    if (docs.some((d) => d.id === id))
      throw new SchemaError("A diagram with this name already exists.");
    docs.push(d);
    persist(docs);
    return d;
  }
  const match = path.match(/^\/schemas\/([^/]+)(\/layout|\/bundle)?$/);
  if (!match) throw new SchemaError("Endpoint not found.");
  const id = match[1],
    d = docs.find((d) => d.id === id);
  if (!d) throw new SchemaError("Schema not found.");
  if (method === "GET")
    return { ...d, bundle_id: d.bundle_id || defaultBundle.id };
  if (method !== "PUT") throw new SchemaError("Method not supported.");
  if (match[2] === "/bundle") {
    if (!bundles().some((b) => b.id === body?.bundle_id))
      throw new SchemaError("Bundle not found.");
    d.bundle_id = body.bundle_id;
  } else if (match[2]) {
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
