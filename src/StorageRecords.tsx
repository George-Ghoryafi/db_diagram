import { useEffect, useState } from 'react';
import { Braces, Download, Pencil, Plus, X } from 'lucide-react';
import { SchemaTooltip } from './SchemaTooltip';
import { StorageIcon } from './StorageUI';
import { shapeFields, storageKinds, validateStorageRecords, type StorageUnit, type StorageRecord } from './storage-model';

export function StorageRecords({ unit, initialItem, onClose, onApply, download }: { unit: StorageUnit; initialItem?: string; onClose: () => void; onApply: (itemId: string, records: StorageRecord[]) => Promise<void>; download: (name: string, text: string) => void }) {
  const [itemId, setItemId] = useState(initialItem || unit.items[0]?.id || '');
  const item = unit.items.find(item => item.id === itemId);
  const [rows, setRows] = useState<StorageRecord[]>(item?.records || []);
  const [editing, setEditing] = useState(false), [json, setJson] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [expanded, setExpanded] = useState<number>();
  const kind = storageKinds[unit.kind];
  useEffect(() => { if (!editing) setRows(item?.records || []); }, [item?.records]);
  const columns = [...new Set([
    ...(unit.kind === 'blob' ? ['key', 'content_type', 'size_bytes'] : unit.kind === 'kv' ? ['key', 'value'] : unit.kind === 'vector' ? ['id', 'vector', 'metadata'] : shapeFields(item?.shape || '').filter(field => !field.depth).map(field => field.name)),
    ...rows.flatMap(row => Object.keys(row)),
  ])];
  const edit = () => { setJson(JSON.stringify(rows, null, 2)); setEditing(true); setError(''); };
  const add = () => {
    try {
      const current = editing ? JSON.parse(json) : rows;
      if (!Array.isArray(current)) throw new Error('Use a JSON array of records.');
      const record = unit.kind === 'blob' ? { key: '', content_type: '', size_bytes: 0 } : unit.kind === 'kv' ? { key: '', value: null } : unit.kind === 'vector' ? { id: '', vector: [0.1, 0.2, 0.3], metadata: {} } : {};
      setJson(JSON.stringify([...current, record], null, 2)); setEditing(true); setError('');
    } catch { setError('Fix the JSON array before adding another record.'); }
  };
  const apply = async () => {
    setBusy(true); setError('');
    try {
      let value: unknown;
      try { value = JSON.parse(json); } catch { throw new Error('Invalid JSON. Fix it before applying records.'); }
      if (!item) throw new Error('This storage item is no longer available. Reopen the records window.');
      const records = validateStorageRecords(unit.kind, item, value);
      await onApply(item.id, records); setRows(records); setEditing(false); setExpanded(undefined);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="modal records-modal storage-records-modal" role="dialog" aria-modal="true" aria-label={'Sample records for ' + unit.name}>
      <div className="records-heading"><span className="records-table-icon"><StorageIcon kind={unit.kind} size={20} /></span><div className="records-title"><h2>{unit.name}</h2><span>{kind.label} · sample records</span></div><button className="records-close" disabled={busy} aria-label="Close records" onClick={onClose}><X size={19} /></button></div>
      <div className="storage-records-item"><label>{kind.item}<select aria-label="Records storage item" value={itemId} disabled={editing || busy} onChange={event => { const next = unit.items.find(item => item.id === event.target.value); setItemId(event.target.value); setRows(next?.records || []); setExpanded(undefined); setError(''); }}>{unit.items.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{unit.kind === 'vector' && item && <span>{item.dimensions ? item.dimensions + ' dimensions · ' : ''}{item.metric || 'cosine'}</span>}</div>
      {item ? <><div className="records-toolbar"><span>{rows.length} {rows.length === 1 ? 'sample record' : 'sample records'}</span><div>{!editing && <button onClick={edit}><Pencil size={13} />Edit JSON</button>}<button disabled={busy} onClick={add}><Plus size={14} />Add record</button>{!editing && <button disabled={!rows.length} onClick={() => download(item.name + '.samples.json', JSON.stringify(rows, null, 2))}><Download size={13} />Download JSON</button>}{editing && <><button disabled={busy} onClick={() => { setRows(item.records || []); setEditing(false); setError(''); }}>Cancel</button><button className="primary" disabled={busy} onClick={() => void apply()}>{busy ? 'Applying…' : 'Apply records'}</button></>}</div></div>
        {editing ? <div className="storage-records-editor"><label htmlFor="storage-samples-json">Sample records JSON</label><textarea id="storage-samples-json" autoFocus spellCheck={false} value={json} onChange={event => setJson(event.target.value)} /><p>{unit.kind === 'document' ? 'Use an array of JSON documents. Nested objects, arrays, nulls and booleans retain their types.' : unit.kind === 'kv' ? 'Each object needs a unique key and a JSON value. Values may be objects, arrays, strings, numbers, booleans or null.' : unit.kind === 'vector' ? 'Each object needs a unique id and a numeric vector matching the index dimensions. Optional metadata can be any JSON value.' : 'Describe sample objects using key, content_type, size_bytes and optional metadata. No files are uploaded.'}</p></div> : rows.length ? <div className="records-grid"><table><thead><tr><th>#</th>{columns.map(column => <th key={column}>{column}</th>)}<th /></tr></thead><tbody>{rows.map((row, index) => <StorageRecordRow key={index} row={row} index={index} columns={columns} expanded={expanded === index} onExpand={() => setExpanded(expanded === index ? undefined : index)} />)}</tbody></table></div> : <div className="records-empty"><Braces size={25} /><strong>No sample records yet</strong><p>Illustrate the contents of this {kind.item.toLowerCase()}.</p><button className="primary" onClick={add}><Plus size={14} />Add record</button></div>}
      </> : <div className="records-empty"><strong>No {kind.plural} defined</strong><p>Add a {kind.item.toLowerCase()} in the storage editor first.</p></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="records-edit-hint">Sample data documents your design. Apply changes, then save the diagram.</div>
    </section>
  </div>;
}
function StorageRecordRow({ row, index, columns, expanded, onExpand }: { row: StorageRecord; index: number; columns: string[]; expanded: boolean; onExpand: () => void }) {
  return <><tr><td className="records-row-number">{index + 1}</td>{columns.map(column => {
    const value = row[column], present = Object.hasOwn(row, column);
    const text = !present ? '(missing)' : value === null ? '(null)' : typeof value === 'object' ? Array.isArray(value) ? `[${value.length} items]` : '{…}' : value === '' ? '(empty string)' : String(value);
    return <td key={column}>{value !== null && typeof value === 'object' || text.length > 90 ? <SchemaTooltip heading={<b>{column}</b>} content={<pre>{JSON.stringify(value, null, 2)}</pre>}><span className="storage-record-value">{text}</span></SchemaTooltip> : present && value !== null && value !== '' ? text : <em>{text}</em>}</td>;
  })}<td><button aria-label={'View record ' + (index + 1) + ' JSON'} aria-expanded={expanded} onClick={onExpand}><Braces size={14} /></button></td></tr>{expanded && <tr><td colSpan={columns.length + 2}><pre className="storage-record-json">{JSON.stringify(row, null, 2)}</pre></td></tr>}</>;
}
