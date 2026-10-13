import { useState, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Archive, Braces, KeyRound, LockKeyhole, Globe, Plus, Pencil, Link2, Trash2, X, ArrowRight, Info, Grid2X2, Waypoints } from 'lucide-react';
import { SchemaTooltip } from './SchemaTooltip';
import { shapeFields, storageKinds, storageNodeId, storagePorts, storageLinkIssue, type StorageUnit, type StorageItem, type StorageModel, type StorageLink, type StorageTable } from './storage-model';

export function StorageIcon({ kind, size = 16 }: { kind: StorageUnit['kind']; size?: number }) {
  const Icon = kind === 'blob' ? Archive : kind === 'document' ? Braces : kind === 'vector' ? Waypoints : KeyRound;
  return <Icon size={size} aria-hidden="true" />;
}
function StorageHandles({ port }: { port: string }) {
  return <><Handle type="source" position={Position.Right} id={port + '-out'} /><Handle type="source" position={Position.Left} id={port + '-out-left'} /><Handle type="target" position={Position.Left} id={port + '-in'} /><Handle type="target" position={Position.Right} id={port + '-in-right'} /></>;
}
export function StorageNode({ id, data, selected }: NodeProps) {
  const unit = data.unit as StorageUnit, kind = storageKinds[unit.kind];
  const updateInternals = useUpdateNodeInternals();
  useEffect(() => { const frame = requestAnimationFrame(() => updateInternals(id)); return () => cancelAnimationFrame(frame); }, [id, unit, data.detail, updateInternals]);
  return <div className={'storage-node' + (selected ? ' selected' : '')} style={{ '--storage-color': kind.color } as React.CSSProperties}>
    <div className="storage-node-heading">
      <StorageIcon kind={unit.kind} size={19} /><div><strong title={unit.name}>{unit.name}</strong><span>{unit.provider || kind.label}</span></div>
      <button className="nodrag nopan" aria-label={'Sample records for ' + unit.name} title="Sample records" onClick={event => { event.stopPropagation(); (data.onRecords as (item?: string) => void)(); }}><Grid2X2 size={14} /></button>
      <button className="nodrag nopan" aria-label={'Edit ' + unit.name} onClick={event => { event.stopPropagation(); (data.onEdit as () => void)(); }}><Pencil size={13} /></button>
      <StorageHandles port="header" />
    </div>
    <div className="storage-node-kind">{kind.label}</div>
    {data.detail !== 'names' && unit.items.map(item => <div key={item.id}>
      <SchemaTooltip heading={<><StorageIcon kind={unit.kind} /><b>{item.name}</b></>} content={<>
        <strong>{kind.item}</strong>{item.note && <p>{item.note}</p>}
        {unit.kind === 'blob' && <p>{item.access === 'private' ? 'Private bucket' : 'Public bucket'}{item.contentType && ' · ' + item.contentType}</p>}
        {item.keyPattern && <><strong>Key pattern</strong><code>{item.keyPattern}</code></>}
        {item.ttl && <p>TTL: {item.ttl}</p>}
        {item.shape && <><strong>Document / value shape</strong><pre>{item.shape}</pre></>}
      </>}>
        <div className="storage-item-row" onPointerEnter={() => (data.onPortHover as (port: string | null) => void)(item.id)} onPointerLeave={() => (data.onPortHover as (port: string | null) => void)(null)}>
          <StorageHandles port={item.id} /><StorageIcon kind={unit.kind} size={13} /><b>{item.name}</b>
          {unit.kind === 'blob' ? <span className="storage-access" title={item.access + ' bucket'}>{item.access === 'private' ? <LockKeyhole size={11} /> : <Globe size={11} />}{item.access}</span> : <code>{unit.kind === 'document' ? 'document' : unit.kind === 'vector' ? `${item.dimensions || '?'}D · ${item.metric || 'cosine'}` : 'key → value'}</code>}
          <button className="storage-item-records nodrag nopan" aria-label={'Sample records for ' + item.name} title={`${(item.records || []).length} sample records`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); (data.onRecords as (item?: string) => void)(item.id); }}><Grid2X2 size={12} /></button>
        </div>
      </SchemaTooltip>
      {item.keyPattern && <div className="storage-pattern-row" title={item.keyPattern}><KeyRound size={10} /><code>{item.keyPattern}</code>{unit.kind === 'kv' && item.ttl && <span>{item.ttl}</span>}</div>}
      {shapeFields(item.shape).map(field => <div key={field.path} className="storage-field-row" style={{ paddingLeft: 16 + field.depth * 12 }} onPointerEnter={() => (data.onPortHover as (port: string | null) => void)(item.id + '/' + field.path)} onPointerLeave={() => (data.onPortHover as (port: string | null) => void)(null)}>
        <StorageHandles port={item.id + '/' + field.path} /><span title={field.path}>{field.name}</span><code>{field.type}</code>
      </div>)}
    </div>)}
    <div className="storage-node-footer"><span>{unit.items.length} {unit.items.length === 1 ? kind.item.toLowerCase() : kind.plural}</span>{unit.note && <SchemaTooltip heading={<b>{unit.name}</b>} content={<p>{unit.note}</p>}><Info size={12} /></SchemaTooltip>}</div>
  </div>;
}

