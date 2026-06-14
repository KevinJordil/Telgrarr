import React, { useEffect, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useThemeStore from './store/themeStore';
import useAuthStore  from './store/authStore';
import Login     from './pages/Login';
import Onboarding from './pages/Onboarding';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings  = lazy(() => import('./pages/Settings'));
const Logs      = lazy(() => import('./pages/Logs'));
const Preview   = lazy(() => import('./pages/Preview'));
const Blacklist = lazy(() => import('./pages/Blacklist'));
const About     = lazy(() => import('./pages/About'));
import AuthLayout from './components/AuthLayout';

// -- Redirects unauthenticated users to login, authenticated to their route --
function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <AuthLayout />;
}

// -- Catch-all: authenticated -> dashboard, unauthenticated -> login ---------
function CatchAll() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return <Navigate to={isAuthenticated ? '/dashboard' : '/'} replace />;
}

export default function App() {
  const initTheme = useThemeStore((s) => s.initTheme);
  const setupNeeded      = useAuthStore((s) => s.setupNeeded);
  const checkSetupStatus = useAuthStore((s) => s.checkSetupStatus);
  useEffect(() => {
    initTheme();
    checkSetupStatus();
  }, [initTheme, checkSetupStatus]);

  // H7.2: gate first paint on the setup check. null = pending -> loader; true -> Onboarding.
  if (setupNeeded === null) {
    return (
      <div className="min-h-[100dvh] bg-telgrarr-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-telgrarr-purple animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      {setupNeeded ? (
          <Routes>
            <Route path="/" element={<Onboarding />} />
            <Route path="*" element={<Onboarding />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/"  element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/settings"  element={<Settings />} />
              <Route path="/logs"      element={<Logs />} />
              <Route path="/preview"   element={<Preview />} />
              <Route path="/blacklist" element={<Blacklist />} />
              <Route path="/about"     element={<About />} />
            </Route>
            <Route path="*" element={<CatchAll />} />
          </Routes>
        )}
    </BrowserRouter>
  );
}
