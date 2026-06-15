import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Lock, ChevronDown, ChevronUp, Loader2, CheckCircle, XCircle } from 'lucide-react';
import api from '../../../api';

export default function SecurityPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPass: '', confirm: '' });
  const [pwStatus, setPwStatus] = useState(null);
  const reduceMotion = useReducedMotion();

  const handlePasswordChange = async () => {
    if (pwForm.newPass !== pwForm.confirm) {
      setPwStatus({ success: false, message: 'New passwords do not match.' });
      return;
    }
    if (pwForm.newPass.length < 8) {
      setPwStatus({ success: false, message: 'Password must be at least 8 characters.' });
      return;
    }
    setPwStatus({ loading: true });
    try {
      const res = await api.post('/auth/password', {
        currentPassword: pwForm.current,
        newPassword: pwForm.newPass,
      });
      if (res.data.success) {
        setPwStatus({ success: true, message: 'Password changed successfully.' });
        setPwForm({ current: '', newPass: '', confirm: '' });
      } else {
        setPwStatus({ success: false, message: res.data.error || 'Failed to change password.' });
      }
    } catch (err) {
      setPwStatus({ success: false, message: err.response?.data?.error || err.message });
    }
  };

  const statusColor = pwStatus
    ? (pwStatus.loading ? 'text-telgrarr-muted' : pwStatus.success ? 'text-telgrarr-success' : 'text-telgrarr-danger')
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
        aria-controls="security-panel-body"
        className="focus-ring w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-telgrarr-purple/15 rounded-lg flex items-center justify-center">
            <Lock className="w-4 h-4 text-telgrarr-purple" />
          </div>
          <span className="font-semibold text-telgrarr-text">Security</span>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-telgrarr-muted" /> : <ChevronDown className="w-4 h-4 text-telgrarr-muted" />}
      </button>
      {isExpanded && (
        <div id="security-panel-body" className="px-4 pb-5 space-y-1 border-t border-telgrarr-border/50">
          {[
            { key: 'current', label: 'Current Password', placeholder: '••••••••' },
            { key: 'newPass', label: 'New Password', placeholder: 'Min. 8 characters' },
            { key: 'confirm', label: 'Confirm New Password', placeholder: 'Repeat new password' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5 pt-3">
              <label htmlFor={`pw-${key}`} className="text-xs text-telgrarr-muted font-medium uppercase tracking-wider">{label}</label>
              <input
                type="password"
                id={`pw-${key}`} value={pwForm[key]}
                placeholder={placeholder}
                onChange={(e) => setPwForm((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 px-4 text-telgrarr-text placeholder-telgrarr-muted/40 focus:outline-hidden focus:border-telgrarr-purple focus:ring-1 focus:ring-telgrarr-purple transition-all text-sm"
              />
            </div>
          ))}
          {pwStatus && (
            <p className={`text-xs flex items-center gap-1.5 pt-2 ${statusColor}`}>
              {pwStatus.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : pwStatus.success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {pwStatus.loading ? 'Changing password…' : pwStatus.message}
            </p>
          )}
          <div className="pt-3">
            <button
              onClick={handlePasswordChange}
              disabled={!pwForm.current || !pwForm.newPass || !pwForm.confirm || !!pwStatus?.loading}
              className="focus-ring flex items-center gap-2 px-4 py-2.5 bg-telgrarr-purple hover:bg-telgrarr-purple-glow disabled:opacity-30 disabled:cursor-not-allowed text-telgrarr-on-accent text-sm font-semibold rounded-xl transition-all active:scale-[0.98]"
            >
              <Lock className="w-4 h-4" />Change Password
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
