import React, { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

export default function TemplateEditor({ value, onChange, tokens, readOnly, syntaxError }) {
  const reduceMotion = useReducedMotion();
  const textareaRef = useRef(null);
  const insertToken = (token) => {
    if (readOnly || !textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const newVal = value.substring(0, start) + token + value.substring(end);
    onChange(newVal);
    setTimeout(() => {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + token.length;
    }, 0);
  };
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.3, ease: 'easeOut' }}
      className="space-y-3"
    >
      <div className="flex overflow-x-auto space-x-2 pb-2 scrollbar-hide">
        {tokens.map(token => (
          <button
            key={token}
            onClick={() => insertToken(token)}
            disabled={readOnly}
            className="focus-ring whitespace-nowrap px-2.5 py-1 bg-telgrarr-elevated border border-telgrarr-border rounded-sm text-[11px] font-mono text-telgrarr-purple hover:bg-telgrarr-border/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
          >
            {token}
          </button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        className={`w-full h-48 bg-telgrarr-elevated border ${syntaxError ? 'border-telgrarr-danger/50 focus:border-telgrarr-danger' : 'border-telgrarr-border focus:border-telgrarr-purple'} rounded-xl p-3 text-sm font-mono text-telgrarr-text focus:outline-hidden transition-colors leading-relaxed disabled:opacity-60 shadow-inner`}
        placeholder={readOnly ? "This template is locked and cannot be edited directly." : "Write your HTML and {{tokens}} here..."}
        aria-label="Template code"
        dir="ltr"
      />
      {syntaxError && (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: 'easeOut' }}
          className="bg-telgrarr-danger/10 border border-telgrarr-danger/30 rounded-lg p-3"
        >
          <div className="flex items-center space-x-1.5 text-telgrarr-danger mb-1.5">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Compiler Error</span>
          </div>
          <div className="text-telgrarr-danger/90 text-[13px] font-mono whitespace-pre-wrap break-words leading-relaxed">
            {syntaxError}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