type PanelProps = { model: StorageModel; tables: StorageTable[]; onRecords: (unit: StorageUnit, itemId?: string) => void; onCreate: () => void; onEdit: (unit: StorageUnit) => void; onFocus: (id: string) => void; onLink: (link?: StorageLink) => void; onDeleteLink: (id: string) => void };
export function StoragePanel(props: PanelProps) {
  const [query, setQuery] = useState('');
  return <div className="storage-panel explorer">
    <div className="explorer-title"><h2>Storage</h2><button onClick={props.onCreate}><Plus size={14} />Add store</button></div>
    <p className="storage-intro">Model the systems around your SQL database.</p>
    <input className="storage-search" aria-label="Search storage" placeholder="Search stores and collections…" value={query} onChange={event => setQuery(event.target.value)} />
    {!props.model.units.length && <div className="storage-empty"><Archive size={28} /><h3>Beyond tables</h3><p>Map object buckets, document collections, key-value stores and vector indexes on the same canvas.</p><button onClick={props.onCreate}><Plus size={14} />Add your first store</button></div>}
    {props.model.units.filter(unit => (unit.name + ' ' + unit.provider + ' ' + unit.items.map(item => item.name).join(' ')).toLowerCase().includes(query.toLowerCase())).map(unit => <section className="storage-explorer-card" key={unit.id}>
      <div><button className="storage-store-name" onClick={() => props.onFocus(storageNodeId(unit.id))}><StorageIcon kind={unit.kind} /><b>{unit.name}</b></button><button aria-label={'Edit ' + unit.name} onClick={() => props.onEdit(unit)}><Pencil size={13} /></button></div>
      <small>{unit.provider || storageKinds[unit.kind].label} · {unit.items.length} {unit.items.length === 1 ? storageKinds[unit.kind].item.toLowerCase() : storageKinds[unit.kind].plural}</small>
      {unit.items.map(item => <div key={item.id} className="storage-explorer-item-line"><button className="storage-explorer-item" onClick={() => props.onFocus(storageNodeId(unit.id))}><StorageIcon kind={unit.kind} size={12} /><span>{item.name}</span>{unit.kind === 'blob' && <small>{item.access}</small>}</button><button aria-label={'Sample records for ' + item.name} title={`${(item.records || []).length} sample records`} onClick={() => props.onRecords(unit, item.id)}><Grid2X2 size={13} /></button></div>)}
    </section>)}
    {!!props.model.units.length && <><div className="explorer-title storage-connections-heading"><h3>Connections</h3><button onClick={() => props.onLink()}><Plus size={13} />Connect</button></div>
      {!props.model.links.length && <p className="storage-intro">Link a SQL column to an object key, document field, cache keyspace or vector index.</p>}
      {props.model.links.map(link => { const issue = storageLinkIssue(link, props.model.units, props.tables); const name = (node: string) => props.model.units.find(unit => storageNodeId(unit.id) === node)?.name || node; return <div className={'storage-link-card' + (issue ? ' broken' : '')} key={link.id}>
        <button onClick={() => props.onLink(link)}><Link2 size={13} /><b>{link.label || link.kind}</b><span>{name(link.from.node)}<ArrowRight size={11} />{name(link.to.node)}</span>{issue && <small>{issue}</small>}</button>
        <button aria-label={'Remove connection ' + (link.label || link.kind)} onClick={() => props.onDeleteLink(link.id)}><X size={13} /></button>
      </div>; })}</>}
    <details className="storage-format-help"><summary>DBML & agent compatibility</summary><p>Storage definitions live in a <code>@schemadb-storage</code> JSON comment. DBML export and MCP preserve them; SQL export includes SQL tables only. Other DBML tools ignore this comment.</p><p>Ask your agent to read_schema, then use write_storage with the current revision and updated model.storage. SQL definitions remain intact.</p></details>
  </div>;
}

