import React from 'react';
import { Eye, EyeOff, Copy, Check, RefreshCw, Webhook } from 'lucide-react';
import useSettingsStore from '../../store/settingsStore';
import { SECRET_MASK } from './formUtils';

// H5.2 (SD-7): suggested webhook URL card for the Sonarr/Radarr settings sections.
// The base URL is a BEST-EFFORT suggestion (the address this browser reached the
// GUI on) and is clearly editable; the secret path segment stays masked until an
// explicit SD-9 reveal (one secret, on demand, transient component state only).
const LABELS = { sonarr: 'Sonarr', radarr: 'Radarr' };

const INPUT =
  'w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 px-4 text-telgrarr-text placeholder-telgrarr-muted/40 focus:outline-none focus:border-telgrarr-purple focus:ring-1 focus:ring-telgrarr-purple transition-all text-sm';

export default function WebhookCard({ source, openConfirm, startRestartPoll }) {
  const webhookInfo = useSettingsStore((s) => s.webhookInfo);
  const revealSecret = useSettingsStore((s) => s.revealSecret);
  const regenerateWebhookSecret = useSettingsStore((s) => s.regenerateWebhookSecret);

  const [base, setBase] = React.useState(null);     // null => use suggestion
  const [secret, setSecret] = React.useState(null); // revealed plaintext (transient)
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState(null);

  if (!webhookInfo || !webhookInfo.paths || !webhookInfo.paths[source]) return null;

  const maskedPath = webhookInfo.paths[source];
  const effectiveBase = base !== null ? base : (webhookInfo.suggestedBase || '');
  const cleanBase = effectiveBase.replace(/\/+$/, '');
  const pathWith = (s) => maskedPath.replace(SECRET_MASK, s);
  const shownUrl = cleanBase + (secret !== null ? pathWith(secret) : maskedPath);

  const fetchSecret = async () => {
    if (secret !== null) return secret;
    setBusy(true);
    const res = await revealSecret('webhookSecret');
    setBusy(false);
    if (res && res.success) { setSecret(res.value); return res.value; }
    setError((res && res.error) || 'Reveal failed');
    return null;
  };

  const handleEye = async () => {
    if (secret !== null) { setSecret(null); return; }
    setError(null);
    await fetchSecret();
  };

  const handleCopy = async () => {
    setError(null);
    const s = await fetchSecret();
    if (!s) return;
    try {
      await navigator.clipboard.writeText(cleanBase + pathWith(s));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) { /* clipboard unavailable */ }
  };

  const handleRegenerate = () => {
    openConfirm({
      title: 'Regenerate webhook secret',
      message: 'Existing Sonarr and Radarr webhooks stop working after the restart. Paste the new URL into both apps afterwards.',
      confirmLabel: 'Regenerate',
      danger: true,
      onConfirm: async () => {
        setError(null);
        const result = await regenerateWebhookSecret();
        if (result.success) {
          setSecret(null); // rotated: any revealed plaintext is stale
          if (result.needsRestart) startRestartPoll();
        } else {
          setError(result.error || 'Regenerate failed');
        }
      },
    });
  };

  return (
    <div className="mt-4 p-4 rounded-xl border border-telgrarr-border/50 bg-telgrarr-elevated/40 space-y-3">
      <div className="flex items-center gap-2">
        <Webhook className="w-4 h-4 text-telgrarr-purple" />
        <span className="text-sm font-semibold text-telgrarr-text">{LABELS[source]} Webhook</span>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-telgrarr-muted font-medium uppercase tracking-wider">Base URL (suggested - edit if wrong)</label>
        <input
          type="text"
          value={effectiveBase}
          onChange={(e) => setBase(e.target.value)}
          placeholder="http://your-server:3400"
          className={INPUT}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-telgrarr-muted font-medium uppercase tracking-wider">Webhook URL</label>
        <div className="relative">
          <input type="text" value={shownUrl} readOnly className={`${INPUT} pr-20 opacity-80`} />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={busy}
              title="Copy full URL"
              className="text-telgrarr-muted hover:text-telgrarr-text transition-colors disabled:opacity-40"
            >
              {copied ? <Check className="w-4 h-4 text-telgrarr-purple" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleEye}
              disabled={busy}
              title={secret !== null ? 'Hide secret' : 'Reveal secret'}
              className="text-telgrarr-muted hover:text-telgrarr-text transition-colors disabled:opacity-40"
            >
              {secret !== null ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <p className="text-xs text-telgrarr-muted/70 leading-relaxed">
          Paste into {LABELS[source]} under Settings - Connect - add Webhook (method POST), then use its Test button.
        </p>
      </div>

      {webhookInfo.envManaged ? (
        <p className="text-xs text-telgrarr-muted/70 leading-relaxed">
          Secret managed by environment (WEBHOOK_SECRET). Change the variable and restart to rotate it.
        </p>
      ) : (
        <button
          type="button"
          onClick={handleRegenerate}
          className="focus-ring flex items-center gap-2 text-sm text-telgrarr-danger hover:text-telgrarr-danger/80 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Regenerate secret
        </button>
      )}

      {error && <p className="text-xs text-telgrarr-danger">{error}</p>}
    </div>
  );
}
