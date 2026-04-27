import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/shared/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Materiais from './pages/Materiais';
import Servicos from './pages/Servicos';
import Usuarios from './pages/Usuarios';
import Orcamentos from './pages/Orcamentos';
import NovoOrcamento from './pages/NovoOrcamento';
import DetalheOrcamento from './pages/DetalheOrcamento';
import Configuracoes from './pages/Configuracoes';
import './index.css';

function PrivateRoute({ children, adminOnly = false }) {
  const { usuario, carregando, isAdmin } = useAuth();
  if (carregando) return <div className="loading-screen"><span className="spinner"/></div>;
  if (!usuario) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin()) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}

function AppRoutes() {
  const { usuario, carregando } = useAuth();
  if (carregando) return <div className="loading-screen"><span className="spinner"/></div>;

  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/" element={<Navigate to="/dashboard" />} />

      <Route path="/dashboard" element={<PrivateRoute><AppLayout><Dashboard /></AppLayout></PrivateRoute>} />
      <Route path="/clientes" element={<PrivateRoute><AppLayout><Clientes /></AppLayout></PrivateRoute>} />
      <Route path="/materiais" element={<PrivateRoute><AppLayout><Materiais /></AppLayout></PrivateRoute>} />
      <Route path="/servicos" element={<PrivateRoute><AppLayout><Servicos /></AppLayout></PrivateRoute>} />
      <Route path="/orcamentos" element={<PrivateRoute><AppLayout><Orcamentos /></AppLayout></PrivateRoute>} />
      <Route path="/orcamentos/novo" element={<PrivateRoute><AppLayout><NovoOrcamento /></AppLayout></PrivateRoute>} />
      <Route path="/orcamentos/:id" element={<PrivateRoute><AppLayout><DetalheOrcamento /></AppLayout></PrivateRoute>} />
      <Route path="/usuarios" element={<PrivateRoute adminOnly><AppLayout><Usuarios /></AppLayout></PrivateRoute>} />
      <Route path="/configuracoes" element={<PrivateRoute><AppLayout><Configuracoes /></AppLayout></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
            },
            success: { iconTheme: { primary: 'var(--success)', secondary: 'var(--bg-card)' } },
            error: { iconTheme: { primary: 'var(--danger)', secondary: 'var(--bg-card)' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
