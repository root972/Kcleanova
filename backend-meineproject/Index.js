require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// Modular routes, helpers, and push notification services
const pushRoutes = require('./helpers/services/routes/push.routes');
const { calculateDistance } = require('./helpers/geofence');
const { sendGeofencePushAlert } = require('./helpers/services/push.service');

const app = express();
const server = http.createServer(app);

// Allowed origins for both Express HTTP & Socket.io WebSockets
const allowedOrigins = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:4200'
];

// Configure Express CORS
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Configure Socket.io CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const prisma = new PrismaClient();

// Geofence configuration
const SITE_CENTER = { lat: 48.2082, lng: 16.3738 };
const MAX_RADIUS_METERS = 250;

// ==========================================
// MIDDLEWARE & API ROUTES
// ==========================================
app.use(express.json());

// Register Push Notification API Route (/api/subscribe)
app.use('/api', pushRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Backend API is live and running!' });
});

// ==========================================
// 1. USER ROUTES
// ==========================================
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        worker: true
      }
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || 'WORKER',
        ...((role === 'WORKER' || !role) && {
          worker: { create: { phone } }
        })
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        worker: true
      }
    });
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(400).json({ error: 'Failed to create user', details: error.message });
  }
});

// ==========================================
// 2. WORKER ROUTES
// ==========================================
app.get('/api/workers', async (req, res) => {
  try {
    const workers = await prisma.worker.findMany({
      select: {
        id: true,
        userId: true,
        phone: true,
        status: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });
    res.json(workers);
  } catch (error) {
    console.error('Error fetching workers:', error);
    res.status(500).json({ error: 'Failed to fetch workers', details: error.message });
  }
});

app.put('/api/workers/:id', async (req, res) => {
  const { phone, status } = req.body;
  try {
    const updated = await prisma.worker.update({
      where: { id: parseInt(req.params.id) },
      data: { phone, status }
    });
    res.json(updated);
  } catch (error) {
    console.error('Error updating worker:', error);
    res.status(400).json({ error: 'Failed to update worker', details: error.message });
  }
});

// ==========================================
// 3. JOB ROUTES
// ==========================================
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await prisma.job.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        workLocation: true,
        status: true,
        createdAt: true,
        assignedWorker: {
          select: {
            id: true,
            phone: true,
            status: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true
              }
            }
          }
        }
      }
    });
    res.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs', details: error.message });
  }
});

app.post('/api/jobs', async (req, res) => {
  const { title, description, workLocation, assignedWorkerId } = req.body;
  try {
    const newJob = await prisma.job.create({
      data: {
        title,
        description,
        workLocation,
        assignedWorkerId: assignedWorkerId ? parseInt(assignedWorkerId) : null
      }
    });
    res.status(201).json(newJob);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(400).json({ error: 'Failed to create job', details: error.message });
  }
});

// ==========================================
// 4. SHIFT ROUTES
// ==========================================
app.post('/api/shifts/start', async (req, res) => {
  const { workerId } = req.body;
  try {
    const shift = await prisma.shift.create({
      data: {
        workerId: parseInt(workerId),
        startTime: new Date(),
        status: 'active'
      }
    });

    await prisma.worker.update({
      where: { id: parseInt(workerId) },
      data: { status: 'active' }
    });

    res.status(201).json(shift);
  } catch (error) {
    console.error('Error starting shift:', error);
    res.status(400).json({ error: 'Failed to start shift', details: error.message });
  }
});

// ==========================================
// 5. SOCKET.IO — LIVE TRACKING & GEOFENCE PUSH
// ==========================================
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  const handleLocationUpdate = async (data) => {
    const lat = data.lat !== undefined ? data.lat : data.latitude;
    const lng = data.lng !== undefined ? data.lng : data.longitude;
    const workerId = parseInt(data.workerId);
    const timestamp = new Date();

    const distance = calculateDistance(SITE_CENTER.lat, SITE_CENTER.lng, lat, lng);
    const roundedDistance = Math.round(distance);

    console.log(`Received location for Worker #${workerId}: Lat ${lat}, Lng ${lng} (${roundedDistance}m away)`);

    io.emit('location:update', {
      workerId,
      lat,
      lng,
      latitude: lat,
      longitude: lng,
      distance: roundedDistance,
      timestamp
    });

    if (distance > MAX_RADIUS_METERS) {
      console.warn(`GEOFENCE BREACH: Worker #${workerId} is ${roundedDistance}m away from perimeter.`);
      try {
        await sendGeofencePushAlert(workerId, roundedDistance);
        console.log('Web Push sent successfully.');
      } catch (pushErr) {
        console.error('Push Alert error:', pushErr);
      }
    }

    try {
      await prisma.location.create({
        data: {
          workerId,
          latitude: lat,
          longitude: lng
        }
      });
      console.log(`Saved location for Worker #${workerId} to DB.`);
    } catch (err) {
      console.error('Failed to save location to DB:', err.message);
    }
  };

  socket.on('location:update', handleLocationUpdate);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Express & Socket.io server running at http://localhost:${PORT}`);
});