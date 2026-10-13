import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { routeRelationship, routeGeometry, type TableBounds } from "./edge-routing";
import { AppearanceSettings } from "./AppearanceSettings";
import { TableRecords, type RecordData } from "./TableRecords";
import type { RecordFocus } from "./record-links";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useReactFlow,
  useViewport,
  useNodesInitialized,
  useUpdateNodeInternals,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getViewportForBounds,
  type FitViewOptions,
  type EdgeProps,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";

import {
  Database,
  ChevronDown,
  Plus,
  Download,
  Upload,
  Code2,
  Layers,
  KeyRound,
  Table2,
  Check,
  AlertCircle,
  Terminal,
  Search,
  X,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  ArrowUpRight,
  Minus,
  Maximize,
  Hand,
  Grid2X2,
  StickyNote,
  Link2,
  MessageSquare,
  Route,
  Focus,
} from "lucide-react";
import { addIndex, setAttachedNote, setVisualColor, setTableRecords, findTableRange } from "./dbml-edit";
import {
  highlightedRelationships,
  foreignKeyTargets,
  visibleFields,
  matchesSearch,
  type Detail,
} from "./canvas";
import { arrangeTables, type Arrangement } from "./layout";
import { exampleDocument, exampleLayoutForCanvas } from "./example";
import { dbmlLanguage, dbmlColors } from "./dbml-language";
import { defaultBundle, bundleColors, type Bundle } from "./bundles";
import { SchemaTooltip } from "./SchemaTooltip";
import { DiagramPicker } from "./DiagramPicker";
import exampleModel from "./example-model.json";

