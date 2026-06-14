import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { User, Lock, Loader2, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAuthStore  from '../store/authStore';
import useThemeStore from '../store/themeStore';
import api from '../api';
import LoginBackground from '../components/LoginBackground';
import ThemeSwitcher from '../components/ThemeSwitcher';
import logoUrlDark  from '../assets/hero-logo-dark.png?format=webp&w=512&quality=80';
import logoUrlLight from '../assets/hero-logo-light.png?format=webp&w=512&quality=80';

// First-run Onboarding (H7.2). Shown only while no admin exists (setupNeeded === true).
// Creates the first admin via the public, self-closing POST /api/auth/setup (H7.1); the
// server sets the session cookie on success (auto-login). CLI setup-auth stays headless.
export default function Onboarding() {
  const reduceMotion = useReducedMotion();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const navigate = useNavigate();
  const login            = useAuthStore((s) => s.login);
  const checkSetupStatus = useAuthStore((s) => s.checkSetupStatus);
  const theme   = useThemeStore((s) => s.theme);
  const logoUrl = theme === 'light' ? logoUrlLight : logoUrlDark;

  const handleSetup = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      // axios rejects non-2xx; a resolved call means the account was created + cookie set.
      await api.post('/auth/setup', { username: username.trim(), password, confirm });
      login();
      navigate('/dashboard');
    } catch (err) {
      if (err.response?.status === 409) {
        // Race: an account already exists. Re-derive setupNeeded and fall back to login.
        await checkSetupStatus();
        navigate('/');
        return;
      }
      setError(err.response?.data?.error || 'Cannot reach server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] bg-telgrarr-black flex flex-col items-center justify-center overflow-hidden transition-colors duration-300">
      <div className="absolute top-4 right-4 z-50"><ThemeSwitcher /></div>
      <LoginBackground />
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0.2 } : { duration: 0.8, ease: 'easeOut' }}
        className="relative w-full max-w-md mx-4 rounded-[2rem] p-[2px] shadow-glass overflow-hidden group"
      >
        <div
          className="absolute -inset-[100%] animate-[spin_8s_linear_infinite] motion-reduce:animate-none will-change-transform z-0 opacity-70 group-hover:opacity-100 transition-opacity duration-500"
          style={{ backgroundImage: 'conic-gradient(from 0deg, transparent 75%, rgb(var(--color-accent)) 100%)' }}
        />
        <div className="relative z-10 w-full h-full bg-telgrarr-surface/95 backdrop-blur-3xl rounded-[calc(2rem-2px)] p-6 md:p-8 flex flex-col transition-colors duration-300">
          <div className="flex flex-col items-center mb-6">
            <motion.img
              initial={reduceMotion ? { scale: 1 } : { scale: 0.8 }} animate={{ scale: 1 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 15 }}
              src={logoUrl} alt="Telgrarr Logo" className="w-32 h-32 md:w-40 md:h-40 mb-0 object-contain relative z-10"
            />
            <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-telgrarr-text to-telgrarr-purple tracking-widest relative z-10">TELGRARR</h1>
            <p className="mt-2 text-xs md:text-sm text-telgrarr-muted text-center tracking-wide">Create your administrator account to get started.</p>
          </div>
          <form onSubmit={handleSetup} className="space-y-4 md:space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="setup-username" className="text-xs md:text-sm text-telgrarr-muted font-medium pl-1">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-telgrarr-muted" />
                <input type="text" id="setup-username" value={username} onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 md:py-3.5 pl-10 md:pl-11 pr-4 text-sm md:text-base text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-hidden focus:border-telgrarr-purple transition-colors shadow-inner"
                  placeholder="Choose a username" autoComplete="username" required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="setup-password" className="text-xs md:text-sm text-telgrarr-muted font-medium pl-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-telgrarr-muted" />
                <input type="password" id="setup-password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 md:py-3.5 pl-10 md:pl-11 pr-4 text-sm md:text-base text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-hidden focus:border-telgrarr-purple transition-colors shadow-inner"
                  placeholder="Min. 8 characters" autoComplete="new-password" required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="setup-confirm" className="text-xs md:text-sm text-telgrarr-muted font-medium pl-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-telgrarr-muted" />
                <input type="password" id="setup-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  className="w-full bg-telgrarr-elevated border border-telgrarr-border rounded-xl py-3 md:py-3.5 pl-10 md:pl-11 pr-4 text-sm md:text-base text-telgrarr-text placeholder-telgrarr-muted/60 focus:outline-hidden focus:border-telgrarr-purple transition-colors shadow-inner"
                  placeholder="Re-enter password" autoComplete="new-password" required
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
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</> : <><UserPlus className="w-4 h-4" /> Create Admin Account</>}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
