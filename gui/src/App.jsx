import React, { useEffect, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useThemeStore from './store/themeStore';
import useAuthStore  from './store/authStore';
import Login     from './pages/Login';
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
  useEffect(() => {
    initTheme();
  }, [initTheme]);
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
