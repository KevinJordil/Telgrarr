import React, { useState, useRef, useEffect } from 'react';
import { Moon, Sun, Zap, Send, Palette } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import useThemeStore from '../store/themeStore';

const THEMES = [
  { id: 'dark', label: 'Dark Mode', icon: Moon },
  { id: 'light', label: 'Light Mode', icon: Sun },
  { id: 'neon', label: 'Neon Glow', icon: Zap },
  { id: 'telegram', label: 'Telegram Native', icon: Send }
];

export default function ThemeSwitcher() {
  const { theme, setTheme } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const menuRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsOpen(false);
    };
    const handleKey = (event) => { if (event.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const currentTheme = THEMES.find(t => t.id === theme) || THEMES[0];
  const ActiveIcon = currentTheme.icon;

  return (
    <div className="relative z-50" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="focus-ring flex items-center justify-center p-2 rounded-xl bg-telgrarr-surface border border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text transition-colors shadow-xs"
        aria-label="Change theme" aria-haspopup="menu" aria-expanded={isOpen} title="Change Theme"
      >
        <ActiveIcon className="w-5 h-5" />
      </button>

      {isOpen && (
        <motion.div
          role="menu"
          aria-label="Theme"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.18, ease: 'easeOut' }}
          className="absolute right-0 mt-2 w-48 bg-telgrarr-surface border border-telgrarr-border rounded-xl shadow-glass overflow-hidden"
        >
          <div className="px-3 py-2 text-xs font-bold text-telgrarr-muted uppercase tracking-wider border-b border-telgrarr-border flex items-center">
            <Palette className="w-3 h-3 mr-1.5" /> Appearance
          </div>
          <div className="p-1">
            {THEMES.map((t) => {
              const Icon = t.icon;
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTheme(t.id); setIsOpen(false); }}
                  role="menuitem"
                  className={`focus-ring w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive 
                      ? 'bg-telgrarr-purple/10 text-telgrarr-purple' 
                      : 'text-telgrarr-text hover:bg-telgrarr-black/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-telgrarr-purple' : 'text-telgrarr-muted'}`} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
