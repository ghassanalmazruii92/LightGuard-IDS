import React, { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

const MS_PER_CHAR = 22;
const MARGIN = 14;

function mergeRefs(refs) {
  return (node) => refs.filter(Boolean).forEach(r => typeof r==='function' ? r(node) : (r && 'current' in r) && (r.current=node));
}

export function HoverHint({ hint, children, as: Tag='div', className='', followCursor=false, ...rest }) {
  const { onMouseEnter:userEnter, onMouseLeave:userLeave, ref:userRef, ...restSafe } = rest;
  const [open,      setOpen]      = useState(false);
  const [pos,       setPos]       = useState({ x:0, y:0 });
  const [typedLen,  setTypedLen]  = useState(0);
  const [tipLayout, setTipLayout] = useState(null);
  const targetRef = useRef(null);
  const tipRef    = useRef(null);
  const timerRef  = useRef(null);
  const rafRef    = useRef(0);
  const chars = useMemo(() => Array.from(hint||''), [hint]);
  const setRef = useCallback(mergeRefs([targetRef, userRef]), [userRef]);

  const layoutTip = useCallback((cursorPos) => {
    const tip = tipRef.current;
    if (!tip) return;
    const tr = tip.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (followCursor && cursorPos) {
      let left = cursorPos.x + 18, top = cursorPos.y + 18;
      if (left + tr.width > vw - MARGIN) left = vw - tr.width - MARGIN;
      if (left < MARGIN) left = MARGIN;
      if (top + tr.height > vh - MARGIN) top = cursorPos.y - tr.height - 10;
      if (top < MARGIN) top = MARGIN;
      setTipLayout({ left, top });
      return;
    }
    const target = targetRef.current;
    if (!target) return;
    const ar = target.getBoundingClientRect();
    let left = ar.left + ar.width/2 - tr.width/2;
    let top  = ar.bottom + 10;
    if (left < MARGIN) left = MARGIN;
    if (left + tr.width > vw - MARGIN) left = vw - tr.width - MARGIN;
    if (top + tr.height > vh - MARGIN) top = ar.top - tr.height - 10;
    setTipLayout({ left, top });
  }, [followCursor]);

  const show = useCallback((e) => {
    clearTimeout(timerRef.current);
    setPos({ x:e.clientX, y:e.clientY });
    setOpen(true); setTypedLen(0); setTipLayout(null);
    let i=0; const tick = () => { i++; setTypedLen(i); if(i<chars.length) timerRef.current=setTimeout(tick,MS_PER_CHAR); };
    timerRef.current = setTimeout(tick, 120);
  }, [chars.length]);

  const hide = useCallback(() => { clearTimeout(timerRef.current); setOpen(false); setTipLayout(null); setTypedLen(0); }, []);
  const move = useCallback((e) => { if(open&&followCursor) { setPos({x:e.clientX,y:e.clientY}); requestAnimationFrame(()=>layoutTip({x:e.clientX,y:e.clientY})); } }, [open,followCursor,layoutTip]);

  useLayoutEffect(() => { if(open) { cancelAnimationFrame(rafRef.current); rafRef.current=requestAnimationFrame(()=>layoutTip(followCursor?pos:null)); } }, [open,typedLen,layoutTip,followCursor,pos]);

  useEffect(() => {
    if (!open||followCursor) return;
    const r = () => { cancelAnimationFrame(rafRef.current); rafRef.current=requestAnimationFrame(()=>layoutTip(null)); };
    window.addEventListener('scroll',r,true); window.addEventListener('resize',r);
    return ()=>{ window.removeEventListener('scroll',r,true); window.removeEventListener('resize',r); cancelAnimationFrame(rafRef.current); };
  }, [open,followCursor,layoutTip]);

  if (!hint) return <Tag className={className} {...restSafe}>{children}</Tag>;

  const typedText = chars.slice(0, typedLen).join('');
  const typing = open && typedLen < chars.length;

  const tooltip = open && (
    <div
      ref={tipRef}
      role="tooltip"
      style={tipLayout
        ? { position:'fixed', zIndex:9999, left:tipLayout.left, top:tipLayout.top, opacity:1, transition:'opacity .15s ease', pointerEvents:'none' }
        : { position:'fixed', zIndex:9999, left:-9999, top:0, opacity:0, pointerEvents:'none' }
      }
    >
      <div style={{
        background:'rgba(5,11,29,.97)',
        border:'1px solid rgba(0,229,255,.28)',
        borderRadius:12,
        padding:'10px 14px',
        maxWidth:320,
        minWidth:160,
        boxShadow:'0 12px 40px rgba(0,0,0,.7), 0 0 20px rgba(0,229,255,.08)',
        backdropFilter:'blur(12px)',
        WebkitBackdropFilter:'blur(12px)',
        position:'relative',
        overflow:'hidden',
      }}>
        {/* top cyan line */}
        <div style={{position:'absolute',top:0,left:'15%',right:'15%',height:'1px',background:'linear-gradient(90deg,transparent,rgba(0,229,255,.5),transparent)'}}/>
        <span style={{
          display:'block',
          fontFamily:'Inter,sans-serif',
          fontSize:12,
          lineHeight:1.6,
          color:'rgba(230,241,255,.88)',
          whiteSpace:'normal',
          wordBreak:'break-word',
        }}>
          {typedText}
          {typing && <span style={{display:'inline-block',width:2,height:12,background:'#00E5FF',marginLeft:2,verticalAlign:'middle',animation:'pulse-dot 1s ease-in-out infinite'}} aria-hidden/>}
        </span>
      </div>
    </div>
  );

  return (
    <>
      <Tag
        {...restSafe}
        ref={setRef}
        className={followCursor ? className.trim() : `relative ${className}`.trim()}
        onMouseEnter={e=>{userEnter?.(e);show(e);}}
        onMouseLeave={e=>{userLeave?.(e);hide();}}
        onMouseMove={followCursor?move:undefined}
      >
        {children}
      </Tag>
      {tooltip && createPortal(tooltip, document.body)}
    </>
  );
}

export default HoverHint;
