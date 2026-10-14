import { createContext, useContext, useLayoutEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Expand, GripHorizontal, MessageSquare, X } from 'lucide-react';

type Note = { title: string; text: string };
const NoteContext = createContext<(note: Note) => void>(() => {});
const plugins = [remarkGfm];
export function MarkdownNote({ text }: { text: string }) {
  return <div className="note-markdown"><Markdown remarkPlugins={plugins} skipHtml components={{
    a: ({ node: _node, children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
    img: ({ node: _node, ...props }) => <img {...props} loading="lazy" />,
  }}>{text}</Markdown></div>;
}
export function NoteView({ text, title, icon, disabled = false }: Note & { icon?: ReactNode; disabled?: boolean }) {
  const show = useContext(NoteContext);
  const open = () => { if (!disabled) show({ title, text }); };
  return icon ? <button type="button" className="note-open note-indicator nodrag nopan" disabled={disabled} aria-label={'Open note for ' + title} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); open(); }}>{icon}</button>
    : <div className="note-preview" onClick={event => { event.stopPropagation(); if (!(event.target as HTMLElement).closest('a')) open(); }}>
      <MarkdownNote text={text} />
      <button type="button" className="note-expand" disabled={disabled} onClick={event => { event.stopPropagation(); open(); }}><Expand size={12} />Expand note</button>
    </div>;
}
export function NoteProvider({ children }: { children: ReactNode }) {
  const [note, setNote] = useState<Note | null>(null);
  return <NoteContext.Provider value={setNote}>{children}{note && <NoteWindow note={note} onClose={() => setNote(null)} />}</NoteContext.Provider>;
}
function NoteWindow({ note, onClose }: { note: Note; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [position, setPosition] = useState(() => ({ left: Math.max(16, (window.innerWidth - 720) / 2), top: Math.max(16, (window.innerHeight - 520) / 2) }));
  useLayoutEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return createPortal(<dialog ref={dialog} className="note-window" aria-labelledby={titleId} style={position} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="note-window-heading" onPointerDown={event => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
      const rect = dialog.current!.getBoundingClientRect();
      drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      if (!drag.current) return;
      const { x, y, left, top } = drag.current;
      const width = dialog.current!.getBoundingClientRect().width;
      setPosition({ left: Math.max(8, Math.min(window.innerWidth - width - 8, left + event.clientX - x)), top: Math.max(8, Math.min(window.innerHeight - 56, top + event.clientY - y)) });
    }} onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onLostPointerCapture={() => { drag.current = null; }}>
      <MessageSquare size={17} /><div><span>Note</span><h2 id={titleId}>{note.title}</h2></div><GripHorizontal size={16} className="note-drag-hint" />
      <button type="button" aria-label="Close note" onClick={onClose}><X size={18} /></button>
    </div>
    <div className="note-window-body"><MarkdownNote text={note.text} /></div>
    <div className="note-window-footer">Drag the header to move · Drag the bottom-right corner to resize</div>
  </dialog>, document.body);
}
