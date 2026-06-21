import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Ban, RotateCcw } from 'lucide-react';
import IconPicker from './IconPicker';

// One ORDERABLE caption element (DEC-1/10): reorder + enable toggle + icon override.
// Label editing (DEC-3): inline input shown only when editable in the active language. The row only
// signals changes; the composer panel owns the order array and descriptor merge (SRP).
export default function ElementRow({ element, descriptor, iconNone = 'none', onChange, onMoveUp, onMoveDown, canMoveUp, canMoveDown, editable = false, defaultLabel = '', labelMax = 40 }) {
  const [iconOpen, setIconOpen] = useState(false);
  const isObj = descriptor && typeof descriptor === 'object';
  const enabled = isObj ? descriptor.enabled !== false : true;
  const icon = isObj ? descriptor.icon : undefined;
  const labelOverride = isObj ? descriptor.label : undefined;
  const labelValue = labelOverride ?? defaultLabel;

  const stepBtn = 'focus-ring p-0.5 rounded-md text-telgrarr-muted enabled:hover:text-telgrarr-text disabled:opacity-30 transition-colors';

  let iconNode;
  if (icon == null) iconNode = <RotateCcw className="w-4 h-4 text-telgrarr-muted" />;
  else if (icon === iconNone) iconNode = <Ban className="w-4 h-4 text-telgrarr-muted" />;
  else iconNode = <span className="text-lg leading-none">{icon}</span>;

  return (
    <div className="space-y-1.5">
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
      {editable && (
        <div className="pl-7 pr-1">
          <input
            type="text"
            value={labelValue}
            maxLength={labelMax}
            dir="auto"
            onChange={(e) => onChange && onChange({ label: e.target.value === defaultLabel ? null : e.target.value })}
            aria-label={`Label for ${element.name}`}
            placeholder={defaultLabel}
            className="focus-ring w-full text-sm rounded-lg bg-telgrarr-elevated border border-telgrarr-border px-2.5 py-1.5 text-telgrarr-text placeholder:text-telgrarr-muted"
          />
        </div>
      )}
    </div>
  );
}
