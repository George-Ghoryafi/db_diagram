import { useId, useState } from 'react';
import { Settings } from 'lucide-react';

const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#d35400', '#c0392b', '#16a085', '#2c3e50', '#f1c40f', '#27ae60', '#8e44ad', '#2980b9', '#e84393'];

export function AppearanceSettings({ label, color, onApply }: { label: string; color: string; onApply: (color: string) => Promise<void> }) {
  const id = useId();
  const [value, setValue] = useState(color), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <>
    <button aria-label={label + ' settings'} title={label + ' settings'} popoverTarget={id} onClick={() => { setValue(color); setError(''); }}><Settings size={15} /></button>
    <div id={id} popover="auto" className="appearance-settings" aria-label={label + ' settings'}>
      <form onSubmit={async e => {
        e.preventDefault();
        const popup = e.currentTarget.closest<HTMLElement>('[popover]');
        setBusy(true); setError('');
        try { await onApply(value); popup?.hidePopover(); }
        catch (e) { setError((e as Error).message); }
        finally { setBusy(false); }
      }}>
        <strong>{label}</strong>
        <div className="appearance-swatches">{colors.map(color => <button key={color} type="button" aria-label={'Color ' + color} aria-pressed={value.toLowerCase() === color} style={{ background: color }} onClick={() => setValue(color)} />)}</div>
        <label>Custom hex color<input aria-label="Custom hex color" value={value} onChange={e => setValue(e.target.value)} pattern="#[0-9a-fA-F]{6}" required /></label>
        <div className="appearance-preview" style={{ background: value }} aria-label="Color preview" />
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy} type="submit">{busy ? 'Applying…' : 'Apply color'}</button>
        <small>Saved in DBML. Save the diagram to persist.</small>
      </form>
    </div>
  </>;
}
