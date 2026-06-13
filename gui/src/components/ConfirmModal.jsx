import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

let idSeq = 0;

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false }) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef(null);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const prevFocus = useRef(null);
  const idRef = useRef(`confirm-${++idSeq}`);
  const titleId = `${idRef.current}-title`;
  const descId = `${idRef.current}-desc`;

  useEffect(() => {
    if (!isOpen) return;
    prevFocus.current = document.activeElement;
    const t = setTimeout(() => {
      (danger ? cancelRef.current : confirmRef.current)?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      const el = prevFocus.current;
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, [isOpen, danger]);

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
            aria-describedby={message ? descId : undefined}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.95 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.95 }}
            transition={reduceMotion ? { duration: 0.12 } : { type: 'spring', damping: 25, stiffness: 300 }}
            className="glass-panel w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${danger ? 'text-telgrarr-danger' : 'text-telgrarr-purple'}`} />
              <div>
                <h3 id={titleId} className="font-semibold text-telgrarr-text">{title}</h3>
                {message && <p id={descId} className="text-sm text-telgrarr-muted mt-1">{message}</p>}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                ref={cancelRef}
                onClick={onCancel}
                className="focus-ring flex-1 py-2.5 rounded-xl border border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text transition-all text-sm font-medium"
              >
                Cancel
              </button>
              <button
                ref={confirmRef}
                onClick={onConfirm}
                className={`focus-ring flex-1 py-2.5 rounded-xl text-telgrarr-on-accent text-sm font-semibold transition-all active:scale-[0.98] ${
                  danger ? 'bg-telgrarr-danger hover:bg-telgrarr-danger/90' : 'bg-telgrarr-purple hover:bg-telgrarr-purple-glow shadow-lg shadow-telgrarr-purple/20'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
