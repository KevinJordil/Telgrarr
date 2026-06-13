import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

let idSeq = 0;

export default function InputModal({
  isOpen,
  title,
  label,
  initialValue = '',
  placeholder = '',
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  maxLength,
  validate,
  onConfirm,
  onCancel,
}) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const prevFocus = useRef(null);
  const idRef = useRef(`input-${++idSeq}`);
  const titleId = `${idRef.current}-title`;
  const fieldId = `${idRef.current}-field`;
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setValue(initialValue);
    setError('');
    prevFocus.current = document.activeElement;
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    return () => {
      clearTimeout(t);
      const el = prevFocus.current;
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, [isOpen, initialValue]);

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

  const submit = (e) => {
    if (e) e.preventDefault();
    const v = value.trim();
    if (!v) { setError('This field is required.'); return; }
    if (validate) {
      const msg = validate(v);
      if (msg) { setError(msg); return; }
    }
    onConfirm && onConfirm(v);
  };

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
            <form onSubmit={submit}>
              <h3 id={titleId} className="font-semibold text-telgrarr-text mb-4">{title}</h3>
              {label && <label htmlFor={fieldId} className="block text-xs text-telgrarr-muted font-medium mb-1.5">{label}</label>}
              <input
                ref={inputRef}
                id={fieldId}
                type="text"
                value={value}
                onChange={(e) => { setValue(e.target.value); if (error) setError(''); }}
                placeholder={placeholder}
                maxLength={maxLength}
                autoComplete="off"
                className="w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl px-3 py-2.5 text-sm text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-hidden focus:border-telgrarr-purple transition-colors"
              />
              {error && <p className="text-xs text-telgrarr-danger mt-2">{error}</p>}
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={onCancel}
                  className="focus-ring flex-1 py-2.5 rounded-xl border border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text transition-colors text-sm font-medium"
                >
                  {cancelLabel}
                </button>
                <button
                  type="submit"
                  disabled={!value.trim()}
                  className="focus-ring flex-1 py-2.5 rounded-xl bg-telgrarr-purple hover:bg-telgrarr-purple-glow text-telgrarr-on-accent text-sm font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-telgrarr-purple/20"
                >
                  {confirmLabel}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
