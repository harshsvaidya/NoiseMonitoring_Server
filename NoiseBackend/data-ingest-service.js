// data-ingest-service.js
// Handles queued data processing and batch writing to MongoDB

const { MongoClient } = require('mongodb');
const Redis = require('ioredis');

// Configuration
const config = {
  mongodb: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:59002',
    database: 'timeseries_db'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 59003
  },
  batch: {
    size: 150,
    flushInterval: 2000, // ms
    queuePrefix: 'queue:node:'
  }
};

class DataIngestService {
  constructor() {
    this.mongoClient = null;
    this.db = null;
    this.redis = new Redis(config.redis);
    this.processQueues = new Map();
    this.flushTimers = new Map();
  }

  async initialize() {
    try {
      // Connect to MongoDB
      this.mongoClient = new MongoClient(config.mongodb.uri);
      await this.mongoClient.connect();
      this.db = this.mongoClient.db(config.mongodb.database);

      // Create indexes
      await this.setupIndexes();

      console.log('✅ Data Ingest Service initialized');
      console.log(`📊 MongoDB: ${config.mongodb.database}`);
      console.log(`🔴 Redis: ${config.redis.host}:${config.redis.port}`);

      // Start monitoring queues
      this.startQueueMonitoring();
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  async setupIndexes() {
    const collection = this.db.collection('timeseries');

    await collection.createIndex({ nodeId: 1, ts: 1 });
    await collection.createIndex({ nodeId: 1, seq: 1 }, { unique: true });

    console.log('📑 Indexes created');
  }

  async getNextSequence(nodeId, count) {
    const counters = this.db.collection('counters');

    const result = await counters.findOneAndUpdate(
      { _id: nodeId },
      { $inc: { seq: count } },
      { upsert: true, returnDocument: 'after' }
    );

    return result.seq - count + 1;
  }

  startQueueMonitoring() {
    // Monitor Redis for queue keys
    const scanInterval = setInterval(async () => {
      try {
        const pattern = `${config.batch.queuePrefix}*`;
        const keys = await this.redis.keys(pattern);

        for (const key of keys) {
          const nodeId = key.replace(config.batch.queuePrefix, '');

          if (!this.processQueues.has(nodeId)) {
            this.processQueues.set(nodeId, true);
            this.processNodeQueue(nodeId);
          }
        }
      } catch (error) {
        console.error('Queue monitoring error:', error);
      }
    }, 1000);

    console.log('👀 Queue monitoring started');
  }

  async processNodeQueue(nodeId) {
    const queueKey = `${config.batch.queuePrefix}${nodeId}`;

    while (true) {
      try {
        const queueLength = await this.redis.llen(queueKey);

        if (queueLength === 0) {
          // No more data, remove from active processing
          this.processQueues.delete(nodeId);
          break;
        }

        // Check if we should flush based on size or time
        const shouldFlush = queueLength >= config.batch.size;

        if (shouldFlush) {
          await this.flushBatch(nodeId, queueKey);
        } else {
          // Set up time-based flush if not already set
          if (!this.flushTimers.has(nodeId)) {
            const timer = setTimeout(async () => {
              await this.flushBatch(nodeId, queueKey);
              this.flushTimers.delete(nodeId);
            }, config.batch.flushInterval);

            this.flushTimers.set(nodeId, timer);
          }

          // Wait before checking again
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error processing queue for ${nodeId}:`, error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async flushBatch(nodeId, queueKey) {
    try {
      // Pop batch from Redis
      const batchSize = Math.min(config.batch.size, await this.redis.llen(queueKey));

      if (batchSize === 0) return;

      const batch = [];
      for (let i = 0; i < batchSize; i++) {
        const item = await this.redis.lpop(queueKey);
        if (item) {
          batch.push(JSON.parse(item));
        }
      }

      if (batch.length === 0) return;

      // Get sequence numbers
      const seqBase = await this.getNextSequence(nodeId, batch.length);

      // Assign sequences
      const documents = batch.map((reading, index) => ({
        nodeId: reading.nodeId,
        seq: seqBase + index,
        ts: reading.ts,
        payload: reading.payload,
        meta: reading.meta || {}
      }));

      // Insert into MongoDB
      await this.db.collection('timeseries').insertMany(documents, { ordered: false });

      console.log(`✅ Flushed ${documents.length} readings for ${nodeId} (seq: ${seqBase}-${seqBase + batch.length - 1})`);

      // Clear flush timer if exists
      if (this.flushTimers.has(nodeId)) {
        clearTimeout(this.flushTimers.get(nodeId));
        this.flushTimers.delete(nodeId);
      }

      // Update metrics in Redis
      await this.updateMetrics(nodeId, batch.length);
    } catch (error) {
      console.error(`❌ Flush error for ${nodeId}:`, error);

      // On error, push items back to queue
      // This is a simplified error handling - in production, use dead letter queue
    }
  }

  async updateMetrics(nodeId, count) {
    const metricsKey = `metrics:${nodeId}`;
    const now = Date.now();

    await this.redis.hincrby(metricsKey, 'totalRecords', count);
    await this.redis.hset(metricsKey, 'lastFlush', now);
    await this.redis.expire(metricsKey, 86400); // 24 hours
  }

  async getMetrics() {
    const pattern = 'metrics:*';
    const keys = await this.redis.keys(pattern);
    const metrics = {};

    for (const key of keys) {
      const nodeId = key.replace('metrics:', '');
      metrics[nodeId] = await this.redis.hgetall(key);
    }

    return metrics;
  }

  async shutdown() {
    console.log('🛑 Shutting down Data Ingest Service...');

    // Clear all timers
    for (const timer of this.flushTimers.values()) {
      clearTimeout(timer);
    }

    // Flush remaining queues
    for (const nodeId of this.processQueues.keys()) {
      const queueKey = `${config.batch.queuePrefix}${nodeId}`;
      await this.flushBatch(nodeId, queueKey);
    }

    await this.mongoClient.close();
    await this.redis.quit();

    console.log('✅ Shutdown complete');
  }
}

// Main execution
const service = new DataIngestService();

process.on('SIGINT', async () => {
  await service.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await service.shutdown();
  process.exit(0);
});

(async () => {
  await service.initialize();
})();

module.exports = DataIngestService;