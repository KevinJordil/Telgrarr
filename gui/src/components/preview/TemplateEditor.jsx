import React, { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

// P3-S3.3: kind-agnostic token->group lookup (R02 DRY -- one source for both kinds,
// covering the union of every token either kind can pass in). runtime/runtime_en are
// filed under Content rather than Episode: Radarr has no "Episode" grouping at all (a
// movie has no episode), and Content is not wrong for Sonarr either -- a deliberate
// simplification that keeps this component's prop contract unchanged (no new `kind`
// prop), declared per DEC-SLOT-19. A token this map doesn't recognise (a future TOKENS
// addition) falls into a trailing 'Other' bucket rather than being silently dropped.
const TOKEN_GROUP_ORDER = ['Content', 'Episode', 'Ratings', 'Links', 'Other'];
const TOKEN_GROUP_OF = {
  '{{title}}': 'Content', '{{year}}': 'Content', '{{genres}}': 'Content',
  '{{status}}': 'Content', '{{status_en}}': 'Content', '{{overview}}': 'Content',
  '{{runtime}}': 'Content', '{{runtime_en}}': 'Content',
  '{{seasonRange}}': 'Episode', '{{epLabel}}': 'Episode', '{{epValue}}': 'Episode',
  '{{epLabel_en}}': 'Episode', '{{epValue_en}}': 'Episode',
  '{{rating.value}}': 'Ratings', '{{rating.label}}': 'Ratings',
  '{{ratings.imdb}}': 'Ratings', '{{ratings.tmdb}}': 'Ratings',
  '{{ratings.rottenTomatoes}}': 'Ratings', '{{ratings.metacritic}}': 'Ratings',
  '{{imdbUrl}}': 'Links', '{{seerrUrl}}': 'Links',
};
function classifyTokens(list) {
  const buckets = {};
  for (const t of list) {
    const g = TOKEN_GROUP_OF[t] || 'Other';
    (buckets[g] = buckets[g] || []).push(t);
  }
  return TOKEN_GROUP_ORDER
    .filter((g) => buckets[g] && buckets[g].length)
    .map((g) => [g, buckets[g]]);
}
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
  const insertIfBlock = () => {
    if (readOnly || !textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const openTag = '{{#if }}';
    const closeTag = '{{/if}}';
    const selected = value.substring(start, end);
    const newVal = value.substring(0, start) + openTag + selected + closeTag + value.substring(end);
    onChange(newVal);
    setTimeout(() => {
      el.focus();
      if (start === end) {
        const conditionPos = start + openTag.indexOf('}}');
        el.selectionStart = el.selectionEnd = conditionPos;
      } else {
        el.selectionStart = start + openTag.length;
        el.selectionEnd = start + openTag.length + selected.length;
      }
    }, 0);
  };
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.3, ease: 'easeOut' }}
      className="space-y-3"
    >
            <div className="space-y-2">
        {classifyTokens(tokens).map(([label, groupTokens]) => (
          <div key={label}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-telgrarr-muted mb-1 px-0.5">
              {label}
            </div>
            <div className="flex overflow-x-auto space-x-2 pb-1 scrollbar-hide">
              {groupTokens.map(token => (
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
          </div>
        ))}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-telgrarr-muted mb-1 px-0.5">
            Blocks
          </div>
          <button
            onClick={insertIfBlock}
            disabled={readOnly}
            className="focus-ring whitespace-nowrap px-2.5 py-1 bg-telgrarr-elevated border border-telgrarr-purple/40 rounded-sm text-[11px] font-mono text-telgrarr-purple hover:bg-telgrarr-purple/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
          >
            {'{{#if}} ... {{/if}}'}
          </button>
        </div>
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
