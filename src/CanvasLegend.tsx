import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BookOpen, ChevronDown, Grid2X2, KeyRound, Layers, Link2, Globe, LockKeyhole, ListFilter, MessageSquare, Settings, ShieldCheck, SlidersHorizontal, StickyNote, Table2, X } from 'lucide-react';
import { StorageIcon } from './StorageUI';

function CardinalitySymbol({ value }: { value: string }) {
  const many = value === '*' || value.endsWith('*') || value === '2..5', optional = value.startsWith('0..');
  return <svg viewBox="0 0 64 30" aria-hidden="true"><path d="M 4 20 H 56"/><path d={many ? 'M 54 15 L 44 20 L 54 25 M 44 20 H 54' : 'M 49 15 V 25'}/>{optional && <circle cx="38" cy="20" r="3"/>}{(value === '1..*' || value === '2..5') && <text x="4" y="12">{value}</text>}</svg>;
}
function LegendRow({ symbol, title, children }: { symbol: ReactNode; title: string; children?: ReactNode }) {
  return <div className="legend-row"><span className="legend-symbol">{symbol}</span><div><strong>{title}</strong>{children && <p>{children}</p>}</div></div>;
}
export function CanvasLegend() {
  const [open, setOpen] = useState(false);
  const id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  return <div className="canvas-legend nodrag nopan" ref={root}>
    <button ref={trigger} className="canvas-legend-trigger" aria-label="Diagram legend" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}><BookOpen size={14}/><span>Legend</span><ChevronDown size={12}/></button>
    {open && <section id={id} className="canvas-legend-menu" role="dialog" aria-label="Diagram legend">
      <div className="legend-heading"><div><h3>Diagram legend</h3><p>A guide to the symbols on your canvas.</p></div><button ref={close} aria-label="Close legend" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={15}/></button></div>
      <div className="legend-content" tabIndex={0} aria-label="Legend symbols">
        <h4>Relationship cardinality</h4><p className="legend-intro">Counts describe records at each end. For composite keys, they apply to the whole tuple.</p>
        <div className="legend-cardinalities">{[{value:'1',title:'One'},{value:'*',title:'Many'},{value:'0..1',title:'Zero or one'},{value:'0..*',title:'Zero or many'},{value:'1..*',title:'One or more'},{value:'2..5',title:'Bounded range'}].map(({value,title})=><div key={value}><CardinalitySymbol value={value}/><strong>{title}</strong><code>{value}</code></div>)}</div>
        <p className="legend-intro">Bar = one · crow’s foot = many · circle = optional. Numeric labels specify exact bounds; * has no upper bound.</p>
        <LegendRow symbol={<svg viewBox="0 0 32 20" aria-hidden="true"><path d="M 2 10 H 30"/></svg>} title="SQL relationship">Solid line connects a foreign key to its referenced key.</LegendRow>
        <LegendRow symbol={<svg viewBox="0 0 32 20" className="legend-storage-line" aria-hidden="true"><path d="M 2 10 H 29" strokeDasharray="4 3"/><path d="M 25 6 L 30 10 L 25 14"/></svg>} title="Storage connection">Dashed arrow links SQL and non-SQL systems. Two arrows mean flow in both directions.</LegendRow>
        <LegendRow symbol={<svg viewBox="0 0 32 20" className="legend-highlight-line" aria-hidden="true"><path d="M 2 10 H 30"/><circle className="legend-motion-dot" cx="4" cy="10" r="2"/></svg>} title="Highlighted relationship">Hover or selection animates an edge. Motion runs one → many, or both ways for matching endpoint kinds.</LegendRow>
        <LegendRow symbol={<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M 2 12 H 18 V 4 H 30 M 18 12 V 20 H 30"/></svg>} title="Shared cable trunk">Edges with the same attribute and cardinality stay together until their branches diverge.</LegendRow>
        <LegendRow symbol={<span className="legend-tuple">(a, b)</span>} title="Composite key">A tuple row groups multiple attributes into one key. Hover to see the column pairings.</LegendRow>
        <h4>Attribute markers</h4>
        <LegendRow symbol={<KeyRound size={15}/>} title="Primary key">Identifies a record; may be part of a composite primary key.</LegendRow>
        <LegendRow symbol={<Link2 size={15}/>} title="Foreign key">References another table’s key.</LegendRow>
        <LegendRow symbol={<span className="not-null-tag">NN</span>} title="Not null">This attribute requires a non-null value.</LegendRow>
        <LegendRow symbol={<ListFilter size={15} className="index-indicator"/>} title="Indexed attribute">Hover for index names, uniqueness and composite columns.</LegendRow>
        <LegendRow symbol={<ShieldCheck size={15} className="check-indicator"/>} title="Check constraint">Hover for allowed values, ranges and the original SQL condition.</LegendRow>
        <LegendRow symbol={<MessageSquare size={15}/>} title="Attached note">Hover the table or attribute to read its note.</LegendRow>
        <h4>Tables, stores & groups</h4>
        <LegendRow symbol={<Table2 size={15}/>} title="SQL table"/>
        <LegendRow symbol={<StorageIcon kind="blob"/>} title="Object / BLOB storage">Buckets describe files and object keys.</LegendRow>
        <LegendRow symbol={<StorageIcon kind="document"/>} title="Document store">Collections contain nested JSON documents.</LegendRow>
        <LegendRow symbol={<StorageIcon kind="kv"/>} title="Key-value store">Keyspaces map keys to values.</LegendRow>
        <LegendRow symbol={<StorageIcon kind="vector"/>} title="Vector database">Indexes define vector dimensions, similarity and metadata.</LegendRow>
        <LegendRow symbol={<span className="legend-bucket-access"><LockKeyhole size={12}/><Globe size={12}/></span>} title="Bucket visibility">Lock = private · globe = public. Describes the intended storage access policy.</LegendRow>
        <LegendRow symbol={<Layers size={15}/>} title="Table group">A colored boundary groups related tables. Click its title to focus it.</LegendRow>
        <LegendRow symbol={<StickyNote size={15}/>} title="Canvas note">A standalone note adds context to the diagram.</LegendRow>
        <h4>Object controls</h4>
        <LegendRow symbol={<Grid2X2 size={15}/>} title="Sample records">View and edit illustrative table or storage records.</LegendRow>
        <LegendRow symbol={<Settings size={15}/>} title="Appearance settings">Change table, relationship or group colors.</LegendRow>
        <LegendRow symbol={<SlidersHorizontal size={15}/>} title="Cardinality settings">Select an SQL edge to edit its endpoint bounds.</LegendRow>
      </div>
    </section>}
  </div>;
}
