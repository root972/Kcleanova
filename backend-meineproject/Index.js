require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Modular routes, helpers, and push notification services
const pushRoutes = require('./routes/push.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const { calculateDistance } = require('./helpers/geofence');
const { sendGeofencePushAlert } = require('./services/push.service');
const { authMiddleware, JWT_SECRET } = require('./helpers/auth.middleware');

// 1. INITIALIZE EXPRESS APP & SERVER
const app = express();
const server = http.createServer(app);

// 2. DEFINE ALL ALLOWED ORIGINS IN ONE PLACE
const allowedOrigins = [
  'https://reassign-detached-tyke.ngrok-free.dev',
  'http://localhost:4200',
  'http://localhost:8081',
  'http://172.20.10.2:4200',
  'http://127.0.0.1:8081'
];

// 3. APPLY MIDDLEWARE
app.use(express.json()); // Parses incoming JSON bodies
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// 4. APPLY CORS TO SOCKET.IO WEBSOCKETS (ONCE)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// 5. MOUNT ROUTE MODULES
app.use('/api/auth', require('./routes/routes-auth'));
app.use('/api', pushRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api', attendanceRoutes);

// 6. INITIALIZE PRISMA & STATE
const prisma = new PrismaClient();

// health backend 
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date(),
    uptime: process.uptime()
  });
});


// Dynamic geofence configuration defaults and runtime state
const DEFAULT_GEOFENCE_CONFIG = {
  siteLat: 48.2082,
  siteLng: 16.3738,
  radiusMeters: 250,
  gracePeriodSeconds: 30
};

let geofenceConfig = { ...DEFAULT_GEOFENCE_CONFIG };
const latestWorkerLocations = new Map();
const activeBreachLogIds = new Map();
const workerGeofenceState = new Map();
const workerSocketCounts = new Map();
const ADMINS_ROOM = 'admins';

function registerWorkerSocket(workerId) {
  const count = workerSocketCounts.get(workerId) || 0;
  workerSocketCounts.set(workerId, count + 1);
}

function unregisterWorkerSocket(workerId) {
  const count = workerSocketCounts.get(workerId) || 0;
  if (count <= 1) {
    workerSocketCounts.delete(workerId);
    return true;
  }
  workerSocketCounts.set(workerId, count - 1);
  return false;
}

async function getActiveShiftForWorker(workerId) {
  return prisma.shift.findFirst({
    where: { workerId, status: 'active', endTime: null },
    orderBy: { startTime: 'desc' }
  });
}

async function emitGeofenceBreach(payload) {
  io.to(ADMINS_ROOM).emit('geofence:breach', payload);
}

async function emitGeofenceRestored(payload) {
  io.to(ADMINS_ROOM).emit('geofence:restored', payload);
}

async function handleInsideToOutside(workerId, roundedDistance, timestamp) {
  let workerName = null;
  let workerRecord = null;

  try {
    workerRecord = await prisma.worker.findUnique({
      where: { id: workerId },
      include: { user: { select: { name: true } } }
    });
    workerName = workerRecord?.user?.name ?? null;
  } catch (workerErr) {
    console.warn('Unable to resolve worker for breach start:', workerErr);
  }

  const activeShift = await getActiveShiftForWorker(workerId);

  const breachLog = await prisma.breachLog.create({
    data: {
      workerId,
      shiftId: activeShift?.id ?? null,
      workerName,
      maxDistance: roundedDistance,
      status: 'ACTIVE',
      startTime: timestamp,
      breachedAt: timestamp
    }
  });

  activeBreachLogIds.set(workerId, breachLog.id);
  workerGeofenceState.set(workerId, 'OUTSIDE');

  const updatedWorker = await prisma.worker.update({
    where: { id: workerId },
    data: { totalBreaches: { increment: 1 } }
  });

  if (activeShift) {
    await prisma.shift.update({
      where: { id: activeShift.id },
      data: { totalBreaches: { increment: 1 } }
    });
  }

  await broadcastBreachLogs();

  const breachPayload = {
    workerId,
    workerName,
    breachLogId: breachLog.id,
    totalBreaches: updatedWorker.totalBreaches,
    totalDurationOutsideSec: updatedWorker.totalDurationOutsideSec,
    breachedAt: timestamp.toISOString(),
    distance: roundedDistance
  };

  await emitGeofenceBreach(breachPayload);

  console.warn(`GEOFENCE BREACH: Worker #${workerId} is ${roundedDistance}m away from perimeter.`);
  try {
    await sendGeofencePushAlert(workerId, roundedDistance);
  } catch (pushErr) {
    console.error('Push Alert error:', pushErr);
  }

  return breachPayload;
}

