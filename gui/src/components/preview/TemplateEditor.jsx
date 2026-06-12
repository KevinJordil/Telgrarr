import React, { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function TemplateEditor({ value, onChange, tokens, readOnly, syntaxError }) {
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
    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex overflow-x-auto space-x-2 pb-2 scrollbar-hide">
        {tokens.map(token => (
          <button
            key={token}
            onClick={() => insertToken(token)}
            disabled={readOnly}
            className="focus-ring whitespace-nowrap px-2.5 py-1 bg-telgrarr-elevated border border-telgrarr-border rounded text-[11px] font-mono text-telgrarr-purple hover:bg-telgrarr-border/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
        className={`w-full h-48 bg-telgrarr-elevated border ${syntaxError ? 'border-telgrarr-danger/50 focus:border-telgrarr-danger' : 'border-telgrarr-border focus:border-telgrarr-purple'} rounded-xl p-3 text-sm font-mono text-telgrarr-text focus:outline-none transition-colors leading-relaxed disabled:opacity-60 shadow-inner`}
        placeholder={readOnly ? "This template is locked and cannot be edited directly." : "Write your HTML and {{tokens}} here..."}
        dir="ltr"
      />
      {syntaxError && (
        <div className="bg-telgrarr-danger/10 border border-telgrarr-danger/30 rounded-lg p-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center space-x-1.5 text-telgrarr-danger mb-1.5">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Compiler Error</span>
          </div>
          <div className="text-telgrarr-danger/90 text-[13px] font-mono whitespace-pre-wrap break-words leading-relaxed">
            {syntaxError}
          </div>
        </div>
      )}
    </div>
  );
}
