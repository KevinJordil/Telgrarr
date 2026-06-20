import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Ban, RotateCcw } from 'lucide-react';
import IconPicker from './IconPicker';

// One ORDERABLE caption element (DEC-1/10): reorder + enable toggle + icon override.
// Label editing is c-4b (needs per-language labelEditable from the catalog). The row only
// signals changes; the composer panel owns the order array and descriptor merge (SRP).
export default function ElementRow({ element, descriptor, iconNone = 'none', onChange, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  const [iconOpen, setIconOpen] = useState(false);
  const isObj = descriptor && typeof descriptor === 'object';
  const enabled = isObj ? descriptor.enabled !== false : true;
  const icon = isObj ? descriptor.icon : undefined;

  const stepBtn = 'focus-ring p-0.5 rounded-md text-telgrarr-muted enabled:hover:text-telgrarr-text disabled:opacity-30 transition-colors';

  let iconNode;
  if (icon == null) iconNode = <RotateCcw className="w-4 h-4 text-telgrarr-muted" />;
  else if (icon === iconNone) iconNode = <Ban className="w-4 h-4 text-telgrarr-muted" />;
  else iconNode = <span className="text-lg leading-none">{icon}</span>;

  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 rounded-xl bg-telgrarr-surface border border-telgrarr-border ${enabled ? '' : 'opacity-60'}`}>
      <div className="flex flex-col -my-1">
        <button type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label={`Move ${element.name} up`} className={stepBtn}>
          <ChevronUp className="w-4 h-4" />
        </button>
        <button type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label={`Move ${element.name} down`} className={stepBtn}>
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <span className="flex-1 text-sm font-medium text-telgrarr-text truncate">{element.name}</span>

      <button
        type="button"
        onClick={() => setIconOpen(true)}
        aria-label={`Choose icon for ${element.name}`}
        title="Icon"
        className="focus-ring w-9 h-9 rounded-lg border border-telgrarr-border bg-telgrarr-elevated flex items-center justify-center hover:border-telgrarr-purple/50 transition-colors"
      >
        {iconNode}
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? 'Disable' : 'Enable'} ${element.name}`}
        onClick={() => onChange && onChange({ enabled: !enabled })}
        className={`focus-ring relative w-10 h-6 rounded-full shrink-0 transition-colors ${enabled ? 'bg-telgrarr-purple' : 'bg-telgrarr-border'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-telgrarr-on-accent shadow-xs transition-transform ${enabled ? 'translate-x-4' : ''}`} />
      </button>

      <IconPicker
        isOpen={iconOpen}
        title={`Icon — ${element.name}`}
        choices={element.iconChoices || []}
        iconNone={iconNone}
        value={icon}
        onSelect={(next) => { onChange && onChange({ icon: next }); setIconOpen(false); }}
        onCancel={() => setIconOpen(false)}
      />
    </div>
  );
}
