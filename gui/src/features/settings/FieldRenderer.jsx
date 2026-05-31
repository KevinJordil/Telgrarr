import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

const DISPLAY_FORMATTERS = {
  'ms-to-s': (v) => `${(v / 1000).toFixed(1)}s`,
  'ms-to-min': (v) => `${Math.round(v / 60000)} min`,
};

export default function FieldRenderer({ field, value, onChange, showSecret, onToggleSecret }) {
  const base = 'w-full bg-telgrarr-black/60 border border-telgrarr-border rounded-xl py-3 px-4 text-telgrarr-text placeholder-telgrarr-muted/40 focus:outline-none focus:border-telgrarr-purple focus:ring-1 focus:ring-telgrarr-purple transition-all text-sm';
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
        <div className="relative">
          <input
            type={showSecret ? 'text' : 'password'}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={`${base} pr-11`}
          />
          <button
            type="button"
            onClick={onToggleSecret}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-telgrarr-muted hover:text-telgrarr-text transition-colors"
          >
            {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      )}

      {field.type === 'slider' && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-telgrarr-purple font-semibold text-sm">
              {/* ITEM 2: Number(value) || field.min collapses 0. Left unchanged as no current slider has min < 1. */}
              {displayFn ? displayFn(Number(value) || field.min) : (Number(value) || field.min)}
            </span>
            <span className="text-xs text-telgrarr-muted">
              {displayFn ? `${displayFn(field.min)} – ${displayFn(field.max)}` : `${field.min} – ${field.max}`}
            </span>
          </div>
          <input
            type="range"
            onWheel={(e) => e.currentTarget.blur()}
            min={field.min}
            max={field.max}
            step={field.step}
            value={Number(value) || field.min}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-telgrarr-border rounded-full appearance-none cursor-pointer accent-telgrarr-purple"
          />
        </div>
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
