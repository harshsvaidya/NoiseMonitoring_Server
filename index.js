const Aedes = require('aedes');
const net = require('net');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');

// Create MQTT broker
const aedes = Aedes();
const mqttServer = net.createServer(aedes.handle);
mqttServer.listen(1883, () => console.log('MQTT broker started on port 1883'));

// HTTPS server with correct SSL paths
const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/noisebackend.harshvaidya.tech/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/noisebackend.harshvaidya.tech/fullchain.pem')
};

const httpsServer = https.createServer(options);

const io = socketIo(httpsServer, {
  cors: {
    origin: "https://ambient-insight-dash.lovable.app",
    methods: ["GET", "POST"]
  }
});

// Socket.IO connections
io.on('connection', (socket) => {
  console.log('Client connected via Socket.IO');
  socket.on('message', (msg) => console.log('Message from client:', msg));
  socket.on('disconnect', () => console.log('Client disconnected'));
});

// Listen on port 8080
httpsServer.listen(8080, "0.0.0.0", () => {
  console.log('Secure Socket.IO (WSS) server started on port 8080');
});

// MQTT client logging
aedes.on('client', (client) => console.log('MQTT Client connected:', client.id));
aedes.on('clientDisconnect', (client) => console.log('MQTT Client disconnected:', client.id));
aedes.on('publish', (packet, client) => {
  if (client) console.log(`Message from ${client.id}: ${packet.payload.toString()}`);
  else console.log('Message from anonymous client:', packet.payload.toString());
});
