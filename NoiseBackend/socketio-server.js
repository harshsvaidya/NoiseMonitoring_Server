// socketio-server.js
// Handles real-time streaming from IoT nodes and to clients
require('dotenv').config();
const express = require('express');
const http = require('node:http');
const socketIO = require('socket.io');
const Redis = require('ioredis');
const { MongoClient } = require('mongodb');
const cors = require('cors');

// Configuration
const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },
  mongodb: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/timeseries_db',
    database: 'timeseries_db'
  },
  batch: {
    queuePrefix: process.env.QUEUE_PREFIX || 'queue:node:',
    bufferSize: parseInt(process.env.BUFFER_SIZE, 10) || 100
  }
};


class SocketIOServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIO(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"],
        transports: ["websocket", "polling"],
      },
      allowUpgrades: true,
      allowEIO3: true, // old socket client support (esp32-socketio)
      connectTimeout: 30000, // 30 seconds timeout
      pingTimeout: 60000, // 60 seconds ping timeout
      pingInterval: 25000 // 25 seconds ping interval

    });

this.redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password
});
    this.mongoClient = null;
    this.db = null;

    this.connectedNodes = new Map();
    this.connectedClients = new Set();
    this.nodeBuffers = new Map();
  }

  async initialize() {
    // Setup Express middleware
    this.app.use(cors());
    this.app.use(express.json());

    // Connect to MongoDB
    this.mongoClient = new MongoClient(config.mongodb.uri);
    await this.mongoClient.connect();
    this.db = this.mongoClient.db(config.mongodb.database);

    // Setup REST API routes
    this.setupAPIRoutes();

    // Setup Socket.IO handlers
    this.setupSocketIO();

    // Start server
    this.server.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`🔴 Redis: ${config.redis.host}:${config.redis.port}`);
      console.log(`📊 MongoDB: ${config.mongodb.database}`);
    });
  }

  setupAPIRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        nodes: this.connectedNodes.size,
        clients: this.connectedClients.size,
        timestamp: Date.now()
      });
    });

    // Get historical data by time range
    this.app.get('/api/series/:nodeId', async (req, res) => {
      try {
        const { nodeId } = req.params;
        const { fromTs, toTs, fromSeq, toSeq, limit = 1000 } = req.query;

        let query = { nodeId };

        if (fromTs && toTs) {
          query.ts = { $gte: parseInt(fromTs), $lte: parseInt(toTs) };
        } else if (fromSeq && toSeq) {
          query.seq = { $gte: parseInt(fromSeq), $lte: parseInt(toSeq) };
        }

        const data = await this.db.collection('timeseries')
          .find(query)
          .sort({ seq: 1 })
          .limit(parseInt(limit))
          .toArray();

        res.json({ success: true, data, count: data.length });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get latest reading
    this.app.get('/api/latest/:nodeId', async (req, res) => {
      try {
        const { nodeId } = req.params;

        const latest = await this.db.collection('timeseries')
          .findOne({ nodeId }, { sort: { seq: -1 } });

        res.json({ success: true, data: latest });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Sync endpoint - get missing sequences
    this.app.get('/api/sync/:nodeId', async (req, res) => {
      try {
        const { nodeId } = req.params;
        const { lastSeq } = req.query;

        if (!lastSeq) {
          return res.status(400).json({ success: false, error: 'lastSeq required' });
        }

        const data = await this.db.collection('timeseries')
          .find({ nodeId, seq: { $gt: parseInt(lastSeq) } })
          .sort({ seq: 1 })
          .toArray();

        res.json({ success: true, data, count: data.length });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Send commands to ESP32 devices
    this.app.post('/api/command/:nodeId', async (req, res) => {
      try {
        const { nodeId } = req.params;
        const { command, data } = req.body;

        const nodeInfo = this.connectedNodes.get(nodeId);
        if (!nodeInfo) {
          return res.status(404).json({ success: false, error: 'Node not connected' });
        }

        const socket = this.io.sockets.sockets.get(nodeInfo.socketId);
        if (!socket) {
          return res.status(404).json({ success: false, error: 'Socket not found' });
        }

        // Send command to ESP32 based on command type
        const commandMap = {
          'setThreshold': '/threshold/set',
          'stop': '/stop',
          'start': '/start',
          'reset': '/reset'
        };

        const eventName = commandMap[command];
        if (!eventName) {
          return res.status(400).json({ success: false, error: 'Invalid command' });
        }

        // Emit event to ESP32
        socket.emit('event', [eventName, data || {}]);

        console.log(`📤 Command sent to ${nodeId}: ${command}`, data);
        res.json({ success: true, message: `Command ${command} sent to ${nodeId}` });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get connected nodes
    this.app.get('/api/nodes', async (req, res) => {
      const nodes = Array.from(this.connectedNodes.entries()).map(([id, info]) => ({
        nodeId: id,
        ...info
      }));

      res.json({ success: true, nodes });
    });

    // Get node metrics
    this.app.get('/api/metrics/:nodeId', async (req, res) => {
      try {
        const { nodeId } = req.params;
        const metricsKey = `metrics:${nodeId}`;
        const metrics = await this.redis.hgetall(metricsKey);

        res.json({ success: true, metrics });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  setupSocketIO() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 Socket connected: ${socket.id}`);

      // Handle ESP32 auto-identification (sends data immediately)
      // Check for early data before explicit identification
      let identificationTimeout = setTimeout(() => {
        console.log(`⚠️  Socket ${socket.id} did not identify, treating as ESP32 device`);
        // Auto-identify as ESP32 if it starts sending data
        socket.identified = false;
      }, 3000);

      // Determine if this is a node or client
      socket.on('identify', (data) => {
        clearTimeout(identificationTimeout);
        socket.identified = true;

        if (data.type === 'node') {
          this.handleNodeConnection(socket, data);
        } else if (data.type === 'client') {
          this.handleClientConnection(socket, data);
        }
      });

      // Handle ESP32 direct data emission (auto-identify as node)
      socket.on('/save', async (payload) => {
        if (!socket.identified) {
          clearTimeout(identificationTimeout);

          // Auto-identify as ESP32 node
          const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
          const deviceId = data.deviceId || `ESP32_${socket.id.substring(0, 8)}`;

          console.log(`🔧 Auto-identifying ESP32 device: ${deviceId}`);
          this.handleNodeConnection(socket, {
            nodeId: deviceId,
            deviceId: deviceId,
            metadata: { type: 'ESP32', autoIdentified: true }
          });

          socket.identified = true;
        }

        // Handle the data
        if (socket.nodeId) {
          await this.handleESP32Data(socket.nodeId, payload);
        }
      });

      socket.on('disconnect', () => {
        clearTimeout(identificationTimeout);
        this.handleDisconnection(socket);
      });
    });
  }

  handleNodeConnection(socket, data) {
    const { nodeId, deviceId, metadata = {} } = data;
    const finalNodeId = nodeId || deviceId; // Support both nodeId and deviceId

    if (!finalNodeId) {
      console.error('Connection rejected: No nodeId or deviceId provided');
      socket.disconnect();
      return;
    }

    this.connectedNodes.set(finalNodeId, {
      socketId: socket.id,
      connectedAt: Date.now(),
      metadata,
      lastDataAt: null
    });

    console.log(`📡 Node connected: ${finalNodeId}`);

    // Initialize buffer for this node
    this.nodeBuffers.set(finalNodeId, []);

    // Broadcast to all clients
    this.io.emit('node:connected', { nodeId: finalNodeId, metadata });

    // Handle ESP32 data event (/save)
    socket.on('/save', async (payload) => {
      await this.handleESP32Data(finalNodeId, payload);
    });

    // Legacy handlers for other node types
    socket.on('data', async (reading) => {
      await this.handleNodeData(finalNodeId, reading);
    });

    socket.on('bulk:data', async (readings) => {
      for (const reading of readings) {
        await this.handleNodeData(finalNodeId, reading);
      }
    });

    // Store socket reference for sending commands
    socket.nodeId = finalNodeId;
  }

  async handleESP32Data(nodeId, payload) {
    try {
      // Parse ESP32 JSON payload
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

      // Extract deviceId from payload or use nodeId
      const deviceId = data.deviceId || nodeId;

      // Transform ESP32 format to our standard format
      const reading = {
        nodeId: deviceId,
        ts: Date.now(),
        payload: {
          min: data.min,
          max: data.max,
          avg: data.avg,
          current: data.current
        },
        meta: {
          source: 'esp32',
          rawDeviceId: data.deviceId
        }
      };

      // Update node info
      const nodeInfo = this.connectedNodes.get(deviceId);
      if (nodeInfo) {
        nodeInfo.lastDataAt = reading.ts;
      }

      // Add to buffer
      const buffer = this.nodeBuffers.get(deviceId) || [];
      buffer.push(reading);
      this.nodeBuffers.set(deviceId, buffer);

      // Broadcast to clients in real-time
      this.io.emit('data:live', reading);

      // Flush to Redis if buffer is full
      if (buffer.length >= config.batch.bufferSize) {
        await this.flushToRedis(deviceId);
      }

      console.log(`📊 ESP32 data received from ${deviceId}:`, data);
    } catch (error) {
      console.error(`Error handling ESP32 data from ${nodeId}:`, error);
    }
  }

  async handleNodeData(nodeId, rawPayload) {
    try {
      // Add timestamp at server
      const reading = {
        nodeId,
        ts: Date.now(),
        payload: rawPayload,
        meta: { source: 'socketio' }
      };

      // Update node info
      const nodeInfo = this.connectedNodes.get(nodeId);
      if (nodeInfo) {
        nodeInfo.lastDataAt = reading.ts;
      }

      // Add to buffer
      const buffer = this.nodeBuffers.get(nodeId) || [];
      buffer.push(reading);
      this.nodeBuffers.set(nodeId, buffer);

      // Broadcast to clients in real-time
      this.io.emit('data:live', reading);

      // Flush to Redis if buffer is full
      if (buffer.length >= config.batch.bufferSize) {
        await this.flushToRedis(nodeId);
      }
    } catch (error) {
      console.error(`Error handling data from ${nodeId}:`, error);
    }
  }

  async flushToRedis(nodeId) {
    const buffer = this.nodeBuffers.get(nodeId);
    if (!buffer || buffer.length === 0) return;

    const queueKey = `${config.batch.queuePrefix}${nodeId}`;

    // Push all readings to Redis queue
    const pipeline = this.redis.pipeline();
    for (const reading of buffer) {
      pipeline.rpush(queueKey, JSON.stringify(reading));
    }
    await pipeline.exec();

    console.log(`💾 Flushed ${buffer.length} readings to Redis for ${nodeId}`);

    // Clear buffer
    this.nodeBuffers.set(nodeId, []);
  }

  handleClientConnection(socket, data) {
    this.connectedClients.add(socket.id);
    console.log(`👤 Client connected: ${socket.id}`);

    // Send current node list
    const nodes = Array.from(this.connectedNodes.entries()).map(([id, info]) => ({
      nodeId: id,
      ...info
    }));

    socket.emit('nodes:list', nodes);

    // Subscribe to specific node
    socket.on('subscribe', (nodeId) => {
      socket.join(`node:${nodeId}`);
      console.log(`Client ${socket.id} subscribed to ${nodeId}`);
    });

    socket.on('unsubscribe', (nodeId) => {
      socket.leave(`node:${nodeId}`);
    });
  }

  handleDisconnection(socket) {
    // Check if it was a node
    for (const [nodeId, info] of this.connectedNodes.entries()) {
      if (info.socketId === socket.id) {
        console.log(`📡 Node disconnected: ${nodeId}`);

        // Flush remaining buffer
        this.flushToRedis(nodeId);

        this.connectedNodes.delete(nodeId);
        this.nodeBuffers.delete(nodeId);

        this.io.emit('node:disconnected', { nodeId });
        return;
      }
    }

    // Otherwise it was a client
    this.connectedClients.delete(socket.id);
    console.log(`👤 Client disconnected: ${socket.id}`);
  }

  async shutdown() {
    console.log('🛑 Shutting down server...');

    // Flush all buffers
    for (const nodeId of this.nodeBuffers.keys()) {
      await this.flushToRedis(nodeId);
    }

    await this.mongoClient.close();
    await this.redis.quit();
    this.server.close();

    console.log('✅ Shutdown complete');
  }
}

// Main execution
const server = new SocketIOServer();

process.on('SIGINT', async () => {
  await server.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.shutdown();
  process.exit(0);
});

(async () => {
  await server.initialize();
})();

module.exports = SocketIOServer;