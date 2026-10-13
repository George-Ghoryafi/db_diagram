import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { routeGeometry, storageLabelPosition, projectToRoute, type TableBounds, type Point as RoutePoint } from "./edge-routing";
import { useRelationshipRoutes } from "./use-relationship-routes";
import { DiagramSkeleton } from "./DiagramSkeleton";
import { AgentSetup } from "./AgentSetup";
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
  useUpdateNodeInternals,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getViewportForBounds,
  type FitViewOptions,
  type EdgeProps,
  type NodeProps,
  type Node,
  MarkerType,
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
  LoaderCircle,
  Archive,
  Pencil,
  ShieldCheck,
  SlidersHorizontal,
  ListFilter,
} from "lucide-react";
import { addIndex, setAttachedNote, setVisualColor, setRelationshipCardinality, setTableRecords, findTableRange } from "./dbml-edit";
import {
  relationshipPorts,
  relationshipSides,
  relationshipFlow,
  type RelationshipPort,
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
import { StorageRecords } from './StorageRecords';
import { StorageNode, StoragePanel, StorageEditor, StorageLinkEditor } from './StorageUI';
import { emptyStorage, readStorageModel, writeStorageModel, storageKinds, storageNodeId, storageNodeHeight, storageLinkIssue, storagePorts, type StorageModel, type StorageUnit, type StorageLink } from './storage-model';

import { compositeEndpoints, relationshipField } from "./composite-relationships";
import { CardinalityEditor } from "./CardinalityEditor";
import { isMany, parseCardinality } from "./cardinality";
import type { CheckRule } from "./checks";

type Field = {
  checks?: CheckRule[];
  indexes?: { name?: string; unique?: boolean; pk?: boolean; type?: string; columns: { type: string; value: string }[] }[];
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
  storage?: StorageModel;
  notes: Note[];
  tables: Table[];
  refs: {
    id: string;
    fromTable: string;
    fromFields: string[];
    toTable: string;
    toFields: string[];
    relation: string;
    sqlRelation?: string;
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
const SchemaEditor = memo(CodeMirror);
const editorExtensions = [dbmlLanguage, dbmlColors];
const editorSetup = { foldGutter: true, lineNumbers: true, highlightActiveLine: true };
const palette = ["#316896", "#537bad", "#6d66a3", "#3c877c", "#bc8951"];
function TableNode({ id, data, selected }: NodeProps) {
  const t = data.table as Table;
  const tuples = (data.composites || []) as ReturnType<typeof compositeEndpoints>;
  const updateInternals = useUpdateNodeInternals();
  useEffect(() => updateInternals(id), [id, data.detail, t.fields, data.composites]);
  const primaryKeys=new Set([...t.fields.filter(f=>f.pk).map(f=>f.name),...t.indexes.filter(i=>i.pk).flatMap(i=>i.columns.filter((c:any)=>c.type==="column").map((c:any)=>c.value))]);
  const foreignKeys=(data.foreignKeys || {}) as Record<string,string[]>;
  return <div className={"table-node "+(selected?"selected":"")}>
    <div className="table-title" style={{background:t.color || "#316896"}}>
      <b>{t.schema==="public"?"":t.schema+"."}{t.name}</b>
      {t.note&&<SchemaTooltip heading={<><Table2 size={14}/><b>{t.name}</b><span>Table</span></>} content={<><strong>Note</strong><p>{t.note}</p></>}><span className="note-indicator" aria-label={"Note on "+t.name}><MessageSquare size={13}/></span></SchemaTooltip>}
      {selected && <div className="table-access-icons nodrag nopan">
        <button type="button" aria-label="Table records" title="Table records" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); (data.openRecords as () => void)(); }}><Grid2X2 size={14}/></button>
        <AppearanceSettings label="Table header color" color={t.color || '#316896'} onApply={data.applyColor as (color: string) => Promise<void>} />
      </div>}
      <Handle type="target" position={Position.Left} id="header-in"/><Handle type="source" position={Position.Right} id="header-out"/><Handle type="source" position={Position.Left} id="header-out-left"/><Handle type="target" position={Position.Right} id="header-in-right"/>
    </div>
    {visibleFields(t.fields,(data.detail as Detail)||"all",(data.keys as string[])||[]).map(f=>{
      const pk=primaryKeys.has(f.name),targets=foreignKeys[f.name] || [];
      const info=<><div className="attribute-constraints">{pk&&<span>Primary key</span>}{targets.length>0&&<span>Foreign key</span>}{f.not_null?<span>Not null</span>:!pk&&<span>Nullable</span>}{f.unique&&!pk&&<span>Unique</span>}</div>{targets.length>0&&<><strong>References</strong>{targets.map(target=><code key={target}>{target}</code>)}</>}{!!f.indexes?.length&&<div className="attribute-indexes"><strong>Indexes</strong>{f.indexes.map((index,i)=><div className="attribute-index" key={i}><div><ListFilter size={13}/><b>{index.name || (index.pk ? "Primary key index" : index.unique ? "Unique index" : "Index")}</b></div><small>{[index.pk ? "Primary key" : index.unique ? "Unique" : "Non-unique", index.type, index.columns.length>1 ? "Composite" : ""].filter(Boolean).join(" · ")}</small><code>{index.columns.map(column=>column.value).join(", ")}</code></div>)}</div>}{f.note&&<><strong>Note</strong><p>{f.note}</p></>}{!!f.checks?.length&&<div className="attribute-checks"><strong>Check constraints <span>{f.checks.length}</span></strong>{f.checks.map((rule,index)=><div className="check-rule" key={index}><div className="check-rule-summary"><ShieldCheck size={14}/><b>{rule.summary}</b></div>{rule.options&&<div className="check-values">{rule.options.map(value=><code key={value}>{value}</code>)}</div>}{rule.limits&&<div className="check-limits">{rule.limits.map(limit=><div key={limit.label}><span>{limit.label}</span><b>≤ {limit.maximum}</b></div>)}</div>}{rule.fields.length>1&&<small>Also applies to {rule.fields.filter(field=>field!==f.name).join(", ")}</small>}{rule.name&&<small className="check-rule-name">{rule.name}</small>}<pre className="check-expression">{rule.expression}</pre></div>)}{!f.not_null&&!pk&&<p className="check-null-hint">Nullable column; NULL handling depends on the expression.</p>}</div>}</>;
      return <SchemaTooltip key={f.name} heading={<><Table2 size={14}/><b>{f.name}</b><code>{f.type}</code></>} content={info}>
        <div onPointerEnter={() => (data.onFieldHover as (field: string | null) => void)(f.name)} onPointerLeave={() => (data.onFieldHover as (field: string | null) => void)(null)} className={"field "+(pk?"primary-field ":"")+(((data.highlightFields as string[])||[]).includes(f.name)?"field-highlight":"")}>
          <Handle type="target" position={Position.Left} id={f.name+"-in"}/>
          <span className="field-name">{f.name}</span>
          {pk&&<span className="attribute-icon" title="Primary key" aria-label="Primary key"><KeyRound size={12}/></span>}
          {targets.length>0&&<span className="attribute-icon" title={"Foreign key: "+targets.join(", ")} aria-label="Foreign key"><Link2 size={12}/></span>}
          {f.note&&<span className="attribute-icon note-indicator" aria-label={"Note on "+f.name}><MessageSquare size={12}/></span>}
          {!!f.indexes?.length&&<span className="attribute-icon index-indicator" aria-label={`${f.indexes.length} indexes on ${f.name}`}><ListFilter size={12}/></span>}
          {!!f.checks?.length&&<span className="attribute-icon check-indicator" aria-label={`${f.checks.length} check constraints on ${f.name}`}><ShieldCheck size={12}/></span>}
          <span className="field-type">{f.type}</span>{f.not_null&&<span className="not-null-tag" aria-label="Not null">NN</span>}
          <Handle type="source" position={Position.Right} id={f.name+"-out"}/><Handle type="source" position={Position.Left} id={f.name+"-out-left"}/><Handle type="target" position={Position.Right} id={f.name+"-in-right"}/>
        </div>
      </SchemaTooltip>;
    })}
    {data.detail!=="names"&&tuples.map(tuple=><SchemaTooltip key={tuple.id} heading={<><Link2 size={14}/><b>Composite relationship</b><span>{tuple.fields.length} columns</span></>} content={<div className="composite-mappings"><p>These columns form one key. Cardinality applies to the complete tuple.</p>{tuple.references.map(ref=><div key={ref.id}><strong>{ref.name || 'Composite foreign key'}</strong>{ref.fromFields.map((field,index)=><div className="composite-pair" key={index}><code>{ref.fromTable}.{field}</code><ArrowUpRight size={12}/><code>{ref.toTable}.{ref.toFields[index]}</code></div>)}</div>)}</div>}>
      <div className={'field composite-field ' + (tuple.fields.some(field=>((data.highlightFields as string[])||[]).includes(field))?'field-highlight':'')} onPointerEnter={()=>(data.onFieldHover as (field:string|null)=>void)(tuple.id)} onPointerLeave={()=>(data.onFieldHover as (field:string|null)=>void)(null)}>
        <Handle type="target" position={Position.Left} id={tuple.id+'-in'} isConnectable={false}/><Handle type="source" position={Position.Right} id={tuple.id+'-out'} isConnectable={false}/><Handle type="source" position={Position.Left} id={tuple.id+'-out-left'} isConnectable={false}/><Handle type="target" position={Position.Right} id={tuple.id+'-in-right'} isConnectable={false}/>
        <span className="composite-label" aria-label={'Composite key '+tuple.fields.join(', ')}>({tuple.fields.join(', ')})</span><Link2 size={11} className="composite-icon"/>
      </div>
    </SchemaTooltip>)}
    {data.detail!=="names"&&t.indexes.length>0&&<div className="index-row"><KeyRound size={11}/>{t.indexes.length} {t.indexes.length===1?"index":"indexes"}</div>}
  </div>;
}
function GroupNode({ data }: NodeProps) {
  return (
    <div
      className={"group-node" + (data.focused ? " is-focused" : "")}
      style={{
        borderColor: `color-mix(in srgb, ${String(data.color)} 35%, #243c57)`,
        background: `color-mix(in srgb, ${String(data.color)} 6%, transparent)`,
      }}
    >
      <div className="group-title-tools nodrag nopan">
      <button type="button" className="group-focus-button nodrag nopan" aria-label={`Focus group ${String(data.name)}`} aria-pressed={!!data.focused}
        style={{ color: `color-mix(in srgb, ${String(data.color)} 45%, #243c57)` }}
        onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); (data.onFocus as () => void)(); }}>
        <Layers size={12} />{String(data.name)}
      </button>
      <AppearanceSettings label={`${String(data.name)} group color`} color={String(data.color)} onApply={data.applyColor as (color: string) => Promise<void>} />
      </div>
    </div>
  );
}
const nodeTypes = {
  storage: memo(StorageNode),
  table: memo(TableNode, (a, b) => a.id === b.id && a.selected === b.selected && (a.data === b.data || (a.data.table === b.data.table && a.data.detail === b.data.detail && a.data.composites === b.data.composites && JSON.stringify(a.data.keys) === JSON.stringify(b.data.keys) && JSON.stringify(a.data.highlightFields) === JSON.stringify(b.data.highlightFields)))),
  group: memo(GroupNode, (a, b) => a.data.name === b.data.name && a.data.color === b.data.color && a.data.focused === b.data.focused),
};
function ZoomPercentage() { return <>{Math.round(useViewport().zoom * 100)}%</>; }
function RelationshipEdge(props: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const ports = props.data?.ports as { source: RelationshipPort; target: RelationshipPort };
  const sourceY = props.sourceY + (ports?.source.offset || 0);
  const targetY = props.targetY + (ports?.target.offset || 0);
  const direction = relationshipFlow(String(props.data?.relation));
  const [path, labelX, labelY] = useMemo(() => {
    const planned = props.data?.route as RoutePoint[] | null | undefined;
    if (!planned || props.data?.dragging || (planned.length < 3 && sourceY !== targetY)) return getSmoothStepPath({ ...props, sourceY, targetY, borderRadius: 10 });
    const points = planned;
    const adjusted = points.map(point => ({ ...point }));
    adjusted[0] = { x: props.sourceX, y: sourceY };
    adjusted[adjusted.length - 1] = { x: props.targetX, y: targetY };
    if (adjusted.length > 2) { adjusted[1].y = sourceY; adjusted[adjusted.length - 2].y = targetY; }
    const geometry = routeGeometry(adjusted, (props.data?.routeBounds || []) as TableBounds[]);
    const storageLabel = props.data?.storageLink ? storageLabelPosition(adjusted, (props.data.routeBounds as TableBounds[]) || [], String(props.data.label || '').length * 6 + 12) : (props.data?.branchLabel as RoutePoint | undefined) || geometry.label;
    const label = props.data?.explicitSelected && props.data?.accessPoint ? projectToRoute(adjusted, props.data.accessPoint as RoutePoint) : storageLabel;
    return [geometry.path, label.x, label.y] as const;
  }, [props.sourceX, sourceY, props.targetX, targetY, props.data?.dragging, props.data?.route, props.data?.routeBounds, props.data?.accessPoint, props.data?.explicitSelected, props.data?.branchLabel]);
  const storageLink = !!props.data?.storageLink;
  const parts = String(props.data?.relation || "").split(":");
  const highlighted = hovered || props.selected || !!props.data?.highlighted;
  const stroke = String(props.data?.color || (highlighted ? "#475aff" : props.style?.stroke || "#9b9ca4"));
  return (
    <g className={hovered ? "edge-hovered" : undefined} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <BaseEdge
        id={props.id}
        className={`relationship-line flow-${direction}`}
        path={path}
        markerStart={props.markerStart}
        markerEnd={props.markerEnd}
        style={{ ...props.style, stroke, strokeWidth: highlighted ? 2 : props.style?.strokeWidth }}
        interactionWidth={10}
      />
      {!storageLink && [
        { x: props.sourceX, y: sourceY, direction: props.sourcePosition === Position.Left ? -1 : 1, cardinality: parts[0], port: ports?.source },
        { x: props.targetX, y: targetY, direction: props.targetPosition === Position.Right ? 1 : -1, cardinality: parts[1], port: ports?.target },
      ].map(({ x, y, direction, cardinality, port }, index) => (port?.showSymbol || hovered) && (
        <g key={index}>
        <path
          className="edge-cardinality"
          aria-label={"Cardinality " + cardinality}
          d={isMany(cardinality)
            ? `M ${x + direction * 2} ${y - (port?.halfHeight || 4)} L ${x + direction * (port?.width || 10)} ${y} L ${x + direction * 2} ${y + (port?.halfHeight || 4)} M ${x + direction * 2} ${y} L ${x + direction * (port?.width || 10)} ${y}`
            : `M ${x + direction * ((port?.width || 10) / 2)} ${y - (port?.halfHeight || 4)} L ${x + direction * ((port?.width || 10) / 2)} ${y + (port?.halfHeight || 4)}`}
          fill="none"
          stroke={stroke}
          strokeWidth={Math.min(highlighted ? 1.4 : 1, (port?.halfHeight || 4) * .4)}
          pointerEvents="none"
        />
        {parseCardinality(cardinality).minimum === 0 && cardinality !== '*' && <circle cx={x + direction * ((port?.width || 10) + 4)} cy={y} r={2.6} fill="var(--canvas-bg, #f8fafc)" stroke={stroke} strokeWidth={1} pointerEvents="none"/>}
        {cardinality !== '*' && cardinality !== '1' && cardinality !== '0..1' && cardinality !== '0..*' && <text className="edge-bound" x={x + direction * 16} y={y - 5} textAnchor={direction > 0 ? 'start' : 'end'} fill={stroke}>{cardinality}</text>}
        </g>
      ))}
      {highlighted && direction !== "both" && <path className={`relationship-motion flow-${direction}`} d={path} fill="none" stroke={stroke} strokeWidth={3} pointerEvents="none" />}
      {highlighted && direction === "both" && <g className="relationship-particles" fill={stroke}>
        {["0;1", "1;0"].map(points => <circle key={points} r={2.4}><animateMotion path={path} dur="3s" repeatCount="indefinite" keyPoints={points} keyTimes="0;1" calcMode="linear" /></circle>)}
      </g>}
      <EdgeLabelRenderer>
        {!!props.data?.explicitSelected && <div className="edge-access-icons nodrag nopan" style={{transform:`translate(-50%,-100%) translate(${(props.data?.accessPoint as {x:number;y:number} | undefined)?.x ?? labelX}px,${((props.data?.accessPoint as {x:number;y:number} | undefined)?.y ?? labelY)-12}px)`}}>
          {storageLink ? <button aria-label="Edit storage connection" onClick={props.data?.onEdit as () => void}><Pencil size={14}/></button> : <><button aria-label="Relationship cardinality" title="Relationship cardinality" onClick={props.data?.editCardinality as () => void}><SlidersHorizontal size={14}/></button><AppearanceSettings label="Relationship color" color={String(props.data?.color || '#9b9ca4')} onApply={props.data?.applyColor as (color: string) => Promise<void>} /></>}
        </div>}
        {(!!props.data?.explicitSelected || !!props.data?.showLabel) && (
          <span
            className={"edge-name nodrag nopan" + (storageLink ? " storage-edge-name" : "")}
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {String(props.data?.label)}
          </span>
        )}
      </EdgeLabelRenderer>
    </g>
  );
}
const edgeTypes = { relationship: memo(RelationshipEdge) };
const initialExampleLayout = exampleLayoutForCanvas(
  window.innerWidth - Math.max(280, Math.min(400, window.innerWidth * 0.3)),
  window.innerHeight - 80,
);
function Workspace() {
  const [docs, setDocs] = useState<Doc[]>([]),
    [doc, setDoc] = useState<Doc | null>(null),
    [code, setCode] = useState(""),
    [model, setModel] = useState<Model>({ tables: [], refs: [], groups: [], notes: [] });
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]),
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
  const storage = model.storage || emptyStorage;
  const [storageRecordFocus, setStorageRecordFocus] = useState<{ unit: string; item?: string }>();
  const openStorageRecords = (unit: StorageUnit, item?: string) => { storageEditBase.current = latestCode.current; setStorageRecordFocus({ unit: unit.id, item }); setModal('storage-records'); };
  const [editingStore, setEditingStore] = useState<StorageUnit>();
  const [editingLink, setEditingLink] = useState<StorageLink>();
  const storageEditBase = useRef('');
  const openStore = (unit?: StorageUnit) => { storageEditBase.current = latestCode.current; setEditingStore(unit); setModal('storage'); };
  const openStorageLink = (link?: StorageLink) => { storageEditBase.current = latestCode.current; setEditingLink(link); setModal('storage-link'); };
  const [arrangement, setArrangement] = useState<Arrangement>("left-right");
  const [selectedEdge, setSelectedEdge] = useState("");
  const [focusedGroup, setFocusedGroup] = useState("");
  const [hoveredField, setHoveredField] = useState<{ tableId: string; field: string } | null>(null);
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
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const loadRun = useRef(0);
  const [arranging, setArranging] = useState(false);
  const layoutRun = useRef(0);
  const layoutContext = useRef({ id: doc?.id, detail });
  layoutContext.current = { id: doc?.id, detail };
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
    document.title = loading ? "Loading diagram — schemaDB" : doc?.name
      ? doc.name + " · " + bundle + " — schemaDB"
      : bundle + " — schemaDB";
  }, [doc?.name, activeBundle, bundles, loading]);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const nodesInitialized = nodes.length > 0 && nodes.every(node => !!node.measured?.width && !!node.measured?.height);
  const saved = useRef(""),
    latestCode = useRef(""),
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
            'button,input,textarea,select,a[href],summary,[tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
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
      0.05,
      options.maxZoom ?? 2,
      options.padding ?? 0.12,
    );
    return flow.setViewport(next, { duration: options.duration });
  };
  const fitInitialDiagram = () => {
    if (!fitPending.current || loading || !nodesInitialized || !nodes.length) return;
    fitPending.current = false;
    void fitDiagram({ padding: 0.12, maxZoom: 1 });
  };
  useEffect(() => {
    if (!nodesInitialized || loading) return;
    const frame = requestAnimationFrame(fitInitialDiagram);
    return () => cancelAnimationFrame(frame);
  }, [nodesInitialized, loading, doc?.id, doc?.revision, loadVersion]);
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
    const run = ++loadRun.current;
    ++parseSeq.current;
    setLoading(true);
    setStatus("Loading diagram…");
    try {
      const d = await api("/schemas/" + id);
      if (run !== loadRun.current) return;
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
      setLoadVersion(version => version + 1);
      setError("");
      setSelected("");
      setSelectedEdge("");
      setFocusedGroup(""); setHoveredField(null);
    } catch (e) {
      if (run !== loadRun.current) return;
      setError((e as Error).message);
      setStatus("Could not load diagram");
      setLoading(false);
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
        setLoading(false);
        setStatus("Empty bundle");
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
    })().catch((e) => {
      setError(e.message); setStatus("Could not load workspace"); setLoading(false);
    });
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
          if (loading) setStatus(doc.storage === "cloud" ? "Saved to shared workspace" : doc.storage === "browser" ? "Saved in this browser" : "Saved locally");
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
              }).concat((m.storage?.units || []).map<Node>((unit, index) => {
                const id = storageNodeId(unit.id), existing = old.find(node => node.id === id);
                const right = Math.max(70, ...old.filter(node => node.type === 'table').map(node => node.position.x + (node.measured?.width || 260)), ...m.tables.map(table => (doc.layout[table.id]?.x || 70) + 260));
                return { ...existing, id, type: 'storage', position: existing?.position || doc.layout[id] || { x: right + 160, y: 100 + (m.storage?.units || []).slice(0, index).reduce((height, unit) => height + storageNodeHeight(unit) + 50, 0) }, data: { unit }, selected: id === selected };
              }));
          });
        })
        .catch((e) => {
          if (seq === parseSeq.current) setError(e.message);
        }).finally(() => {
          if (seq === parseSeq.current) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      if (parseSeq.current === seq) ++parseSeq.current;
    };
  }, [code, doc?.id, doc?.revision, loadVersion]);
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
    let active = true, running = false;
    const t = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const metadata = doc.storage === "cloud" ? (await api("/schemas")).find((item: Doc) => item.id === doc.id) : await api("/schemas/" + doc.id);
        if (!active) return;
        if (!metadata) throw new Error("This diagram is no longer available.");
        const d = metadata;
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
            const d = doc.storage === "cloud" ? await api("/schemas/" + doc.id) : metadata;
            if (!active) return;
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
        if (active) setError((e as Error).message);
      } finally { running = false; }
    }, 2000);
    return () => { active = false; clearInterval(t); };
  }, [doc?.id, doc?.revision, doc?.name, doc?.bundle_id, doc?.storage]);
  const persistLayout = () => {
    if (!doc) return;
    clearTimeout(layoutTimer.current);
    const layout = {...doc.layout,...Object.fromEntries(
      flow.getNodes().filter(n => n.type === "table" || n.type === "storage").map(n => [n.id, n.position]),
    )};
    layoutTimer.current = setTimeout(() => {
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
  const arrange = async (mode: Arrangement = arrangement) => {
    const run = ++layoutRun.current;
    const originalCode = latestCode.current;
    const originalId = doc?.id;
    const current = () => run === layoutRun.current && originalCode === latestCode.current && originalId === layoutContext.current.id && detail === layoutContext.current.detail;
    setArranging(true);
    setError("");
    try {
      const positions = await arrangeTables(
        flow.getNodes().filter(n => n.type === "table" || n.type === "storage").map(n => {
          if (n.type === 'storage') {
            const unit = n.data.unit as StorageUnit;
            return { id: n.id, width: n.measured?.width || 300, height: n.measured?.height || storageNodeHeight(unit, detail === 'names'), fields: [{name: 'header', y: 25}, ...storagePorts(unit).map(port => ({ name: port.port, y: flow.getInternalNode(n.id)?.internals.handleBounds?.source?.find(handle => handle.id === port.port + '-out')?.y || 96 }))] };
          }
          const table = n.data.table as Table;
          const fields = visibleFields(table.fields, detail, (displayedNodes.find(d => d.id === n.id)?.data.keys as string[]) || []);
          return {
            id: n.id,
            width: n.measured?.width || 260,
            height: n.measured?.height || 35 + fields.length * 30 + (table.indexes.length ? 25 : 0) + (detail === "names" ? 0 : compositeEndpoints(model.refs, table.id).length * 30),
            fields: [...fields.map(field => field.name), ...(detail === "names" ? [] : compositeEndpoints(model.refs, table.id).map(tuple => tuple.id))].map((name,index)=>({name,y:33+index*30+15})),
          };
        }), [...model.refs.map(ref=>({...ref,fromFields:[relationshipField(ref.fromFields)],toFields:[relationshipField(ref.toFields)]})), ...storage.links.filter(link => !storageLinkIssue(link, storage.units, model.tables)).map(link => ({ fromTable: link.from.node, fromFields: [link.from.port || 'header'], toTable: link.to.node, toFields: [link.to.port || 'header'], relation: '1:*' }))], model.groups, mode,
      );
      if (!current()) return;
      setSelected(""); setSelectedEdge(""); setEdgeAccessPoint(undefined); setFocusedGroup("");
      setNodes(ns => ns.map(n => positions[n.id] ? { ...n, position: positions[n.id], selected: false } : n));
      setTimeout(() => {
        if (!current()) return;
        fitDiagram({ includeHiddenNodes: true, duration: 400, padding: 0.15 });
        persistLayout();
      }, 100);
    } catch (e) {
      if (current()) setError("Could not arrange tables: " + (e as Error).message);
    } finally {
      if (run === layoutRun.current) setArranging(false);
    }
  };
  const openNote = () => {
    const table=model.tables.find(t=>t.id===selected)||model.tables[0];
    if(!table){setError("Create a table before attaching a note.");return;}
    setTableId(table.id);setNoteField("");setNoteText(table.note || "");setError("");setModal("note");
  };
  useEffect(() => {
    if (hoveredField && !model.tables.some(table => table.id === hoveredField.tableId && (table.fields.some(field => field.name === hoveredField.field) || compositeEndpoints(model.refs, table.id).some(tuple => tuple.id === hoveredField.field))) && !storage.units.some(unit => storageNodeId(unit.id) === hoveredField.tableId && storagePorts(unit).some(port => port.port === hoveredField.field))) setHoveredField(null);
  }, [model, hoveredField]);
  const highlightedRefs = useMemo(() => highlightedRelationships(
    model.refs,
    highlight,
    selected,
    selectedEdge,
    hoveredField,
  ), [model.refs, highlight, selected, selectedEdge, hoveredField]);
  const compositeRows = useMemo(() => new Map(model.tables.map(table => [table.id, compositeEndpoints(model.refs, table.id)])), [model.tables, model.refs]);
  const tableData = useMemo(() => new Map(nodes.filter(n => n.type === "table").map((n) => {
    const t = n.data.table as Table;
    const keys = [
      ...storage.links.flatMap(link => [link.from, link.to].filter(endpoint => endpoint.node === t.id && endpoint.port).map(endpoint => endpoint.port)),
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
    return [n.id, {
        ...n.data,
        table: t,
        detail,
        keys,
        foreignKeys:foreignKeyTargets(model.refs,t.id),
        composites: compositeRows.get(t.id),
        onFieldHover: (field: string | null) => setHoveredField(current => field ? { tableId: t.id, field } : current?.tableId === t.id ? null : current),
        openRecords: () => { setTableId(t.id); setRecordFocus(undefined); setRecordHistory([]); setModal('records'); },
        applyColor: (color: string) => applyVisualColor('table', t.id, color),
        highlightFields: model.refs
          .filter((r) => highlightedRefs.has(r.id))
          .flatMap((r) => [
            ...(r.fromTable === t.id ? r.fromFields : []),
            ...(r.toTable === t.id ? r.toFields : []),
          ]),
    }] as const;
  })), [model, detail, highlightedRefs, compositeRows]);
  const storageData = useMemo(() => new Map(storage.units.map(unit => [storageNodeId(unit.id), {
    unit, detail, onEdit: () => openStore(unit), onRecords: (item?: string) => openStorageRecords(unit, item),
    onPortHover: (port: string | null) => setHoveredField(current => port ? { tableId: storageNodeId(unit.id), field: port } : current?.tableId === storageNodeId(unit.id) ? null : current),
  }])), [storage.units, detail]);
  const displayedNodes = useMemo<Node[]>(() => nodes.map(n => ({ ...n, selected: n.id === selected, zIndex: 2, data: tableData.get(n.id) || storageData.get(n.id) || n.data })), [nodes, selected, tableData, storageData]);
  const groupNodes: Node[] = useMemo(() => model.groups.flatMap((g) => {
    const members = nodes.filter((n) => g.tables.includes(n.id));
    if (!members.length) return [];
    const x = Math.min(...members.map((n) => n.position.x)) - 22,
      y = Math.min(...members.map((n) => n.position.y)) - 38;
    const right = Math.max(...members.map((n) => n.position.x + (n.measured?.width || 260))),
      bottom = Math.max(
        ...members.map(
          (n) =>
            n.position.y +
            (n.measured?.height || (33 +
            visibleFields(
              (n.data.table as Table).fields,
              detail,
              (displayedNodes.find((d) => d.id === n.id)?.data
                .keys as string[]) || [],
            ).length *
              30 +
            (detail === "names" ? 0 : (compositeRows.get(n.id)?.length || 0) * 30) + 25)),
        ),
      );
    return [
      {
        id: "group:" + g.name,
        type: "group",
        position: { x, y },
        data: { name: g.name, color: g.color || "#537bad", applyColor: (color: string) => applyVisualColor('group', g.name, color), focused: focusedGroup === g.name, onFocus: () => {
          setFocusedGroup(g.name); setSelected(""); setSelectedEdge("");
          const group = flow.getNode("group:" + g.name);
          if (group) void fitDiagram({ nodes: [group], duration: 400, padding: 0.12, maxZoom: 1.1 });
        } },
        initialWidth: right - x + 22,
        initialHeight: bottom - y + 22,
        width: right - x + 22,
        height: bottom - y + 22,
        style: { width: right - x + 22, height: bottom - y + 22 },
        draggable: false,
        selectable: false,
        zIndex: focusedGroup === g.name ? 1 : 0,
      },
    ];
  }), [nodes, model.groups, detail, tableData, focusedGroup]);
  const obstacles = useMemo(() => displayedNodes.map(n => ({
    ...n.position,
    width: n.measured?.width || 260,
    height: n.measured?.height || (n.type === "storage" ? storageNodeHeight(n.data.unit as StorageUnit, detail === "names") : detail === "names" ? 33 : 33 + visibleFields((n.data.table as Table).fields, detail, (n.data.keys as string[]) || []).length * 30 + ((n.data.table as Table).indexes.length ? 25 : 0) + (compositeRows.get(n.id)?.length || 0) * 30),
  })), [nodes, detail, tableData]);
  const canvasRefs = useMemo(() => [...model.refs.map(ref => ({ ...ref, storageLink: undefined as StorageLink | undefined })), ...storage.links.filter(link => !storageLinkIssue(link, storage.units, model.tables)).map(link => ({ id: 'storage-link:' + link.id, fromTable: link.from.node, fromFields: [link.from.port || 'header'], toTable: link.to.node, toFields: [link.to.port || 'header'], name: link.label || link.kind, color: '#127c80', relation: link.direction === 'both' ? '*:*' : '1:*', storageLink: link }))], [model.refs, model.tables, storage]);
  const attachments = useMemo(() => Object.fromEntries(canvasRefs.map(ref => {
    const from = nodes.find(node => node.id === ref.fromTable), to = nodes.find(node => node.id === ref.toTable);
    return [ref.id, from && to ? relationshipSides({ x: from.position.x, width: from.measured?.width || 260 }, { x: to.position.x, width: to.measured?.width || 260 }, from.id === to.id) : { sourceSide: "right" as const, targetSide: "left" as const }];
  })), [nodes, canvasRefs]);
  const attachmentKey = JSON.stringify(attachments);
  const ports = useMemo(() => ({ ...relationshipPorts(model.refs.map(ref => ({ ...ref, ...attachments[ref.id] })), detail, selectedEdge, highlightedRefs), ...Object.fromEntries(canvasRefs.filter(ref => ref.storageLink).map(ref => [ref.id, { source: { offset: 0, halfHeight: 4, width: 10, showSymbol: false }, target: { offset: 0, halfHeight: 4, width: 10, showSymbol: false } }])) }), [canvasRefs, model.refs, detail, selectedEdge, highlightedRefs, attachmentKey]);
  const sourceHandle = (refId: string, field: string) => (detail === "names" || !field ? "header" : field) + (attachments[refId].sourceSide === "left" ? "-out-left" : "-out");
  const targetHandle = (refId: string, field: string) => (detail === "names" || !field ? "header" : field) + (attachments[refId].targetSide === "right" ? "-in-right" : "-in");
  const routingRequests = canvasRefs.flatMap(ref => {
    const from = displayedNodes.find(n => n.id === ref.fromTable), to = displayedNodes.find(n => n.id === ref.toTable);
    if (!from || !to) return [];
    const endpoint = (node: Node, field: string, source: boolean) => {
      const side = source ? attachments[ref.id].sourceSide : attachments[ref.id].targetSide;
      const handleId = source ? sourceHandle(ref.id, field) : targetHandle(ref.id, field);
      const handle = flow.getInternalNode(node.id)?.internals.handleBounds?.[source ? "source" : "target"]?.find(handle => handle.id === handleId);
      const fields = node.type === "table" ? visibleFields((node.data.table as Table).fields, detail, (node.data.keys as string[]) || []) : [];
      return { x: node.position.x + (handle ? handle.x + handle.width / 2 : side === "right" ? node.measured?.width || 260 : 0),
        y: node.position.y + (handle ? handle.y + handle.height / 2 : detail === "names" ? 16.5 : 49 + Math.max(0, [...fields.map(f => f.name), ...(compositeRows.get(node.id) || []).map(tuple => tuple.id)].indexOf(field)) * 30) };
    };
    const source = endpoint(from, relationshipField(ref.fromFields), true), target = endpoint(to, relationshipField(ref.toFields), false);
    source.y += ports[ref.id].source.offset;
    target.y += ports[ref.id].target.offset;
    const parts = ref.relation.split(':');
    const sourceBundle = ref.storageLink ? undefined : JSON.stringify([ref.fromTable, relationshipField(ref.fromFields), parts[0], attachments[ref.id].sourceSide]);
    const targetBundle = ref.storageLink ? undefined : JSON.stringify([ref.toTable, relationshipField(ref.toFields), parts[1], attachments[ref.id].targetSide]);
    return [{ id: ref.id, source, target, sourceBundle, targetBundle, ...attachments[ref.id] }];
  });
  const routingKey = JSON.stringify({ routingRequests, obstacles });
  const draggingKey = nodes.filter(node => node.dragging).map(node => node.id).sort().join("|");
  const movingTables = useMemo(() => new Set(draggingKey.split("|")), [draggingKey]);
  const routing = useRelationshipRoutes({ key: routingKey, relationships: routingRequests, tables: obstacles }, !!draggingKey);
  const relationshipRoutes = routing.routes;
  const edges = useMemo(() => canvasRefs.map((r) => {
    const active = r.id === selectedEdge;
    const related = r.storageLink ? r.id === selectedEdge || (hoveredField ? (r.fromTable === hoveredField.tableId && r.fromFields.includes(hoveredField.field)) || (r.toTable === hoveredField.tableId && r.toFields.includes(hoveredField.field)) : highlight && (!selected || r.fromTable === selected || r.toTable === selected)) : highlightedRefs.has(r.id);
    return {
      id: r.id,
      source: r.fromTable,
      target: r.toTable,
      sourceHandle: sourceHandle(r.id, relationshipField(r.fromFields)),
      targetHandle: targetHandle(r.id, relationshipField(r.toFields)),
      type: "relationship",
      markerEnd: r.storageLink ? { type: MarkerType.ArrowClosed, color: '#127c80', width: 13, height: 13 } : undefined,
      markerStart: r.storageLink?.direction === 'both' ? { type: MarkerType.ArrowClosed, color: '#127c80', width: 13, height: 13 } : undefined,
      ariaLabel: `Relationship ${r.name || r.fromTable + " to " + r.toTable}`,
      selected: active || (!hoveredField && !!selected && (r.fromTable===selected || r.toTable===selected)),
      animated: false,
      interactionWidth: 10,
      data: {
        storageLink: r.storageLink,
        onEdit: () => openStorageLink(r.storageLink),
        ports: ports[r.id],
        route: routing.sides?.[r.id] === `${attachments[r.id].sourceSide}:${attachments[r.id].targetSide}` ? relationshipRoutes[r.id] : undefined,
        branchLabel: routing.labels?.[r.id],
        routeBounds: routing.tables,
        dragging: movingTables.has(r.fromTable) || movingTables.has(r.toTable),
        color: r.color,
        accessPoint: active ? edgeAccessPoint : undefined,
        applyColor: (color: string) => applyVisualColor('relationship', r.id, color),
        relation: r.relation,
        editCardinality: () => { setSelectedEdge(r.id); setModal("cardinality"); },
        highlighted: related,
        explicitSelected:active,
        showLabel: !!r.storageLink || (related && !!r.name),
        label:
          (r.fromFields.length > 1 || r.toFields.length > 1) ? `${r.name ? r.name + " · " : ""}Composite (${r.fromFields.length} columns)` : r.name ||
          `${r.fromTable}.${r.fromFields.join(", ")} → ${r.toTable}.${r.toFields.join(", ")}`,
      },
      style: {
        stroke: r.color || (active || related ? "#475aff" : "#9b9ca4"),
        strokeWidth: active || related ? 2 : 1,
        opacity: 1,
        strokeDasharray: r.storageLink ? "5 5" : undefined,
      },
    };
  }), [canvasRefs, highlight, ports, relationshipRoutes, routing.labels, routing.tables, routing.sides, attachmentKey, selectedEdge, highlightedRefs, selected, hoveredField, edgeAccessPoint, movingTables]);
  const applyVisualColor = async (kind: 'table' | 'relationship' | 'group', id: string, color: string) => {
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
      if (loading || modal || el.closest("input,textarea,select,[contenteditable=true],.appearance-settings"))
        return;
      if (e.key === "Escape" && focusedGroup) { setFocusedGroup(""); return; }
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
  }, [modal, doc?.id, loading, focusedGroup]);
  const focus = (id: string) => {
    setSelectedEdge("");
    setSelected(nodes.some(node => node.id === id) ? id : "");
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
  const updateStorage = async (next: StorageModel, expected?: string) => {
    const previous = latestCode.current;
    if (expected !== undefined && expected !== previous) throw new Error('The diagram changed while this editor was open. Reopen it before applying your changes.');
    const updated = writeStorageModel(previous, next);
    await api('/parse', { dbml: updated });
    if (latestCode.current !== previous) throw new Error('The diagram changed. Reopen the storage editor and try again.');
    change(updated);
  };
  return (
    <div className="app">
      <header>
        <nav className="workspace-breadcrumb" aria-label="Workspace breadcrumb">
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
          loading={loading}
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
        </nav>
        <button
          className="new"
          onClick={() => {
            setName("");
            setModal("new");
          }}
          disabled={loading}
          title="New diagram"
        >
          <Plus size={16} />
        </button>
        <div className="header-spacer" />
        <span className="save-state">
          <span className={loading ? "dot muted" : error ? "dot red" : dirty.current ? "dot amber" : "dot"} />
          {status}
        </span>
        <button className="header-button" disabled={loading} onClick={() => setModal("agent")}>
          <Terminal size={15} /> Agent access
        </button>
        <button className="header-button" disabled={loading} onClick={() => file.current?.click()}>
          <Upload size={15} /> Import
        </button>
        <button
          className="header-button"
          disabled={!doc || loading}
          onClick={() => setModal("export")}
        >
          <Download size={15} /> Export
        </button>
        <button
          className="save-button"
          disabled={!doc || loading}
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
      <main aria-busy={loading}>
        {loading && editorVisible && <aside className="editor editor-loading" aria-label="Loading schema editor">
          <div className="loading-editor-heading"><Code2 size={14} /><span>Loading schema</span></div>
          <div className="loading-code" aria-hidden="true">{[72,48,61,84,56,69,42,78,53,65].map((width, i) => <span key={i} style={{ width: width + "%" }} />)}</div>
        </aside>}
        {!loading && editorVisible && doc && (
          <aside className="editor">
            <div className="tabs">
              {["DBML", "Tables", "Groups", "Indexes", "Storage"].map((t) => (
                <button
                  className={tab === t ? "active" : ""}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t === "DBML" ? (
                    <Code2 size={14} />
                  ) : t === "Groups" ? (
                    <Layers size={14} />
                  ) : t === "Storage" ? (
                    <Archive size={14} />
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
                <SchemaEditor
                  ref={editorRef}
                  value={code}
                  height="100%"
                  theme="dark"
                  extensions={editorExtensions}
                  onChange={change}
                  basicSetup={editorSetup}
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
            ) : tab === 'Storage' ? <StoragePanel onRecords={openStorageRecords} model={storage} tables={model.tables} onCreate={() => openStore()} onEdit={openStore} onFocus={focus} onLink={openStorageLink} onDeleteLink={id => { void updateStorage({ ...readStorageModel(latestCode.current), links: readStorageModel(latestCode.current).links.filter(link => link.id !== id) }).catch(error => setError(error.message)); }} /> : (
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
          {loading && <div className="canvas-loading" role="status" aria-live="polite">
            <DiagramSkeleton /><div className="loading-caption"><strong>Loading your diagram</strong><span>Getting your schema and saved layout ready…</span></div>
          </div>}
          {routing.error && !loading && <div className="layout-progress" role="alert">{routing.error}</div>}
          {arranging && !loading && <div className="layout-progress" role="status"><LoaderCircle size={14} aria-hidden="true" />Arranging tables…</div>}
          {!doc && !loading && error && <div className="empty-bundle"><AlertCircle size={28} /><h2>Could not load your workspace</h2><p>{error}</p><button className="primary" onClick={() => window.location.reload()}>Try again</button></div>}
          {!doc && !loading && !error && (
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
          <div className="canvas-content" inert={loading || !doc}>
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
                relationships{!!storage.units.length && <> <i>·</i> {storage.units.length} stores</>}
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
              if (selected) return;
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
              if (n.type === "storage") { setSelected(n.id); setSelectedEdge(""); setTab("Storage"); setEditorVisible(true); }
            }}
            onPaneClick={() => {
              setFocusedGroup("");
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
              const sourceField = connection.sourceHandle?.replace(/-out(?:-left)?$/, ""),
                targetField = connection.targetHandle?.replace(/-in(?:-right)?$/, "");
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
            nodesDraggable={!panMode && !arranging}
            panOnDrag={panMode ? [0, 1, 2] : [1, 2]}
            selectionOnDrag={!panMode}
            snapToGrid={snap}
            snapGrid={[20, 20]}
            onNodeDragStop={persistLayout}
            onSelectionDragStop={persistLayout}
            minZoom={0.05}
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
              nodeColor={(n) => n.type === "storage" ? storageKinds[(n.data.unit as StorageUnit).kind].color : (n.data.table as Table)?.color || "#316896"}
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
              <ZoomPercentage />
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
              aria-label={arranging ? "Arranging tables" : "Auto arrange"}
              disabled={arranging}
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
          </div>
        </section>
      </main>
      <footer>
        <span>
          {loading ? <><LoaderCircle size={13} /> Loading diagram…</> : error ? (
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
      {modal === 'storage-records' && storage.units.find(unit => unit.id === storageRecordFocus?.unit) && <StorageRecords key={storageRecordFocus!.unit} unit={storage.units.find(unit => unit.id === storageRecordFocus?.unit)!} initialItem={storageRecordFocus?.item} onClose={() => setModal('')} download={download} onApply={async (itemId, records) => {
        const current = readStorageModel(latestCode.current);
        const unit = current.units.find(unit => unit.id === storageRecordFocus?.unit);
        if (!unit?.items.some(item => item.id === itemId)) throw new Error('This storage item was removed. Reopen the records window.');
        await updateStorage({ ...current, units: current.units.map(value => value.id === unit.id ? { ...value, items: value.items.map(item => item.id === itemId ? { ...item, records } : item) } : value) }, storageEditBase.current);
        storageEditBase.current = latestCode.current;
      }} />}
      {modal && modal !== 'records' && modal !== 'storage-records' && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal("");
          }}
        >
          <section
            className={`modal${modal === "agent" && cloudAvailable ? " agent-modal" : ""}${modal.startsWith("storage") ? " storage-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={modal}
          >
            <div className="modal-heading">
              <h2>
                {modal === "cardinality" ? "Relationship cardinality" : modal === "storage" ? (editingStore ? "Edit storage schema" : "Add storage schema") : modal === "storage-link" ? "Connect storage" : modal === "arrange"
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
            {modal === 'cardinality' ? (() => { const ref = model.refs.find(ref => ref.id === selectedEdge); return ref ? <CardinalityEditor fromLabel={ref.fromTable + '.' + ref.fromFields.join(', ')} toLabel={ref.toTable + '.' + ref.toFields.join(', ')} relation={ref.relation} onApply={async (from,to) => { const previous = latestCode.current; const next = await setRelationshipCardinality(previous, ref.id, from, to); if (latestCode.current !== previous) throw new Error('The diagram changed. Reopen settings and try again.'); change(next); setModal(''); }} /> : <p>Select a relationship first.</p>; })() : modal === 'storage' ? <StorageEditor key={editingStore?.id || 'new'} unit={editingStore} onClose={() => setModal('')} onSave={async unit => {
              const current = readStorageModel(latestCode.current);
              await updateStorage({ ...current, units: current.units.some(existing => existing.id === unit.id) ? current.units.map(existing => existing.id === unit.id ? unit : existing) : [...current.units, unit] }, storageEditBase.current);
              setTab('Storage');
            }} onDelete={async id => { const current = readStorageModel(latestCode.current); await updateStorage({ ...current, units: current.units.filter(unit => unit.id !== id), links: current.links.filter(link => link.from.node !== storageNodeId(id) && link.to.node !== storageNodeId(id)) }, storageEditBase.current); setSelected(''); }} /> : modal === 'storage-link' && storage.units.length ? <StorageLinkEditor link={editingLink} model={storage} tables={model.tables} onClose={() => setModal('')} onSave={async link => { const current = readStorageModel(latestCode.current); await updateStorage({ ...current, links: current.links.some(existing => existing.id === link.id) ? current.links.map(existing => existing.id === link.id ? link : existing) : [...current.links, link] }, storageEditBase.current); }} /> : modal === "arrange" ? (
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
                          "Order table groups by dependencies, with tables stacked inside each stage.",
                      },
                      {
                        id: "groups",
                        name: "By groups",
                        description: "Pack each group into a separate block with clear boundaries.",
                      },
                      {
                        id: "snowflake",
                        name: "Snowflake",
                        description:
                          "Cluster related tables around the most connected tables.",
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
                      disabled={arranging}
                      onClick={() => {
                        setArrangement(option.id);
                        void arrange(option.id);
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
                  Find tables, fields, storage, relationships, or groups
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

                      storage.units.flatMap(unit => [{ label: unit.name, id: storageNodeId(unit.id), kind: storageKinds[unit.kind].label }, ...unit.items.map(item => ({ label: unit.name + '.' + item.name, id: storageNodeId(unit.id), kind: storageKinds[unit.kind].item }))]),
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
              <AgentSetup
                endpoint={location.origin + "/api/mcp"}
                bundleName={bundles.find(b => b.id === activeBundle)?.name || "Shared diagrams"}
                bundleId={activeBundle}
                download={download}
              />
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
