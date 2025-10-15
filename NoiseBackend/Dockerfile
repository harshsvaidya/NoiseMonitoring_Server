# ============================================
# NoiseBackend/Dockerfile
# Place this file in: NoiseBackend/Dockerfile
# ============================================

FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY *.js ./

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Default command - can be overridden
CMD ["node", "socketio-server.js"]






# ============================================
# docker-compose.yml
# Place in: NoiseMonitoring_Server/docker-compose.yml
# ============================================

# See the multi-service dockerfile above - it's actually a docker-compose.yml


# ============================================
# .env.example for Docker
# Place in: NoiseMonitoring_Server/.env
# ============================================



