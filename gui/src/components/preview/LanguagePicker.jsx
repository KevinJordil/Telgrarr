import React, { useEffect, useState } from 'react';
import { Check, RefreshCw, XCircle } from 'lucide-react';
import useSettingsStore from '../../store/settingsStore';
import useTemplatesStore from '../../store/templatesStore';

// 6-language picker for Default styling. Writes config.translator.targetLang through the
// shared settings save path (R17): sends the FULL translator section with targetLang
// patched so no other translator field is dropped (masked secrets are sentinel-stripped
// server-side per SD-6, so round-tripping them is safe).
export default function LanguagePicker({ languages = [] }) {
  const { settings, fetchSettings, saveSection, saveStatus, saveErrors } = useSettingsStore();
  const { templates, setActiveMode, saving: tplSaving } = useTemplatesStore();
  const [relocError, setRelocError] = useState(null);

  useEffect(() => { if (!settings) fetchSettings(); }, [settings, fetchSettings]);

  const isLegacyEn = templates?.activeMode === 'default_en';
  const storedLang = (settings && settings.translator && settings.translator.targetLang) || 'ar';
  const current = isLegacyEn ? 'en' : storedLang;
  const status = saveStatus.translator;
  const busy = status === 'saving' || tplSaving;

  const choose = async (code) => {
    if (busy) return;
    if (isLegacyEn) {
      // c-7 relocation, SAFETY ORDER: persist targetLang FIRST, then collapse the alias.
      // A collapse failure leaves 'default_en' (English, safe); never the inverse flip.
      setRelocError(null);
      const r = await saveSection('translator', { translator: { ...((settings && settings.translator) || {}), targetLang: code } });
      if (!r.success) return;
      const c = await setActiveMode('default');
      if (!c.success) setRelocError(c.error || 'Could not finalize the language change. Please retry.');
      return;
    }
    if (code === current) return;
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
              disabled={busy}
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
      {relocError && (
          <p role="alert" className="text-xs text-telgrarr-danger px-1">{relocError}</p>
        )}
        {status === 'error' && saveErrors.translator && (
        <p role="alert" className="text-xs text-telgrarr-danger px-1">{saveErrors.translator}</p>
      )}
    </div>
  );
}
