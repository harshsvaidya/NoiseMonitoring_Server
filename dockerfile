
version: '3.8'

services:
  # MongoDB
  mongodb:
    image: mongo:6.0
    container_name: noise-mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
      MONGO_INITDB_DATABASE: timeseries_db
    volumes:
      - mongodb_data:/data/db
    networks:
      - noise-network
    ports:
      - "27017:27017"

  # Redis
  redis:
    image: redis:7-alpine
    container_name: noise-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - noise-network
    ports:
      - "6379:6379"

  # Backend - Socket.IO Server
  socketio-server:
    build:
      context: ./NoiseBackend
      dockerfile: Dockerfile
    container_name: noise-socketio
    restart: unless-stopped
    command: node socketio-server.js
    environment:
      NODE_ENV: production
      PORT: 3000
      MONGO_URI: mongodb://admin:${MONGO_ROOT_PASSWORD}@mongodb:27017/timeseries_db?authSource=admin
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    depends_on:
      - mongodb
      - redis
    networks:
      - noise-network
    ports:
      - "3000:3000"
    volumes:
      - ./NoiseBackend/logs:/app/logs

  # Backend - Data Ingest Service
  data-ingest:
    build:
      context: ./NoiseBackend
      dockerfile: Dockerfile
    container_name: noise-ingest
    restart: unless-stopped
    command: node data-ingest-service.js
    environment:
      NODE_ENV: production
      MONGO_URI: mongodb://admin:${MONGO_ROOT_PASSWORD}@mongodb:27017/timeseries_db?authSource=admin
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    depends_on:
      - mongodb
      - redis
    networks:
      - noise-network
    volumes:
      - ./NoiseBackend/logs:/app/logs

  # Frontend (Nginx with built files)
  frontend:
    image: nginx:alpine
    container_name: noise-frontend
    restart: unless-stopped
    volumes:
      - ./NoiseFrontend/dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    networks:
      - noise-network
    ports:
      - "80:80"
    depends_on:
      - socketio-server

networks:
  noise-network:
    driver: bridge

volumes:
  mongodb_data:
  redis_data:

