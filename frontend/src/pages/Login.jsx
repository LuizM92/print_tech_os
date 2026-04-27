import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [form, setForm] = useState({ email: '', senha: '' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.senha) return toast.error('Preencha todos os campos');
    setLoading(true);
    try {
      await login(form.email, form.senha);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>Sistema <span className="dot">OS</span></h1>
          <p>Gestão de Orçamentos e Ordens de Serviço</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Senha</label>
            <input
              type="password"
              placeholder="••••••••"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px' }}
          >
            {loading ? <span className="spinner" /> : 'Entrar'}
          </button>
        </form>

        <div style={{ marginTop: 24, padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Acesso inicial:</strong><br />
          admin@sistema.com / admin123
        </div>
      </div>
    </div>
  );
}
