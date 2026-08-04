const { io } = require('socket.io-client');

const socket = io('http://localhost:3000');

// GPS points starting inside site (~0m) and walking far out to Schwedenplatz (~600m)
const route = [
  { lat: 48.208492, lng: 16.373118 }, // Point 1: 0m away (Inside 250m boundary)
  { lat: 48.209000, lng: 16.374000 }, // Point 2: ~90m away (Inside 250m boundary)
  { lat: 48.210000, lng: 16.375000 }, // Point 3: ~210m away (Inside 250m boundary)
  { lat: 48.210800, lng: 16.375800 }, // Point 4: ~310m away (OUT OF BOUNDS! Timer Starts t=0s)
  { lat: 48.211500, lng: 16.376500 }, // Point 5: ~380m away (OUT OF BOUNDS! t=2s)
  { lat: 48.212200, lng: 16.377200 }, // Point 6: ~480m away (OUT OF BOUNDS! t=4s)
  { lat: 48.213000, lng: 16.378000 }, // Point 7: ~580m away (OUT OF BOUNDS! t=6s -> 🚨 ALERT FIRES HERE!)
];

socket.on('connect', () => {
  console.log('📡 Connected to Socket.io server! Sending GPS simulation coordinates...\n');

  let index = 0;
  const interval = setInterval(() => {
    if (index >= route.length) {
      clearInterval(interval);
      console.log('🏁 Simulation finished! Check your Angular dashboard for alerts.');
      socket.disconnect();
      return;
    }

    const point = route[index];
    const payload = {
      workerId: 1,
      latitude: point.lat,
      longitude: point.lng,
      timestamp: new Date().toISOString()
    };

    console.log(`📍 [Sending Point ${index + 1}/${route.length}] Lat: ${point.lat}, Lng: ${point.lng}`);
    
    // Broadcast coordinate update
    socket.emit('location:updated', payload);

    index++;
  }, 2000); // Sends a new point every 2 seconds
});

socket.on('location:updated', (data) => {
  console.log('  ⚡ Server Broadcast Received:', data);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected from server.');
});