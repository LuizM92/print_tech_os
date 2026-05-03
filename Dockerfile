# Estágio 1: Build do Frontend React
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Estágio 2: Configuração do Backend e Servidor Final
FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production
COPY backend/ ./backend/
# Copia o build do frontend para ser servido pelo backend
COPY --from=frontend-build /app/frontend/build ./frontend/build

EXPOSE 5000
CMD ["node", "backend/src/server.js"]