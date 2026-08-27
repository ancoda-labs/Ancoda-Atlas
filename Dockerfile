FROM node:22-alpine

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm ci --omit=optional || npm install --omit=optional

# Copy source
COPY . .

# Build the Next.js app
RUN npm run build

ENV NODE_ENV=production

# Default port (override with -e PORT=xxxx)
EXPOSE 3117

# /api/data answers as soon as the server is up, whether or not a sweep
# has completed, so it doubles as the liveness probe.
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3117}/api/data > /dev/null || exit 1

CMD ["sh", "-c", "npx next start -p ${PORT:-3117}"]
