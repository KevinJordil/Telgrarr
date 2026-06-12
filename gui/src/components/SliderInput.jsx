import React from 'react';

// Shared horizontal slider primitive (U3.1/U4.5).
// touch-action pan-y: vertical drags scroll the page; only deliberate horizontal
// drags (or taps) change the value. Keyboard + ARIA included.
export default function SliderInput({ field, value, onChange, displayFn }) {
  const trackRef = React.useRef(null);
  const dragging = React.useRef(false);
  const moved = React.useRef(false);
  const startX = React.useRef(0);
  const SLOP = 4;
  const min = field.min;
  const max = field.max;
  const step = field.step || 1;
  const n = Number(value);
  const current = Number.isFinite(n) ? n : min;
  const clamped = Math.min(max, Math.max(min, current));
  const pct = max > min ? ((clamped - min) / (max - min)) * 100 : 0;
  const fmt = (v) => (displayFn ? displayFn(v) : v);
  const quantize = (r) => {
    const stepped = Math.round((r - min) / step) * step + min;
    return Math.min(max, Math.max(min, stepped));
  };
  const valueFromClientX = (clientX) => {
    const el = trackRef.current;
    if (!el) return clamped;
    const rect = el.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return quantize(min + ratio * (max - min));
  };
  const commit = (v) => { if (v !== clamped) onChange(v); };
  const onPointerDown = (e) => {
    dragging.current = true;
    moved.current = false;
    startX.current = e.clientX;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    if (!moved.current && Math.abs(e.clientX - startX.current) < SLOP) return;
    moved.current = true;
    commit(valueFromClientX(e.clientX));
  };
  const onPointerUp = (e) => {
    if (dragging.current && !moved.current) commit(valueFromClientX(e.clientX));
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onPointerCancel = (e) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onKeyDown = (e) => {
    let next = clamped;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = clamped - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = clamped + step;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else return;
    e.preventDefault();
    commit(quantize(next));
  };
  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between">
        <span className="text-telgrarr-purple font-semibold text-sm tabular-nums">{fmt(clamped)}</span>
        <span className="text-xs text-telgrarr-muted tabular-nums">{fmt(min)} – {fmt(max)}</span>
      </div>
      <div
        ref={trackRef}
        id={field.key}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={String(fmt(clamped))}
        aria-label={field.label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        className="focus-ring relative h-9 flex items-center cursor-pointer select-none touch-pan-y"
      >
        <div className="w-full h-2 rounded-full bg-telgrarr-border overflow-hidden">
          <div className="h-full rounded-full bg-telgrarr-purple" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute top-1/2 w-5 h-5 -mt-2.5 -ml-2.5 rounded-full bg-telgrarr-purple border-2 border-telgrarr-surface shadow-card transition-transform active:scale-110"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
