import React from 'react';
import { Plus, Edit2, Trash2, CheckCircle } from 'lucide-react';

export default function SlotManager({ templates, currentView, onSelectView, onAdd, onRename, onDelete, onMakeActive }) {
  const slots = templates?.slots || [];
  const activeMode = templates?.activeMode || 'default_ar';
  const isDefault = currentView === 'default_ar' || currentView === 'default_en';
  const isActive = currentView === activeMode;

  return (
    <div className="bg-telgrarr-surface border border-telgrarr-border rounded-xl p-3 space-y-3">
      <div className="flex items-center space-x-3">
        <div className="flex-1">
          <select
            value={currentView}
            onChange={(e) => onSelectView(e.target.value)}
            className="w-full bg-telgrarr-black/50 border border-telgrarr-border text-telgrarr-text text-sm rounded-lg block p-2 focus:ring-telgrarr-purple focus:border-telgrarr-purple transition-colors"
          >
            <optgroup label="Protected Defaults">
              <option value="default_ar">🔒 Default (Arabic)</option>
              <option value="default_en">🔒 Default (English)</option>
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
          className="p-2 bg-telgrarr-purple hover:bg-purple-600 text-white rounded-lg disabled:opacity-50 transition-colors shadow-sm"
          title="Add New Slot"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center space-x-2 text-sm">
          {isActive ? (
            <span className="flex items-center text-green-500 font-medium"><CheckCircle className="w-4 h-4 mr-1" /> Live Setup</span>
          ) : (
            <button onClick={onMakeActive} className="text-telgrarr-purple hover:text-telgrarr-text font-medium transition-colors">
              Make Active Layout
            </button>
          )}
        </div>
        {!isDefault && (
          <div className="flex items-center space-x-2">
            <button onClick={onRename} className="p-1.5 text-telgrarr-muted hover:text-telgrarr-text rounded bg-telgrarr-surface border border-telgrarr-border transition-colors shadow-sm"><Edit2 className="w-4 h-4" /></button>
            <button onClick={onDelete} className="p-1.5 text-red-400 hover:text-red-300 rounded bg-red-500/10 border border-red-500/20 transition-colors shadow-sm"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
}
