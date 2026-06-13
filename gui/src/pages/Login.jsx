import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Lock, User, Loader2, KeyRound, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useNavigate, Navigate } from 'react-router-dom';
import useAuthStore  from '../store/authStore';
import useThemeStore from '../store/themeStore';
import api from '../api';
import LoginBackground from '../components/LoginBackground';
import ThemeSwitcher from '../components/ThemeSwitcher';
import logoUrlDark  from '../assets/hero-logo-dark.png?format=webp&w=512&quality=80';
import logoUrlLight from '../assets/hero-logo-light.png?format=webp&w=512&quality=80';

let idSeq = 0;

// ── Recovery Modal ────────────────────────────────────────────────────────────
function RecoveryModal({ onClose }) {
  const reduceMotion = useReducedMotion();
  const [recoveryToken, setRecoveryToken] = useState('');
  const [newPassword,   setNewPassword]   = useState('');
  const [confirmPw,     setConfirmPw]     = useState('');
  const [error,         setError]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [success,       setSuccess]       = useState(false);
  const panelRef  = useRef(null);
  const firstRef  = useRef(null);
  const prevFocus = useRef(null);
  const idRef = useRef(`recovery-${++idSeq}`);
  const titleId = `${idRef.current}-title`;

  useEffect(() => {
    prevFocus.current = document.activeElement;
    const t = setTimeout(() => { firstRef.current?.focus(); }, 0);
    return () => {
      clearTimeout(t);
      const el = prevFocus.current;
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); if (!success) onClose(); return; }
    if (e.key !== 'Tab') return;
    const nodes = panelRef.current && panelRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!nodes || nodes.length === 0) return;
    const list = Array.from(nodes).filter((n) => !n.disabled);
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const handleRecover = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPw) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/recover', { recoveryToken: recoveryToken.trim(), newPassword });
      if (res.data && res.data.success) {
        setSuccess(true);
      } else {
        setError(res.data?.error || 'Recovery failed. Check your token and try again.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Cannot reach server. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <motion.div
      key="recovery-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-telgrarr-black/60 backdrop-blur-xs px-4"
      onClick={(e) => { if (e.target === e.currentTarget && !success) onClose(); }}
      onKeyDown={onKeyDown}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1,    y: 0  }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
        transition={reduceMotion ? { duration: 0.15 } : { duration: 0.25, ease: 'easeOut' }}
        className="relative w-full max-w-md rounded-[2rem] p-[2px] shadow-glass overflow-hidden group"
      >
        <div
          className="absolute -inset-[100%] animate-[spin_8s_linear_infinite] will-change-transform z-0 opacity-70 group-hover:opacity-100 transition-opacity duration-500"
          style={{ backgroundImage: 'conic-gradient(from 0deg, transparent 75%, rgb(var(--color-accent)) 100%)' }}
        />
        <div className="relative z-10 w-full bg-telgrarr-surface/95 backdrop-blur-3xl rounded-[calc(2rem-2px)] p-6 md:p-8 flex flex-col transition-colors duration-300">
          {success ? (
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-4 py-4"
            >
              <ShieldCheck className="w-14 h-14 text-telgrarr-success" />
              <h2 id={titleId} className="text-xl font-bold text-telgrarr-text tracking-wide">Password Reset</h2>
              <p className="text-sm text-telgrarr-muted text-center">
                Your password has been updated and all sessions have been invalidated.
                Please log in with your new password.
              </p>
              <button
                onClick={onClose}
                className="focus-ring w-full bg-telgrarr-purple hover:bg-telgrarr-purple-dark text-telgrarr-on-accent font-bold tracking-wide rounded-xl py-3 mt-2 transition-colors shadow-md text-sm"
              >
                Back to Login
              </button>
            </motion.div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={onClose}
                  className="focus-ring rounded-sm text-telgrarr-muted hover:text-telgrarr-text transition-colors"
                  aria-label="Back to login"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-telgrarr-purple" />
                  <h2 id={titleId} className="text-lg font-bold text-telgrarr-text tracking-wide">Password Recovery</h2>
                </div>
              </div>
              <p className="text-xs text-telgrarr-muted mb-5 leading-relaxed">
                Run <code className="bg-telgrarr-elevated px-1.5 py-0.5 rounded-sm text-telgrarr-purple font-mono">npm run recover</code> in SSH to generate a one-time token, then enter it below.
              </p>
              <form onSubmit={handleRecover} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-telgrarr-muted font-medium pl-1">Recovery Token</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-telgrarr-muted" />
                    <input
                      ref={firstRef}
                      type="text"
                      value={recoveryToken}
                      onChange={(e) => setRecoveryToken(e.target.value)}
                      className="w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 pl-10 pr-4 text-xs text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-hidden focus:border-telgrarr-purple transition-colors shadow-inner font-mono tracking-tight"
                      placeholder="Paste 64-character token from terminal"
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-telgrarr-muted font-medium pl-1">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-telgrarr-muted" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 pl-10 pr-4 text-sm text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-hidden focus:border-telgrarr-purple transition-colors shadow-inner"
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-telgrarr-muted font-medium pl-1">Confirm New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-telgrarr-muted" />
                    <input
                      type="password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      className="w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 pl-10 pr-4 text-sm text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-hidden focus:border-telgrarr-purple transition-colors shadow-inner"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
                {error && (
                  <motion.p
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-telgrarr-danger text-center bg-telgrarr-danger/10 border border-telgrarr-danger/20 rounded-lg px-3 py-2"
                  >
                    {error}
                  </motion.p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="focus-ring w-full bg-telgrarr-purple hover:bg-telgrarr-purple-dark disabled:opacity-60 text-telgrarr-on-accent font-bold tracking-wide rounded-xl py-3 mt-2 transition-colors shadow-md flex justify-center items-center gap-2 text-sm"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : 'Reset Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Login Page ────────────────────────────────────────────────────────────────
export default function Login() {
  const reduceMotion = useReducedMotion();
  const [username,      setUsername]      = useState('');
  const [password,      setPassword]      = useState('');
  const [error,         setError]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [showRecovery,  setShowRecovery]  = useState(false);
  const navigate                    = useNavigate();
  const { login, isAuthenticated }  = useAuthStore();
  const theme   = useThemeStore((s) => s.theme);
  const logoUrl = theme === 'light' ? logoUrlLight : logoUrlDark;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/login', { username, password });
      if (res.data && res.data.success) {
        login();
        navigate('/dashboard');
      } else {
        setError(res.data?.error || 'Login failed. Check your credentials.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Cannot reach server. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="relative min-h-[100dvh] bg-telgrarr-black flex flex-col items-center justify-center overflow-hidden transition-colors duration-300">
      <div className="absolute top-4 right-4 z-50"><ThemeSwitcher /></div>
      <LoginBackground />
      <AnimatePresence>
        {showRecovery && (
          <RecoveryModal onClose={() => setShowRecovery(false)} />
        )}
      </AnimatePresence>
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0.2 } : { duration: 0.8, ease: 'easeOut' }}
        className="relative w-full max-w-md mx-4 rounded-[2rem] p-[2px] shadow-glass overflow-hidden group"
      >
        <div
          className="absolute -inset-[100%] animate-[spin_8s_linear_infinite] will-change-transform z-0 opacity-70 group-hover:opacity-100 transition-opacity duration-500"
          style={{ backgroundImage: 'conic-gradient(from 0deg, transparent 75%, rgb(var(--color-accent)) 100%)' }}
        />
        <div className="relative z-10 w-full h-full bg-telgrarr-surface/95 backdrop-blur-3xl rounded-[calc(2rem-2px)] p-6 md:p-8 flex flex-col transition-colors duration-300">
          <div className="flex flex-col items-center mb-8">
            <motion.img
              initial={reduceMotion ? { scale: 1 } : { scale: 0.8 }} animate={{ scale: 1 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 15 }}
              src={logoUrl} alt="Telgrarr Logo" className="w-36 h-36 md:w-44 md:h-44 mb-0 object-contain relative z-10"
            />
            <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-telgrarr-text to-telgrarr-purple tracking-widest relative z-10">TELGRARR</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-4 md:space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs md:text-sm text-telgrarr-muted font-medium pl-1">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-telgrarr-muted" />
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 md:py-3.5 pl-10 md:pl-11 pr-4 text-sm md:text-base text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-hidden focus:border-telgrarr-purple transition-colors shadow-inner"
                  placeholder="Enter username" autoComplete="username" required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs md:text-sm text-telgrarr-muted font-medium pl-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-telgrarr-muted" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 md:py-3.5 pl-10 md:pl-11 pr-4 text-sm md:text-base text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-hidden focus:border-telgrarr-purple transition-colors shadow-inner"
                  placeholder="••••••••" autoComplete="current-password" required
                />
              </div>
            </div>
            {error && (
              <motion.p initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="text-xs md:text-sm text-telgrarr-danger text-center bg-telgrarr-danger/10 border border-telgrarr-danger/20 rounded-lg px-3 py-2">
                {error}
              </motion.p>
            )}
            <button type="submit" disabled={loading}
              className="focus-ring w-full bg-telgrarr-purple hover:bg-telgrarr-purple-dark disabled:opacity-60 text-telgrarr-on-accent font-bold tracking-wide rounded-xl py-3 md:py-3.5 mt-4 md:mt-6 transition-colors shadow-md flex justify-center items-center gap-2 text-sm md:text-base">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Authenticating…</> : 'Login'}
            </button>
          </form>
          <button
            onClick={() => setShowRecovery(true)}
            className="focus-ring rounded-sm mt-5 text-xs text-telgrarr-muted hover:text-telgrarr-purple transition-colors self-center tracking-wide"
          >
            Forgot password?
          </button>
        </div>
      </motion.div>
    </div>
  );
}