async function handleOutsideToInside(workerId, timestamp) {
  const activeBreachId = activeBreachLogIds.get(workerId);
  if (!activeBreachId) {
    workerGeofenceState.set(workerId, 'INSIDE');
    return null;
  }

  const activeBreach = await prisma.breachLog.findUnique({
    where: { id: activeBreachId },
    select: { breachedAt: true, startTime: true }
  });

  if (!activeBreach) {
    activeBreachLogIds.delete(workerId);
    workerGeofenceState.set(workerId, 'INSIDE');
    return null;
  }

  const breachStart = activeBreach.breachedAt || activeBreach.startTime;
  const durationSec = Math.max(0, Math.round((timestamp - breachStart) / 1000));

  await prisma.breachLog.update({
    where: { id: activeBreachId },
    data: {
      endTime: timestamp,
      resolvedAt: timestamp,
      durationSec,
      status: 'RESOLVED'
    }
  });

  activeBreachLogIds.delete(workerId);
  workerGeofenceState.set(workerId, 'INSIDE');

  const updatedWorker = await prisma.worker.update({
    where: { id: workerId },
    data: { totalDurationOutsideSec: { increment: durationSec } }
  });

  const activeShift = await getActiveShiftForWorker(workerId);
  if (activeShift) {
    await prisma.shift.update({
      where: { id: activeShift.id },
      data: { totalDurationOutsideSec: { increment: durationSec } }
    });
  }

  await broadcastBreachLogs();

  const restoredPayload = {
    workerId,
    breachLogId: activeBreachId,
    totalBreaches: updatedWorker.totalBreaches,
    durationSec,
    totalDurationOutsideSec: updatedWorker.totalDurationOutsideSec,
    resolvedAt: timestamp.toISOString()
  };

  await emitGeofenceRestored(restoredPayload);
  console.log(`GEOFENCE RESTORED: Worker #${workerId} returned inside after ${durationSec}s outside.`);

  return restoredPayload;
}

async function processWorkerLocationUpdate(workerId, safeLat, safeLng, timestamp = new Date()) {
  const distance = calculateDistance(geofenceConfig.siteLat, geofenceConfig.siteLng, safeLat, safeLng);
  const roundedDistance = Math.round(distance);
  const isOutside = distance > geofenceConfig.radiusMeters;
  const currentState = isOutside ? 'OUTSIDE' : 'INSIDE';
  const previousState = workerGeofenceState.get(workerId) ?? 'INSIDE';

  latestWorkerLocations.set(workerId, { lat: safeLat, lng: safeLng, timestamp });

  console.log(`Received location for Worker #${workerId}: Lat ${safeLat}, Lng ${safeLng} (${roundedDistance}m away)`);

  io.to(ADMINS_ROOM).emit('location:updated', {
    workerId,
    lat: safeLat,
    lng: safeLng,
    latitude: safeLat,
    longitude: safeLng,
    distance: roundedDistance,
    timestamp,
    geofenceStatus: currentState
  });

  if (previousState === 'INSIDE' && currentState === 'OUTSIDE') {
    await handleInsideToOutside(workerId, roundedDistance, timestamp);
  } else if (previousState === 'OUTSIDE' && currentState === 'INSIDE') {
    await handleOutsideToInside(workerId, timestamp);
  } else if (currentState === 'OUTSIDE') {
    workerGeofenceState.set(workerId, 'OUTSIDE');
    const activeBreachId = activeBreachLogIds.get(workerId);
    if (activeBreachId) {
      const activeBreach = await prisma.breachLog.findUnique({
        where: { id: activeBreachId },
        select: { maxDistance: true }
      });
      if (activeBreach && roundedDistance > activeBreach.maxDistance) {
        await prisma.breachLog.update({
          where: { id: activeBreachId },
          data: { maxDistance: roundedDistance }
        });
        await broadcastBreachLogs();
      }
    } else {
      // State says outside but no active breach (e.g. after restart) — open one without incrementing duplicate counter
      await handleInsideToOutside(workerId, roundedDistance, timestamp);
    }
  } else {
    workerGeofenceState.set(workerId, 'INSIDE');
  }

  try {
    await prisma.location.create({
      data: {
        workerId,
        latitude: safeLat,
        longitude: safeLng
      }
    });
    try {
      await prisma.worker.update({ where: { id: workerId }, data: { status: 'active' } });
    } catch (wu) {
      // worker may not have a worker profile yet; ignore
    }

    console.log(`Saved location for Worker #${workerId} to DB.`);
  } catch (err) {
    console.error('Failed to save location to DB:', err.message);
  }

  const workerStats = await prisma.worker.findUnique({
    where: { id: workerId },
    select: { totalBreaches: true, totalDurationOutsideSec: true }
  });

  return {
    workerId,
    lat: safeLat,
    lng: safeLng,
    latitude: safeLat,
    longitude: safeLng,
    distance: roundedDistance,
    timestamp,
    geofenceStatus: currentState,
    totalBreaches: workerStats?.totalBreaches ?? 0,
    totalDurationOutsideSec: workerStats?.totalDurationOutsideSec ?? 0
  };
}

