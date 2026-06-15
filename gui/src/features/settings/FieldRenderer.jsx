import React from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import useSettingsStore from '../../store/settingsStore';
import { isMaskedValue } from './formUtils';
import SliderInput from '../../components/SliderInput';
import { copyText } from './clipboard';

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
    if (!v) return;
    const ok = await copyText(v);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
        id={field.key}
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
          aria-label="Copy"
          className="focus-ring rounded-sm text-telgrarr-muted hover:text-telgrarr-text transition-colors disabled:opacity-40"
        >
          {copied ? <Check className="w-4 h-4 text-telgrarr-success" /> : <Copy className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={handleEye}
          disabled={!hasValue || busy}
          title={open ? 'Hide' : 'Reveal'}
          aria-label={open ? 'Hide' : 'Reveal'}
          className="focus-ring rounded-sm text-telgrarr-muted hover:text-telgrarr-text transition-colors disabled:opacity-40"
        >
          {open ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function FieldRenderer({ field, value, onChange }) {
  const base = 'w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 px-4 text-telgrarr-text placeholder-telgrarr-muted/40 focus:outline-hidden focus:border-telgrarr-purple focus:ring-1 focus:ring-telgrarr-purple transition-all text-sm';
  const displayFn = field.displayFormat ? DISPLAY_FORMATTERS[field.displayFormat] : null;

  // H4.3b: env-managed fields (GET /settings/meta) render read-only with the
  // EFFECTIVE boot-resolved value; the file-tier draft value is irrelevant here.
  const fieldMeta = useSettingsStore((s) => s.fieldMeta);
  const meta = fieldMeta ? fieldMeta[field.key] : undefined;
  if (meta && meta.editable === false) {
    return (
      <div className="space-y-1.5 pt-3">
        <label htmlFor={field.key} id={`${field.key}-label`} className="text-xs text-telgrarr-muted font-medium uppercase tracking-wider">{field.label}</label>
        <input
          type="text"
          id={field.key}
          value={String(meta.effective ?? '')}
          disabled
          readOnly
          className={`${base} opacity-60 cursor-not-allowed`}
        />
        <p className="text-xs text-telgrarr-muted/70 leading-relaxed">
          Managed by environment ({field.envVar}). Change the {field.envVar} environment variable and restart to update.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 pt-3">
      <label htmlFor={field.key} id={`${field.key}-label`} className="text-xs text-telgrarr-muted font-medium uppercase tracking-wider">{field.label}</label>

      {(field.type === 'text' || field.type === 'url') && (
        <input
          type="text"
          id={field.key}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={base}
        />
      )}

      {field.type === 'number' && (
        <input
          type="text"
          id={field.key}
          inputMode="numeric"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={base}
        />
      )}

      {field.type === 'secret' && (
        <SecretInput field={field} value={value} onChange={onChange} base={base} />
      )}

      {field.type === 'slider' && (
        <SliderInput field={field} value={value} onChange={onChange} displayFn={displayFn} labelId={`${field.key}-label`} />
      )}

      {field.type === 'select' && (
        <select id={field.key} value={value || ''} onChange={(e) => onChange(e.target.value)} className={`${base} cursor-pointer`}>
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
