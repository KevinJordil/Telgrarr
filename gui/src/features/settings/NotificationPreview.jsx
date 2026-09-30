import React from 'react';
import api from '../../api';

const EXAMPLES = {
  request: { event: 'request', mediaType: 'movie', title: 'Un film', year: '2026', tmdbId: '123', requester: 'Camille' },
  available: { event: 'available', mediaType: 'episode', title: 'Le retour', seriesTitle: 'Une série', year: '2026', tmdbId: '123', season: '2', episodeNumber: '3', overview: 'Une rencontre inattendue bouleverse les plans des personnages.', origin: 'Demande Seerr — Camille', quality: 'WEBDL-1080p · H264', ratingKey: '123', serverId: 'example' },
};

function messagePreview(caption) {
  const document = new DOMParser().parseFromString(caption, 'text/html');
  const tags = { B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', U: 'u', S: 's', DEL: 's', CODE: 'code', PRE: 'pre' };
  function nodeView(node, key) {
    if (node.nodeType === 3) return node.textContent;
    const children = Array.from(node.childNodes).map((child, i) => nodeView(child, `${key}-${i}`));
    if (tags[node.nodeName]) return React.createElement(tags[node.nodeName], { key }, children);
    if (node.nodeName === 'A') {
      let href;
      try { const url = new URL(node.getAttribute('href')); if (['https:', 'http:'].includes(url.protocol)) href = url.href; } catch {}
      return href ? <a key={key} href={href} target="_blank" rel="noreferrer" className="underline text-telgrarr-purple">{children}</a> : children;
    }
    return children;
  }
  return Array.from(document.body.childNodes).map((node, i) => nodeView(node, String(i)));
}

export default function NotificationPreview() {
  const [caption, setCaption] = React.useState('');
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const refresh = async () => {
    try { const res = await api.get('/notifications/status'); setStatus(res.data); }
    catch { setError('Impossible de lire la file de notifications.'); }
  };
  React.useEffect(() => { refresh(); }, []);
  const preview = async (kind) => {
    setBusy(true); setError('');
    try {
      const res = await api.post('/notifications/preview', { event: EXAMPLES[kind] });
      setCaption(res.data.caption);
    } catch { setError('Modèle invalide. Vérifier et enregistrer les paramètres.'); }
    finally { setBusy(false); }
  };
  const retry = async () => {
    setBusy(true); setError('');
    try { await api.post('/notifications/retry'); await refresh(); }
    catch { setError('Impossible de relancer les notifications.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="pt-4 space-y-3">
      <p className="text-xs text-telgrarr-muted">Aperçu des modèles enregistrés avec des données fictives. Aucun message Telegram n’est envoyé.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} className="focus-ring text-sm text-telgrarr-purple" onClick={() => preview('request')}>Aperçu demande</button>
        <button type="button" disabled={busy} className="focus-ring text-sm text-telgrarr-purple" onClick={() => preview('available')}>Aperçu disponibilité</button>
        <button type="button" disabled={busy} className="focus-ring text-sm text-telgrarr-purple" onClick={refresh}>Actualiser la file</button>
      </div>
      {caption && <div aria-label="Aperçu du message" className="text-sm whitespace-pre-wrap break-words p-3 rounded-xl bg-telgrarr-elevated border border-telgrarr-border">{messagePreview(caption)}</div>}
      {status && <p className="text-xs text-telgrarr-muted">En attente : {status.pending} · Bloquées : {status.blocked} · Envois mémorisés : {status.sent}</p>}
      {status?.blocked > 0 && <button type="button" disabled={busy} className="focus-ring text-sm text-telgrarr-purple" onClick={retry}>Relancer les messages bloqués après correction</button>}
      {error && <p role="alert" className="text-xs text-telgrarr-danger">{error}</p>}
    </div>
  );
}
