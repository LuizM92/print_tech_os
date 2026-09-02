# Node 22 (LTS). O 18 saiu de suporte em abril/2025 e não tem
# process.getBuiltinModule, exigido pelo leitor de PDF da ficha cadastral.
ARG NODE_VERSION=22-alpine

# Estágio 1: Build do Frontend
FROM node:${NODE_VERSION} AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Estágio 2: Backend
FROM node:${NODE_VERSION}
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY backend/ ./

# O build do React vai para ./build, que é onde o Express procura.
COPY --from=frontend-build /app/frontend/build ./build

EXPOSE 5000
CMD ["node", "src/server.js"]
