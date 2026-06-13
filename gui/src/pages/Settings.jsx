import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, XCircle, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import useSettingsStore from '../store/settingsStore';
import ConfirmModal from '../components/ConfirmModal';
import { buildPayload } from '../features/settings/formUtils';
import SecurityPanel from '../features/settings/panels/SecurityPanel';
import BackupPanel from '../features/settings/panels/BackupPanel';
import SettingsSection from '../features/settings/SettingsSection';
import useSettingsDraft from '../features/settings/hooks/useSettingsDraft';
import useConnectionTest from '../features/settings/hooks/useConnectionTest';
import useRestartPoll from '../features/settings/hooks/useRestartPoll';
import useNavGuard from '../store/navGuardStore';

export default function Settings() {
  const {
    settings, schema, loading, error,
    fetchSettings, fetchSchema, fetchSystemInfo, fetchFieldMeta, fetchWebhookInfo,
    saveSection, testConnection,
    saveStatus, testStatus, saveErrors, fieldMeta,
  } = useSettingsStore();

  const [expanded, setExpanded] = useState({});
  const [confirm, setConfirm] = useState({
    open: false,
    onConfirm: null,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    danger: false,
  });

  const { draft, handleChange, sectionIsDirty } = useSettingsDraft(settings, schema);
  const { handleTest, handleTestDeepl } = useConnectionTest(draft, testConnection);
  const { restarting, manualRestart, startRestartPoll, dismissManualRestart } = useRestartPoll(fetchSettings);
  const setIntercept = useNavGuard((s) => s.setIntercept);

  useEffect(() => {
    fetchSettings();
    fetchSchema();
    fetchSystemInfo();
    fetchFieldMeta();
    fetchWebhookInfo();
  }, [fetchSettings, fetchSchema, fetchSystemInfo, fetchFieldMeta, fetchWebhookInfo]);

  const openConfirm = (opts) => {
    setConfirm({
      open: true,
      onConfirm: opts.onConfirm || null,
      title: opts.title || '',
      message: opts.message || '',
      confirmLabel: opts.confirmLabel || 'Confirm',
      danger: !!opts.danger,
    });
  };

  const closeConfirm = () => {
    setConfirm({
      open: false,
      onConfirm: null,
      title: '',
      message: '',
      confirmLabel: 'Confirm',
      danger: false,
    });
  };

  // Unsaved-changes guard: while any section is dirty, intercept in-app nav
  // (navGuard) and browser refresh/close (beforeunload) with a discard confirm.
  useEffect(() => {
    const isDirtyNow = () => Array.isArray(schema) && schema.some((sec) => sectionIsDirty(sec));
    setIntercept((proceed) => {
      if (isDirtyNow()) {
        openConfirm({
          title: 'Discard unsaved changes?',
          message: 'You have unsaved edits on this page. Leaving now will discard them.',
          confirmLabel: 'Discard & Leave',
          danger: true,
          onConfirm: proceed,
        });
      } else {
        proceed();
      }
    });
    const onBeforeUnload = (e) => {
      if (isDirtyNow()) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      setIntercept(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, draft, settings]);

  const handleSaveRequest = (sectionId) => {
    const section = schema.find((s) => s.id === sectionId);
    if (!section) return;

    const payload = buildPayload(draft, section.fields, fieldMeta);

    openConfirm({
      title: `Save ${section.title}`,
      message: 'Changes take effect immediately after saving.',
      confirmLabel: 'Save Changes',
      danger: false,
      onConfirm: async () => {
        const result = await saveSection(sectionId, payload);
        if (result.success) {
          // B1-A: do NOT blank secret drafts here. saveSection refreshes
          // store.settings with the masked response; useSettingsDraft's effect
          // rebuilds the draft (secrets -> sentinel) via mergeSettingsIntoDraft,
          // so the field reads as 'set' instead of going blank.
          if (result.needsRestart) startRestartPoll();
        }
      }
    });
  };

  const handleConfirm = async () => {
    const current = confirm;
    closeConfirm();
    if (current.onConfirm) {
      await current.onConfirm();
    }
  };

  if (loading || (!error && (!draft || !schema))) {
    return (
      <div className="min-h-[60vh] bg-telgrarr-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-telgrarr-purple animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] bg-telgrarr-black flex flex-col items-center justify-center gap-4 px-6">
        <XCircle className="w-10 h-10 text-telgrarr-danger" />
        <p className="text-telgrarr-text font-semibold text-center">Failed to load settings</p>
        <p className="text-telgrarr-muted text-sm text-center">{error}</p>
        <button
          onClick={() => {
            fetchSettings();
            fetchSchema();
          }}
          className="focus-ring flex items-center gap-2 px-4 py-2.5 bg-telgrarr-purple hover:bg-telgrarr-purple-glow text-telgrarr-on-accent text-sm font-semibold rounded-xl transition-all"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-telgrarr-black text-telgrarr-text">
      <div className="absolute top-0 left-0 w-full h-64 bg-linear-to-b from-telgrarr-purple/10 to-transparent pointer-events-none" />
      <div className="max-w-lg mx-auto px-4 pt-6 md:pt-8 space-y-4 relative z-10">
        <div className="flex items-center gap-3 mb-6 px-1">
          <SettingsIcon className="w-6 h-6 text-telgrarr-purple" />
          <h1 className="text-2xl font-bold tracking-tight text-telgrarr-text">System Settings</h1>
        </div>

        {schema.map((section) => (
          <SettingsSection
            key={section.id}
            section={section}
            draft={draft}
            expanded={expanded}
            setExpanded={setExpanded}
            saveStatus={saveStatus}
            testStatus={testStatus}
            sectionIsDirty={sectionIsDirty}
            handleChange={handleChange}
            handleTest={handleTest}
            handleTestDeepl={handleTestDeepl}
            handleSaveRequest={handleSaveRequest}
            saveErrors={saveErrors}
            openConfirm={openConfirm}
            startRestartPoll={startRestartPoll}
          />
        ))}

        <BackupPanel openConfirm={openConfirm} startRestartPoll={startRestartPoll} />
        <SecurityPanel />
      </div>

      {restarting && (
        <div className="fixed inset-0 z-50 bg-telgrarr-black/80 backdrop-blur-xs flex flex-col items-center justify-center gap-4">
          <RefreshCw className="w-10 h-10 text-telgrarr-purple animate-spin" />
          <p className="text-telgrarr-text font-semibold">Backend restarting…</p>
          <p className="text-telgrarr-muted text-sm">Do not refresh your browser.</p>
        </div>
      )}

      {manualRestart && (
        <div className="fixed bottom-24 inset-x-4 z-50 mx-auto max-w-lg">
          <div className="flex items-start gap-3 rounded-xl border border-telgrarr-warning/40 bg-telgrarr-warning/10 px-4 py-3 backdrop-blur-xs">
            <AlertTriangle className="w-5 h-5 text-telgrarr-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-telgrarr-text text-sm font-semibold">Manual restart required</p>
              <p className="text-telgrarr-muted text-xs mt-0.5">
                Your changes were saved but will not take effect until the backend restarts. This deployment cannot restart itself; restart the service manually.
              </p>
            </div>
            <button
              onClick={dismissManualRestart}
              className="focus-ring text-telgrarr-muted hover:text-telgrarr-text text-xs font-semibold shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        danger={confirm.danger}
        onConfirm={handleConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
