import React from 'react';
import { Eye, EyeOff, Copy, Check, RefreshCw } from 'lucide-react';
import useSettingsStore from '../../store/settingsStore';
import { SECRET_MASK } from './formUtils';
import { copyText } from './clipboard';

// TELGRARR's webhook secret = its API key: auto-generated, Regenerate-only (never
// hand-typed), masked with reveal + copy. Fully GUI-managed - the WEBHOOK_SECRET env
// var only seeds the first run, after which the saved value is authoritative.
export default function WebhookSecretField({ openConfirm, startRestartPoll }) {
  const webhookInfo = useSettingsStore((s) => s.webhookInfo);
  const revealSecret = useSettingsStore((s) => s.revealSecret);
  const regenerateWebhookSecret = useSettingsStore((s) => s.regenerateWebhookSecret);

  const [revealed, setRevealed] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState(null);

  if (!webhookInfo) return null;
  const { secretSet } = webhookInfo;
  const inputBase = 'w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 px-4 text-telgrarr-text text-sm';

  const fetchReal = async () => {
    if (revealed !== null) return revealed;
    setBusy(true);
    const res = await revealSecret('webhookSecret');
    setBusy(false);
    if (res && res.success) { setRevealed(res.value); return res.value; }
    setError((res && res.error) || 'Reveal failed');
    return null;
  };

  const handleEye = async () => {
    setError(null);
    if (revealed !== null) setRevealed(null);
    else await fetchReal();
  };

  const handleCopy = async () => {
    setError(null);
    const v = await fetchReal();
    if (!v) return;
    const ok = await copyText(v);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
    else setError('Copy failed.');
  };

  const handleRegenerate = () => {
    openConfirm({
      title: 'Regenerate webhook secret',
      message: 'The current Sonarr and Radarr webhook URLs stop working after the restart. Copy and paste the new URLs into both apps afterwards.',
      confirmLabel: 'Regenerate',
      danger: true,
      onConfirm: async () => {
        setError(null);
        const result = await regenerateWebhookSecret();
        if (result.success) {
          setRevealed(null);
          if (result.needsRestart) startRestartPoll();
        } else {
          setError(result.error || 'Regenerate failed');
        }
      },
    });
  };

  const open = revealed !== null;
  const value = !secretSet ? '' : (open ? revealed : SECRET_MASK);

  return (
    <div className="space-y-1.5 pt-3">
      <label className="text-xs text-telgrarr-muted font-medium uppercase tracking-wider">Webhook Secret</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          readOnly
          placeholder={secretSet ? '' : 'Not set'}
          className={`${inputBase} ${open ? 'font-mono' : ''} pr-20 opacity-90 cursor-default`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <button type="button" onClick={handleCopy} disabled={!secretSet || busy} title="Copy secret"
            className="text-telgrarr-muted hover:text-telgrarr-text transition-colors disabled:opacity-40">
            {copied ? <Check className="w-4 h-4 text-telgrarr-purple" /> : <Copy className="w-4 h-4" />}
          </button>
          <button type="button" onClick={handleEye} disabled={!secretSet || busy} title={open ? 'Hide' : 'Reveal'}
            className="text-telgrarr-muted hover:text-telgrarr-text transition-colors disabled:opacity-40">
            {open ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <p className="text-xs text-telgrarr-muted/70 leading-relaxed">
        Auto-generated. This is TELGRARR's API key - it authenticates the Sonarr and Radarr webhook URLs. Regenerating requires a restart.
      </p>
      <button type="button" onClick={handleRegenerate}
        className="focus-ring flex items-center gap-2 text-sm text-telgrarr-danger hover:text-telgrarr-danger/80 transition-colors">
        <RefreshCw className="w-4 h-4" /> Regenerate secret
      </button>
      {error && <p className="text-xs text-telgrarr-danger">{error}</p>}
    </div>
  );
}
