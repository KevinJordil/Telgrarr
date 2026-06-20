import React, { useEffect } from 'react';
import { Check, RefreshCw, XCircle } from 'lucide-react';
import useSettingsStore from '../../store/settingsStore';

// 6-language picker for Default styling. Writes config.translator.targetLang through the
// shared settings save path (R17): sends the FULL translator section with targetLang
// patched so no other translator field is dropped (masked secrets are sentinel-stripped
// server-side per SD-6, so round-tripping them is safe).
export default function LanguagePicker({ languages = [] }) {
  const { settings, fetchSettings, saveSection, saveStatus, saveErrors } = useSettingsStore();

  useEffect(() => { if (!settings) fetchSettings(); }, [settings, fetchSettings]);

  const current = (settings && settings.translator && settings.translator.targetLang) || 'ar';
  const status = saveStatus.translator;

  const choose = (code) => {
    if (code === current || status === 'saving') return;
    saveSection('translator', { translator: { ...((settings && settings.translator) || {}), targetLang: code } });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <p className="text-xs font-semibold text-telgrarr-muted uppercase tracking-wider">Language</p>
        <span role="status" aria-live="polite" className="flex items-center text-telgrarr-muted">
          {status === 'saving' && <RefreshCw className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />}
          {status === 'saved' && <Check className="w-3.5 h-3.5 text-telgrarr-success" />}
          {status === 'error' && <XCircle className="w-3.5 h-3.5 text-telgrarr-danger" />}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {languages.map((l) => {
          const active = current === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => choose(l.code)}
              aria-pressed={active}
              disabled={status === 'saving'}
              className={`focus-ring px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-60 ${
                active
                  ? 'bg-telgrarr-purple/10 border-telgrarr-purple text-telgrarr-purple'
                  : 'bg-telgrarr-surface border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text'
              }`}
            >
              {l.name}
            </button>
          );
        })}
      </div>
      {status === 'error' && saveErrors.translator && (
        <p role="alert" className="text-xs text-telgrarr-danger px-1">{saveErrors.translator}</p>
      )}
    </div>
  );
}
