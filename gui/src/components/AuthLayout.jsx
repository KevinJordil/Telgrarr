import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import useAuthStore  from '../store/authStore';
import useThemeStore from '../store/themeStore';
import BottomNav from './BottomNav';
import ThemeSwitcher from './ThemeSwitcher';
import PullToRefresh from './PullToRefresh';
import logoUrlDark  from '../assets/header-logo-dark.png';
import logoUrlLight from '../assets/header-logo-light.png';

export default function AuthLayout() {
  const { isAuthenticated, logout } = useAuthStore();
  const theme   = useThemeStore((s) => s.theme);
  const logoUrl = theme === 'light' ? logoUrlLight : logoUrlDark;

  if (!isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-telgrarr-black text-telgrarr-text transition-colors duration-300">

      <header className="sticky top-0 z-40 bg-telgrarr-surface/80 backdrop-blur-xl border-b border-telgrarr-border px-4 py-3 flex items-center justify-between shadow-sm">
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
            className="flex items-center justify-center p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-colors shadow-sm"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <PullToRefresh className="flex-1">
        <main className="w-full max-w-3xl mx-auto pt-4 pb-24">
          <Outlet />
        </main>
      </PullToRefresh>

      <BottomNav />

    </div>
  );
}
