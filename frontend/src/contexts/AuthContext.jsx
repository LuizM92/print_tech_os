import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('usuario');
    if (token && user) {
      setUsuario(JSON.parse(user));
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    setCarregando(false);
  }, []);

  const login = async (email, senha) => {
    const res = await api.post('/auth/login', { email, senha });
    const { token, usuario: user } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(user));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUsuario(user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    delete api.defaults.headers.common['Authorization'];
    setUsuario(null);
  };

  const isAdmin = () => usuario?.perfil === 'admin';

  return (
    <AuthContext.Provider value={{ usuario, login, logout, isAdmin, carregando }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
};
