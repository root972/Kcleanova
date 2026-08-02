const { io } = require('socket.io-client');

// Connect to your running Socket.io server
const socket = io('http://localhost:3000');

// Simulated GPS path (e.g., walking through Stephansplatz, Vienna)
const simulatedRoute = [
  { workerId: 1, latitude: 48.208492, longitude: 16.373118 },
  { workerId: 1, latitude: 48.208851, longitude: 16.373522 },
  { workerId: 1, latitude: 48.209123, longitude: 16.374105 },
  { workerId: 1, latitude: 48.209450, longitude: 16.374680 },
  { workerId: 1, latitude: 48.209810, longitude: 16.375120 }
];

socket.on('connect', () => {
  console.log('📡 Connected to Socket.io server! Socket ID:', socket.id);
  console.log('🚀 Starting GPS simulation...\n');

  let index = 0;

  // Send a coordinate update every 2 seconds
  const interval = setInterval(() => {
    if (index >= simulatedRoute.length) {
      console.log('\n🏁 Simulation complete! Disconnecting...');
      clearInterval(interval);
      socket.disconnect();
      process.exit(0);
    }

    const currentPoint = simulatedRoute[index];
    console.log(`📍 [Sending Point ${index + 1}/${simulatedRoute.length}] Lat: ${currentPoint.latitude}, Lng: ${currentPoint.longitude}`);

    // Emit event matching backend socket listener 'location:update'
    socket.emit('location:update', currentPoint);

    index++;
  }, 2000);
});

// Listen for broadcasted updates from server
socket.on('location:updated', (data) => {
  console.log('  ⚡ Server Broadcast Received:', data);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected from server.');
});