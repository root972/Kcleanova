const express = require('express');
const router = express.Router();

// 1. Import Authentication Middleware
const { authMiddleware } = require('../helpers/auth.middleware');

// 2. Import Controller
const attendanceController = require('../controllers/attendance.controller');

// -------------------------------------------------------------
// GET /api/attendance/history/:workerId
// Access: Authenticated Users (Protected by authMiddleware)
// -------------------------------------------------------------
router.get(
  '/history/:workerId', 
  authMiddleware, 
  attendanceController.getWorkerShiftHistory
);

// GET /api/shifts/worker/:id
router.get(
  '/shifts/worker/:id',
  authMiddleware,
  attendanceController.getWorkerShiftHistory
);

module.exports = router;