import React from 'react';
import { Lock, Copy, Check, Webhook } from 'lucide-react';
import useSettingsStore from '../../store/settingsStore';
import { copyText } from './clipboard';

// H5.3c (SD-7/SD-15): copy-only, locked webhook link for the Sonarr/Radarr sections.
// The secret is owned by Server settings; here it is shown masked and never edited.
// Copy composes the real working URL via a one-shot SD-9 reveal (transient, not stored).
const APP = { sonarr: 'Sonarr', radarr: 'Radarr' };

export default function WebhookCard({ source }) {
  const webhookInfo = useSettingsStore((s) => s.webhookInfo);
  const revealSecret = useSettingsStore((s) => s.revealSecret);

  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState(null);

  if (!webhookInfo || !webhookInfo.secretSet || !webhookInfo.paths || !webhookInfo.paths[source]) {
    return null;
  }

  const app = APP[source] || source;
  const base = (webhookInfo.suggestedBase || '').replace(/\/+$/, '');
  const maskedPath = webhookInfo.paths[source];
  const maskedUrl = base + maskedPath;
  const derived = webhookInfo.baseSource === 'derived';

  const handleCopy = async () => {
    setError(null);
    setBusy(true);
    const res = await revealSecret('webhookSecret');
    setBusy(false);
    if (!res || !res.success || !res.value) {
      setError('Could not retrieve the secret - try again.');
      return;
    }
    const realPath = maskedPath.replace(/\/hooks\/[^/]+\//, () => '/hooks/' + res.value + '/');
    const ok = await copyText(base + realPath);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
    else setError('Copy failed - select the URL and copy it manually.');
  };

  return (
    <div className="mt-5 pt-4 border-t border-telgrarr-border/50 space-y-2">
      <div className="flex items-center gap-2">
        <Webhook className="w-4 h-4 text-telgrarr-purple" />
        <span className="text-xs font-semibold uppercase tracking-wider text-telgrarr-muted">{app} Webhook URL</span>
      </div>

      <div className="flex items-center gap-2 w-full bg-telgrarr-elevated/60 border border-telgrarr-border rounded-xl py-3 pl-4 pr-3">
        <Lock className="w-3.5 h-3.5 text-telgrarr-muted shrink-0" />
        <code className="flex-1 min-w-0 truncate text-xs font-mono text-telgrarr-muted select-all">{maskedUrl}</code>
        <button
          type="button"
          onClick={handleCopy}
          disabled={busy}
          title="Copy webhook URL"
          className="focus-ring shrink-0 flex items-center gap-1.5 text-xs font-semibold text-telgrarr-purple hover:text-telgrarr-purple-glow transition-colors disabled:opacity-40"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="text-xs text-telgrarr-muted/70 leading-relaxed">
        In {app}, open Settings, Connect and add a Webhook (method: POST) with this URL. The secret is managed in Server settings.
      </p>
      {derived && (
        <p className="text-xs text-telgrarr-muted/70 leading-relaxed">
          Base address auto-detected from your current connection. If {app} cannot reach it, set a Public Base URL in Server settings.
        </p>
      )}
      {error && <p className="text-xs text-telgrarr-danger">{error}</p>}
    </div>
  );
}
