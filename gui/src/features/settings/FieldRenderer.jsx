import React from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import useSettingsStore from '../../store/settingsStore';
import { isMaskedValue } from './formUtils';

const DISPLAY_FORMATTERS = {
  'ms-to-s': (v) => `${(v / 1000).toFixed(1)}s`,
  'ms-to-min': (v) => `${Math.round(v / 60000)} min`,
};

function SecretInput({ field, value, onChange, base }) {
  const revealSecret = useSettingsStore((s) => s.revealSecret);
  const [revealed, setRevealed] = React.useState(null);
  const [forceShow, setForceShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const masked = isMaskedValue(value);
  const hasValue = !!(value && String(value).length);

  const fetchReal = async () => {
    if (revealed !== null) return revealed;
    setBusy(true);
    const res = await revealSecret(field.key);
    setBusy(false);
    if (res && res.success) { setRevealed(res.value); return res.value; }
    return null;
  };

  const handleEye = async () => {
    if (masked) {
      if (revealed !== null) setRevealed(null);
      else await fetchReal();
    } else {
      setForceShow((s) => !s);
    }
  };

  const handleCopy = async () => {
    const v = masked ? await fetchReal() : value;
    if (v) {
      try {
        await navigator.clipboard.writeText(v);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch (e) { /* clipboard unavailable */ }
    }
  };

  const handleType = (v) => {
    if (revealed !== null) setRevealed(null);
    onChange(v);
  };

  const open = (masked && revealed !== null) || (!masked && forceShow);
  const displayValue = (masked && revealed !== null) ? revealed : (value || '');

  return (
    <div className="relative">
      <input
        type={open ? 'text' : 'password'}
        value={displayValue}
        onChange={(e) => handleType(e.target.value)}
        placeholder={field.placeholder}
        className={`${base} pr-20`}
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!hasValue || busy}
          title="Copy"
          className="text-telgrarr-muted hover:text-telgrarr-text transition-colors disabled:opacity-40"
        >
          {copied ? <Check className="w-4 h-4 text-telgrarr-purple" /> : <Copy className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={handleEye}
          disabled={!hasValue || busy}
          title={open ? 'Hide' : 'Reveal'}
          className="text-telgrarr-muted hover:text-telgrarr-text transition-colors disabled:opacity-40"
        >
          {open ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function SliderInput({ field, value, onChange, displayFn }) {
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

export default function FieldRenderer({ field, value, onChange }) {
  const base = 'w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 px-4 text-telgrarr-text placeholder-telgrarr-muted/40 focus:outline-none focus:border-telgrarr-purple focus:ring-1 focus:ring-telgrarr-purple transition-all text-sm';
  const displayFn = field.displayFormat ? DISPLAY_FORMATTERS[field.displayFormat] : null;

  return (
    <div className="space-y-1.5 pt-3">
      <label className="text-xs text-telgrarr-muted font-medium uppercase tracking-wider">{field.label}</label>

      {(field.type === 'text' || field.type === 'url') && (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={base}
        />
      )}

      {field.type === 'secret' && (
        <SecretInput field={field} value={value} onChange={onChange} base={base} />
      )}

      {field.type === 'slider' && (
        <SliderInput field={field} value={value} onChange={onChange} displayFn={displayFn} />
      )}

      {field.type === 'select' && (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={`${base} cursor-pointer`}>
          {(field.options || []).map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-telgrarr-black">
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.note && <p className="text-xs text-telgrarr-muted/70 leading-relaxed">{field.note}</p>}
    </div>
  );
}
