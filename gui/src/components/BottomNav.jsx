import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Home, Ban, Settings, MoreHorizontal, Sparkles, ScrollText, Info } from 'lucide-react';

const PRIMARY_TABS = [
  { id: 'home',      label: 'Home',      icon: Home,     path: '/dashboard' },
  { id: 'blacklist', label: 'Blacklist', icon: Ban,      path: '/blacklist' },
  { id: 'settings',  label: 'Settings',  icon: Settings, path: '/settings'  },
];

const SHEET_ITEMS = [
  { id: 'preview', label: 'Preview', icon: Sparkles,   path: '/preview' },
  { id: 'logs',    label: 'Logs',    icon: ScrollText, path: '/logs'    },
  { id: 'about',   label: 'About',   icon: Info,       path: '/about'   },
];

const SHEET_PATHS = SHEET_ITEMS.map(i => i.path);

export default function BottomNav() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const moreActive = SHEET_PATHS.includes(location.pathname);

  function handleTab(path, soon) {
    if (soon) return;
    setOpen(false);
    navigate(path);
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-telgrarr-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="sheet"
            initial={reduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
            transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 380, damping: 36, mass: 0.8 }}
            className="fixed bottom-16 sm:bottom-28 left-0 right-0 z-50 mx-auto max-w-lg px-3 pb-2"
          >
            <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-4 pt-4 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-telgrarr-muted">More</p>
              </div>
              {SHEET_ITEMS.map(({ id, label, icon: Icon, path, soon }) => {
                const isActive = location.pathname === path;
                return (
                  <button
                    key={id}
                    onClick={() => handleTab(path, soon)}
                    aria-label={label}
                    className={
                      'focus-ring w-full flex items-center gap-4 px-4 py-3.5 transition-all ' +
                      (soon ? 'opacity-40 cursor-not-allowed ' : 'hover:bg-telgrarr-text/5 active:bg-telgrarr-text/10 ') +
                      (isActive ? 'text-telgrarr-purple' : 'text-telgrarr-text')
                    }
                  >
                    <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2.5 : 1.8} />
                    <span className="text-sm font-medium">{label}</span>
                    {isActive && !soon && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-telgrarr-purple" />
                    )}
                  </button>
                );
              })}
              <div className="h-3" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RESPONSIVE OPTIMIZATION: The macOS Floating Dock upgrade */}
      <nav className="fixed bottom-0 sm:bottom-6 left-0 right-0 z-50 bg-telgrarr-black/95 sm:bg-telgrarr-surface/85 backdrop-blur-xl border-t sm:border border-telgrarr-border safe-area-bottom sm:max-w-md sm:mx-auto sm:rounded-2xl sm:shadow-glass overflow-hidden transition-all duration-300">
        <div className="flex items-stretch h-16 w-full">
          {PRIMARY_TABS.map(({ id, label, icon: Icon, path, soon }) => {
            const isActive = location.pathname === path;
            return (
              <button
                key={id}
                onClick={() => handleTab(path, soon)}
                aria-label={label}
                className={
                  'focus-ring relative flex-1 flex flex-col items-center justify-center gap-1 transition-all ' +
                  (isActive ? 'text-telgrarr-purple' : 'text-telgrarr-muted') +
                  ' hover:text-telgrarr-text active:scale-95'
                }
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-telgrarr-purple rounded-full" />
                )}
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="text-[10px] font-medium tracking-wide">{label}</span>
              </button>
            );
          })}

          <button
            onClick={() => setOpen(prev => !prev)}
            aria-label="More"
            aria-expanded={open}
            aria-haspopup="menu"
            className={
              'focus-ring relative flex-1 flex flex-col items-center justify-center gap-1 transition-all ' +
              (moreActive || open ? 'text-telgrarr-purple' : 'text-telgrarr-muted') +
              ' hover:text-telgrarr-text active:scale-95'
            }
          >
            {(moreActive || open) && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-telgrarr-purple rounded-full" />
            )}
            <MoreHorizontal className="w-5 h-5" strokeWidth={moreActive || open ? 2.5 : 1.8} />
            <span className="text-[10px] font-medium tracking-wide">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
