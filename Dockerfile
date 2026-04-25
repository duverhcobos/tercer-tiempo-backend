# Etapa 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY . .

# Build de la aplicación
RUN npm run build

# Etapa 2: Producción
FROM node:20-alpine AS production

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production

# Copiar build desde etapa anterior
COPY --from=builder /app/dist ./dist

# Copiar migraciones
COPY --from=builder /app/src/infrastructure/database/migrations ./dist/infrastructure/database/migrations

# Exponer puerto
EXPOSE 3000

# Usuario no-root por seguridad
USER node

# Comando de inicio
CMD ["node", "dist/main"]
