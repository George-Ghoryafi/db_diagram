import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FolderOpen,
  Plus,
  Search,
  Table2,
  ArrowRightLeft,
} from "lucide-react";
import type { Bundle } from "./bundles";

type Diagram = { id: string; name: string; bundle_id?: string };
type Props = {
  bundles: Bundle[];
  diagrams: Diagram[];
  bundleId: string;
  diagramId?: string;
  onBundle: (id: string) => void;
  onDiagram: (id: string) => Promise<void>;
  onNewBundle: () => void;
  onNewDiagram: () => void;
  onMove: () => void;
  onOpen: () => void;
};
export function DiagramPicker(props: Props) {
  const popover = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const bundle =
    props.bundles.find((b) => b.id === props.bundleId) || props.bundles[0];
  const selected = props.diagrams.find((d) => d.id === props.diagramId);
  useEffect(() => {
    if (open) {
      setQuery("");
      searchInput.current?.focus();
      props.onOpen();
    }
  }, [open]);
  const close = () => popover.current?.hidePopover();
  const diagrams = props.diagrams.filter(
    (d) =>
      (d.bundle_id || "shared") === props.bundleId &&
      d.name.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()),
  );
  return (
    <>
      <button
        className="workspace-picker-trigger"
        aria-label="Choose bundle and diagram"
        aria-expanded={open}
        aria-haspopup="dialog"
        popoverTarget="diagram-picker"
      >
        <span className="bundle-avatar" style={{ background: bundle?.color }}>
          {bundle?.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="picker-breadcrumb">
          <span>{bundle?.name || "Shared diagrams"}</span>
          <b>{selected?.name || "Choose a diagram"}</b>
        </span>
        <ChevronDown size={14} />
      </button>
      <div
        id="diagram-picker"
        ref={popover}
        popover="auto"
        className="diagram-picker"
        role="dialog"
        aria-label="Bundle and diagram navigator"
        onToggle={(e) =>
          setOpen((e.nativeEvent as ToggleEvent).newState === "open")
        }
      >
        <div className="bundle-list">
          <div className="picker-section-heading">
            <span>Bundles</span>
            <button
              title="New bundle"
              aria-label="New bundle"
              onClick={() => {
                close();
                props.onNewBundle();
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="bundle-list-scroll">
            {props.bundles.map((b) => (
              <button
                key={b.id}
                className={
                  "bundle-choice" + (b.id === props.bundleId ? " active" : "")
                }
                onClick={() => props.onBundle(b.id)}
                style={
                  b.id === props.bundleId
                    ? { background: b.color + "18" }
                    : undefined
                }
                aria-pressed={b.id === props.bundleId}
              >
                <span className="bundle-avatar" style={{ background: b.color }}>
                  {b.name.slice(0, 1).toUpperCase()}
                </span>
                <span>{b.name}</span>
                <small>
                  {
                    props.diagrams.filter(
                      (d) => (d.bundle_id || "shared") === b.id,
                    ).length
                  }
                </small>
              </button>
            ))}
          </div>
          <div className="bundle-list-footer">
            <FolderOpen size={13} />
            {props.diagrams.length}{" "}
            {props.diagrams.length === 1 ? "diagram" : "diagrams"} across{" "}
            {props.bundles.length}{" "}
            {props.bundles.length === 1 ? "bundle" : "bundles"}
          </div>
        </div>
        <div className="diagram-list">
          <label className="picker-search">
            <Search size={16} />
            <input
              ref={searchInput}
              placeholder="Find a diagram…"
              aria-label="Find a diagram"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="diagram-list-heading">
            <span>
              <i style={{ background: bundle?.color }} />
              {bundle?.name}
            </span>
            <button
              aria-label="New diagram in this bundle"
              title="New diagram"
              onClick={() => {
                close();
                props.onNewDiagram();
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="diagram-list-scroll">
            {diagrams.map((d) => (
              <button
                key={d.id}
                className={
                  "diagram-choice" + (d.id === props.diagramId ? " active" : "")
                }
                onClick={() => {
                  void props.onDiagram(d.id).then(close);
                }}
              >
                <Table2 size={18} />
                <span>{d.name}</span>
                {d.id === props.diagramId && <Check size={15} />}
              </button>
            ))}
            {!diagrams.length && (
              <div className="picker-empty">
                <FolderOpen size={28} />
                <b>{query ? "No matches" : "Your next idea starts here"}</b>
                <span>
                  {query
                    ? "Try another diagram name."
                    : "Create a diagram in this bundle."}
                </span>
                {!query && (
                  <button
                    onClick={() => {
                      close();
                      props.onNewDiagram();
                    }}
                  >
                    <Plus size={14} />
                    New diagram
                  </button>
                )}
              </div>
            )}
          </div>
          {selected && (
            <button
              className="move-diagram"
              onClick={() => {
                close();
                props.onMove();
              }}
            >
              <ArrowRightLeft size={14} />
              Move current diagram to another bundle
            </button>
          )}
        </div>
      </div>
    </>
  );
}
