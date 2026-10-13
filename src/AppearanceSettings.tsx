import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings } from 'lucide-react';

const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#d35400', '#c0392b', '#16a085', '#2c3e50', '#f1c40f', '#27ae60', '#8e44ad', '#2980b9', '#e84393'];

export function AppearanceSettings({ label, color, onApply }: { label: string; color: string; onApply: (color: string) => Promise<void> }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0 });
  const [value, setValue] = useState(color), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !popup.current) return;
    const anchor = trigger.current.getBoundingClientRect(), box = popup.current.getBoundingClientRect();
    const left = anchor.right + 8 + box.width <= window.innerWidth - 12 ? anchor.right + 8 : anchor.left - box.width - 8;
    setPosition({ left: Math.max(12, left), top: Math.max(12, Math.min(anchor.top, window.innerHeight - box.height - 12)) });
  }, [open, error]);
  useEffect(() => {
    if (!open) return;
    popup.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (e: PointerEvent) => { if (!trigger.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    const moved = () => setOpen(false);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', moved);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); window.removeEventListener('resize', moved); };
  }, [open]);
  return <>
    <button ref={trigger} type="button" className="appearance-trigger nodrag nopan" aria-label={label + ' settings'} title={label + ' settings'} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setValue(color); setError(''); setOpen(!open); }}><Settings size={15} /></button>
    {open && createPortal(<div ref={popup} id={id} role="dialog" className="appearance-settings nodrag nopan" aria-label={label + ' settings'} style={position} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <form onSubmit={async e => {
        e.preventDefault();
        setBusy(true); setError('');
        try { await onApply(value); setOpen(false); }
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
    </div>, document.body)}
  </>;
}
