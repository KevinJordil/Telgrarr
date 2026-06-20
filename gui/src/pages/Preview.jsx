import React, { useState, useEffect, useRef } from 'react';
import { Film, Tv, Send, Save, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
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

const STARTER_AR = `<b>{{headerEmoji}} {{headerText}}</b>
{{separator}}
📺 <b>{{title}}</b>{{#if genres}}
🎭 {{genres}}{{/if}}{{#if year}}
📆 {{year}}{{status}}{{/if}}
{{separator}}
<b>الموسم:</b> {{seasonRange}}
<b>{{epLabel}}</b> {{epValue}}{{#if runtime}}
⏳     <b>مدة الحلقة:</b> {{runtime}}{{/if}}
&#8203;`;

const TOKENS = {
  sonarr: ['{{title}}', '{{year}}', '{{genres}}', '{{status}}', '{{status_en}}', '{{seasonRange}}', '{{epLabel}}', '{{epValue}}', '{{epLabel_en}}', '{{epValue_en}}', '{{runtime}}', '{{runtime_en}}', '{{imdbUrl}}', '{{seerrUrl}}'],
  radarr: ['{{title}}', '{{year}}', '{{genres}}', '{{overview}}', '{{runtime}}', '{{runtime_en}}', '{{rating.value}}', '{{rating.label}}', '{{ratings.imdb}}', '{{ratings.tmdb}}', '{{ratings.rottenTomatoes}}', '{{ratings.metacritic}}', '{{imdbUrl}}', '{{seerrUrl}}']
};

export default function Preview() {
  const { templates: config, loading, error, saving: storeSaving, fetchTemplates, setActiveMode, addSlot, updateSlot, deleteSlot, catalog } = useTemplatesStore();
  const { settings } = useSettingsStore();
  const targetLang = settings?.translator?.targetLang || 'ar';
  const [type, setType]                     = useState('sonarr');
  const [scenario, setScenario]             = useState('single');
  const [currentView, setCurrentView]       = useState('default');
  const [draft, setDraft]                   = useState('');
  const [html, setHtml]                     = useState('');
  const [syntaxError, setSyntaxError]       = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [modal, setModal]   = useState(null);
  const [sendState, setSendState] = useState('idle'); // idle | sending | sent | error
  const [slotError, setSlotError] = useState(null);
  const initializedRef = useRef(false);
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
      setCurrentView((!m || m === 'default' || m === 'default_ar' || m === 'default_en') ? 'default' : m);
    }
  }, [config]);
  useEffect(() => {
    if (!config) return;
    setSyntaxError(null);
    if (currentView === 'default') {
      setDraft('');
    } else {
      const slot = config.slots.find(s => s.id === currentView);
      const backup = localStorage.getItem(`telgrarr_draft_${currentView}_${type}`);
      if (backup !== null) setDraft(backup);
      else if (slot) setDraft(slot[type] || '');
    }
  }, [currentView, type, config]);
  useEffect(() => {
    if (currentView !== 'default' && draft !== '') {
      localStorage.setItem(`telgrarr_draft_${currentView}_${type}`, draft);
    }
  }, [draft, currentView, type]);
  useEffect(() => {
    if (!config) return;
    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const body = currentView === 'default'
          ? { type, scenario, lang: targetLang }
          : { type, scenario, template: draft === '' ? '&#8203;' : draft };
        const res = await api.post('/preview/render', body);
        if (res.data.success === false) setSyntaxError(res.data.error);
        else { setSyntaxError(null); setHtml(res.data.html); }
      } catch (err) { setSyntaxError('Network or server error. Check backend logs.'); }
      finally { setLoadingPreview(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [type, scenario, currentView, draft, config, targetLang]);
  const confirmAddSlot = async (name) => {
    setModal(null);
    const newSlot = { id: `slot_${Date.now()}`, name, sonarr: STARTER_AR, radarr: STARTER_AR };
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
      localStorage.removeItem(`telgrarr_draft_${currentView}_sonarr`);
      localStorage.removeItem(`telgrarr_draft_${currentView}_radarr`);
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
    if (!res.success) setSlotError(res.error);
  };
  const sendTest = async () => {
    setSendState('sending');
    try {
      const body = currentView === 'default'
        ? { type, scenario, lang: targetLang }
        : { type, scenario, template: draft || null };
      await api.post('/preview/send', body);
      setSendState('sent');
    } catch (error) { setSendState('error'); }
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
  return (
    <div className="text-telgrarr-text px-4 pt-6 overflow-x-hidden relative">
      <div className="max-w-5xl mx-auto md:grid md:grid-cols-12 md:gap-8 relative z-10">
        <div className="md:col-span-7 space-y-6">
          <h1 className="text-2xl font-bold text-telgrarr-text tracking-tight">Style Editor</h1>
          <SlotManager templates={config} currentView={currentView} onSelectView={setCurrentView} onAdd={() => setModal({ kind: 'add' })} onRename={() => setModal({ kind: 'rename' })} onDelete={() => setModal({ kind: 'delete' })} onMakeActive={handleMakeActive} />
          {slotError && (
            <p role="alert" className="text-xs text-telgrarr-danger px-1 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 shrink-0" />
              {slotError}
            </p>
          )}
          <div className="flex space-x-2 bg-telgrarr-surface p-1 rounded-xl border border-telgrarr-border shadow-card">
            <button onClick={() => { setType('sonarr'); setScenario('single'); }} className={`focus-ring flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'sonarr' ? 'bg-telgrarr-purple text-telgrarr-on-accent shadow-md' : 'text-telgrarr-muted hover:bg-telgrarr-border/50'}`}><Tv className="w-4 h-4" /><span>Sonarr</span></button>
            <button onClick={() => { setType('radarr'); setScenario('single'); }} className={`focus-ring flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'radarr' ? 'bg-telgrarr-purple text-telgrarr-on-accent shadow-md' : 'text-telgrarr-muted hover:bg-telgrarr-border/50'}`}><Film className="w-4 h-4" /><span>Radarr</span></button>
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
              <TemplateEditor value={draft} onChange={setDraft} tokens={TOKENS[type]} readOnly={false} syntaxError={syntaxError} />
              <button onClick={saveDraftToSlot} disabled={storeSaving} className="focus-ring w-full py-3 bg-telgrarr-success hover:bg-telgrarr-success/90 disabled:opacity-50 text-telgrarr-on-accent font-medium rounded-xl flex items-center justify-center space-x-2 shadow-card active:scale-[0.98] transition-all">
                {storeSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save Code to Slot</span>
              </button>
            </>
          ) : (
            <>
              <LanguagePicker languages={catalog?.languages || []} />
              <LayoutComposer kind={type} />
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
    </div>
  );
}