const DEFAULT_ADMIN_EMAIL = 'superadmin@kcleanova.com';
const DEFAULT_ADMIN_PASSWORD = 'KcleanovaAdmin2026!';

async function getAllBreachLogs() {
  return prisma.breachLog.findMany({
    orderBy: { startTime: 'desc' }
  });
}

async function broadcastBreachLogs() {
  try {
    const logs = await getAllBreachLogs();
    io.to(ADMINS_ROOM).emit('breach-logs:updated', logs);
  } catch (err) {
    console.error('Failed to broadcast breach logs:', err);
  }
}

async function ensureAdminCredentials() {
  const adminEmail = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    if (existingUser) {
      await prisma.worker.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role: 'ADMIN',
          password: hashedPassword
        }
      });
    } else {
      await prisma.user.create({
        data: {
          name: 'Administrator',
          email: adminEmail,
          password: hashedPassword,
          role: 'ADMIN'
        }
      });
    }

    console.log('===================================================');
    console.log('👑 NEW ADMIN ACCOUNT CONFIGURED & READY:');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log('Role: ADMIN');
    console.log('===================================================');
  } catch (err) {
    console.error('Error while configuring admin user:', err);
  }
}

ensureAdminCredentials();

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

    // Hydrate latest worker locations from DB so server restarts don't lose active worker positions
    try {
      const workers = await prisma.worker.findMany({ include: { locations: { orderBy: { timestamp: 'desc' }, take: 1 } } });
      workers.forEach((w) => {
        if (w.locations && w.locations.length > 0) {
          const loc = w.locations[0];
          latestWorkerLocations.set(w.id, { lat: loc.latitude, lng: loc.longitude, timestamp: loc.timestamp });
        }
      });
      console.log(`Hydrated ${latestWorkerLocations.size} active worker location(s) from DB.`);

      try {
        const activeBreaches = await prisma.breachLog.findMany({ where: { status: 'ACTIVE' } });
        activeBreaches.forEach((log) => {
          activeBreachLogIds.set(log.workerId, log.id);
          workerGeofenceState.set(log.workerId, 'OUTSIDE');
        });
        console.log(`Hydrated ${activeBreachLogIds.size} active breach log(s) from DB.`);

        workers.forEach((w) => {
          if (!workerGeofenceState.has(w.id) && w.locations && w.locations.length > 0) {
            const loc = w.locations[0];
            const dist = calculateDistance(geofenceConfig.siteLat, geofenceConfig.siteLng, loc.latitude, loc.longitude);
            workerGeofenceState.set(w.id, dist > geofenceConfig.radiusMeters ? 'OUTSIDE' : 'INSIDE');
          } else if (!workerGeofenceState.has(w.id)) {
            workerGeofenceState.set(w.id, 'INSIDE');
          }
        });
      } catch (breachHydrateErr) {
        console.error('Failed to hydrate active breach logs from DB:', breachHydrateErr);
      }
    } catch (hydrateErr) {
      console.error('Failed to hydrate active worker locations from DB:', hydrateErr);
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
    io.to(ADMINS_ROOM).emit('geofence:updated', geofenceConfig);

    for (const [workerId, location] of latestWorkerLocations.entries()) {
      const distance = calculateDistance(geofenceConfig.siteLat, geofenceConfig.siteLng, location.lat, location.lng);
      const roundedDistance = Math.round(distance);
      const isOutOfBounds = distance > geofenceConfig.radiusMeters;

      if (isOutOfBounds) {
        console.warn(`GEOFENCE BREACH AFTER SITE UPDATE: Worker #${workerId} is ${roundedDistance}m away from the new perimeter.`);
        try {
          await sendGeofencePushAlert(workerId, roundedDistance);
          console.log(`Web Push sent for Worker #${workerId} after site update.`);
        } catch (pushErr) {
          console.error(`Push Alert error for Worker #${workerId}:`, pushErr);
        }
      }
    }

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
        totalBreaches: true,
        totalDurationOutsideSec: true,
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

app.get('/api/breach-logs', async (req, res) => {
  try {
    const breachLogs = await getAllBreachLogs();
    res.json(breachLogs);
  } catch (error) {
    console.error('Error fetching breach logs:', error);
    res.status(500).json({ error: 'Failed to fetch breach logs', details: error.message });
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
// 4. LOCATION HEARTBEAT (HTTP fallback for workers)
// ==========================================
app.post('/api/location/heartbeat', authMiddleware, async (req, res) => {
  try {
    const lat = req.body.lat !== undefined ? req.body.lat : req.body.latitude;
    const lng = req.body.lng !== undefined ? req.body.lng : req.body.longitude;
    const workerId = parseInt(req.body.workerId, 10);

    if (isNaN(workerId) || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'workerId, lat, and lng are required.' });
    }

    if (req.user.role !== 'WORKER' || req.user.workerId !== workerId) {
      return res.status(403).json({ error: 'Not authorized to send heartbeat for this worker.' });
    }

    const safeLat = parseFloat(lat);
    const safeLng = parseFloat(lng);
    const timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();

    const payload = await processWorkerLocationUpdate(workerId, safeLat, safeLng, timestamp);
    res.json({ ok: true, location: payload });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ error: 'Failed to process location heartbeat.' });
  }
});

