import React, { useState, useEffect, useRef } from 'react';
import { Film, Tv, Send, Save, RefreshCw, CheckCircle, XCircle, Undo2 } from 'lucide-react';
import api from '../api';
import useTemplatesStore from '../store/templatesStore';
import TelegramMock from '../components/preview/TelegramMock';
import TemplateEditor from '../components/preview/TemplateEditor';
import SlotManager from '../components/preview/SlotManager';
import ConfirmModal from '../components/ConfirmModal';
import InputModal from '../components/InputModal';
import LayoutComposer from '../components/preview/LayoutComposer';
import LanguagePicker from '../components/preview/LanguagePicker';
import useSettingsStore from '../store/settingsStore';

const TOKENS = {
  sonarr: ['{{title}}', '{{year}}', '{{genres}}', '{{status}}', '{{status_en}}', '{{seasonRange}}', '{{epLabel}}', '{{epValue}}', '{{epLabel_en}}', '{{epValue_en}}', '{{runtime}}', '{{runtime_en}}', '{{imdbUrl}}', '{{seerrUrl}}'],
  radarr: ['{{title}}', '{{year}}', '{{genres}}', '{{overview}}', '{{runtime}}', '{{runtime_en}}', '{{rating.value}}', '{{rating.label}}', '{{ratings.imdb}}', '{{ratings.tmdb}}', '{{ratings.rottenTomatoes}}', '{{ratings.metacritic}}', '{{imdbUrl}}', '{{seerrUrl}}']
};

// c-7: default-family mode taxonomy. Canonical mode is 'default'; 'default_ar' and
// 'default_en' are recognised LEGACY ALIASES (P5b-2), all shown as the one "Default
// styling" view. Single source for the family check (de-duplicates the former inline
// list in the init effect).
const isDefaultMode = (m) => !m || m === 'default' || m === 'default_ar' || m === 'default_en';

