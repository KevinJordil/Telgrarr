import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Info, Server, Clock, FolderOpen, Terminal, Copy, Check, RefreshCw } from 'lucide-react';

function formatUptime(seconds) {
  const years   = Math.floor(seconds / (365 * 24 * 3600));
  seconds      -= years   * 365 * 24 * 3600;
  const months  = Math.floor(seconds / (30 * 24 * 3600));
  seconds      -= months  * 30 * 24 * 3600;
  const days    = Math.floor(seconds / (24 * 3600));
  seconds      -= days    * 24 * 3600;
  const hours   = Math.floor(seconds / 3600);
  seconds      -= hours   * 3600;
  const minutes = Math.floor(seconds / 60);
  const secs    = seconds % 60;

  const parts = [];
  if (years)   parts.push(years   + (years   === 1 ? ' year'   : ' years'));
  if (months)  parts.push(months  + (months  === 1 ? ' month'  : ' months'));
  if (days)    parts.push(days    + (days    === 1 ? ' day'    : ' days'));
  if (hours)   parts.push(hours   + (hours   === 1 ? ' hour'   : ' hours'));
  if (minutes) parts.push(minutes + (minutes === 1 ? ' minute' : ' minutes'));
  if (secs || parts.length === 0) parts.push(secs + (secs === 1 ? ' second' : ' seconds'));
  return parts.join(', ');
}

function InfoRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-telgrarr-border last:border-0">
      <Icon className="w-4 h-4 mt-0.5 text-telgrarr-purple shrink-0" strokeWidth={1.8} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[10px] uppercase tracking-widest text-telgrarr-muted font-semibold">{label}</span>
        <span className={'text-sm text-telgrarr-text break-all ' + (mono ? 'font-mono' : 'font-medium')}>{value}</span>
      </div>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs text-telgrarr-muted hover:text-telgrarr-purple transition-colors mt-1"
      aria-label="Copy recovery command"
    >
      {copied
        ? <><Check className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400">Copied</span></>
        : <><Copy className="w-3.5 h-3.5" /><span>Copy command</span></>
      }
    </button>
  );
}

export default function About() {
  const [info,    setInfo]  = useState(null);
  const [error,   setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [uptimeSec, setUptimeSec] = useState(0);

  async function fetchAbout() {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/about');
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load system info.'); return; }
      setInfo(data);
      setUptimeSec(data.uptimeSeconds);
    } catch {
      setError('Cannot reach server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAbout(); }, []);

  // Live uptime ticker — increments every second after data is loaded
  useEffect(() => {
    if (!info) return;
    const timer = setInterval(() => setUptimeSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [info]);

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-telgrarr-purple" />
          <h1 className="text-lg font-bold text-telgrarr-text tracking-wide">About</h1>
        </div>
        <button
          onClick={fetchAbout}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-telgrarr-muted hover:text-telgrarr-purple transition-colors disabled:opacity-50"
          aria-label="Refresh system info"
        >
          <RefreshCw className={'w-3.5 h-3.5 ' + (loading ? 'animate-spin' : '')} />
          Refresh
        </button>
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
        >
          {error}
        </motion.p>
      )}

      {loading && !info && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-telgrarr-surface animate-pulse" />
          ))}
        </div>
      )}

      {info && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-telgrarr-surface border border-telgrarr-border rounded-2xl px-4 divide-y divide-telgrarr-border"
        >
          <InfoRow icon={Info}       label="App"          value={info.appName + ' v' + info.version} />
          <InfoRow icon={Server}     label="Node Version" value={info.nodeVersion} mono />
          <InfoRow icon={Server}     label="Platform"     value={info.platform} mono />
          <InfoRow icon={Clock}      label="Uptime"       value={formatUptime(uptimeSec)} />
          <InfoRow icon={FolderOpen} label="Install Root" value={info.installRoot} mono />
          <div className="flex items-start gap-3 py-3">
            <Terminal className="w-4 h-4 mt-0.5 text-telgrarr-purple shrink-0" strokeWidth={1.8} />
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-[10px] uppercase tracking-widest text-telgrarr-muted font-semibold">Recovery Command</span>
              <span className="text-xs text-telgrarr-text font-mono break-all bg-telgrarr-black/40 rounded-lg px-3 py-2 mt-1 border border-telgrarr-border">
                {info.recoverCmd}
              </span>
              <CopyButton text={info.recoverCmd} />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
