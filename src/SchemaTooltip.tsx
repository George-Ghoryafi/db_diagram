import {useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
type Props={children:ReactNode;heading:ReactNode;content:ReactNode;disabled?:boolean};
export function SchemaTooltip({children,heading,content,disabled=false}:Props){
 const id=useId(),anchor=useRef<HTMLSpanElement>(null),popup=useRef<HTMLDivElement>(null);
 const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
 const [position,setPosition]=useState({left:0,top:0});
 const closeTimer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const enter=()=>{clearTimeout(closeTimer.current);if(!disabled)setHovered(true);};
 const leave=()=>{clearTimeout(closeTimer.current);closeTimer.current=setTimeout(()=>setHovered(false),140);};
 useEffect(()=>()=>clearTimeout(closeTimer.current),[]);
 const open=!disabled&&(hovered||focused);
 useEffect(()=>{if(disabled){clearTimeout(closeTimer.current);setHovered(false);setFocused(false);}},[disabled]);
 useLayoutEffect(()=>{
  if(!open||!anchor.current||!popup.current)return;
  const rect=anchor.current.getBoundingClientRect();
  const box=popup.current.getBoundingClientRect();
  const right=rect.right+10;
  setPosition({left:Math.max(8,right+box.width<=window.innerWidth-8?right:rect.left-box.width-10),top:Math.max(8,Math.min(rect.top,window.innerHeight-box.height-8))});
 },[open,heading,content]);
 return <span ref={anchor} className="schema-tooltip-anchor" tabIndex={0} aria-describedby={open?id:undefined} onMouseEnter={enter} onMouseLeave={leave} onFocus={()=>{if(!disabled)setFocused(true);}} onBlur={()=>setFocused(false)} onKeyDown={e=>{if(e.key==='Escape'){setFocused(false);setHovered(false);}}}>
  {children}
  {open&&createPortal(<div id={id} ref={popup} role="tooltip" onMouseEnter={enter} onMouseLeave={leave} className="schema-tooltip" style={{...position,zIndex:110}}><div className="schema-tooltip-heading">{heading}</div><div className="schema-tooltip-content">{content}</div></div>,document.body)}
 </span>;
}
