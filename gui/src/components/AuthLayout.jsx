import React, { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import useAuthStore  from '../store/authStore';
import useThemeStore from '../store/themeStore';
import BottomNav from './BottomNav';
import ThemeSwitcher from './ThemeSwitcher';
import PullToRefresh from './PullToRefresh';
import logoUrlDark  from '../assets/header-logo-dark.png';
import logoUrlLight from '../assets/header-logo-light.png';

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const theme   = useThemeStore((s) => s.theme);
  const logoUrl = theme === 'light' ? logoUrlLight : logoUrlDark;

  const location = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);
  const ptrDisabled = location.pathname === '/settings';
  // Soft refresh: remount the routed subtree (re-fires its data effects); no full reload.
  const handleRefresh = () =>
    new Promise((resolve) => {
      setRefreshKey((k) => k + 1);
      setTimeout(resolve, 600);
    });
  if (!isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-telgrarr-black text-telgrarr-text transition-colors duration-300">

      <header className="sticky top-0 z-40 bg-telgrarr-surface/80 backdrop-blur-xl border-b border-telgrarr-border px-4 pb-3 pt-[calc(0.75rem_+_env(safe-area-inset-top))] flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2.5">
          <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-telgrarr-text to-telgrarr-purple text-lg">
            TELGRARR
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <ThemeSwitcher />
          <button
            onClick={logout}
            aria-label="Log out"
            className="focus-ring flex items-center justify-center p-2 rounded-xl bg-telgrarr-danger/10 border border-telgrarr-danger/20 text-telgrarr-danger hover:bg-telgrarr-danger/20 transition-colors shadow-sm"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <PullToRefresh className="flex-1" onRefresh={handleRefresh} disabled={ptrDisabled}>
        <main key={refreshKey} className="w-full max-w-3xl mx-auto pb-[calc(5rem_+_env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </PullToRefresh>

      <BottomNav />

    </div>
  );
}
