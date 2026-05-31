import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Database, ChevronDown, ChevronUp, Loader2, CheckCircle, XCircle, Download, RefreshCw, Trash2 } from 'lucide-react';
import useSettingsStore from '../../../store/settingsStore';
import api from '../../../api';
import { formatBytes } from '../formUtils';

export default function BackupPanel({ openConfirm, startRestartPoll }) {
  const { settings, saveSection, fetchSettings } = useSettingsStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupConfig, setBackupConfig] = useState({ enabled: true, intervalDays: 7, retainCount: 5 });
  const [backupStatus, setBackupStatus] = useState(null);

  useEffect(() => {
    if (settings?.backup) setBackupConfig(settings.backup);
  }, [settings]);

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
            if (res.data.needsRestart) {
              setBackupStatus({ success: true, msg: 'Restore complete. Rebooting backend...' });
              startRestartPoll();
            } else {
              setBackupStatus({ success: true, msg: 'Restore complete.' });
              fetchSettings();
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
        try {
          await api.delete(`/backups/${filename}`);
          fetchBackupsList();
        } catch (err) {
          setBackupStatus({ success: false, msg: err.response?.data?.error || err.message });
        }
      }
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel overflow-hidden">
      <button onClick={() => setIsExpanded((p) => !p)} className="w-full flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-telgrarr-purple/15 rounded-lg flex items-center justify-center">
            <Database className="w-4 h-4 text-telgrarr-purple" />
          </div>
          <span className="font-semibold text-telgrarr-text">Backup & Restore</span>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-telgrarr-muted" /> : <ChevronDown className="w-4 h-4 text-telgrarr-muted" />}
      </button>

      {isExpanded && (
        <div className="px-4 pb-5 space-y-4 border-t border-telgrarr-border/50 pt-4">
          <div className="p-4 bg-telgrarr-black/40 rounded-xl border border-telgrarr-border space-y-4">
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
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-telgrarr-black border border-telgrarr-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-telgrarr-muted after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-telgrarr-purple peer-checked:after:bg-white" />
              </label>
            </div>

            {backupConfig.enabled && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-telgrarr-muted font-medium uppercase tracking-wider">Interval: {backupConfig.intervalDays} Days</span>
                  </div>
                  <input
                    type="range"
                    onWheel={(e) => e.currentTarget.blur()}
                    min="1"
                    max="30"
                    value={backupConfig.intervalDays}
                    onChange={(e) => setBackupConfig({ ...backupConfig, intervalDays: parseInt(e.target.value, 10) })}
                    className="w-full h-2 bg-telgrarr-border rounded-full appearance-none accent-telgrarr-purple"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-telgrarr-muted font-medium uppercase tracking-wider">Retain Last: {backupConfig.retainCount} Backups</span>
                  </div>
                  <input
                    type="range"
                    onWheel={(e) => e.currentTarget.blur()}
                    min="1"
                    max="20"
                    value={backupConfig.retainCount}
                    onChange={(e) => setBackupConfig({ ...backupConfig, retainCount: parseInt(e.target.value, 10) })}
                    className="w-full h-2 bg-telgrarr-border rounded-full appearance-none accent-telgrarr-purple"
                  />
                </div>
              </>
            )}

            <button
              onClick={handleSaveBackupConfig}
              className="w-full py-2 bg-telgrarr-surface border border-telgrarr-border hover:bg-telgrarr-purple/10 text-xs font-semibold rounded-lg transition-colors"
            >
              Save Backup Settings
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-telgrarr-text">Manual Backup</h3>
              <button
                onClick={handleCreateBackup}
                className="flex items-center gap-1.5 text-xs text-telgrarr-purple hover:text-telgrarr-purple-glow font-medium bg-telgrarr-purple/10 px-2 py-1 rounded"
              >
                <Download className="w-3.5 h-3.5" /> Create Now
              </button>
            </div>

            {backupStatus && (
              <p className={`text-xs flex items-center gap-1.5 ${backupStatus.loading ? 'text-telgrarr-muted' : backupStatus.success ? 'text-green-400' : 'text-red-400'}`}>
                {backupStatus.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : backupStatus.success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {backupStatus.msg}
              </p>
            )}

            {backupsLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="w-5 h-5 text-telgrarr-purple animate-spin" />
              </div>
            ) : backups.length === 0 ? (
              <div className="text-center p-4 bg-telgrarr-black/30 rounded-xl border border-telgrarr-border text-telgrarr-muted text-xs">
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
                      <button onClick={() => handleRestoreBackup(b.filename)} className="p-1.5 text-telgrarr-purple hover:bg-telgrarr-purple/10 rounded" title="Restore">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteBackup(b.filename)} className="p-1.5 text-red-400 hover:bg-red-400/10 rounded" title="Delete">
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
