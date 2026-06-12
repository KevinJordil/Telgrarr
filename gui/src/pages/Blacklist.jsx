import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Ban, Search, Folder, Tv, Film, X, ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import api from '../api';

const TABS   = ['titles', 'folders'];
const TYPES  = ['sonarr', 'radarr'];

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Blacklist() {
  const reduceMotion = useReducedMotion();
  const [tab,     setTab]     = useState('titles');
  const [type,    setType]    = useState('sonarr');
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [confirm, setConfirm] = useState(null); // { item, action }
  const debounced = useDebounce(query, 450);

  // ── Search titles ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'titles') return;
    if (!debounced.trim()) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get('/blacklist/search', { params: { type, q: debounced.trim() } })
      .then(r => { if (!cancelled) setResults(r.data); })
      .catch(e => { if (!cancelled) setError(e.response?.data?.error || 'Search failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, type, tab]);

  // ── Load folders ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'folders') return;
    setLoading(true);
    setError(null);
    api.get('/blacklist/rootfolders', { params: { type } })
      .then(r => setFolders(r.data))
      .catch(e => setError(e.response?.data?.error || 'Failed to load folders'))
      .finally(() => setLoading(false));
  }, [tab, type]);

  // ── Reset state on tab/type switch ───────────────────────────────────────────
  useEffect(() => {
    setResults([]);
    setFolders([]);
    setQuery('');
    setError(null);
  }, [tab, type]);

  // ── Toggle handlers ──────────────────────────────────────────────────────────
  const toggleId = useCallback((item) => {
    const action = item.blacklisted ? 'remove' : 'add';
    setConfirm({ item, action });
  }, []);
  const togglePath = useCallback((folder) => {
    const action = folder.blacklisted ? 'remove' : 'add';
    setConfirm({ item: folder, action, isPath: true });
  }, []);
  const executeToggle = async () => {
    const { item, action, isPath } = confirm;
    setConfirm(null);
    try {
      if (isPath) {
        await api.post(`/blacklist/paths/${action}`, { type, path: item.path });
        setFolders(prev => prev.map(f => f.path === item.path ? { ...f, blacklisted: action === 'add' } : f));
      } else {
        await api.post(`/blacklist/ids/${action}`, { type, id: item.id });
        setResults(prev => prev.map(r => r.id === item.id ? { ...r, blacklisted: action === 'add' } : r));
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Action failed');
    }
  };

  return (
    <div className="text-telgrarr-text">
      {/* Sticky header — sticks within the AuthLayout scroll region */}
      <div className="sticky top-0 z-30 bg-telgrarr-surface/90 backdrop-blur-xl border-b border-telgrarr-border px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-4">
          <Ban className="w-5 h-5 text-telgrarr-purple" strokeWidth={2} />
          <h1 className="text-lg font-semibold tracking-tight">Blacklist</h1>
        </div>
        {/* Tab: Titles / Folders */}
        <div className="flex gap-1 p-1 bg-telgrarr-elevated rounded-xl mb-3" role="tablist" aria-label="Blacklist mode">
          {TABS.map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`focus-ring flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-telgrarr-purple text-telgrarr-on-accent' : 'text-telgrarr-muted hover:text-telgrarr-text'
              }`}
            >
              {t === 'titles' ? <Film className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
              {t}
            </button>
          ))}
        </div>
        {/* Sub-tab: Sonarr / Radarr */}
        <div className="flex gap-2">
          {TYPES.map(tp => (
            <button
              key={tp}
              aria-pressed={type === tp}
              onClick={() => setType(tp)}
              className={`focus-ring flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                type === tp
                  ? 'bg-telgrarr-purple/20 text-telgrarr-purple border border-telgrarr-purple/40'
                  : 'text-telgrarr-muted border border-telgrarr-border hover:text-telgrarr-text'
              }`}
            >
              {tp === 'sonarr' ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
              {tp.charAt(0).toUpperCase() + tp.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto">
        {/* Search bar — titles only */}
        {tab === 'titles' && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-telgrarr-muted" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${type === 'sonarr' ? 'series' : 'movies'}…`}
              className="w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl pl-9 pr-9 py-2.5 text-sm text-telgrarr-text placeholder-telgrarr-muted focus:outline-none focus:border-telgrarr-purple transition-colors"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search" className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded text-telgrarr-muted hover:text-telgrarr-text">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-telgrarr-danger/10 border border-telgrarr-danger/30 text-telgrarr-danger text-sm" role="alert">
            {error}
          </div>
        )}
        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-telgrarr-purple animate-spin" />
          </div>
        )}
        {/* Title results */}
        {!loading && tab === 'titles' && (
          <AnimatePresence mode="popLayout">
            {results.length === 0 && query.trim() && !error && (
              <motion.p
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-center text-telgrarr-muted text-sm py-12"
              >
                No results for "{query}"
              </motion.p>
            )}
            {results.length === 0 && !query.trim() && (
              <motion.p
                key="hint"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-center text-telgrarr-muted text-sm py-12"
              >
                Search to find titles
              </motion.p>
            )}
            {results.map((item, i) => (
              <motion.div
                key={item.id + '-' + item.title}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ delay: reduceMotion ? 0 : i * 0.03 }}
                className="glass-panel rounded-xl mb-2 flex items-center gap-3 p-3"
              >
                {item.posterUrl
                  ? <img src={item.posterUrl} alt={item.title} className="w-10 h-14 object-cover rounded-lg shrink-0" />
                  : <div className="w-10 h-14 bg-telgrarr-elevated rounded-lg shrink-0 flex items-center justify-center">
                      {type === 'sonarr' ? <Tv className="w-4 h-4 text-telgrarr-muted" /> : <Film className="w-4 h-4 text-telgrarr-muted" />}
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-telgrarr-muted">{item.year || '—'}</p>
                  {item.id === 0 && (
                    <p className="text-[10px] text-telgrarr-warning mt-0.5">Not in library</p>
                  )}
                </div>
                <button
                  onClick={() => item.id !== 0 && toggleId(item)}
                  disabled={item.id === 0}
                  className={`focus-ring shrink-0 p-2 rounded-lg transition-colors ${
                    item.id === 0
                      ? 'opacity-30 cursor-not-allowed'
                      : item.blacklisted
                        ? 'bg-telgrarr-danger/20 text-telgrarr-danger hover:bg-telgrarr-danger/30'
                        : 'bg-telgrarr-elevated text-telgrarr-muted hover:text-telgrarr-text'
                  }`}
                  aria-label={item.blacklisted ? 'Remove from blacklist' : 'Add to blacklist'}
                >
                  {item.blacklisted
                    ? <ShieldOff className="w-4 h-4" />
                    : <ShieldCheck className="w-4 h-4" />
                  }
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        {/* Folder results */}
        {!loading && tab === 'folders' && (
          <AnimatePresence mode="popLayout">
            {folders.length === 0 && !error && (
              <motion.p
                key="empty-folders"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-center text-telgrarr-muted text-sm py-12"
              >
                No root folders found
              </motion.p>
            )}
            {folders.map((folder, i) => (
              <motion.div
                key={folder.path}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : i * 0.05 }}
                className="glass-panel rounded-xl mb-2 flex items-center gap-3 p-4"
              >
                <Folder className={`w-5 h-5 shrink-0 ${folder.blacklisted ? 'text-telgrarr-danger' : 'text-telgrarr-muted'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{folder.label}</p>
                  <p className="text-[11px] text-telgrarr-muted truncate">{folder.path}</p>
                </div>
                <button
                  onClick={() => togglePath(folder)}
                  className={`focus-ring shrink-0 p-2 rounded-lg transition-colors ${
                    folder.blacklisted
                      ? 'bg-telgrarr-danger/20 text-telgrarr-danger hover:bg-telgrarr-danger/30'
                      : 'bg-telgrarr-elevated text-telgrarr-muted hover:text-telgrarr-text'
                  }`}
                  aria-label={folder.blacklisted ? 'Unblock folder' : 'Block folder'}
                >
                  {folder.blacklisted
                    ? <ShieldOff className="w-4 h-4" />
                    : <ShieldCheck className="w-4 h-4" />
                  }
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Confirm modal */}
      <ConfirmModal
        isOpen={!!confirm}
        title={confirm?.action === 'add' ? 'Add to Blacklist' : 'Remove from Blacklist'}
        message={
          confirm?.action === 'add'
            ? `Block "${confirm?.item?.title || confirm?.item?.label}" from triggering notifications?`
            : `Allow "${confirm?.item?.title || confirm?.item?.label}" to trigger notifications again?`
        }
        confirmLabel={confirm?.action === 'add' ? 'Block' : 'Unblock'}
        danger={confirm?.action === 'add'}
        onConfirm={executeToggle}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
