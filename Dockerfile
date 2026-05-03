# Estágio 1: Build do Frontend
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Estágio 2: Backend
FROM node:18-alpine
WORKDIR /app
# Copia o backend para /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./

# Copia o build do frontend para dentro da pasta do backend
# Assim o Express encontra em ./build
COPY --from=frontend-build /app/frontend/build ./build

EXPOSE 5000
CMD ["node", "src/server.js"]