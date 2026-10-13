import { useState } from 'react';
import { Download, Pencil, Plus, X, KeyRound, Table2, ArrowLeftRight } from 'lucide-react';
import { SchemaTooltip } from './SchemaTooltip';
import { recordLiteral } from './dbml-edit';

export type RecordData = { columns: string[]; example: boolean; rows: { value: string | number | boolean | null; type: string; literal: string }[][] };
type Field = { name: string; type: string; pk?: boolean; unique?: boolean; not_null?: boolean; note?: string };
type Table = { id: string; name: string; schema: string; fields: Field[]; indexes: any[]; records?: RecordData | null };
type Ref = { fromTable: string; fromFields: string[]; toTable: string; toFields: string[] };

export function TableRecords({ table, refs, onClose, onApply }: { table: Table; refs: Ref[]; onClose: () => void; onApply: (columns: string[], rows: string[][]) => Promise<void> }) {
  const columns = table.records?.columns || table.fields.map(f => f.name);
  const initial = () => table.records?.rows.map(row => row.map(cell => ({ value: cell.value == null ? '' : cell.type === 'expression' ? '`' + cell.value + '`' : String(cell.value), literal: cell.literal }))) || [];
  const [rows, setRows] = useState(initial), [editing, setEditing] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const addRow = () => { setEditing(true); setRows([...rows, columns.map(() => ({ value: '', literal: '' }))]); };
  const applyRows = async () => {
    setBusy(true); setError('');
    try { await onApply(columns, rows.map(row => row.map((cell, i) => cell.literal || recordLiteral(cell.value, table.fields.find(f => f.name === columns[i])!.type)))); setEditing(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const primary = new Set([...table.fields.filter(f => f.pk).map(f => f.name), ...table.indexes.filter(i => i.pk).flatMap(i => i.columns.filter((c: any) => c.type === 'column').map((c: any) => c.value))]);
  const download = () => {
    const csv = [columns, ...rows.map(row => row.map(c => c.value))].map(row => row.map(value => '"' + value.replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = table.name + '.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="modal records-modal" role="dialog" aria-modal="true" aria-label={'Records for ' + table.id}>
      <div className="records-heading"><span className="records-table-icon"><Table2 size={19} /></span><div className="records-title"><h2>{table.id}</h2><span>Table records</span></div>
        <button className="records-close" aria-label="Close records" onClick={onClose}><X size={19} /></button>
      </div>
      {(rows.length > 0 || editing) && <div className="records-toolbar">
        <span>{rows.length} {rows.length === 1 ? 'record' : 'records'}</span>
        <div>{!editing && <button onClick={() => { setRows(initial()); setEditing(true); setError(''); }}><Pencil size={13} /> Edit</button>}
        <button onClick={addRow} disabled={busy}><Plus size={14} /> Add row</button>
        {!editing && <button onClick={download}><Download size={13} /> Download CSV</button>}
        {editing && <><button disabled={busy} onClick={() => { setRows(initial()); setEditing(false); setError(''); }}>Cancel</button><button className="primary" disabled={busy} onClick={applyRows}>{busy ? 'Applying…' : 'Apply records'}</button></>}</div>
      </div>}
      <div className="records-grid"><table><thead><tr><th>#</th>{columns.map(column => {
        const field = table.fields.find(f => f.name === column)!;
        const related = refs.flatMap(r => [
          ...(r.fromTable === table.id && r.fromFields.includes(column) ? r.toFields.map(f => r.toTable + '.' + f) : []),
          ...(r.toTable === table.id && r.toFields.includes(column) ? r.fromFields.map(f => r.fromTable + '.' + f) : []),
        ]);
        return <th key={column}><SchemaTooltip heading={<b>{column}</b>} content={<>{primary.has(column) && <strong>Primary key</strong>}{field.not_null && <strong>Not null</strong>}{field.unique && <strong>Unique</strong>}{related.length > 0 && <><strong>Related columns</strong>{related.map(r => <code key={r}>{r}</code>)}</>}{field.note && <><strong>Note</strong><p>{field.note}</p></>}</>}><span className="records-column-name">{column}{primary.has(column) && <KeyRound size={12} />}{related.length > 0 && <ArrowLeftRight size={13} />}</span><span className="records-column-type">{field.type}</span></SchemaTooltip></th>;
      })}{editing && <th />}</tr></thead><tbody>{rows.map((row, ri) => <tr key={ri}><td className="records-row-number">{ri + 1}</td>{row.map((cell, ci) => <td key={columns[ci]}>{editing ? <input aria-label={`Row ${ri + 1} ${columns[ci]}`} value={cell.value} placeholder="NULL" onChange={e => setRows(rows.map((r, i) => i === ri ? r.map((c, j) => j === ci ? { value: e.target.value, literal: '' } : c) : r))} /> : cell.value === '' && cell.literal !== "''" ? <em>(null)</em> : cell.value}</td>)}{editing && <td><button aria-label={'Remove row ' + (ri + 1)} onClick={() => setRows(rows.filter((_, i) => i !== ri))}><X size={12} /></button></td>}</tr>)}</tbody></table></div>
      {!rows.length && !editing && <div className="records-empty"><Table2 size={25}/><strong>No records yet</strong><p>Add a sample row to illustrate this table.</p><button className="primary" onClick={addRow}><Plus size={14}/> Add row</button></div>}
      {editing && <div className="records-edit-hint">Empty cells are NULL. Apply changes, then save your diagram.</div>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  </div>;
}
