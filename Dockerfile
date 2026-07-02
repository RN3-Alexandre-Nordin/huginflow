# Estágio 1: Dependências
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

COPY package.json ./

# Instalamos os pacotes nativos críticos
RUN npm install @next/swc-linux-x64-musl lightningcss-linux-x64-musl @tailwindcss/oxide-linux-x64-musl

# Copiamos o lock
COPY package-lock.json* ./

# SUBSTIUA 'npm ci' POR ESTA LINHA:
RUN npm install

# Estágio 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Forçar rebuild de binários nativos para Alpine (musl)
RUN npm rebuild @next/swc-linux-x64-musl lightningcss

# Desativar telemetria do Next.js durante o build
ENV NEXT_TELEMETRY_DISABLED=1

# Variáveis de Build - Necessárias para o Next.js embutir no bundle do cliente
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_LANDING_PAGE_TOKEN

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_LANDING_PAGE_TOKEN=$NEXT_PUBLIC_LANDING_PAGE_TOKEN

RUN npm run build

# Estágio 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Setar a permissão correta para o cache do Next.js
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copiar o output standalone (mais leve)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
