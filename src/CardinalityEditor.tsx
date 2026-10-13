import { useState } from 'react';
import { parseCardinality } from './cardinality';
export function CardinalityEditor({ fromLabel, toLabel, relation, onApply }: { fromLabel: string; toLabel: string; relation: string; onApply: (from: string, to: string) => Promise<void> }) {
  const [from, setFrom] = useState(relation.split(':')[0]), [to, setTo] = useState(relation.split(':')[1]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <form className="cardinality-form" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { parseCardinality(from); parseCardinality(to); await onApply(from, to); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>
    <p>Define how many records may participate at each end of this relationship.</p>
    <div className="cardinality-endpoints">{[{ label: fromLabel, value: from, set: setFrom }, { label: toLabel, value: to, set: setTo }].map((endpoint, index) => <label key={index}><b>{endpoint.label}</b><input aria-label={index ? 'Target cardinality' : 'Source cardinality'} value={endpoint.value} onChange={event => endpoint.set(event.target.value)} required /><div className="cardinality-presets">{['1', '0..1', '0..*', '1..*'].map(value => <button key={value} type="button" aria-pressed={endpoint.value === value} onClick={() => endpoint.set(value)}>{value}</button>)}</div></label>)}</div>
    <small>Use 1 for exactly one, 0..1 for optional, or a custom range such as 2..5. * means no upper bound.</small>
    <p className="cardinality-hint">Optional relationships use native DBML syntax. Numeric bounds are stored in a portable schemaDB comment; they document the design and do not create SQL enforcement.</p>
    {error && <p role="alert" className="error">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Applying…' : 'Apply cardinality'}</button>
  </form>;
}
