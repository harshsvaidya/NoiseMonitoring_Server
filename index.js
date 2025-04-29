// Import required modules
const Aedes = require('aedes'); // Import Aedes MQTT broker
const net = require('net'); // Import net module for TCP connections
const http = require('http'); // Import HTTP module for HTTP server
const socketIo = require('socket.io'); // Import socket.io for real-time communication

// Create an instance of the Aedes MQTT broker
const aedes = Aedes(); // Instantiate the broker

// Setting up the TCP server to handle MQTT connections
const server = net.createServer(aedes.handle); // Create a TCP server for MQTT

// Listen for incoming MQTT connections on port 1883
server.listen(1883, function () {
    console.log('MQTT broker started on port 1883');
});

// Setting up the HTTP server for Socket.IO communication
const httpServer = http.createServer();
const io = socketIo(httpServer); // Create a Socket.IO server

// Listen for new client connections via Socket.IO
io.on('connection', (socket) => {
    console.log('Client connected via Socket.IO');

    // Handle receiving messages from the client
    socket.on('message', (msg) => {
        console.log('Message from client:', msg);
    });

    // Handle client disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Listen for incoming HTTP connections on port 8080 for Socket.IO communication
httpServer.listen(8080,"0.0.0.0", function () {
    console.log('Socket.IO server started on port 8080');
});

// Setting up logging and handling incoming messages from MQTT clients
aedes.on('client', (client) => {
    console.log('Client connected:', client.id);
});

aedes.on('clientDisconnect', (client) => {
    console.log('Client disconnected:', client.id);
});

// Handling incoming messages from MQTT clients
aedes.on('publish', (packet, client) => {
    if (client) {
        console.log(`Message from ${client.id}: ${packet.payload.toString()}`);
    } else {
        console.log('Message received from anonymous client:', packet.payload.toString());
    }
});