// ==========================================
// 5. SHIFT ROUTES
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
// 6. SOCKET.IO — LIVE TRACKING & GEOFENCE PUSH
// ==========================================
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Try to attach user info to socket from provided auth token (JWT)
  try {
    const token = (socket.handshake && socket.handshake.auth && socket.handshake.auth.token) ||
      (socket.handshake && socket.handshake.headers && socket.handshake.headers.authorization && socket.handshake.headers.authorization.split(' ')[1]);
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
      } catch (e) {
        console.warn('Socket authentication failed:', e.message);
      }
    }
  } catch (e) {
    // ignore
  }

  if (socket.user?.role === 'ADMIN') {
    socket.join(ADMINS_ROOM);
    console.log(`Admin socket joined ${ADMINS_ROOM}:`, socket.id);
  }

  if (socket.user?.role === 'WORKER' && socket.user.workerId) {
    socket.trackedWorkerId = socket.user.workerId;
    registerWorkerSocket(socket.user.workerId);
    console.log(`Worker #${socket.user.workerId} socket registered:`, socket.id);
  }

  socket.on('map:subscribe', () => {
    try {
      if (!socket.user || socket.user.role !== 'ADMIN') {
        socket.emit('map:subscribe:denied', { error: 'Not authorized' });
        console.warn('map:subscribe denied for socket', socket.id);
        return;
      }

      const workersArray = Array.from(latestWorkerLocations.entries()).map(([workerId, loc]) => ({
        workerId,
        lat: loc.lat,
        lng: loc.lng,
        timestamp: loc.timestamp
      }));
      socket.emit('workers:initial', workersArray);
    } catch (err) {
      console.error('Error sending initial workers list:', err);
    }
  });

  socket.on('breach-logs:subscribe', async () => {
    try {
      if (!socket.user || socket.user.role !== 'ADMIN') {
        socket.emit('breach-logs:subscribe:denied', { error: 'Not authorized' });
        console.warn('breach-logs:subscribe denied for socket', socket.id);
        return;
      }

      const breachLogs = await getAllBreachLogs();
      socket.emit('breach-logs:updated', breachLogs);
    } catch (err) {
      console.error('Error sending initial breach logs:', err);
    }
  });

  const handleLocationUpdate = async (data) => {
    const lat = data.lat !== undefined ? data.lat : data.latitude;
    const lng = data.lng !== undefined ? data.lng : data.longitude;
    const workerId = parseInt(data.workerId, 10);
    const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();

    if (isNaN(workerId) || lat === undefined || lng === undefined) {
      console.warn('Invalid location update payload received:', data);
      return;
    }

    if (socket.user?.role === 'WORKER' && socket.user.workerId && socket.user.workerId !== workerId) {
      console.warn(`Worker #${socket.user.workerId} attempted to send location for Worker #${workerId}`);
      return;
    }

    const safeLat = parseFloat(lat);
    const safeLng = parseFloat(lng);
    await processWorkerLocationUpdate(workerId, safeLat, safeLng, timestamp);
  };

  socket.on('location:update', handleLocationUpdate);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    if (socket.trackedWorkerId) {
      const isLastSocket = unregisterWorkerSocket(socket.trackedWorkerId);
      if (isLastSocket) {
        io.to(ADMINS_ROOM).emit('worker:offline', { workerId: socket.trackedWorkerId });
        console.log(`Worker #${socket.trackedWorkerId} is offline (last socket disconnected).`);
      }
    }
  });
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Express & Socket.io server running at http://localhost:${PORT}`);
});