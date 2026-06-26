import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Database, ChevronDown, ChevronUp, Loader2, CheckCircle, XCircle, Download, Upload, Save, RefreshCw, Trash2 } from 'lucide-react';
import useSettingsStore from '../../../store/settingsStore';
import useNavGuard from '../../../store/navGuardStore';
import api from '../../../api';
import SliderInput from '../../../components/SliderInput';
import { formatBytes } from '../formUtils';

export default function BackupPanel({ openConfirm, startRestartPoll }) {
  const { settings, saveSection, fetchSettings } = useSettingsStore();
  const setDirty = useNavGuard((s) => s.setDirty);
  const [isExpanded, setIsExpanded] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupConfig, setBackupConfig] = useState(null);
  const [backupStatus, setBackupStatus] = useState(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (settings?.backup) setBackupConfig(settings.backup);
  }, [settings]);
  useEffect(() => {
    const baseline = settings?.backup;
    const dirty = !!baseline && JSON.stringify(backupConfig) !== JSON.stringify(baseline);
    setDirty('backup', dirty);
    return () => setDirty('backup', false);
  }, [backupConfig, settings, setDirty]);

  const fetchBackupsList = useCallback(async () => {
    setBackupsLoading(true);
    try {
      const res = await api.get('/backups');
      if (res.data.success) {
        setBackups(res.data.backups);
      } else {
        setBackupStatus({ success: false, msg: res.data.error || 'Failed to load backups.' });
      }
    } catch (err) {
      setBackupStatus({ success: false, msg: err.response?.data?.error || err.message });
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isExpanded) fetchBackupsList();
  }, [isExpanded, fetchBackupsList]);

  const handleSaveBackupConfig = () => {
    openConfirm({
      title: 'Save Backup Settings',
      message: 'Changes take effect immediately after saving.',
      confirmLabel: 'Save Changes',
      danger: false,
      onConfirm: async () => {
        setBackupStatus({ loading: true, msg: 'Saving config...' });
        const result = await saveSection('backup', { backup: backupConfig });
        if (result.success) {
          setBackupStatus({ success: true, msg: 'Backup configuration saved.' });
          if (result.needsRestart) startRestartPoll();
        } else {
          setBackupStatus({ success: false, msg: result.error || 'Save failed' });
        }
      }
    });
  };

  const fileInputRef = useRef(null);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setBackupStatus({ success: false, msg: 'Please choose a .zip backup file.' });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setBackupStatus({ success: false, msg: 'Backup file is too large (max 25 MB).' });
      return;
    }
    setBackupStatus({ loading: true, msg: 'Uploading backup…' });
    try {
      const res = await api.post('/backups/upload', file, { headers: { 'Content-Type': 'application/zip' } });
      if (res.data.success) {
        setBackupStatus({ success: true, msg: `Imported ${res.data.filename}. Restore it below to apply.` });
        fetchBackupsList();
      } else {
        setBackupStatus({ success: false, msg: res.data.error || 'Import failed' });
      }
    } catch (err) {
      setBackupStatus({ success: false, msg: err.response?.data?.error || err.message });
    }
  };

  const handleDownloadBackup = async (filename) => {
    try {
      const res = await api.get(`/backups/${filename}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setBackupStatus({ success: false, msg: err.response?.data?.error || err.message });
    }
  };

  const handleCreateBackup = async () => {
    setBackupStatus({ loading: true, msg: 'Archiving config...' });
    try {
      const res = await api.post('/backups');
      if (res.data.success) {
        setBackupStatus({ success: true, msg: `Backup created: ${res.data.filename}` });
        fetchBackupsList();
      } else {
        setBackupStatus({ success: false, msg: res.data.error || 'Backup failed' });
      }
    } catch (err) {
      setBackupStatus({ success: false, msg: err.response?.data?.error || err.message });
    }
  };

  const handleRestoreBackup = (filename) => {
    openConfirm({
      title: 'Restore Backup',
      message: `Restore "${filename}"? This will overwrite your current configuration and restart the backend.`,
      confirmLabel: 'Restore',
      danger: true,
      onConfirm: async () => {
        setBackupStatus({ loading: true, msg: 'Extracting archive...' });
        try {
          const res = await api.post(`/backups/restore/${filename}`);
          if (res.data.success) {
            if (res.data.restartCapable) {
              setBackupStatus({ success: true, msg: 'Restore complete. Rebooting backend...' });
              startRestartPoll();
            } else {
              setBackupStatus({ success: true, msg: 'Restore complete. Restart to finish applying restored settings.' });
              fetchSettings();
              startRestartPoll();
            }
          } else {
            setBackupStatus({ success: false, msg: res.data.error || 'Restore failed' });
          }
        } catch (err) {
          setBackupStatus({ success: false, msg: err.response?.data?.error || err.message });
        }
      }
    });
  };

  const handleDeleteBackup = (filename) => {
    openConfirm({
      title: 'Delete Backup',
      message: `Permanently delete "${filename}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBackupStatus({ loading: true, msg: 'Deleting backup…' });
        try {
          await api.delete(`/backups/${filename}`);
          setBackupStatus({ success: true, msg: 'Backup deleted.' });
          fetchBackupsList();
        } catch (err) {
          setBackupStatus({ success: false, msg: err.response?.data?.error || err.message });
        }
      }
    });
  };

  const busy = !!backupStatus?.loading;
  const statusColor = backupStatus
    ? (backupStatus.loading ? 'text-telgrarr-muted' : backupStatus.success ? 'text-telgrarr-success' : 'text-telgrarr-danger')
    : '';

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel overflow-hidden"
    >
      <button
        onClick={() => setIsExpanded((p) => !p)}
        aria-expanded={isExpanded}
        aria-controls="backup-panel-body"
        className="focus-ring w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-telgrarr-purple/15 rounded-lg flex items-center justify-center">
            <Database className="w-4 h-4 text-telgrarr-purple" />
          </div>
          <span className="font-semibold text-telgrarr-text">Backup &amp; Restore</span>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-telgrarr-muted" /> : <ChevronDown className="w-4 h-4 text-telgrarr-muted" />}
      </button>
      {isExpanded && (
        <div id="backup-panel-body" className="px-4 pb-5 space-y-4 border-t border-telgrarr-border/50 pt-4">
          {backupConfig && (
          <div className="p-4 bg-telgrarr-elevated rounded-xl border border-telgrarr-border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-telgrarr-text">Autonomous Scheduler</h3>
                <p className="text-xs text-telgrarr-muted mt-0.5">Auto-backup config files</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupConfig.enabled}
                  onChange={(e) => setBackupConfig({ ...backupConfig, enabled: e.target.checked })}
                  aria-label="Enable autonomous backups"
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-telgrarr-black border border-telgrarr-border rounded-full peer peer-focus-visible:ring-2 peer-focus-visible:ring-telgrarr-purple peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-telgrarr-black peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-telgrarr-muted after:border-telgrarr-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-telgrarr-purple peer-checked:after:bg-telgrarr-on-accent peer-checked:after:border-telgrarr-on-accent" />
              </label>
            </div>
            {backupConfig.enabled && (
              <>
                <SliderInput
                  field={{ label: 'Backup interval', min: 1, max: 30, step: 1 }}
                  value={backupConfig.intervalDays}
                  onChange={(v) => setBackupConfig({ ...backupConfig, intervalDays: v })}
                  displayFn={(v) => `${v} day${v === 1 ? '' : 's'}`}
                />
                <SliderInput
                  field={{ label: 'Retain last', min: 1, max: 20, step: 1 }}
                  value={backupConfig.retainCount}
                  onChange={(v) => setBackupConfig({ ...backupConfig, retainCount: v })}
                  displayFn={(v) => `${v} backup${v === 1 ? '' : 's'}`}
                />
              </>
            )}
            <button
              onClick={handleSaveBackupConfig}
              className="focus-ring w-full py-2 bg-telgrarr-surface border border-telgrarr-border hover:bg-telgrarr-purple/10 text-xs font-semibold rounded-lg transition-colors"
            >
              Save Backup Settings
            </button>
          </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-telgrarr-text">Manual Backup</h3>
              <button
                onClick={handleCreateBackup} disabled={busy}
                className="focus-ring flex items-center gap-1.5 text-xs text-telgrarr-purple hover:text-telgrarr-purple-glow font-medium bg-telgrarr-purple/10 px-2 py-1 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-3.5 h-3.5" /> Create Now
              </button>
            </div>
                          <button
                onClick={handleUploadClick} disabled={busy}
                className="focus-ring w-full flex items-center justify-center gap-1.5 py-2 bg-telgrarr-surface border border-telgrarr-border hover:bg-telgrarr-purple/10 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-3.5 h-3.5" /> Import Backup File
              </button>
              <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileSelected} className="hidden" aria-hidden="true" />
              {backupStatus && (
              <p role="status" aria-live="polite" className={`text-xs flex items-center gap-1.5 ${statusColor}`}>
                {backupStatus.loading ? <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" /> : backupStatus.success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {backupStatus.msg}
              </p>
            )}
            {backupsLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="w-5 h-5 text-telgrarr-purple animate-spin motion-reduce:animate-none" />
              </div>
            ) : backups.length === 0 ? (
              <div className="text-center p-4 bg-telgrarr-elevated rounded-xl border border-telgrarr-border text-telgrarr-muted text-xs">
                No backups found.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {backups.map((b) => (
                  <div key={b.filename} className="flex items-center justify-between p-2.5 bg-telgrarr-surface border border-telgrarr-border rounded-xl">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono text-telgrarr-text truncate">{b.filename}</p>
                      <p className="text-[10px] text-telgrarr-muted">
                        {new Date(b.createdAt).toLocaleString()} · {formatBytes(b.size)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3">
                        <button onClick={() => handleDownloadBackup(b.filename)} aria-label={`Download ${b.filename}`} className="focus-ring p-1.5 text-telgrarr-text hover:bg-telgrarr-purple/10 rounded-sm">
                          <Download className="w-4 h-4" />
                        </button>
                      <button onClick={() => handleRestoreBackup(b.filename)} disabled={busy} aria-label={`Restore ${b.filename}`} className="focus-ring p-1.5 text-telgrarr-purple hover:bg-telgrarr-purple/10 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteBackup(b.filename)} disabled={busy} aria-label={`Delete ${b.filename}`} className="focus-ring p-1.5 text-telgrarr-danger hover:bg-telgrarr-danger/10 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
