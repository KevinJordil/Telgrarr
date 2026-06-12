import React, { useState, useEffect, useRef } from 'react';
import { Film, Tv, Send, Save, RefreshCw } from 'lucide-react';
import api from '../api';
import useTemplatesStore from '../store/templatesStore';
import TelegramMock from '../components/preview/TelegramMock';
import TemplateEditor from '../components/preview/TemplateEditor';
import SlotManager from '../components/preview/SlotManager';

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
  const { templates: config, loading, saving: storeSaving, fetchTemplates, setActiveMode, addSlot, updateSlot, deleteSlot } = useTemplatesStore();
  const [type, setType]                     = useState('sonarr');
  const [scenario, setScenario]             = useState('single');
  const [currentView, setCurrentView]       = useState('default_ar');
  const [draft, setDraft]                   = useState('');
  const [html, setHtml]                     = useState('');
  const [syntaxError, setSyntaxError]       = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending]               = useState(false);
  const initializedRef = useRef(false);
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  useEffect(() => {
    if (config && !initializedRef.current) {
      initializedRef.current = true;
      setCurrentView(config.activeMode || 'default_ar');
    }
  }, [config]);
  useEffect(() => {
    if (!config) return;
    setSyntaxError(null);
    if (currentView === 'default_ar' || currentView === 'default_en') {
      setDraft('');
    } else {
      const slot = config.slots.find(s => s.id === currentView);
      const backup = localStorage.getItem(`telgrarr_draft_${currentView}_${type}`);
      if (backup !== null) setDraft(backup);
      else if (slot) setDraft(slot[type] || '');
    }
  }, [currentView, type, config]);
  useEffect(() => {
    if (currentView !== 'default_ar' && currentView !== 'default_en' && draft !== '') {
      localStorage.setItem(`telgrarr_draft_${currentView}_${type}`, draft);
    }
  }, [draft, currentView, type]);
  useEffect(() => {
    if (!config) return;
    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        let payloadTemplate = 'DEFAULT_AR';
        if (currentView === 'default_en') payloadTemplate = 'DEFAULT_EN';
        else if (currentView !== 'default_ar') payloadTemplate = draft === '' ? '&#8203;' : draft;
        const res = await api.post('/preview/render', { type, scenario, template: payloadTemplate });
        if (res.data.success === false) setSyntaxError(res.data.error);
        else { setSyntaxError(null); setHtml(res.data.html); }
      } catch (err) { setSyntaxError('Network or server error. Check backend logs.'); }
      finally { setLoadingPreview(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [type, scenario, currentView, draft, config]);
  const handleAddSlot = async () => {
    const name = window.prompt('Enter a name for your new preset slot:');
    if (!name) return;
    const newSlot = { id: `slot_${Date.now()}`, name, sonarr: STARTER_AR, radarr: STARTER_AR };
    const res = await addSlot(newSlot);
    if (res.success) setCurrentView(newSlot.id);
    else alert(res.error);
  };
  const handleRenameSlot = async () => {
    const slot = config.slots.find(s => s.id === currentView);
    if (!slot) return;
    const newName = window.prompt('Enter new name:', slot.name);
    if (!newName || newName === slot.name) return;
    const res = await updateSlot(currentView, { name: newName });
    if (!res.success) alert(res.error);
  };
  const handleDeleteSlot = async () => {
    if (!window.confirm('Are you sure you want to permanently delete this slot?')) return;
    const res = await deleteSlot(currentView);
    if (res.success) setCurrentView('default_ar');
    else alert(res.error);
  };
  const handleMakeActive = async () => {
    const res = await setActiveMode(currentView);
    if (!res.success) alert(res.error);
  };
  const saveDraftToSlot = async () => {
    const res = await updateSlot(currentView, { [type]: draft });
    if (!res.success) alert(res.error);
  };
  const sendTest = async () => {
    setSending(true);
    try {
      let payloadTemplate = 'DEFAULT_AR';
      if (currentView === 'default_en') payloadTemplate = 'DEFAULT_EN';
      else if (currentView !== 'default_ar') payloadTemplate = draft || null;
      await api.post('/preview/send', { type, scenario, template: payloadTemplate });
      alert('Test sent!');
    } catch (error) { alert('Failed to send test.'); }
    setSending(false);
  };
  if (loading || !config) return <div className="flex justify-center items-center py-32"><RefreshCw className="w-8 h-8 animate-spin text-telgrarr-purple" /></div>;
  const isCustom = currentView !== 'default_ar' && currentView !== 'default_en';
  return (
    <div className="text-telgrarr-text px-4 pt-6 overflow-x-hidden relative">
      <div className="max-w-5xl mx-auto md:grid md:grid-cols-12 md:gap-8 relative z-10">
        <div className="md:col-span-7 space-y-6">
          <h1 className="text-2xl font-bold text-telgrarr-text tracking-tight">Style Editor</h1>
          <SlotManager templates={config} currentView={currentView} onSelectView={setCurrentView} onAdd={handleAddSlot} onRename={handleRenameSlot} onDelete={handleDeleteSlot} onMakeActive={handleMakeActive} />
          <div className="flex space-x-2 bg-telgrarr-surface p-1 rounded-xl border border-telgrarr-border shadow-card">
            <button onClick={() => { setType('sonarr'); setScenario('single'); }} className={`focus-ring flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'sonarr' ? 'bg-telgrarr-purple text-telgrarr-on-accent shadow-md' : 'text-telgrarr-muted hover:bg-telgrarr-border/50'}`}><Tv className="w-4 h-4" /><span>Sonarr</span></button>
            <button onClick={() => { setType('radarr'); setScenario('single'); }} className={`focus-ring flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'radarr' ? 'bg-telgrarr-purple text-telgrarr-on-accent shadow-md' : 'text-telgrarr-muted hover:bg-telgrarr-border/50'}`}><Film className="w-4 h-4" /><span>Radarr</span></button>
          </div>
          {type === 'sonarr' && (
            <div className="flex space-x-2">
              {['single', 'multi', 'multiseason'].map((scen) => (
                <button key={scen} onClick={() => setScenario(scen)} className={`focus-ring flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${scenario === scen ? 'bg-telgrarr-surface border-telgrarr-purple text-telgrarr-purple shadow-sm' : 'bg-transparent border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text'}`}>
                  {scen === 'single' ? '1 Ep' : scen === 'multi' ? 'Multi-Ep' : 'Multi-Season'}
                </button>
              ))}
            </div>
          )}
          <TemplateEditor value={isCustom ? draft : ''} onChange={setDraft} tokens={TOKENS[type]} readOnly={!isCustom} syntaxError={syntaxError} />
          {isCustom && (
            <button onClick={saveDraftToSlot} disabled={storeSaving} className="focus-ring w-full py-3 bg-telgrarr-success hover:bg-telgrarr-success/90 disabled:opacity-50 text-telgrarr-on-accent font-medium rounded-xl flex items-center justify-center space-x-2 shadow-card active:scale-[0.98] transition-all">
              {storeSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Code to Slot</span>
            </button>
          )}
        </div>
        <div className="md:col-span-5 mt-8 md:mt-0 relative">
          <div className="md:sticky md:top-24 space-y-6">
            <TelegramMock html={html} loading={loadingPreview} />
            <button onClick={sendTest} disabled={sending || loadingPreview || !!syntaxError} className="focus-ring w-full py-3.5 px-4 bg-telgrarr-purple hover:bg-telgrarr-purple-dark disabled:opacity-50 text-telgrarr-on-accent font-semibold rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-telgrarr-purple/20 active:scale-[0.98] transition-all">
              {sending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              <span>Send Test Notification</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
