import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { RotateCcw, Ban, Check } from 'lucide-react';

let idSeq = 0;

// Minimal single-emoji check — mirrors backend layout-schema.isSingleEmoji for instant UX
// feedback ONLY; backend isValidIcon -> normalizeLayout stays authoritative on save.
function isSingleEmoji(v) {
  if (typeof v !== 'string' || v.length === 0) return false;
  try {
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
    if ([...seg.segment(v)].length !== 1) return false;
  } catch (_e) { /* no Intl.Segmenter: fall back to the pictographic test alone */ }
  return /\p{Extended_Pictographic}/u.test(v);
}

export default function IconPicker({ isOpen, title, choices = [], iconNone = 'none', value, onSelect, onCancel }) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef(null);
  const prevFocus = useRef(null);
  const idRef = useRef(`icon-${++idSeq}`);
  const titleId = `${idRef.current}-title`;
  const customId = `${idRef.current}-custom`;
  const [custom, setCustom] = useState('');

  const curated = choices.filter((c) => c !== iconNone);
  const isDefault = value == null;
  const isNone = value === iconNone;
  const isCustomValue = value != null && value !== iconNone && !curated.includes(value);

  useEffect(() => {
    if (!isOpen) return;
    setCustom(isCustomValue ? value : '');
    prevFocus.current = document.activeElement;
    const t = setTimeout(() => panelRef.current?.querySelector('button')?.focus(), 0);
    return () => {
      clearTimeout(t);
      const el = prevFocus.current;
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel && onCancel(); return; }
    if (e.key !== 'Tab') return;
    const nodes = panelRef.current && panelRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!nodes || nodes.length === 0) return;
    const list = Array.from(nodes).filter((n) => !n.disabled);
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const customValid = custom !== '' && isSingleEmoji(custom);
  const applyCustom = () => { if (customValid && onSelect) onSelect(custom); };

  const cellBase = 'focus-ring aspect-square rounded-xl border flex items-center justify-center transition-colors';
  const cellOn = 'border-telgrarr-purple bg-telgrarr-purple/10 text-telgrarr-purple';
  const cellOff = 'border-telgrarr-border bg-telgrarr-elevated text-telgrarr-text hover:border-telgrarr-purple/50';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-telgrarr-black/60 backdrop-blur-xs"
          onClick={onCancel}
          onKeyDown={onKeyDown}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.95 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.95 }}
            transition={reduceMotion ? { duration: 0.12 } : { type: 'spring', damping: 25, stiffness: 300 }}
            className="glass-panel w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id={titleId} className="font-semibold text-telgrarr-text mb-4">{title}</h3>

            <div className="grid grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => onSelect && onSelect(null)}
                aria-label="Default icon"
                aria-pressed={isDefault}
                title="Default"
                className={`${cellBase} ${isDefault ? cellOn : cellOff}`}
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {curated.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onSelect && onSelect(g)}
                  aria-label={`Icon ${g}`}
                  aria-pressed={value === g}
                  className={`${cellBase} text-xl ${value === g ? cellOn : cellOff}`}
                >
                  {g}
                </button>
              ))}

              <button
                type="button"
                onClick={() => onSelect && onSelect(iconNone)}
                aria-label="No icon"
                aria-pressed={isNone}
                title="No icon"
                className={`${cellBase} ${isNone ? cellOn : cellOff}`}
              >
                <Ban className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5">
              <label htmlFor={customId} className="block text-xs text-telgrarr-muted font-medium mb-1.5">Custom emoji</label>
              <div className="flex gap-2">
                <input
                  id={customId}
                  type="text"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCustom(); } }}
                  placeholder={'\u{1F3AC}'}
                  autoComplete="off"
                  className={`flex-1 bg-telgrarr-elevated border rounded-xl px-3 py-2.5 text-sm text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-hidden transition-colors ${isCustomValue ? 'border-telgrarr-purple' : 'border-telgrarr-border focus:border-telgrarr-purple'}`}
                />
                <button
                  type="button"
                  onClick={applyCustom}
                  disabled={!customValid}
                  aria-label="Use custom emoji"
                  className="focus-ring px-4 rounded-xl bg-telgrarr-purple hover:bg-telgrarr-purple-glow text-telgrarr-on-accent font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 flex items-center"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
              {custom !== '' && !customValid && (
                <p role="alert" className="text-xs text-telgrarr-danger mt-2">Enter a single emoji.</p>
              )}
            </div>

            <div className="flex mt-6">
              <button
                type="button"
                onClick={onCancel}
                className="focus-ring flex-1 py-2.5 rounded-xl border border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
