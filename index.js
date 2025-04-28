// Import dependencies
const aedes = require('aedes')();
const net = require('net');
const http = require('http');
const socketIo = require('socket.io');

// MQTT Broker Config
const MQTT_PORT = 1883;
const MQTT_HOST = '0.0.0.0'; // Listen on all network interfaces

// Create MQTT server
const mqttServer = net.createServer(aedes.handle);
mqttServer.listen(MQTT_PORT, MQTT_HOST, () => {
  console.log(`🚀 MQTT broker listening on ${MQTT_HOST}:${MQTT_PORT}`);
});

// HTTP + Socket.IO Config (for web dashboard)
const HTTP_PORT = 3000;
const httpServer = http.createServer();
const io = socketIo(httpServer, {
  cors: {
    origin: "*", // Allow all origins (for dev), restrict in production
  }
});

// Create Socket.IO server
httpServer.listen(HTTP_PORT, () => {
  console.log(`🌐 Socket.IO server listening on port ${HTTP_PORT}`);
});

// Handle MQTT client connections
aedes.on('clientReady', (client) => {
  console.log(`🔌 MQTT client connected: ${client?.id || 'unknown'}`);
  io.emit('clientConnected', { id: client?.id || 'unknown' });
});

// Handle MQTT client disconnections
aedes.on('clientDisconnect', (client) => {
  console.log(`❌ MQTT client disconnected: ${client?.id || 'unknown'}`);
  io.emit('clientDisconnected', { id: client?.id || 'unknown' });
});

// Handle published MQTT messages
aedes.on('publish', async (packet, client) => {
  if (client) {
    const message = {
      clientId: client.id,
      topic: packet.topic,
      payload: packet.payload.toString(),
    };

    console.log(`📦 Message received: ${message.topic} => ${message.payload}`);

    // Emit to Web Clients using the topic as event name
    io.emit('mqttMessage', message);

    // Optional: You can selectively emit based on topic, example:
    // if (packet.topic.startsWith('ecg/')) {
    //   io.emit('ecgData', message);
    // }
  }
});

// Handle Web dashboard Socket.IO connections
io.on('connection', (socket) => {
  console.log('🔗 Web dashboard connected via Socket.IO');

  socket.on('disconnect', () => {
    console.log('🔌 Web dashboard disconnected');
  });
});
