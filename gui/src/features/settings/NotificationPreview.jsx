import React from 'react';
import api from '../../api';

const EXAMPLES = {
  request: { event: 'request', mediaType: 'movie', title: 'Un film', year: '2026', tmdbId: '123', requester: 'Camille', imdbRating: '8,1', trailers: [{ url: 'https://www.youtube.com/results?search_query=film+bande+annonce+VF', label: 'Rechercher la bande-annonce VF' }] },
  season: { event: 'available', mediaType: 'season', title: 'Saison 2', seriesTitle: 'Une série', year: '2026', season: '2', seasonComplete: true, episodeRange: '1-8', episodeCount: '8', overview: 'Une nouvelle saison pleine de rencontres inattendues.', quality: 'WEBDL-1080p', origin: 'Demande Seerr — Camille', imdbRating: '8,1', trailers: [{ url: 'https://www.youtube.com/results?search_query=serie+saison+2+bande+annonce+VF', label: 'Rechercher la bande-annonce VF — saison 2' }] },
  available: { event: 'available', mediaType: 'episode', title: 'Le retour', seriesTitle: 'Une série', year: '2026', tmdbId: '123', season: '2', episodeNumber: '3', overview: 'Une rencontre inattendue bouleverse les plans des personnages.', origin: 'Demande Seerr — Camille', quality: 'WEBDL-1080p · H264', ratingKey: '123', serverId: 'example' },
};

function messagePreview(caption) {
  const document = new DOMParser().parseFromString(caption, 'text/html');
  const tags = { B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', U: 'u', S: 's', DEL: 's', MARK: 'mark', CODE: 'code', PRE: 'pre', P: 'p', BLOCKQUOTE: 'blockquote', H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h5', H6: 'h6' };
  function nodeView(node, key) {
    if (node.nodeType === 3) return node.textContent;
    const children = Array.from(node.childNodes).map((child, i) => nodeView(child, `${key}-${i}`));
    if (node.nodeName === 'BR') return <br key={key} />;
    if (node.nodeName === 'HR') return <hr key={key} className="my-3 border-telgrarr-border" />;
    if (node.nodeName === 'IMG') {
      let src;
      try { const url = new URL(node.getAttribute('src')); if (url.protocol === 'https:' && !url.username && !url.password && ![...url.searchParams.keys()].some(k => /token|api.?key|secret|auth/i.test(k))) src = url.href; } catch {}
      return src ? <img key={key} src={src} alt="Affiche" loading="lazy" referrerPolicy="no-referrer" className="max-h-72 my-3 rounded-lg object-contain" /> : null;
    }
    if (tags[node.nodeName]) {
      const sizes = { H1: 'text-3xl', H2: 'text-2xl', H3: 'text-xl', H4: 'text-lg', H5: 'text-base', H6: 'text-sm' };
      const className = /^H[1-6]$/.test(node.nodeName) ? `font-bold my-2 ${sizes[node.nodeName]}` : node.nodeName === 'MARK' ? 'bg-[#f5c518] text-black px-1 rounded' : node.nodeName === 'P' ? 'my-2' : node.nodeName === 'BLOCKQUOTE' ? 'my-3 pl-3 border-l-2 border-telgrarr-purple italic' : undefined;
      return React.createElement(tags[node.nodeName], { key, className }, children);
    }
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
  const [format, setFormat] = React.useState('classic');
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
      setCaption(res.data.caption); setFormat(res.data.format);
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
        <button type="button" disabled={busy} className="focus-ring text-sm text-telgrarr-purple" onClick={() => preview('season')}>Aperçu saison</button>
        <button type="button" disabled={busy} className="focus-ring text-sm text-telgrarr-purple" onClick={refresh}>Actualiser la file</button>
      </div>
      {caption && <div aria-label="Aperçu du message" className="text-sm whitespace-pre-wrap break-words p-3 rounded-xl bg-telgrarr-elevated border border-telgrarr-border"><p className="text-xs text-telgrarr-muted mb-2">{format === 'rich' ? 'Message enrichi — rendu indicatif' : 'Affiche et légende HTML'}</p>{messagePreview(caption)}</div>}
      {status && <p className="text-xs text-telgrarr-muted">En attente : {status.pending} · Bloquées : {status.blocked} · Envois mémorisés : {status.sent}</p>}
      {status?.blocked > 0 && <button type="button" disabled={busy} className="focus-ring text-sm text-telgrarr-purple" onClick={retry}>Relancer les messages bloqués après correction</button>}
      {error && <p role="alert" className="text-xs text-telgrarr-danger">{error}</p>}
    </div>
  );
}
