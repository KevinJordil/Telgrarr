import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Save, Lock, XCircle, CheckCircle } from 'lucide-react';
import useTemplatesStore from '../../store/templatesStore';
import ElementRow from './ElementRow';

// Apply an ElementRow patch ({enabled?}/{icon?}) to a descriptor item, collapsing back to a
// bare string key when no overrides remain (mirrors backend normalizeLayoutKind so the gui
// sends the same canonical shape it receives).
function applyPatch(item, patch) {
  const obj = typeof item === 'string' ? { key: item } : { ...item };
  if ('enabled' in patch) { if (patch.enabled === false) obj.enabled = false; else delete obj.enabled; }
  if ('icon' in patch) { if (patch.icon == null) delete obj.icon; else obj.icon = patch.icon; }
  return Object.keys(obj).length === 1 ? obj.key : obj;
}
function swap(arr, i, j) { const next = arr.slice(); [next[i], next[j]] = [next[j], next[i]]; return next; }
const keyOf = (item) => (typeof item === 'string' ? item : item.key);

export default function LayoutComposer({ kind }) {
  const { catalog, catalogLoading, catalogError, fetchCatalog,
          layout, layoutLoading, layoutError, fetchLayout,
          saveLayout, saving } = useTemplatesStore();
  const [draft, setDraft] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saved | error
  const hydratedRef = useRef(false);

  useEffect(() => { fetchCatalog(); fetchLayout(); }, [fetchCatalog, fetchLayout]);
  useEffect(() => { if (layout && !hydratedRef.current) { hydratedRef.current = true; setDraft(layout); } }, [layout]);
  useEffect(() => {
    if (saveState !== 'saved' && saveState !== 'error') return;
    const t = setTimeout(() => setSaveState('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  if (catalogError || layoutError) {
    return (
      <div role="alert" className="rounded-xl border border-telgrarr-border bg-telgrarr-surface p-4 flex items-center gap-2 text-sm text-telgrarr-danger">
        <XCircle className="w-4 h-4 shrink-0" /> {catalogError || layoutError}
      </div>
    );
  }
  if (catalogLoading || layoutLoading || !catalog || !draft) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin motion-reduce:animate-none text-telgrarr-purple" />
      </div>
    );
  }

  const kindCat = catalog[kind] || { orderable: [], prefix: [] };
  const elByKey = Object.fromEntries(kindCat.orderable.map((e) => [e.key, e]));
  const order = draft[kind] || [];
  const dirty = JSON.stringify(draft[kind]) !== JSON.stringify((layout && layout[kind]) || []);

  const update = (next) => setDraft({ ...draft, [kind]: next });
  const patchAt = (i, patch) => update(order.map((it, j) => (j === i ? applyPatch(it, patch) : it)));
  const moveAt = (i, dir) => { const j = i + dir; if (j < 0 || j >= order.length) return; update(swap(order, i, j)); };

  const onSave = async () => {
    const res = await saveLayout(draft);
    if (res.success) { hydratedRef.current = false; setSaveState('saved'); }
    else setSaveState('error');
  };

  return (
    <div className="space-y-4">
      {kindCat.prefix.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-telgrarr-muted uppercase tracking-wider px-1">Fixed</p>
          {kindCat.prefix.map((p) => (
            <div key={p.key} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-telgrarr-surface/60 border border-telgrarr-border/60">
              <Lock className="w-3.5 h-3.5 text-telgrarr-muted shrink-0" />
              <span className="text-sm text-telgrarr-muted">{p.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-telgrarr-muted uppercase tracking-wider px-1">Elements</p>
        {order.map((item, i) => {
          const el = elByKey[keyOf(item)];
          if (!el) return null;
          return (
            <ElementRow
              key={keyOf(item)}
              element={el}
              descriptor={item}
              iconNone={catalog.iconNone}
              onChange={(patch) => patchAt(i, patch)}
              onMoveUp={() => moveAt(i, -1)}
              onMoveDown={() => moveAt(i, 1)}
              canMoveUp={i > 0}
              canMoveDown={i < order.length - 1}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        className={`focus-ring w-full py-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-telgrarr-on-accent shadow-card active:scale-[0.98] transition-all disabled:opacity-50 ${
          saveState === 'saved' ? 'bg-telgrarr-success' : saveState === 'error' ? 'bg-telgrarr-danger' : 'bg-telgrarr-purple hover:bg-telgrarr-purple-glow'
        }`}
      >
        {saving ? <RefreshCw className="w-4 h-4 animate-spin motion-reduce:animate-none" />
          : saveState === 'saved' ? <CheckCircle className="w-4 h-4" />
          : saveState === 'error' ? <XCircle className="w-4 h-4" />
          : <Save className="w-4 h-4" />}
        <span>{saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : 'Save Layout'}</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {saving ? 'Saving' : saveState === 'saved' ? 'Layout saved' : saveState === 'error' ? 'Save failed' : ''}
      </span>
    </div>
  );
}