const blankItem = (): StorageItem => ({ id: crypto.randomUUID(), name: '', note: '', access: 'private', keyPattern: '', contentType: '', ttl: '', shape: '', records: [] });
export function StorageEditor({ unit, onSave, onDelete, onClose }: { unit?: StorageUnit; onSave: (unit: StorageUnit) => Promise<void>; onDelete: (id: string) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState<StorageUnit>(unit || { id: crypto.randomUUID(), name: '', kind: 'blob', provider: '', note: '', items: [blankItem()] });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [deleting, setDeleting] = useState(false);
  const kind = storageKinds[draft.kind];
  const updateItem = (id: string, patch: Partial<StorageItem>) => setDraft(value => ({ ...value, items: value.items.map(item => item.id === id ? { ...item, ...patch } : item) }));
  const submit = async () => { setBusy(true); setError(''); try { await onSave(draft); onClose(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } };
  return <div className="storage-edit-form">
    <p className="storage-intro">Describe your storage schema and its contents. This creates a diagram definition.</p>
    <div className="storage-kind-options">{Object.entries(storageKinds).map(([value, config]) => <button key={value} type="button" aria-pressed={draft.kind === value} disabled={!!unit} onClick={() => setDraft(previous => ({ ...previous, kind: value as StorageUnit['kind'] }))}><StorageIcon kind={value as StorageUnit['kind']} size={20} /><span>{config.label}</span></button>)}</div>
    <div className="storage-form-grid"><label>Store name<input autoFocus value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder={draft.kind === 'blob' ? 'Application files' : draft.kind === 'document' ? 'Enrichment database' : 'Application cache'} /></label><label>Provider / technology<input value={draft.provider} onChange={event => setDraft({ ...draft, provider: event.target.value })} placeholder={draft.kind === 'blob' ? 'S3, Azure Blob, Supabase…' : draft.kind === 'document' ? 'MongoDB, Firestore, Cosmos DB…' : draft.kind === 'vector' ? 'Pinecone, Qdrant, Weaviate…' : 'Redis, DynamoDB…'} /></label></div>
    <label>Purpose<textarea rows={2} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} placeholder="What does this store hold?" /></label>
    <div className="storage-items-heading"><h3>{kind.plural[0].toUpperCase() + kind.plural.slice(1)}</h3><button onClick={() => setDraft({ ...draft, items: [...draft.items, blankItem()] })}><Plus size={13} />Add {kind.item.toLowerCase()}</button></div>
    {draft.items.map((item, index) => <fieldset className="storage-item-form" key={item.id}><legend>{kind.item} {index + 1}</legend>
      <div className="storage-item-form-heading"><label>{kind.item} name<input aria-label={kind.item + ' name ' + (index + 1)} value={item.name} onChange={event => updateItem(item.id, { name: event.target.value })} placeholder={draft.kind === 'blob' ? 'documents-private' : draft.kind === 'document' ? 'document_summaries' : 'document:summary:*'} /></label><button aria-label={'Remove ' + kind.item.toLowerCase() + ' ' + (index + 1)} onClick={() => setDraft({ ...draft, items: draft.items.filter(current => current.id !== item.id) })}><Trash2 size={14} /></button></div>
      <div className="storage-form-grid"><label>{draft.kind === 'blob' ? 'Object key pattern' : draft.kind === 'kv' ? 'Key pattern' : draft.kind === 'vector' ? 'Vector ID pattern' : 'Document ID pattern'}<input value={item.keyPattern} onChange={event => updateItem(item.id, { keyPattern: event.target.value })} placeholder={draft.kind === 'blob' ? '{org_id}/{document_id}/{version_id}.pdf' : '{document_id}'} /></label>
      {draft.kind === 'blob' ? <label>Access<select value={item.access} onChange={event => updateItem(item.id, { access: event.target.value as StorageItem['access'] })}><option value="private">Private</option><option value="public">Public</option></select></label> : <label>TTL / retention<input value={item.ttl} onChange={event => updateItem(item.id, { ttl: event.target.value })} placeholder="Permanent, 24 hours…" /></label>}</div>
      {draft.kind === 'blob' ? <label>Object types<input value={item.contentType} onChange={event => updateItem(item.id, { contentType: event.target.value })} placeholder="application/pdf, image/*" /></label> : <label>{draft.kind === 'document' ? 'Document structure' : draft.kind === 'vector' ? 'Metadata structure' : 'Value structure'}<textarea className="storage-shape-input" rows={5} value={item.shape} onChange={event => updateItem(item.id, { shape: event.target.value })} placeholder={'{\n  "document_id": "uuid",\n  "summary": "string",\n  "metadata": { "language": "string" }\n}'} /><small>Use a JSON field map or JSON Schema. Nested objects and arrays appear on the canvas.</small></label>}
      {draft.kind === 'vector' && <div className="storage-form-grid"><label>Dimensions<input type="number" min={1} step={1} value={item.dimensions ?? ''} placeholder="1536" onChange={event => updateItem(item.id, { dimensions: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><label>Similarity metric<select value={item.metric || 'cosine'} onChange={event => updateItem(item.id, { metric: event.target.value as StorageItem['metric'] })}><option value="cosine">Cosine</option><option value="dot">Dot product</option><option value="euclidean">Euclidean</option></select></label></div>}
      <label>{kind.item} purpose<input value={item.note} onChange={event => updateItem(item.id, { note: event.target.value })} placeholder="Describe what belongs here…" /></label>
    </fieldset>)}
    {error && <p className="storage-form-error" role="alert">{error}</p>}
    <div className="storage-form-actions">{unit && <button className="storage-delete" disabled={busy} onClick={async () => { if (!deleting) { setDeleting(true); return; } setBusy(true); try { await onDelete(unit.id); onClose(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>{deleting ? 'Confirm remove store and its links' : 'Remove store'}</button>}<button onClick={onClose} disabled={busy}>Cancel</button><button className="primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Applying…' : unit ? 'Apply changes' : 'Add store'}</button></div>
  </div>;
}

export function StorageLinkEditor({ link, model, tables, onSave, onClose }: { link?: StorageLink; model: StorageModel; tables: StorageTable[]; onSave: (link: StorageLink) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState<StorageLink>(link || { id: crypto.randomUUID(), from: { node: tables[0]?.id || storageNodeId(model.units[0].id), port: '' }, to: { node: storageNodeId(model.units[0].id), port: model.units[0].items[0]?.id || '' }, kind: 'reference', label: '', direction: 'forward' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const nodes = [...tables.map(table => ({ id: table.id, name: table.id, ports: table.fields.map(field => ({ port: field.name, label: field.name })) })), ...model.units.map(unit => ({ id: storageNodeId(unit.id), name: unit.name, ports: storagePorts(unit) }))];
  return <div className="storage-edit-form"><p className="storage-intro">Connect a SQL column, bucket, collection field, or keyspace. These are application relationships, independent of SQL foreign keys.</p>
    {(['from', 'to'] as const).map(side => <div key={side} className="storage-endpoint-form"><h3>{side === 'from' ? 'Source' : 'Destination'}</h3><div className="storage-form-grid"><label>Table / store<select aria-label={side + ' node'} value={draft[side].node} onChange={event => setDraft({ ...draft, [side]: { node: event.target.value, port: '' } })}>{!nodes.some(node => node.id === draft[side].node) && <option value={draft[side].node}>{draft[side].node} (missing)</option>}{nodes.map(node => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label><label>Column / storage item<select aria-label={side + ' port'} value={draft[side].port} onChange={event => setDraft({ ...draft, [side]: { ...draft[side], port: event.target.value } })}><option value="">Whole table / store</option>{draft[side].port && !nodes.find(node => node.id === draft[side].node)?.ports.some(port => port.port === draft[side].port) && <option value={draft[side].port}>{draft[side].port} (missing)</option>}{nodes.find(node => node.id === draft[side].node)?.ports.map(port => <option key={port.port} value={port.port}>{port.label}</option>)}</select></label></div></div>)}
    <div className="storage-form-grid"><label>Connection type<select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as StorageLink['kind'] })}><option value="reference">Object / document reference</option><option value="sync">Synchronization</option><option value="cache">Cache / derived data</option><option value="flow">Data flow</option></select></label><label>Direction<select value={draft.direction} onChange={event => setDraft({ ...draft, direction: event.target.value as StorageLink['direction'] })}><option value="forward">Source → destination</option><option value="both">Bidirectional</option></select></label></div>
    <label>Label<input autoFocus value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} placeholder="object_key locates the original file" /></label>
    {error && <p role="alert" className="storage-form-error">{error}</p>}<div className="storage-form-actions"><button disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const issue = storageLinkIssue(draft, model.units, tables); if (issue) throw new Error(issue); if (!model.units.some(unit => [draft.from.node, draft.to.node].includes(storageNodeId(unit.id)))) throw new Error('Choose a storage endpoint. Use DBML Ref for SQL foreign keys.'); await onSave(draft); onClose(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>{busy ? 'Applying…' : 'Apply connection'}</button></div>
  </div>;
}
