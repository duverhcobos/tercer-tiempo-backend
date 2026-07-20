# Etapa 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Habilitar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml ./

# Instalar todas las dependencias
RUN pnpm install --frozen-lockfile

# Copiar código fuente
COPY . .

# Build de la aplicación
RUN pnpm run build

# Etapa 2: Producción
FROM node:20-alpine AS production

WORKDIR /app

# Habilitar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml ./

# Instalar solo dependencias de producción
RUN pnpm install --frozen-lockfile --prod

# Copiar build desde etapa anterior
COPY --from=builder /app/dist ./dist

# Copiar typeorm config para migraciones
COPY --from=builder /app/typeorm.config.ts ./typeorm.config.ts

# Exponer puerto
EXPOSE 3000

# Usuario no-root por seguridad
USER node

# Comando de inicio (las migraciones se corren desde docker-compose)
CMD ["node", "dist/main"]
