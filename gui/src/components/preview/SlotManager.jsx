import React from 'react';
import { Plus, Edit2, Trash2, CheckCircle } from 'lucide-react';

export default function SlotManager({ templates, currentView, onSelectView, onAdd, onRename, onDelete, onMakeActive }) {
  const slots = templates?.slots || [];
  const activeMode = templates?.activeMode || 'default';
  const isDefault = currentView === 'default';
  const isActive = currentView === activeMode;
  return (
    <div className="bg-telgrarr-surface border border-telgrarr-border rounded-xl p-3 space-y-3">
      <div className="flex items-center space-x-3">
        <div className="flex-1">
          <label htmlFor="slot-select" className="sr-only">Select template</label>
          <select
            id="slot-select"
            value={currentView}
            onChange={(e) => onSelectView(e.target.value)}
            className="w-full bg-telgrarr-elevated border border-telgrarr-border text-telgrarr-text text-sm rounded-lg block p-2 focus:ring-telgrarr-purple focus:border-telgrarr-purple transition-colors"
          >
            <optgroup label="Default">
              <option value="default">Default styling</option>
            </optgroup>
            <optgroup label={`Custom Slots (${slots.length}/5)`}>
              {slots.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <button
          onClick={onAdd}
          disabled={slots.length >= 5}
          className="focus-ring p-2 bg-telgrarr-purple hover:bg-telgrarr-purple-dark text-telgrarr-on-accent rounded-lg disabled:opacity-50 transition-colors shadow-xs"
          aria-label="Add new slot"
          title="Add New Slot"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center space-x-2 text-sm">
          {isActive ? (
            <span className="flex items-center text-telgrarr-success font-medium"><CheckCircle className="w-4 h-4 mr-1" /> Live Setup</span>
          ) : (
            <button onClick={onMakeActive} className="focus-ring rounded-sm text-telgrarr-purple hover:text-telgrarr-text font-medium transition-colors">
              Make Active Layout
            </button>
          )}
        </div>
        {!isDefault && (
          <div className="flex items-center space-x-2">
            <button onClick={onRename} aria-label="Rename slot" className="focus-ring p-1.5 text-telgrarr-muted hover:text-telgrarr-text rounded-sm bg-telgrarr-elevated border border-telgrarr-border transition-colors shadow-xs"><Edit2 className="w-4 h-4" /></button>
            <button onClick={onDelete} aria-label="Delete slot" className="focus-ring p-1.5 text-telgrarr-danger rounded-sm bg-telgrarr-danger/10 hover:bg-telgrarr-danger/20 border border-telgrarr-danger/20 transition-colors shadow-xs"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
}