export default function Preview() {
  const { templates: config, loading, error, saving: storeSaving, fetchTemplates, setActiveMode, addSlot, updateSlot, deleteSlot, fetchComposed, catalog, layout } = useTemplatesStore();
  const { settings } = useSettingsStore();
  const targetLang = settings?.translator?.targetLang || 'ar';
  const [type, setType]                     = useState('sonarr');
  const [scenario, setScenario]             = useState('single');
  const [currentView, setCurrentView]       = useState('default');
  const [draft, setDraft]                   = useState('');
  const [draftLayout, setDraftLayout]       = useState(null); // B4: live layout draft lifted from LayoutComposer
  const [html, setHtml]                     = useState('');
  const [syntaxError, setSyntaxError]       = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [modal, setModal]   = useState(null);
  const [sendState, setSendState] = useState('idle'); // idle | sending | sent | error
  const [slotError, setSlotError] = useState(null);
  const initializedRef = useRef(false);
  const hydratedKeyRef = useRef(null);
  const draftKey = (kind) => `telgrarr_draft_${currentView}_${kind}`;
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  useEffect(() => {
    if (!slotError) return;
    const t = setTimeout(() => setSlotError(null), 4000);
    return () => clearTimeout(t);
  }, [slotError]);
  useEffect(() => {
    if (sendState !== 'sent' && sendState !== 'error') return;
    const t = setTimeout(() => setSendState('idle'), 2500);
    return () => clearTimeout(t);
  }, [sendState]);
  useEffect(() => {
    if (config && !initializedRef.current) {
      initializedRef.current = true;
      const m = config.activeMode;
      setCurrentView(isDefaultMode(m) ? 'default' : m);
    }
  }, [config]);
  useEffect(() => {
    if (!config || currentView === 'default') return;
    if (hydratedKeyRef.current !== `${currentView}_${type}`) return;
    const key = draftKey(type);
    const slot = config.slots.find(s => s.id === currentView);
    const savedValue = slot?.[type] || '';
    if (draft === savedValue) localStorage.removeItem(key);
    else localStorage.setItem(key, draft);
  }, [draft, currentView, type, config]);
  useEffect(() => {
    if (!config) return;
    setSyntaxError(null);
    if (currentView === 'default') {
      setDraft('');
      hydratedKeyRef.current = null;
      return;
    }
    const slot = config.slots.find(s => s.id === currentView);
    const savedValue = slot?.[type] || '';
    const key = draftKey(type);
    const backup = localStorage.getItem(key);
    if (backup === null) setDraft(savedValue);
    else if (backup === savedValue) { localStorage.removeItem(key); setDraft(savedValue); }
    else setDraft(backup);
    hydratedKeyRef.current = `${currentView}_${type}`;
  }, [currentView, type, config]);
  useEffect(() => {
    if (!config) return;
    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const body = currentView === 'default'
          ? { type, scenario, lang: targetLang, ...(draftLayout ? { layout: draftLayout } : {}) }
          : { type, scenario, template: draft || null };
        const res = await api.post('/preview/render', body);
        if (res.data.success === false) setSyntaxError(res.data.error);
        else { setSyntaxError(null); setHtml(res.data.html); }
      } catch (err) { setSyntaxError('Network or server error. Check backend logs.'); }
      finally { setLoadingPreview(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [type, scenario, currentView, draft, config, targetLang, layout, draftLayout]); // +layout: re-render on saved-layout change (B2)
  const confirmAddSlot = async (name) => {
    setModal(null);
    const [sonarrRes, radarrRes] = await Promise.all([
      fetchComposed('sonarr', targetLang),
      fetchComposed('radarr', targetLang),
    ]);
    if (!sonarrRes.success || !radarrRes.success) {
      setSlotError(`Slot not created. Could not load default styling: ${sonarrRes.error || radarrRes.error}`);
      return;
    }
    const newSlot = { id: `slot_${Date.now()}`, name, sonarr: sonarrRes.template, radarr: radarrRes.template };
    const res = await addSlot(newSlot);
    if (res.success) setCurrentView(newSlot.id);
    else setSlotError(res.error);
  };
  const confirmRenameSlot = async (newName) => {
    setModal(null);
    const slot = config.slots.find(s => s.id === currentView);
    if (!slot || newName === slot.name) return;
    const res = await updateSlot(currentView, { name: newName });
    if (!res.success) setSlotError(res.error);
  };
  const confirmDeleteSlot = async () => {
    setModal(null);
    const res = await deleteSlot(currentView);
    if (res.success) {
      localStorage.removeItem(draftKey('sonarr'));
      localStorage.removeItem(draftKey('radarr'));
      setCurrentView('default');
    }
    else setSlotError(res.error);
  };
  const handleMakeActive = async () => {
    const res = await setActiveMode(currentView);
    if (!res.success) setSlotError(res.error);
  };
  const saveDraftToSlot = async () => {
    const res = await updateSlot(currentView, { [type]: draft });
    if (res.success) localStorage.removeItem(`telgrarr_draft_${currentView}_${type}`);
    else setSlotError(res.error);
  };
  const loadDefaultStyling = async () => {
    setModal(null);
    const res = await fetchComposed(type, targetLang);
    if (res.success) setDraft(res.template);
    else setSlotError(`Could not load default styling: ${res.error}`);
  };
  const requestLoadDefault = () => {
    const slot = config.slots.find(s => s.id === currentView);
    const savedValue = slot?.[type] || '';
    if (draft !== savedValue) setModal({ kind: 'loadDefault' });
    else loadDefaultStyling();
  };
  const sendTest = async () => {
    setSendState('sending');
    try {
      const body = currentView === 'default'
        ? { type, scenario, lang: targetLang }
        : { type, scenario, template: draft || null };
      await api.post('/preview/send', body);
      setSendState('sent');
    } catch (error) {
      setSendState('error');
      setSlotError(error?.response?.data?.error || error?.message || 'Send failed. Check backend logs.');
    }
  };
  if (!config && error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <XCircle className="w-10 h-10 text-telgrarr-danger" />
        <p className="text-telgrarr-text font-semibold">Failed to load templates</p>
        <p className="text-telgrarr-muted text-sm">{error}</p>
        <button onClick={fetchTemplates} className="focus-ring flex items-center gap-2 px-4 py-2.5 bg-telgrarr-purple hover:bg-telgrarr-purple-glow text-telgrarr-on-accent text-sm font-semibold rounded-xl transition-all">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }
  if (loading || !config) return <div className="flex justify-center items-center py-32"><RefreshCw className="w-8 h-8 animate-spin text-telgrarr-purple" /></div>;
  const isCustom = currentView !== 'default';
  const currentSlot = config.slots.find(s => s.id === currentView);
  const siblingType = type === 'sonarr' ? 'radarr' : 'sonarr';
  const savedValue = isCustom ? (currentSlot?.[type] || '') : '';
  const isDirty = isCustom && draft !== savedValue;
  const draftDotFor = (kind) => isCustom && type !== kind && localStorage.getItem(draftKey(kind)) !== null;
  const discardDraft = () => {
    setModal(null);
    setDraft(savedValue);
  };
  const requestDiscard = () => {
    if (isDirty) setModal({ kind: 'discard' });
  };
  const copyFromOtherType = () => {
    setModal(null);
    const backup = localStorage.getItem(draftKey(siblingType));
    const siblingSaved = currentSlot?.[siblingType] || '';
    setDraft(backup !== null ? backup : siblingSaved);
  };
  const requestCopyFromOther = () => {
    if (isDirty) setModal({ kind: 'copyOther' });
    else copyFromOtherType();
  };
  return (
    <div className="text-telgrarr-text px-4 pt-6 overflow-x-hidden relative">
      <div className="max-w-5xl mx-auto md:grid md:grid-cols-12 md:gap-8 relative z-10">
        <div className="md:col-span-7 space-y-6">
          <h1 className="text-2xl font-bold text-telgrarr-text tracking-tight">Style Editor</h1>
          <SlotManager templates={config} currentView={currentView} onSelectView={setCurrentView} onAdd={() => setModal({ kind: 'add' })} onRename={() => setModal({ kind: 'rename' })} onDelete={() => setModal({ kind: 'delete' })} defaultActive={isDefaultMode(config.activeMode)} onMakeActive={handleMakeActive} />
          {slotError && (
            <p role="alert" className="text-xs text-telgrarr-danger px-1 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 shrink-0" />
              {slotError}
            </p>
          )}
          <div className="flex space-x-2 bg-telgrarr-surface p-1 rounded-xl border border-telgrarr-border shadow-card">
            <button onClick={() => { setType('sonarr'); setScenario('single'); }} className={`focus-ring flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'sonarr' ? 'bg-telgrarr-purple text-telgrarr-on-accent shadow-md' : 'text-telgrarr-muted hover:bg-telgrarr-border/50'}`}><Tv className="w-4 h-4" /><span>Sonarr</span>{draftDotFor('sonarr') && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-telgrarr-purple" />}</button>
            <button onClick={() => { setType('radarr'); setScenario('single'); }} className={`focus-ring flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'radarr' ? 'bg-telgrarr-purple text-telgrarr-on-accent shadow-md' : 'text-telgrarr-muted hover:bg-telgrarr-border/50'}`}><Film className="w-4 h-4" /><span>Radarr</span>{draftDotFor('radarr') && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-telgrarr-purple" />}</button>
          </div>
          {type === 'sonarr' && (
            <div className="flex space-x-2">
              {['single', 'multi', 'multiseason'].map((scen) => (
                <button key={scen} onClick={() => setScenario(scen)} className={`focus-ring flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${scenario === scen ? 'bg-telgrarr-surface border-telgrarr-purple text-telgrarr-purple shadow-xs' : 'bg-transparent border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text'}`}>
                  {scen === 'single' ? '1 Ep' : scen === 'multi' ? 'Multi-Ep' : 'Multi-Season'}
                </button>
              ))}
            </div>
          )}
          {isCustom ? (
            <>
              {draft === '' && (
                <p role="status" aria-live="polite" className="text-xs text-telgrarr-muted px-1">
                  This slot is empty. Until you add content, Telgrarr renders and sends the Default (Locked) styling, translated to your configured language.
                </p>
              )}
              <TemplateEditor value={draft} onChange={setDraft} tokens={TOKENS[type]} readOnly={false} syntaxError={syntaxError} />
              <button onClick={saveDraftToSlot} disabled={storeSaving || !isDirty} className="focus-ring w-full py-3 bg-telgrarr-success hover:bg-telgrarr-success/90 disabled:opacity-50 text-telgrarr-on-accent font-medium rounded-xl flex items-center justify-center space-x-2 shadow-card active:scale-[0.98] transition-all">
                {storeSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save Code to Slot</span>
              </button>
              {isDirty && (
                <p role="status" aria-live="polite" className="text-xs text-telgrarr-purple font-medium px-1 flex items-center gap-1.5">
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-telgrarr-purple" />
                  Unsaved changes
                </p>
              )}
              <button onClick={requestLoadDefault} disabled={storeSaving} className="focus-ring w-full py-2.5 bg-transparent hover:bg-telgrarr-border/50 border border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text text-sm font-medium rounded-xl flex items-center justify-center space-x-2 transition-colors">
                <RefreshCw className="w-4 h-4" />
                <span>Load Default styling</span>
              </button>
              <button onClick={requestDiscard} disabled={storeSaving || !isDirty} className="focus-ring w-full py-2.5 bg-transparent hover:bg-telgrarr-danger/10 border border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-danger text-sm font-medium rounded-xl flex items-center justify-center space-x-2 transition-colors">
                <Undo2 className="w-4 h-4" />
                <span>Discard Changes</span>
              </button>
              <button onClick={requestCopyFromOther} disabled={storeSaving} className="focus-ring w-full py-2.5 bg-transparent hover:bg-telgrarr-border/50 border border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text text-sm font-medium rounded-xl flex items-center justify-center space-x-2 transition-colors">
                <RefreshCw className="w-4 h-4" />
                <span>Copy from {siblingType === 'sonarr' ? 'Sonarr' : 'Radarr'}</span>
              </button>
            </>
          ) : (
            <>
              <LanguagePicker languages={catalog?.languages || []} />
              <LayoutComposer kind={type} onDraftChange={setDraftLayout} />
            </>
          )}
        </div>
        <div className="md:col-span-5 mt-8 md:mt-0 relative">
          <div className="md:sticky md:top-24 space-y-6">
            <TelegramMock html={html} loading={loadingPreview} />
            <button
              onClick={sendTest}
              disabled={sendState === 'sending' || loadingPreview || !!syntaxError}
              className={`focus-ring w-full py-3.5 px-4 disabled:opacity-50 text-telgrarr-on-accent font-semibold rounded-xl flex items-center justify-center space-x-2 shadow-lg active:scale-[0.98] transition-all ${
                sendState === 'sent'
                  ? 'bg-telgrarr-success hover:bg-telgrarr-success'
                  : sendState === 'error'
                    ? 'bg-telgrarr-danger hover:bg-telgrarr-danger'
                    : 'bg-telgrarr-purple hover:bg-telgrarr-purple-dark shadow-telgrarr-purple/20'
              }`}
            >
              {sendState === 'sending' ? (
                <><RefreshCw className="w-5 h-5 animate-spin" /><span>Sending&#8230;</span></>
              ) : sendState === 'sent' ? (
                <><CheckCircle className="w-5 h-5" /><span>Sent</span></>
              ) : sendState === 'error' ? (
                <><XCircle className="w-5 h-5" /><span>Send failed</span></>
              ) : (
                <><Send className="w-5 h-5" /><span>Send Test Notification</span></>
              )}
            </button>
          </div>
        </div>
      </div>

      <InputModal
        isOpen={modal?.kind === 'add'}
        title="New Preset Slot"
        label="Slot name"
        placeholder={'e.g. Compact, Detailed\u2026'}
        confirmLabel="Create"
        maxLength={40}
        onConfirm={confirmAddSlot}
        onCancel={() => setModal(null)}
      />
      <InputModal
        isOpen={modal?.kind === 'rename'}
        title="Rename Slot"
        label="Slot name"
        initialValue={currentSlot?.name || ''}
        confirmLabel="Rename"
        maxLength={40}
        onConfirm={confirmRenameSlot}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        isOpen={modal?.kind === 'delete'}
        title="Delete Slot"
        message="This permanently deletes this preset slot and cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={confirmDeleteSlot}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        isOpen={modal?.kind === 'loadDefault'}
        title="Load Default Styling"
        message="This replaces your unsaved changes in this editor with the composed Default styling. Nothing is saved to the slot until you press Save."
        confirmLabel="Load"
        danger
        onConfirm={loadDefaultStyling}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        isOpen={modal?.kind === 'discard'}
        title="Discard Changes"
        message="This reverts your unsaved changes back to the last saved version of this slot."
        confirmLabel="Discard"
        danger
        onConfirm={discardDraft}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        isOpen={modal?.kind === 'copyOther'}
        title="Copy from Other Type"
        message={`This replaces your unsaved changes in this editor with the ${siblingType} content from this slot. Nothing is saved until you press Save.`}
        confirmLabel="Copy"
        danger
        onConfirm={copyFromOtherType}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
