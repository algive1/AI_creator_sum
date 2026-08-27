import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

const Login = lazy(() => import('./pages/Login'));
const InstallShell = lazy(() => import('./InstallShell'));
const AdminShell = lazy(() => import('./AdminShell'));

function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = localStorage.getItem('admin_token');
  if (!token) return <Navigate to="/login" replace />;
  // Check if token is already expired before rendering protected content
  try {
    const payload = token.split('.')[1];
    if (payload) {
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
      const parsed = JSON.parse(atob(padded));
      if (parsed.exp && Number(parsed.exp) * 1000 < Date.now()) {
        localStorage.removeItem('admin_token');
        return <Navigate to="/login" replace />;
      }
    }
  } catch {
    // If token is malformed, clear it and redirect
    localStorage.removeItem('admin_token');
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function RouteLoading() {
  return <div role="status" aria-live="polite" style={{ minHeight: '100vh' }} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/install" element={<InstallShell />} />
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedRoute><AdminShell /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
