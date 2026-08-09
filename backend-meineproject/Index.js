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

// 1. INITIALIZE EXPRESS APP FIRST
const app = express();
const server = http.createServer(app);

// Allowed origins for both Express HTTP & Socket.io WebSockets
const allowedOrigins = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:4200'
];

// 2. MIDDLEWARE (Parsing JSON & CORS)
app.use(express.json()); // Parses incoming JSON bodies
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// 3. MOUNT ROUTE MODULES
app.use('/api/auth', require('./helpers/services/routes/routes-auth'));
app.use('/api', pushRoutes);

// Configure Socket.io CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const prisma = new PrismaClient();

// Dynamic geofence configuration defaults and runtime state
const DEFAULT_GEOFENCE_CONFIG = {
  siteLat: 48.2082,
  siteLng: 16.3738,
  radiusMeters: 250,
  gracePeriodSeconds: 30
};
let geofenceConfig = { ...DEFAULT_GEOFENCE_CONFIG };

(async () => {
  try {
    const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!existingAdmin) {
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (adminEmail && adminPassword) {
        const hashed = await bcrypt.hash(adminPassword, 10);
        await prisma.user.create({
          data: {
            name: 'Administrator',
            email: adminEmail.toLowerCase(),
            password: hashed,
            role: 'ADMIN'
          }
        });
        console.log('🔐 Seeded ADMIN user from environment variables.');
      } else {
        console.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set in environment; skipping admin seeding.');
      }
    } else {
      console.log('Admin user already exists; skipping seeding.');
    }
  } catch (err) {
    console.error('Error while seeding admin user:', err);
  }
})();

// Load or initialize geofence settings from the database
(async () => {
  try {
    const existingGeofence = await prisma.geofence.findFirst();
    if (existingGeofence) {
      geofenceConfig = existingGeofence;
      console.log('Loaded geofence settings from database.');
    } else {
      const createdGeofence = await prisma.geofence.create({ data: DEFAULT_GEOFENCE_CONFIG });
      geofenceConfig = createdGeofence;
      console.log('Created default geofence settings.');
    }
  } catch (err) {
    console.error('Error while loading geofence settings:', err);
  }
})();

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Backend API is live and running!' });
});

// ==========================================
// 0. GEOFENCE SETTINGS ROUTES
// ==========================================
app.get('/api/geofence', async (req, res) => {
  try {
    res.json(geofenceConfig);
  } catch (error) {
    console.error('Error fetching geofence config:', error);
    res.status(500).json({ error: 'Failed to fetch geofence configuration.' });
  }
});

app.put('/api/geofence', async (req, res) => {
  try {
    const { siteLat, siteLng, radiusMeters, gracePeriodSeconds } = req.body;
    if (siteLat === undefined || siteLng === undefined || radiusMeters === undefined || gracePeriodSeconds === undefined) {
      return res.status(400).json({ error: 'All geofence settings are required.' });
    }

    if (!geofenceConfig.id) {
        return res.status(503).json({ error: 'Geofence configuration not initialized yet.' });
      }

      const updatedConfig = await prisma.geofence.update({
        where: { id: geofenceConfig.id },
        data: {
          siteLat: parseFloat(siteLat),
          siteLng: parseFloat(siteLng),
          radiusMeters: parseInt(radiusMeters, 10),
          gracePeriodSeconds: parseInt(gracePeriodSeconds, 10)
        }
      });

    geofenceConfig = updatedConfig;
    io.emit('geofence:updated', geofenceConfig);
    console.log('Geofence configuration updated:', geofenceConfig);
    res.json(geofenceConfig);
  } catch (error) {
    console.error('Error updating geofence config:', error);
    res.status(500).json({ error: 'Failed to update geofence configuration.', details: error.message });
  }
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

    if (isNaN(workerId) || lat === undefined || lng === undefined) {
      console.warn('Invalid location update payload received:', data);
      return;
    }

    const distance = calculateDistance(geofenceConfig.siteLat, geofenceConfig.siteLng, lat, lng);
    const roundedDistance = Math.round(distance);

    console.log(`Received location for Worker #${workerId}: Lat ${lat}, Lng ${lng} (${roundedDistance}m away)`);

    // ✅ Broadcast using 'location:updated' to match Angular LocationService
    io.emit('location:updated', {
      workerId,
      lat,
      lng,
      latitude: lat,
      longitude: lng,
      distance: roundedDistance,
      timestamp
    });

    if (distance > geofenceConfig.radiusMeters) {
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
          latitude: parseFloat(lat),
          longitude: parseFloat(lng)
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