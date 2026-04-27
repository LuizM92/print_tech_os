const jwt = require('jsonwebtoken');

const autenticar = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
};

const apenasAdmin = (req, res, next) => {
  if (req.usuario.perfil !== 'admin') {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador' });
  }
  next();
};

module.exports = { autenticar, apenasAdmin };
