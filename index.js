const aedes = require('aedes')();
const net = require('net');

const PORT = 1883;
const HOST = '0.0.0.0'; // <— Listen on all network interfaces

const server = net.createServer(aedes.handle);

server.listen(PORT, HOST, () => {
  console.log(`🚀 MQTT broker listening on ${HOST}:${PORT}`);
});

aedes.on('client', (client) => {
  console.log(`🔌 Client connected: ${client?.id || 'unknown'}`);
});

aedes.on('clientDisconnect', (client) => {
  console.log(`❌ Client disconnected: ${client?.id || 'unknown'}`);
});

aedes.on('publish', (packet, client) => {
  if (client) {
    console.log(`📦 Message from ${client.id}: ${packet.topic} => ${packet.payload.toString()}`);
  }
});
