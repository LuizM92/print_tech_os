import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // O 401 do próprio login é resposta esperada de senha errada — deixa a tela de
    // login tratar e mostrar a mensagem, em vez de recarregar a página por cima dela.
    const ehLogin = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !ehLogin) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
