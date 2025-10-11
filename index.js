// Import required modules
const Aedes = require('aedes');
const net = require('net');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');

// Create an instance of the Aedes MQTT broker
const aedes = Aedes();

// Setting up the TCP server to handle MQTT connections (port 1883 for MQTT)
const mqttServer = net.createServer(aedes.handle);
mqttServer.listen(1883, function () {
  console.log('MQTT broker started on port 1883');
});

// Load SSL certificates (replace with your actual backend domain)
const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/noisemonitor.harshvaidya.tech/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/noisemonitor.harshvaidya.tech/fullchain.pem')
};

// Create an HTTPS server for Socket.IO
const httpsServer = https.createServer(options);
const io = socketIo(httpsServer, {
  cors: {
    origin: "https://ambient-insight-dash.lovable.app",
    methods: ["GET", "POST"]
  }
});

// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log('Client connected via Socket.IO');

  socket.on('message', (msg) => {
    console.log('Message from client:', msg);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Listen for HTTPS connections on port 8080 (WSS)
httpsServer.listen(8080, "0.0.0.0", function () {
  console.log('Secure Socket.IO (WSS) server started on port 8080');
});

// MQTT client logging
aedes.on('client', (client) => {
  console.log('MQTT Client connected:', client.id);
});

aedes.on('clientDisconnect', (client) => {
  console.log('MQTT Client disconnected:', client.id);
});

aedes.on('publish', (packet, client) => {
  if (client) {
    console.log(`Message from ${client.id}: ${packet.payload.toString()}`);
  } else {
    console.log('Message from anonymous client:', packet.payload.toString());
  }
});
