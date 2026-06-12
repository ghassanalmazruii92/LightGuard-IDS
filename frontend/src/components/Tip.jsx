/**
 * Tip.jsx — Lightweight wrapper around HoverHint
 * Usage: <Tip hint="Description" side="top|bottom|left|right"><IconComponent/></Tip>
 * Smart positioning: auto-flips if tooltip would overflow viewport
 */
import React from 'react';
import { HoverHint } from './HoverHint';

export function Tip({ hint, children, followCursor = false, className = '', style = {}, as = 'span' }) {
  if (!hint) return <span className={className} style={style}>{children}</span>;
  return (
    <HoverHint hint={hint} followCursor={followCursor} as={as} className={className} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'default', ...style }}>
      {children}
    </HoverHint>
  );
}

export default Tip;