type Field = {
  name: string;
  type: string;
  pk?: boolean;
  unique?: boolean;
  not_null?: boolean;
  note?: string;
};
type Table = {
  records?: RecordData | null;
  id: string;
  name: string;
  schema: string;
  fields: Field[];
  indexes: any[];
  color?: string;
  note?: string;
};
type Note = { id: string; name: string; content: string };
type Model = {
  notes: Note[];
  tables: Table[];
  refs: {
    id: string;
    fromTable: string;
    fromFields: string[];
    toTable: string;
    toFields: string[];
    relation: string;
    name?: string;
    color?: string;
  }[];
  groups: { name: string; color?: string; tables: string[]; note?: string }[];
};
type Doc = {
  id: string;
  name: string;
  dbml: string;
  revision: string;
  layout: Record<string, { x: number; y: number }>;
  storage?: "browser" | "cloud";
  bundle_id?: string;
};
let browserMode = false;
async function api(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  if (browserMode)
    return (await import("./browser-api")).browserApi(path, body, method);
  const r = await fetch("/api" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (
    path === "/schemas" &&
    method === "GET" &&
    (r.status === 404 ||
      (r.ok && r.headers.get("content-type")?.includes("text/html")))
  ) {
    browserMode = true;
    return (await import("./browser-api")).browserApi(path, body, method);
  }
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "The schema API is unavailable. Export your edits as DBML.",
    );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const palette = ["#326d94", "#537bad", "#6d66a3", "#3c877c", "#bc8951"];
function TableNode({ id, data, selected }: NodeProps) {
  const t = data.table as Table;
  const updateInternals = useUpdateNodeInternals();
  useEffect(() => updateInternals(id), [id, data.detail, t.fields]);
  const primaryKeys=new Set([...t.fields.filter(f=>f.pk).map(f=>f.name),...t.indexes.filter(i=>i.pk).flatMap(i=>i.columns.filter((c:any)=>c.type==="column").map((c:any)=>c.value))]);
  const foreignKeys=(data.foreignKeys || {}) as Record<string,string[]>;
  return <div className={"table-node "+(selected?"selected":"")}>
    <div className="table-title" style={{background:t.color || "#326d94"}}>
      <b>{t.schema==="public"?"":t.schema+"."}{t.name}</b>
      {t.note&&<SchemaTooltip heading={<><Table2 size={14}/><b>{t.name}</b><span>Table</span></>} content={<><strong>Note</strong><p>{t.note}</p></>}><span className="note-indicator" aria-label={"Note on "+t.name}><MessageSquare size={13}/></span></SchemaTooltip>}
      {selected && <div className="table-access-icons nodrag nopan">
        <button type="button" aria-label="Table records" title="Table records" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); (data.openRecords as () => void)(); }}><Grid2X2 size={14}/></button>
        <AppearanceSettings label="Table header color" color={t.color || '#326d94'} onApply={data.applyColor as (color: string) => Promise<void>} />
      </div>}
      {data.detail==="names"&&<><Handle type="target" position={Position.Left} id="header-in"/><Handle type="source" position={Position.Right} id="header-out"/></>}
    </div>
    {visibleFields(t.fields,(data.detail as Detail)||"all",(data.keys as string[])||[]).map(f=>{
      const pk=primaryKeys.has(f.name),targets=foreignKeys[f.name] || [];
      const info=<><div className="attribute-constraints">{pk&&<span>Primary key</span>}{targets.length>0&&<span>Foreign key</span>}{f.not_null?<span>Not null</span>:!pk&&<span>Nullable</span>}{f.unique&&!pk&&<span>Unique</span>}</div>{targets.length>0&&<><strong>References</strong>{targets.map(target=><code key={target}>{target}</code>)}</>}{f.note&&<><strong>Note</strong><p>{f.note}</p></>}</>;
      return <SchemaTooltip key={f.name} heading={<><Table2 size={14}/><b>{f.name}</b><code>{f.type}</code></>} content={info}>
        <div className={"field "+(pk?"primary-field ":"")+(((data.highlightFields as string[])||[]).includes(f.name)?"field-highlight":"")}>
          <Handle type="target" position={Position.Left} id={f.name+"-in"}/>
          <span className="field-name">{f.name}</span>
          {pk&&<span className="attribute-icon" title="Primary key" aria-label="Primary key"><KeyRound size={12}/></span>}
          {targets.length>0&&<span className="attribute-icon" title={"Foreign key: "+targets.join(", ")} aria-label="Foreign key"><Link2 size={12}/></span>}
          {f.note&&<span className="attribute-icon note-indicator" aria-label={"Note on "+f.name}><MessageSquare size={12}/></span>}
          <span className="field-type">{f.type}</span>{f.not_null&&<span className="not-null-tag" aria-label="Not null">NN</span>}
          <Handle type="source" position={Position.Right} id={f.name+"-out"}/>
        </div>
      </SchemaTooltip>;
    })}
    {data.detail!=="names"&&t.indexes.length>0&&<div className="index-row"><KeyRound size={11}/>{t.indexes.length} {t.indexes.length===1?"index":"indexes"}</div>}
  </div>;
}
function GroupNode({ data }: NodeProps) {
  return (
    <div
      className="group-node"
      style={{
        borderColor: String(data.color),
        background: String(data.color) + "08",
      }}
    >
      <span style={{ color: String(data.color) }}>
        <Layers size={12} />
        {String(data.name)}
      </span>
    </div>
  );
}
const nodeTypes = { table: TableNode, group: GroupNode };
function RelationshipEdge(props: EdgeProps) {
  const [path, labelX, labelY] = useMemo(() => {
    const points = routeRelationship(
      { x: props.sourceX, y: props.sourceY },
      { x: props.targetX, y: props.targetY },
      (props.data?.obstacles || []) as TableBounds[],
    );
    if (!points) return getSmoothStepPath(props);
    const geometry = routeGeometry(points);
    return [geometry.path, geometry.label.x, geometry.label.y] as const;
  }, [props.sourceX, props.sourceY, props.targetX, props.targetY, props.data?.obstacles]);
  const parts = String(props.data?.relation || "").split(":");
  const highlighted = props.selected || !!props.data?.highlighted;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={props.style}
        interactionWidth={24}
      />
      {[
        { x: props.sourceX, y: props.sourceY, direction: 1, cardinality: parts[0] },
        { x: props.targetX, y: props.targetY, direction: -1, cardinality: parts[1] },
      ].map(({ x, y, direction, cardinality }, index) => (
        <path
          key={index}
          className="edge-cardinality"
          aria-label={cardinality === "*" ? "Many" : "One"}
          d={cardinality === "*"
            ? `M ${x + direction * 2} ${y - 6} L ${x + direction * 15} ${y} L ${x + direction * 2} ${y + 6} M ${x + direction * 2} ${y} L ${x + direction * 15} ${y}`
            : `M ${x + direction * 8} ${y - 6} L ${x + direction * 8} ${y + 6}`}
          fill="none"
          stroke={String(props.style?.stroke || (highlighted ? "#3273dc" : "#748699"))}
          strokeWidth={1.5}
          pointerEvents="none"
        />
      ))}
      <EdgeLabelRenderer>
        {!!props.data?.explicitSelected && <div className="edge-access-icons nodrag nopan" style={{transform:`translate(-50%,-100%) translate(${(props.data?.accessPoint as {x:number;y:number} | undefined)?.x ?? labelX}px,${((props.data?.accessPoint as {x:number;y:number} | undefined)?.y ?? labelY)-12}px)`}}>
          <AppearanceSettings label="Relationship color" color={String(props.data?.color || '#93a2b3')} onApply={props.data?.applyColor as (color: string) => Promise<void>} />
        </div>}
        {(!!props.data?.explicitSelected || !!props.data?.showLabel) && (
          <span
            className="edge-name nodrag nopan"
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {String(props.data?.label)}
          </span>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
const edgeTypes = { relationship: RelationshipEdge };
const initialExampleLayout = exampleLayoutForCanvas(
  window.innerWidth - Math.max(280, Math.min(400, window.innerWidth * 0.3)),
  window.innerHeight - 80,
);
const exampleNodes: Node[] = [
  ...exampleModel.tables.map((table) => ({
    id: table.id,
    type: "table",
    initialWidth: 260,
    initialHeight:
      33 + table.fields.length * 30 + (table.indexes.length ? 25 : 0),
    position: initialExampleLayout[table.id],
    data: { table },
    zIndex: 1,
  })),
];
function Workspace() {
  const [docs, setDocs] = useState<Doc[]>([exampleDocument]),
    [doc, setDoc] = useState<Doc | null>(exampleDocument),
    [code, setCode] = useState(exampleDocument.dbml),
    [model, setModel] = useState<Model>(exampleModel);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(exampleNodes),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Loading…"),
    [tab, setTab] = useState("DBML"),
    [modal, setModal] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [editorVisible, setEditorVisible] = useState(true),
    [exportFormat, setExportFormat] = useState("dbml");
  const [name, setName] = useState(""),
    [tableId, setTableId] = useState(""),
    [columns, setColumns] = useState<string[]>([]),
    [unique, setUnique] = useState(false),
    [groupColor, setGroupColor] = useState("#537bad");
  const [arrangement, setArrangement] = useState<Arrangement>("left-right");
  const [selectedEdge, setSelectedEdge] = useState("");
  const [edgeAccessPoint, setEdgeAccessPoint] = useState<{x:number;y:number}>();
  const [recordFocus, setRecordFocus] = useState<RecordFocus>();
  const [recordHistory, setRecordHistory] = useState<{tableId: string; focus?: RecordFocus}[]>([]);
  const [panMode, setPanMode] = useState(false),
    [highlight, setHighlight] = useState(false),
    [snap, setSnap] = useState(false),
    [detail, setDetail] = useState<Detail>("all"),
    [canvasSearch, setCanvasSearch] = useState(""),
    [noteText, setNoteText] = useState(""),
    [noteField, setNoteField] = useState("");
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const selectionReady = useRef(false);
  const [previousSelection] = useState<{ id?: string; bundle?: string }>(() => {
    try {
      return JSON.parse(localStorage.getItem("dbdiagram.selection.v1") || "{}");
    } catch {
      return {};
    }
  });
  const [bundles, setBundles] = useState<Bundle[]>([defaultBundle]);
  const [activeBundle, setActiveBundle] = useState(defaultBundle.id);
  const [bundleColor, setBundleColor] = useState(bundleColors[0]);
  const [moveBundle, setMoveBundle] = useState(defaultBundle.id);
  useEffect(() => {
    void fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) =>
        setCloudAvailable(data?.storage === "cloud" && data.configured),
      )
      .catch(() => {});
  }, []);
  useEffect(() => {
    const bundle =
      bundles.find((b) => b.id === activeBundle)?.name || "Shared diagrams";
    document.title = doc?.name
      ? doc.name + " · " + bundle + " — schemaDB"
      : bundle + " — schemaDB";
  }, [doc?.name, activeBundle, bundles]);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const viewport = useViewport();
  const nodesInitialized = useNodesInitialized();
  const saved = useRef(exampleDocument.dbml),
    latestCode = useRef(exampleDocument.dbml),
    saving = useRef(false),
    dirty = useRef(false),
    parseSeq = useRef(0),
    fitPending = useRef(true),
    layoutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    file = useRef<HTMLInputElement>(null),
    flow = useReactFlow();
  useEffect(() => {
    if (!modal) return;
    const dialog = document.querySelector<HTMLElement>('.modal[role="dialog"]');
    const focusFrame=requestAnimationFrame(()=>{(dialog?.querySelector<HTMLElement>("input:not([disabled]),textarea,select") || dialog?.querySelector<HTMLElement>("button:not([disabled])"))?.focus();});
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal("");
      if (e.key === "Tab" && dialog) {
        const items = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button,input,textarea,select,a[href],[tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("disabled"));
        const first = items[0],
          last = items.at(-1);
        if (dialog.contains(document.activeElement) && !items.includes(document.activeElement as HTMLElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handle);
    return () => {cancelAnimationFrame(focusFrame);window.removeEventListener("keydown", handle);};
  }, [modal, modal === 'records' ? tableId : null]);
  const fitDiagram = (options: FitViewOptions = {}) => {
    const canvas = canvasRef.current;
    if (!canvas) return Promise.resolve(false);
    const bounds = flow.getNodesBounds(
      options.nodes?.map((node) => node.id) ?? flow.getNodes(),
    );
    const next = getViewportForBounds(
      bounds,
      canvas.clientWidth,
      canvas.clientHeight,
      0.15,
      options.maxZoom ?? 2,
      options.padding ?? 0.12,
    );
    return flow.setViewport(next, { duration: options.duration });
  };
  const fitInitialDiagram = () => {
    if (!fitPending.current) return;
    fitPending.current = false;
    void fitDiagram({ padding: 0.12, maxZoom: 1 }).then(() => {
      const canvas = canvasRef.current;
      if (canvas && canvas.clientHeight > canvas.clientWidth * 1.2) {
        const bounds = flow.getNodesBounds(flow.getNodes());
        const current = flow.getViewport();
        void flow.setViewport({ ...current, y: 104 - bounds.y * current.zoom });
      }
    });
  };
  useEffect(() => {
    if (nodesInitialized) fitInitialDiagram();
  }, [nodesInitialized, doc?.id, doc?.revision]);
  const refresh = async () => {
    const [documents, groups] = await Promise.all([
      api("/schemas"),
      api("/bundles"),
    ]);
    setDocs(documents);
    setBundles(groups);
  };
  const load = async (id: string) => {
    if (dirty.current) {
      setError("Save or revert your edits before switching schemas.");
      return;
    }
    try {
      const d = await api("/schemas/" + id);
      const untouchedExample =
        d.id === "welcome" &&
        d.dbml === exampleDocument.dbml &&
        JSON.stringify(d.layout) === JSON.stringify(exampleDocument.layout);
      if (untouchedExample) d.layout = initialExampleLayout;
      saved.current = d.dbml;
      latestCode.current = d.dbml;
      fitPending.current = true;
      if (doc?.id !== d.id) {
        setModel({ notes: [], tables: [], refs: [], groups: [] });
        setNodes([]);
      }
      selectionReady.current = true;
      setDoc(d);
      setActiveBundle(d.bundle_id || defaultBundle.id);
      setCode(d.dbml);
      setStatus(
        d.storage === "cloud"
          ? "Saved to shared workspace"
          : d.storage === "browser"
            ? "Saved in this browser"
            : "Saved locally",
      );
      setError("");
      setSelected("");
      setSelectedEdge("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const chooseBundle = (id: string) => {
    if (dirty.current) {
      setError("Save or revert your edits before switching bundles.");
      return;
    }
    setActiveBundle(id);
    const first = docs.find((d) => (d.bundle_id || defaultBundle.id) === id);
    if (first) {
      void load(first.id);
      return;
    }
    setDoc(null);
    setCode("");
    setModel({ tables: [], refs: [], groups: [], notes: [] });
    setNodes([]);
    setSelected("");
    setSelectedEdge("");
    setError("");
    saved.current = "";
    latestCode.current = "";
    setStatus("Empty bundle");
  };
  const createBundle = async () => {
    if (dirty.current) {
      setError("Save or revert your edits before switching bundles.");
      return;
    }
    try {
      const bundle = await api("/bundles", { name, color: bundleColor });
      await refresh();
      setActiveBundle(bundle.id);
      setDoc(null);
      setCode("");
      setModel({ tables: [], refs: [], groups: [], notes: [] });
      setNodes([]);
      setSelected("");
      setSelectedEdge("");
      saved.current = "";
      latestCode.current = "";
      setModal("");
      setError("");
      setStatus("Bundle created");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const moveDiagram = async () => {
    if (!doc) return;
    if (dirty.current) {
      setError("Save or revert your edits before moving this diagram.");
      return;
    }
    try {
      const d = await api(
        "/schemas/" + doc.id + "/bundle",
        { bundle_id: moveBundle },
        "PUT",
      );
      setDoc(d);
      setActiveBundle(moveBundle);
      await refresh();
      setModal("");
      setStatus("Diagram moved");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void (async () => {
      const documents = await api("/schemas");
      const groups = await api("/bundles");
      setDocs(documents);
      setBundles(groups);
      const previous = previousSelection;
      const existing = documents.find((d: Doc) => d.id === previous.id);
      if (existing) {
        await load(existing.id);
        return;
      }
      const first = documents.find(
        (d: Doc) => (d.bundle_id || defaultBundle.id) === previous.bundle,
      );
      if (first) {
        await load(first.id);
        return;
      }
      if (
        previous.bundle &&
        groups.some((b: Bundle) => b.id === previous.bundle)
      ) {
        selectionReady.current = true;
        setActiveBundle(previous.bundle);
        setDoc(null);
        setCode("");
        setModel({ tables: [], refs: [], groups: [], notes: [] });
        setNodes([]);
        return;
      }
      if (documents.length) {
        await load(documents[0].id);
        return;
      }
      const d = await api("/schemas", {
        name: "Welcome",
        dbml: exampleDocument.dbml,
        bundle_id: defaultBundle.id,
      });
      await refresh();
      await load(d.id);
    })().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!selectionReady.current) return;
    try {
      localStorage.setItem(
        "dbdiagram.selection.v1",
        JSON.stringify({ id: doc?.id, bundle: activeBundle }),
      );
    } catch {}
  }, [doc?.id, activeBundle]);
  useEffect(() => {
    if (!doc) return;
    const seq = ++parseSeq.current;
    const timer = setTimeout(() => {
      api("/parse", { dbml: code })
        .then((m: Model) => {
          if (seq !== parseSeq.current) return;
          setModel(m);
          setError("");
          setNodes((old) => {
            return m.tables
              .map<Node>((t, i) => {
                const existing = old.find((n) => n.id === t.id);
                const g = m.groups.find((g) => g.tables.includes(t.id));
                return {
                  ...existing,
                  id: t.id,
                  type: "table",
                  position: existing?.position ||
                    doc.layout[t.id] || {
                      x:
                        (g
                          ? g.tables.indexOf(t.id)
                          : m.tables
                              .filter(
                                (t) =>
                                  !m.groups.some((g) =>
                                    g.tables.includes(t.id),
                                  ),
                              )
                              .findIndex((u) => u.id === t.id)) *
                          310 +
                        70,
                      y:
                        (g ? m.groups.indexOf(g) : m.groups.length) * 290 + 100,
                    },
                  data: {
                    table: {
                      ...t,
                      color:
                        t.color ||
                        g?.color ||
                        palette[m.groups.indexOf(g!) % palette.length] ||
                        palette[0],
                    },
                  },
                  selected: t.id === selected,
                  zIndex: 1,
                };
              });
          });
        })
        .catch((e) => {
          if (seq === parseSeq.current) setError(e.message);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [code, doc?.id, doc?.revision]);
  const change = useCallback((value: string) => {
    latestCode.current = value;
    setCode(value);
    dirty.current = value !== saved.current;
    setStatus(dirty.current ? "Unsaved changes" : "Saved");
  }, []);
  const save = async () => {
    if (!doc || saving.current) return;
    saving.current = true;
    try {
      const d = await api(
        "/schemas/" + doc.id,
        { dbml: code, revision: doc.revision },
        "PUT",
      );
      saved.current = code;
      dirty.current = latestCode.current !== code;
      setDoc(d);
      setStatus(
        dirty.current
          ? "Unsaved changes"
          : d.storage === "cloud"
            ? "Saved to shared workspace"
            : d.storage === "browser"
              ? "Saved in this browser"
              : "Saved locally",
      );
      setError("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setStatus("Save failed");
    } finally {
      saving.current = false;
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", handler);
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("beforeunload", unload);
    };
  }, [doc, code]);
  useEffect(() => {
    if (!doc) return;
    const t = setInterval(async () => {
      try {
        const d = await api("/schemas/" + doc.id);
        if (d.bundle_id !== doc.bundle_id || d.name !== doc.name) {
          setDoc((previous) =>
            previous
              ? { ...previous, name: d.name, bundle_id: d.bundle_id }
              : previous,
          );
          setActiveBundle(d.bundle_id || defaultBundle.id);
          void refresh();
        }
        if (d.revision !== doc.revision) {
          if (dirty.current) {
            setError(
              doc.storage === "cloud"
                ? "Schema changed in the shared workspace. Export your edits, then Revert to load it."
                : doc.storage === "browser"
                  ? "Schema changed in another tab. Export your edits, then Revert to load it."
                  : "Schema changed on disk. Export your edits, then Revert to load the agent version.",
            );
          } else {
            saved.current = d.dbml;
            latestCode.current = d.dbml;
            fitPending.current = true;
            setModel({ notes: [], tables: [], refs: [], groups: [] });
            setNodes([]);
            setDoc(d);
            setCode(d.dbml);
            setStatus(
              d.storage === "cloud"
                ? "Updated from shared storage"
                : d.storage === "browser"
                  ? "Updated from browser storage"
                  : "Updated from disk",
            );
          }
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }, 2000);
    return () => clearInterval(t);
  }, [doc?.id, doc?.revision]);
  const persistLayout = () => {
    if (!doc) return;
    clearTimeout(layoutTimer.current);
    layoutTimer.current = setTimeout(() => {
      const layout = {...doc.layout,...Object.fromEntries(
        flow
          .getNodes()
          .filter((n) => n.type === "table")
          .map((n) => [n.id, n.position]),
      )};
      api("/schemas/" + doc.id + "/layout", { layout }, "PUT").catch((e) =>
        setError(e.message),
      );
    }, 400);
  };
  const create = async (dbml?: string, filename?: string) => {
    if (dirty.current) {
      setError(
        "Save or revert your edits before creating or importing a diagram.",
      );
      return;
    }
    try {
      const d = await api("/schemas", {
        name: filename || name || "Untitled Diagram",
        bundle_id: activeBundle,
        dbml:
          dbml ||
          "// Define your database with DBML\n\nTable users {\n  id integer [pk, increment]\n  email varchar [unique, not null]\n}\n",
      });
      dirty.current = false;
      await refresh();
      await load(d.id);
      setModal("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const exportDoc = async () => {
    try {
      const d = await api("/export", { dbml: code, format: exportFormat });
      download(
        (doc?.id || "schema") + (exportFormat === "dbml" ? ".dbml" : ".sql"),
        typeof d === "string" ? d : d.content || d.sql || d.output,
      );
      setModal("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const apply = async (next: string) => {
    const previous=latestCode.current;
    try {
      await api("/parse", { dbml: next });
      if(latestCode.current!==previous)throw new Error("Schema changed while preparing this edit. Try again.");
      change(next);
      setModal("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const add = () => {
    setName("");
    setColumns([]);
    setUnique(false);
    setTableId(selected || model.tables[0]?.id || "");
    setModal(tab === "Groups" ? "group" : "index");
  };
  const addGroup = () => {
    const safe = name.replace(/[^\w]/g, "_");
    if (!safe || !columns.length) {
      setError("Choose a group name and at least one table.");
      return;
    }
    void apply(
      code +
        `\n\nTableGroup ${safe} [color: ${groupColor}] {\n${columns.map((id) => "  " + id).join("\n")}\n}\n`,
    );
  };
  const addIndexNow = () => {
    if (!columns.length) {
      setError("Choose at least one column.");
      return;
    }
    try {
      const expr =
        (columns.length === 1
          ? JSON.stringify(columns[0])
          : "(" + columns.map((c) => JSON.stringify(c)).join(", ") + ")") +
        (name || unique
          ? " [" +
            [
              unique ? "unique" : "",
              name ? `name: '${name.replace(/[^\w]/g, "_")}'` : "",
            ]
              .filter(Boolean)
              .join(", ") +
            "]"
          : "");
      void apply(addIndex(code, tableId, expr));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const addNote = async () => {
    const table=model.tables.find(t=>t.id===tableId);
    if(!table || !noteText.trim()){setError("Choose a table and enter note text.");return;}
    const previous=latestCode.current;
    try{
      const next=await setAttachedNote(previous,table.schema,table.name,noteField,noteText);
      if(latestCode.current!==previous)throw new Error("Schema changed while preparing the note. Try again.");
      await apply(next);
    }catch(e){setError((e as Error).message);}
  };
  const arrange = (mode: Arrangement = arrangement) => {
    const positions = arrangeTables(
      nodes
        .filter((n) => n.type === "table")
        .map((n) => ({
          id: n.id,
          width: 260,
          height: 33 + (n.data.table as Table).fields.length * 30 + 25,
        })),
      model.refs,
      model.groups,
      mode,
    );
    const right =
      Math.max(0, ...Object.values(positions).map((p) => p.x)) + 350;
    setNodes((ns) =>
      ns.map((n, i) => ({
        ...n,
        position: positions[n.id] || { x: right, y: 100 + i * 200 },
      })),
    );
    setTimeout(() => {
      fitDiagram({ includeHiddenNodes: true, duration: 400, padding: 0.15 });
      persistLayout();
    }, 100);
  };
  const openNote = () => {
    const table=model.tables.find(t=>t.id===selected)||model.tables[0];
    if(!table){setError("Create a table before attaching a note.");return;}
    setTableId(table.id);setNoteField("");setNoteText(table.note || "");setError("");setModal("note");
  };
  const highlightedRefs = highlightedRelationships(
    model.refs,
    highlight,
    selected,
    selectedEdge,
  );
  const displayedNodes = nodes.map((n) => {
    if (n.type !== "table") return n;
    const t = n.data.table as Table;
    const keys = [
      ...model.refs.flatMap((r) =>
        r.fromTable === t.id
          ? r.fromFields
          : r.toTable === t.id
            ? r.toFields
            : [],
      ),
      ...t.indexes
        .filter((i) => i.pk)
        .flatMap((i) =>
          i.columns
            .filter((c: any) => c.type === "column")
            .map((c: any) => c.value),
        ),
    ];
    return {
      ...n,
      selected: n.id === selected,
      data: {
        ...n.data,
        detail,
        keys,
        foreignKeys:foreignKeyTargets(model.refs,t.id),
        openRecords: () => { setTableId(t.id); setRecordFocus(undefined); setRecordHistory([]); setModal('records'); },
        applyColor: (color: string) => applyVisualColor('table', t.id, color),
        highlightFields: model.refs
          .filter((r) => highlightedRefs.has(r.id))
          .flatMap((r) => [
            ...(r.fromTable === t.id ? r.fromFields : []),
            ...(r.toTable === t.id ? r.toFields : []),
          ]),
      },
    };
  });
  const groupNodes: Node[] = model.groups.flatMap((g) => {
    const members = nodes.filter((n) => g.tables.includes(n.id));
    if (!members.length) return [];
    const x = Math.min(...members.map((n) => n.position.x)) - 22,
      y = Math.min(...members.map((n) => n.position.y)) - 38;
    const right = Math.max(...members.map((n) => n.position.x + 260)),
      bottom = Math.max(
        ...members.map(
          (n) =>
            n.position.y +
            33 +
            visibleFields(
              (n.data.table as Table).fields,
              detail,
              (displayedNodes.find((d) => d.id === n.id)?.data
                .keys as string[]) || [],
            ).length *
              27 +
            25,
        ),
      );
    return [
      {
        id: "group:" + g.name,
        type: "group",
        position: { x, y },
        data: { name: g.name, color: g.color || "#537bad" },
        initialWidth: right - x + 22,
        initialHeight: bottom - y + 22,
        width: right - x + 22,
        height: bottom - y + 22,
        style: { width: right - x + 22, height: bottom - y + 22 },
        draggable: false,
        selectable: false,
        zIndex: 0,
      },
    ];
  });
  const obstacles = displayedNodes.map(n => ({
    ...n.position,
    width: n.measured?.width || 260,
    height: n.measured?.height || (detail === "names" ? 33 : 33 + visibleFields((n.data.table as Table).fields, detail, (n.data.keys as string[]) || []).length * 30 + ((n.data.table as Table).indexes.length ? 25 : 0)),
  }));
  const edges = model.refs.map((r) => {
    const active = r.id === selectedEdge;
    const related = highlightedRefs.has(r.id);
    return {
      id: r.id,
      source: r.fromTable,
      target: r.toTable,
      sourceHandle:
        detail === "names" ? "header-out" : r.fromFields[0] + "-out",
      targetHandle: detail === "names" ? "header-in" : r.toFields[0] + "-in",
      type: "relationship",
      ariaLabel: `Relationship ${r.name || r.fromTable + " to " + r.toTable}`,
      selected: active || (!!selected && (r.fromTable===selected || r.toTable===selected)),
      animated: active || related,
      interactionWidth: 24,
      data: {
        obstacles,
        color: r.color,
        accessPoint: active ? edgeAccessPoint : undefined,
        applyColor: (color: string) => applyVisualColor('relationship', r.id, color),
        relation: r.relation,
        highlighted: related,
        explicitSelected:active,
        showLabel: related && !!r.name,
        label:
          r.name ||
          `${r.fromTable}.${r.fromFields.join(", ")} → ${r.toTable}.${r.toFields.join(", ")}`,
      },
      style: {
        stroke: r.color || (active || related ? "#3273dc" : "#93a2b3"),
        strokeWidth: active || related ? 2.5 : 1.3,
        opacity: 1,
      },
    };
  });
  const applyVisualColor = async (kind: 'table' | 'relationship', id: string, color: string) => {
    const previous = latestCode.current;
    const next = await setVisualColor(previous, kind, id, color);
    if (latestCode.current !== previous) throw new Error('The diagram changed. Reopen settings and try again.');
    change(next);
  };
  const focusSelection = (id: string) => {
    const table = model.tables.find((t) => t.id === id);
    const range = table && findTableRange(code, table.schema, table.name);
    if (range) {
      setTab("DBML");
      setEditorVisible(true);
      requestAnimationFrame(() => {
        const view = editorRef.current?.view;
        if (view) {
          view.dispatch({
            selection: { anchor: range.from, head: range.to },
            effects: EditorView.scrollIntoView(range.from, {
              y: "start",
              yMargin: 24,
            }),
          });
          view.focus();
        }
      });
    }
    setSelectedEdge("");
    setSelected(id);
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (modal || el.closest("input,textarea,select,[contenteditable=true],.appearance-settings"))
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCanvasSearch("");
        setModal("search");
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "1")
        fitDiagram({
          includeHiddenNodes: true,
          duration: 300,
          padding: 0.15,
        });
      if (e.key === "2") setModal("arrange");
      if (e.key === "3") setHighlight((v) => !v);
      if (e.key === "4") setSnap((v) => !v);
      if (e.key === "5") openNote();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal, doc?.id]);
  const focus = (id: string) => {
    setSelectedEdge("");
    setSelected(model.tables.some((t) => t.id === id) ? id : "");
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    const n = flow.getNode(id);
    if (n)
      fitDiagram({
        includeHiddenNodes: true,
        nodes: [n],
        duration: 400,
        maxZoom: 1.1,
      });
  };
  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">
            <img src="/favicon.svg" alt="" width="28" height="28" />
          </span>
          schemaDB{" "}
        </div>
        <span className="slash">/</span>
        <DiagramPicker
          bundles={bundles}
          diagrams={docs}
          bundleId={activeBundle}
          diagramId={doc?.id}
          onBundle={chooseBundle}
          onDiagram={load}
          onOpen={() => {
            void refresh().catch((e) => setError(e.message));
          }}
          onNewBundle={() => {
            setName("");
            setBundleColor(bundleColors[bundles.length % bundleColors.length]);
            setError("");
            setModal("bundle");
          }}
          onNewDiagram={() => {
            setName("");
            setError("");
            setModal("new");
          }}
          onMove={() => {
            setMoveBundle(activeBundle);
            setError("");
            setModal("move");
          }}
        />
        <button
          className="new"
          onClick={() => {
            setName("");
            setModal("new");
          }}
          title="New diagram"
        >
          <Plus size={16} />
        </button>
        <div className="header-spacer" />
        <span className="save-state">
          <span className={dirty.current ? "dot amber" : "dot"} />
          {status}
        </span>
        <button className="header-button" onClick={() => setModal("agent")}>
          <Terminal size={15} /> Agent access
        </button>
        <button className="header-button" onClick={() => file.current?.click()}>
          <Upload size={15} /> Import
        </button>
        <button
          className="header-button"
          disabled={!doc}
          onClick={() => setModal("export")}
        >
          <Download size={15} /> Export
        </button>
        <button
          className="save-button"
          disabled={!doc}
          onClick={() => void save()}
        >
          <Save size={14} /> Save
        </button>
        <input
          ref={file}
          hidden
          type="file"
          accept=".dbml"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await create(await f.text(), f.name.replace(/\.dbml$/, ""));
            e.target.value = "";
          }}
        />
      </header>
      <main>
        {editorVisible && doc && (
          <aside className="editor">
            <div className="tabs">
              {["DBML", "Tables", "Groups", "Indexes"].map((t) => (
                <button
                  className={tab === t ? "active" : ""}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t === "DBML" ? (
                    <Code2 size={14} />
                  ) : t === "Groups" ? (
                    <Layers size={14} />
                  ) : t === "Indexes" ? (
                    <KeyRound size={14} />
                  ) : (
                    <Table2 size={14} />
                  )}{" "}
                  {t}
                </button>
              ))}
              <button
                className="collapse"
                aria-label="Hide editor"
                onClick={() => setEditorVisible(false)}
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            {tab === "DBML" ? (
              <>
                <div className="editor-meta">
                  <span>{doc?.id || "SCHEMA"}.DBML</span>
                  <a
                    href="https://dbml.dbdiagram.io/docs/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    DBML syntax <ArrowUpRight size={11} />
                  </a>
                </div>
                <CodeMirror
                  ref={editorRef}
                  value={code}
                  height="100%"
                  theme="dark"
                  extensions={[dbmlLanguage, dbmlColors]}
                  onChange={change}
                  basicSetup={{
                    foldGutter: true,
                    lineNumbers: true,
                    highlightActiveLine: true,
                  }}
                  aria-label="DBML schema editor"
                />
                <div className="editor-bottom">
                  <span>DBML</span>
                  <span>UTF-8</span>
                  <span>{code.split("\n").length} lines</span>
                  <button
                    onClick={() => {
                      dirty.current = false;
                      if (doc) void load(doc.id);
                    }}
                  >
                    Revert
                  </button>
                  <span>⌘S to save</span>
                </div>
              </>
            ) : (
              <div className="explorer">
                <div className="explorer-title">
                  <h2>{tab}</h2>
                  {tab !== "Tables" && (
                    <button onClick={add}>
                      <Plus size={14} /> Add{" "}
                      {tab === "Groups" ? "group" : "index"}
                    </button>
                  )}
                </div>
                <label className="search">
                  <Search size={15} />
                  <input
                    placeholder={`Search ${tab.toLowerCase()}…`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                {tab === "Tables"
                  ? model.tables
                      .filter((t) => t.name.includes(search))
                      .map((t) => (
                        <button
                          className="explorer-card"
                          key={t.id}
                          onClick={() => focus(t.id)}
                        >
                          <Table2 size={16} />
                          <b>{t.name}</b>
                          <span>
                            {t.fields.length} columns · {t.indexes.length}{" "}
                            indexes
                          </span>
                        </button>
                      ))
                  : tab === "Groups"
                    ? model.groups
                        .filter((g) => g.name.includes(search))
                        .map((g) => (
                          <div className="group-card" key={g.name}>
                            <h3>
                              <span
                                style={{ background: g.color || "#537bad" }}
                              />
                              {g.name}
                              <small>{g.tables.length} tables</small>
                            </h3>
                            {g.tables.map((id) => (
                              <button key={id} onClick={() => focus(id)}>
                                <Table2 size={13} />
                                {id.replace(/^public\./, "")}
                              </button>
                            ))}
                          </div>
                        ))
                    : model.tables
                        .filter((t) => t.name.includes(search))
                        .map((t) => (
                          <div className="group-card" key={t.id}>
                            <h3>
                              {t.name}
                              <small>{t.indexes.length} indexes</small>
                            </h3>
                            {t.indexes.map((idx, i) => (
                              <p key={i}>
                                <KeyRound size={12} />{" "}
                                {idx.name ||
                                  idx.columns
                                    .map((c: any) => c.value)
                                    .join(", ")}{" "}
                                {idx.unique && <small>UNIQUE</small>}
                              </p>
                            ))}
                          </div>
                        ))}
                {tab === "Groups" && !model.groups.length && (
                  <p className="empty">
                    Organize related tables with your first group.
                  </p>
                )}
              </div>
            )}
          </aside>
        )}
        <section
          ref={canvasRef}
          className={"canvas " + (panMode ? "pan-mode" : "")}
        >
          {!doc && (
            <div className="empty-bundle">
              <span
                className="bundle-avatar"
                style={{
                  background: bundles.find((b) => b.id === activeBundle)?.color,
                }}
              >
                {bundles.find((b) => b.id === activeBundle)?.name.slice(0, 1)}
              </span>
              <h2>{bundles.find((b) => b.id === activeBundle)?.name}</h2>
              <p>No diagrams yet. Start your first schema in this bundle.</p>
              <button
                className="primary"
                onClick={() => {
                  setName("");
                  setModal("new");
                }}
              >
                <Plus size={16} />
                Create diagram
              </button>
            </div>
          )}
          <div className="canvas-top">
            {!editorVisible && (
              <button
                onClick={() => setEditorVisible(true)}
                aria-label="Show editor"
              >
                <PanelLeftOpen size={16} />
              </button>
            )}
            <div>
              <span>
                {model.tables.length} tables <i>·</i> {model.refs.length}{" "}
                relationships
              </span>
            </div>
            <span className="private">
              <span className="dot" />{" "}
              {doc?.storage === "cloud"
                ? "Shared workspace"
                : "Only on this device"}
            </span>
          </div>
          <ReactFlow
            onInit={fitInitialDiagram}
            nodes={[...groupNodes, ...displayedNodes]}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={(changes) => {
              for (const c of changes) {
                if (c.type === "select") {
                  if (c.selected) {
                    setSelected("");
                    setSelectedEdge(c.id);
                  } else
                    setSelectedEdge((current) =>
                      current === c.id ? "" : current,
                    );
                }
              }
            }}
            onNodeClick={(_, n) => {
              if (n.type === "table") focusSelection(n.id);
            }}
            onPaneClick={() => {
              setSelected("");
              setSelectedEdge("");
            }}
            onEdgeClick={(event, edge) => {
              setSelected("");
              setSelectedEdge(edge.id);
              setEdgeAccessPoint(flow.screenToFlowPosition({x:event.clientX,y:event.clientY}));
            }}
            onConnect={(connection) => {
              const from = model.tables.find((t) => t.id === connection.source),
                to = model.tables.find((t) => t.id === connection.target);
              const sourceField = connection.sourceHandle?.replace(/-out$/, ""),
                targetField = connection.targetHandle?.replace(/-in$/, "");
              if (
                !from ||
                !to ||
                !sourceField ||
                !targetField ||
                detail === "names"
              )
                return;
              const qualified = (t: Table, field: string) =>
                [t.schema, t.name, field]
                  .map((v) => JSON.stringify(v))
                  .join(".");
              void apply(
                code +
                  `\nRef: ${qualified(from, sourceField)} < ${qualified(to, targetField)}\n`,
              );
            }}
            deleteKeyCode={null}
            zoomOnDoubleClick={false}
            nodesDraggable={!panMode}
            panOnDrag={panMode ? [0, 1, 2] : [1, 2]}
            selectionOnDrag={!panMode}
            snapToGrid={snap}
            snapGrid={[20, 20]}
            onNodeDragStop={persistLayout}
            minZoom={0.15}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            {
              <Background
                color={snap ? "#c0cbd9" : "#d7dee7"}
                gap={20}
                size={1}
              />
            }
            <MiniMap
              nodeColor={(n) => (n.data.table as Table)?.color || "#326d94"}
              maskColor="#f6f8fac9"
            />
          </ReactFlow>
          <div
            className="zoom-tools"
            role="toolbar"
            aria-label="Canvas navigation"
          >
            <button
              title="Zoom out"
              aria-label="Zoom out"
              onClick={() => flow.zoomOut({ duration: 150 })}
            >
              <Minus size={16} />
            </button>
            <button
              title="Reset zoom to 100%"
              aria-label="Reset zoom to 100%"
              onClick={() => flow.zoomTo(1, { duration: 150 })}
            >
              {Math.round(viewport.zoom * 100)}%
            </button>
            <button
              title="Zoom in"
              aria-label="Zoom in"
              onClick={() => flow.zoomIn({ duration: 150 })}
            >
              <Plus size={16} />
            </button>
            <span className="tool-divider" />
            <button
              title="Fit diagram (1)"
              aria-label="Fit diagram"
              onClick={() =>
                fitDiagram({
                  includeHiddenNodes: true,
                  duration: 300,
                  padding: 0.15,
                })
              }
            >
              <Maximize size={17} />
            </button>
            <button
              title="Pan mode"
              aria-label="Pan mode"
              aria-pressed={panMode}
              onClick={() => setPanMode((v) => !v)}
            >
              <Hand size={17} />
            </button>
          </div>
          <div
            className="canvas-tools"
            role="toolbar"
            aria-label="Diagram controls"
          >
            <button
              title="Auto arrange (2)"
              aria-label="Auto arrange"
              onClick={() => setModal("arrange")}
            >
              <LayoutGrid size={18} />
              <small>2</small>
            </button>
            <button
              title="Highlight related tables and relationships (3)"
              aria-label="Highlight relationships"
              aria-pressed={highlight}
              onClick={() => setHighlight((v) => !v)}
            >
              <Route size={18} />
              <small>3</small>
            </button>
            <button
              title="Snap to grid (4)"
              aria-label="Snap to grid"
              aria-pressed={snap}
              onClick={() => setSnap((v) => !v)}
            >
              <Grid2X2 size={18} />
              <small>4</small>
            </button>
            <span className="tool-divider" />
            <button
              title="Attach a note to a table or attribute (5)"
              aria-label="Attach note"
              onClick={openNote}
            >
              <StickyNote size={18} />
              <small>5</small>
            </button>
            <span className="tool-divider" />
            <label className="detail-control">
              <Table2 size={17} />
              <select
                aria-label="Diagram detail level"
                value={detail}
                onChange={(e) => setDetail(e.target.value as Detail)}
              >
                <option value="all">All fields</option>
                <option value="keys">Keys only</option>
                <option value="names">Table names</option>
              </select>
            </label>
            <span className="tool-divider" />
            <button
              title="Search diagram (⌘K / Ctrl+K)"
              aria-label="Search diagram"
              onClick={() => {
                setCanvasSearch("");
                setModal("search");
              }}
            >
              <Search size={18} />
            </button>
            <button
              className="group-tool"
              title="Add table group"
              aria-label="Add table group"
              onClick={() => {
                setName("");
                setColumns([]);
                setModal("group");
              }}
            >
              <Layers size={17} />
            </button>
          </div>
        </section>
      </main>
      <footer>
        <span>
          {error ? (
            <>
              <AlertCircle size={13} />
              <span className="error">{error}</span>
            </>
          ) : (
            <>
              <Check size={13} />
              Schema is valid
            </>
          )}
        </span>
        <span>
          <Database size={12} /> PostgreSQL{" "}
          <span className="footer-divider">|</span>{" "}
          {doc?.storage === "cloud" || cloudAvailable
            ? "Public workspace"
            : doc?.storage === "browser" || browserMode
              ? "Browser workspace"
              : "Local workspace"}
        </span>
      </footer>
      {modal === 'records' && model.tables.find(t => t.id === tableId) && <TableRecords key={tableId} table={model.tables.find(t => t.id === tableId)!} refs={model.refs} focus={recordFocus} onNavigate={(id, focus) => {
        setRecordHistory(history => [...history, {tableId, focus: recordFocus}]); setTableId(id); setRecordFocus(focus);
      }} onBack={recordHistory.length ? () => {
        const previous = recordHistory.at(-1)!; setRecordHistory(recordHistory.slice(0, -1)); setTableId(previous.tableId); setRecordFocus(previous.focus);
      } : undefined} onClose={() => setModal('')} onApply={async (columns, rows) => {
        const previous = latestCode.current;
        const next = await setTableRecords(previous, tableId, columns, rows);
        if (latestCode.current !== previous) throw new Error('The diagram changed. Reopen records and try again.');
        change(next);
      }} />}
      {modal && modal !== 'records' && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal("");
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal}
          >
            <div className="modal-heading">
              <h2>
                {modal === "arrange"
                  ? "Auto arrange diagram"
                  : modal === "search"
                    ? "Search diagram"
                    : modal === "note"
                      ? "Attach a note"
                      : modal === "bundle"
                        ? "Create a bundle"
                        : modal === "move"
                          ? "Move diagram"
                          : modal === "agent"
                            ? "Your schema. Your agent."
                            : modal === "new"
                              ? "New diagram"
                              : modal === "group"
                                ? "Create table group"
                                : modal === "index"
                                  ? "Create index"
                                  : "Export schema"}
              </h2>
              <button aria-label="Close dialog" onClick={() => setModal("")}>
                <X size={18} />
              </button>
            </div>
            {modal === "arrange" ? (
              <>
                <p>
                  Choose a layout for your tables. Your schema stays unchanged.
                </p>
                <div className="arrange-options">
                  {(
                    [
                      {
                        id: "left-right",
                        name: "Left–right",
                        description:
                          "Follow foreign-key relationships from left to right.",
                      },
                      {
                        id: "pipeline",
                        name: "Pipeline",
                        description:
                          "Organize table groups as vertical stages.",
                      },
                      {
                        id: "snowflake",
                        name: "Snowflake",
                        description:
                          "Put the most connected table in the center.",
                      },
                      {
                        id: "compact",
                        name: "Compact",
                        description: "Arrange tables in a compact rectangle.",
                      },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      onClick={() => {
                        setArrangement(option.id);
                        arrange(option.id);
                        setModal("");
                      }}
                    >
                      <LayoutGrid size={18} />
                      <span>
                        <b>{option.name}</b>
                        <small>{option.description}</small>
                      </span>
                      {arrangement === option.id && <Check size={15} />}
                    </button>
                  ))}
                </div>
              </>
            ) : modal === "search" ? (
              <>
                <label>
                  Find tables, fields, relationships, groups, or notes
                  <input
                    autoFocus
                    value={canvasSearch}
                    onChange={(e) => setCanvasSearch(e.target.value)}
                    placeholder="Search your schema…"
                  />
                </label>
                <div className="canvas-search-results">
                  {model.tables
                    .flatMap((t) => [
                      { label: t.id, id: t.id, kind: "Table" },
                      ...t.fields.map((f) => ({
                        label: t.id + "." + f.name,
                        id: t.id,
                        kind: "Field",
                      })),
                    ])
                    .concat(
                      model.refs.map((r) => ({
                        label:
                          (r.name ? r.name + " — " : "") +
                          `${r.fromTable}.${r.fromFields.join(", ")} → ${r.toTable}.${r.toFields.join(", ")}`,
                        id: r.id,
                        kind: "Relationship",
                      })),

                      model.groups.map((g) => ({
                        label: g.name,
                        id: g.tables[0] || "",
                        kind: "Group",
                      })),
                    )
                    .filter((r) => matchesSearch(r.label, canvasSearch))
                    .map((r, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (r.kind === "Relationship") {
                            const ref = model.refs.find(
                              (ref) => ref.id === r.id,
                            )!;
                            setSelected("");
                            setSelectedEdge(ref.id);
                            fitDiagram({
                              includeHiddenNodes: true,
                              nodes: flow
                                .getNodes()
                                .filter(
                                  (n) =>
                                    n.id === ref.fromTable ||
                                    n.id === ref.toTable,
                                ),
                              duration: 300,
                              padding: 0.2,
                            });
                          } else focus(r.id);
                          setModal("");
                        }}
                      >
                        <Search size={13} />
                        <span>{r.label}</span>
                        <small>{r.kind}</small>
                      </button>
                    ))}
                </div>
              </>
            ) : modal === "bundle" ? (
              <>
                <label>
                  Bundle name
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={64}
                    placeholder="Personal, Alex’s projects, Work…"
                  />
                </label>
                <label>Bundle color</label>
                <div className="bundle-color-options">
                  {bundleColors.map((color) => (
                    <button
                      key={color}
                      aria-label={"Choose " + color + " bundle color"}
                      aria-pressed={color === bundleColor}
                      style={{ background: color }}
                      onClick={() => setBundleColor(color)}
                    >
                      {color === bundleColor && <Check size={18} />}
                    </button>
                  ))}
                </div>
                <p>
                  Bundles keep diagrams organized. Everyone can view and edit
                  them.
                </p>
                {error && <p className="error">{error}</p>}
                <button className="primary" onClick={() => void createBundle()}>
                  Create bundle
                </button>
              </>
            ) : modal === "move" ? (
              <>
                <p>
                  Move <b>{doc?.name}</b> into another bundle. Its schema and
                  layout stay intact.
                </p>
                <label>
                  Destination bundle
                  <select aria-label="Destination bundle"
                    value={moveBundle}
                    onChange={(e) => setMoveBundle(e.target.value)}
                  >
                    {bundles.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                {error && <p className="error">{error}</p>}
                <button className="primary" onClick={() => void moveDiagram()}>
                  Move diagram
                </button>
              </>
            ) : modal === "note" ? (
              <>
                <label>Table<select aria-label="Note table" value={tableId} onChange={e=>{setTableId(e.target.value);setNoteField("");setNoteText(model.tables.find(t=>t.id===e.target.value)?.note || "");}}>{model.tables.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label>Attach to<select aria-label="Note target" value={noteField} onChange={e=>{setNoteField(e.target.value);const table=model.tables.find(t=>t.id===tableId);setNoteText(e.target.value?table?.fields.find(f=>f.name===e.target.value)?.note || "":table?.note || "");}}><option value="">Table</option>{model.tables.find(t=>t.id===tableId)?.fields.map(f=><option key={f.name} value={f.name}>{f.name}</option>)}</select></label>
                <label>Note text<textarea autoFocus rows={5} value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Explain this table or attribute…"/></label>
                {error&&<p className="error">{error}</p>}
                <button className="primary" onClick={()=>void addNote()}>Apply note</button>
              </>
            ) : modal === "agent" && cloudAvailable ? (
              <>
                <p>
                  Diagrams are public and organized into bundles. Your agent can
                  list, create, read, edit, move, and export them.
                </p>
                <code className="path">{location.origin + "/api/mcp"}</code>
                <p>
                  Current bundle:{" "}
                  <b>{bundles.find((b) => b.id === activeBundle)?.name}</b>
                </p>
                <code className="path">{activeBundle}</code>
                <p>
                  Use list_bundles to find bundle IDs. Pass bundle_id when
                  creating a diagram, or use move_schema to organize an existing
                  diagram.
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    download(
                      "schemaDB.mcp.json",
                      JSON.stringify(
                        {
                          mcpServers: {
                            schemaDB: {
                              type: "http",
                              url: location.origin + "/api/mcp",
                            },
                          },
                        },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  Download MCP config
                </button>
              </>
            ) : modal === "agent" && doc?.storage === "browser" ? (
              <>
                <p>
                  This deployment stores schemas in this browser. Download the
                  DBML file for Codex or Claude Code to edit, then import it
                  back here.
                </p>
                <button
                  className="primary"
                  onClick={() => download((doc.id || "schema") + ".dbml", code)}
                >
                  <Download size={15} />
                  Download DBML for your agent
                </button>
                <p>
                  Shared storage and a remote MCP connection are not configured
                  on this deployment.
                </p>
              </>
            ) : modal === "agent" ? (
              <>
                <p>
                  Every diagram is a plain DBML file. Ask Codex or Claude Code
                  to edit it; changes appear here automatically.
                </p>
                <code className="path">{`/Users/george/Documents/diagram/schemas/${doc?.id || "schema"}.dbml`}</code>
                <h3>MCP tools</h3>
                <p>
                  Read, validate, update, and export schemas. Updates require
                  the revision from the last read.
                </p>
                <pre>{`{\n  "mcpServers": {\n    "local-diagram": {\n      "command": "${"/Users/george/Documents/diagram/node_modules/.bin/tsx"}",\n      "args": ["${"/Users/george/Documents/diagram/server/mcp.ts"}"],\n      "env": {"SCHEMA_DIR": "/Users/george/Documents/diagram/schemas"}\n    }\n  }\n}`}</pre>
                <button
                  className="primary"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(
                        `Edit schemas/${doc?.id}.dbml using DBML syntax. Preserve existing tables and references. Run npm test after changes.`,
                      )
                      .then(() => setStatus("Agent prompt copied"))
                      .catch(() =>
                        setError(
                          "Clipboard unavailable. Copy the file path above.",
                        ),
                      );
                  }}
                >
                  Copy agent prompt
                </button>
              </>
            ) : modal === "export" ? (
              <>
                <p>
                  Portable DBML, or SQL generated by the official DBML library.
                </p>
                <label>
                  Format
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                  >
                    <option value="dbml">DBML (.dbml)</option>
                    <option value="postgres">PostgreSQL (.sql)</option>
                    <option value="mysql">MySQL (.sql)</option>
                    <option value="mssql">SQL Server (.sql)</option>
                  </select>
                </label>
                <button className="primary" onClick={() => void exportDoc()}>
                  <Download size={15} /> Download
                </button>
              </>
            ) : (
              <>
                <label>
                  {modal === "index"
                    ? "Index name (optional)"
                    : modal === "group"
                      ? "Group name"
                      : "Diagram name"}
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      modal === "index"
                        ? "users_email_idx"
                        : modal === "group"
                          ? "identity"
                          : "Untitled Diagram"
                    }
                  />
                </label>
                {modal === "index" && (
                  <>
                    <label>
                      Table
                      <select
                        value={tableId}
                        onChange={(e) => {
                          setTableId(e.target.value);
                          setColumns([]);
                        }}
                      >
                        {model.tables.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>Columns</label>
                    <div className="checkbox-list">
                      {model.tables
                        .find((t) => t.id === tableId)
                        ?.fields.map((f) => (
                          <label key={f.name}>
                            <input
                              type="checkbox"
                              checked={columns.includes(f.name)}
                              onChange={(e) =>
                                setColumns((cs) =>
                                  e.target.checked
                                    ? [...cs, f.name]
                                    : cs.filter((c) => c !== f.name),
                                )
                              }
                            />
                            {f.name}
                            <small>{f.type}</small>
                          </label>
                        ))}
                    </div>
                    <label className="inline">
                      <input
                        type="checkbox"
                        checked={unique}
                        onChange={(e) => setUnique(e.target.checked)}
                      />{" "}
                      Unique index
                    </label>
                  </>
                )}
                {modal === "group" && (
                  <>
                    <label>
                      Color
                      <input
                        type="color"
                        value={groupColor}
                        onChange={(e) => setGroupColor(e.target.value)}
                      />
                    </label>
                    <label>Tables</label>
                    <div className="checkbox-list">
                      {model.tables.map((t) => (
                        <label key={t.id}>
                          <input
                            type="checkbox"
                            checked={columns.includes(t.id)}
                            onChange={(e) =>
                              setColumns((cs) =>
                                e.target.checked
                                  ? [...cs, t.id]
                                  : cs.filter((c) => c !== t.id),
                              )
                            }
                          />
                          {t.name}
                        </label>
                      ))}
                    </div>
                  </>
                )}
                {error && <p className="error">{error}</p>}
                <button
                  className="primary"
                  onClick={() =>
                    modal === "new"
                      ? void create()
                      : modal === "index"
                        ? addIndexNow()
                        : addGroup()
                  }
                >
                  <Plus size={15} />
                  {modal === "new"
                    ? "Create diagram"
                    : modal === "index"
                      ? "Add index"
                      : "Create group"}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
export default function App() {
  return (
    <ReactFlowProvider>
      <Workspace />
    </ReactFlowProvider>
  );
}
