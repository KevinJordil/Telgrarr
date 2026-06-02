import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, User, Loader2, KeyRound, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useNavigate, Navigate } from 'react-router-dom';
import useAuthStore  from '../store/authStore';
import useThemeStore from '../store/themeStore';
import LoginBackground from '../components/LoginBackground';
import ThemeSwitcher from '../components/ThemeSwitcher';
import logoUrlDark  from '../assets/hero-logo-dark.png';
import logoUrlLight from '../assets/hero-logo-light.png';

// ── Recovery Modal ────────────────────────────────────────────────────────────
function RecoveryModal({ onClose }) {
  const [recoveryToken, setRecoveryToken] = useState('');
  const [newPassword,   setNewPassword]   = useState('');
  const [confirmPw,     setConfirmPw]     = useState('');
  const [error,         setError]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [success,       setSuccess]       = useState(false);

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
      const res  = await fetch('/api/auth/recover', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recoveryToken: recoveryToken.trim(), newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Recovery failed. Check your token and try again.');
      }
    } catch {
      setError('Cannot reach server. Please try again.');
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget && !success) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{    opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="relative w-full max-w-md rounded-[2rem] p-[2px] shadow-[0_0_80px_rgba(0,0,0,0.7)] overflow-hidden group"
      >
        <div
          className="absolute -inset-[100%] animate-[spin_8s_linear_infinite] z-0 opacity-70 group-hover:opacity-100 transition-opacity duration-500"
          style={{ backgroundImage: 'conic-gradient(from 0deg, transparent 75%, rgb(var(--color-accent)) 100%)' }}
        />
        <div className="relative z-10 w-full bg-telgrarr-surface/95 backdrop-blur-3xl rounded-[calc(2rem-2px)] p-6 md:p-8 flex flex-col">
          {success ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-4 py-4"
            >
              <ShieldCheck className="w-14 h-14 text-green-400" />
              <h2 className="text-xl font-bold text-telgrarr-text tracking-wide">Password Reset</h2>
              <p className="text-sm text-telgrarr-muted text-center">
                Your password has been updated and all sessions have been invalidated.
                Please log in with your new password.
              </p>
              <button
                onClick={onClose}
                className="w-full bg-telgrarr-purple hover:bg-telgrarr-purple-dark text-white font-bold tracking-wide rounded-xl py-3 mt-2 transition-all shadow-md text-sm"
              >
                Back to Login
              </button>
            </motion.div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={onClose}
                  className="text-telgrarr-muted hover:text-telgrarr-text transition-colors"
                  aria-label="Back to login"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-telgrarr-purple" />
                  <h2 className="text-lg font-bold text-telgrarr-text tracking-wide">Password Recovery</h2>
                </div>
              </div>
              <p className="text-xs text-telgrarr-muted mb-5 leading-relaxed">
                Run <code className="bg-telgrarr-black/60 px-1.5 py-0.5 rounded text-telgrarr-purple font-mono">cd /home/fhd/software/telgrarr && npm run recover</code> in SSH to generate a one-time token, then enter it below.
              </p>
              <form onSubmit={handleRecover} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-telgrarr-muted font-medium pl-1">Recovery Token</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-telgrarr-muted" />
                    <input
                      type="text"
                      value={recoveryToken}
                      onChange={(e) => setRecoveryToken(e.target.value)}
                      className="w-full bg-telgrarr-black/50 border border-telgrarr-border rounded-xl py-3 pl-10 pr-4 text-xs text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-none focus:border-telgrarr-purple transition-all shadow-inner font-mono tracking-tight"
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
                      className="w-full bg-telgrarr-black/50 border border-telgrarr-border rounded-xl py-3 pl-10 pr-4 text-sm text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-none focus:border-telgrarr-purple transition-all shadow-inner"
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
                      className="w-full bg-telgrarr-black/50 border border-telgrarr-border rounded-xl py-3 pl-10 pr-4 text-sm text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-none focus:border-telgrarr-purple transition-all shadow-inner"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-400 text-center bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                  >
                    {error}
                  </motion.p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-telgrarr-purple hover:bg-telgrarr-purple-dark disabled:opacity-60 text-white font-bold tracking-wide rounded-xl py-3 mt-2 transition-all shadow-md flex justify-center items-center gap-2 text-sm"
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
      const res  = await fetch('/api/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        login();
        navigate('/dashboard');
      } else {
        setError(data.error || 'Login failed. Check your credentials.');
      }
    } catch {
      setError('Cannot reach server. Please try again.');
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative w-full max-w-md mx-4 rounded-[2rem] p-[2px] shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden group"
      >
        <div
          className="absolute -inset-[100%] animate-[spin_8s_linear_infinite] z-0 opacity-70 group-hover:opacity-100 transition-opacity duration-500"
          style={{ backgroundImage: 'conic-gradient(from 0deg, transparent 75%, rgb(var(--color-accent)) 100%)' }}
        />
        <div className="relative z-10 w-full h-full bg-telgrarr-surface/95 backdrop-blur-3xl rounded-[calc(2rem-2px)] p-6 md:p-8 flex flex-col">
          <div className="flex flex-col items-center mb-8">
            <motion.img
              initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              src={logoUrl} alt="Telgrarr Logo" className="w-36 h-36 md:w-44 md:h-44 mb-0 object-contain relative z-10"
            />
            <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-telgrarr-text to-telgrarr-purple tracking-widest relative z-10">TELGRARR</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-4 md:space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs md:text-sm text-telgrarr-muted font-medium pl-1">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-telgrarr-muted" />
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-telgrarr-black/50 border border-telgrarr-border rounded-xl py-3 md:py-3.5 pl-10 md:pl-11 pr-4 text-sm md:text-base text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-none focus:border-telgrarr-purple transition-all shadow-inner"
                  placeholder="Enter username" autoComplete="username" required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs md:text-sm text-telgrarr-muted font-medium pl-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-telgrarr-muted" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-telgrarr-black/50 border border-telgrarr-border rounded-xl py-3 md:py-3.5 pl-10 md:pl-11 pr-4 text-sm md:text-base text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-none focus:border-telgrarr-purple transition-all shadow-inner"
                  placeholder="••••••••" autoComplete="current-password" required
                />
              </div>
            </div>
            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="text-xs md:text-sm text-red-400 text-center bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </motion.p>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-telgrarr-purple hover:bg-telgrarr-purple-dark disabled:opacity-60 text-white font-bold tracking-wide rounded-xl py-3 md:py-3.5 mt-4 md:mt-6 transition-all shadow-md flex justify-center items-center gap-2 text-sm md:text-base">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Authenticating…</> : 'Login'}
            </button>
          </form>
          <button
            onClick={() => setShowRecovery(true)}
            className="mt-5 text-xs text-telgrarr-muted hover:text-telgrarr-purple transition-colors self-center tracking-wide"
          >
            Forgot password?
          </button>
        </div>
      </motion.div>
    </div>
  );
}
