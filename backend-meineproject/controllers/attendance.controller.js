const attendanceService = require('../services/attendance.service');

async function getWorkerShiftHistory(req, res, next) {
  // 1. Authorization Guard
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ 
      success: false, 
      message: 'Forbidden: Admin access required' 
    });
  }

  // -------------------------------------------------------------
  // ROLE 1: TRANSLATOR / EXTRACTOR
  // -------------------------------------------------------------
  const workerId = req.params.id || req.params.workerId;
  if (!workerId) {
    return res.status(400).json({ 
      success: false, 
      message: 'workerId parameter is required' 
    });
  }

  // Extract query params & calculate pagination
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
  const requestedSkip = parseInt(req.query.skip, 10);
  const skip = Number.isNaN(requestedSkip)
    ? (page - 1) * limit
    : Math.max(0, requestedSkip);

  try {
    // -------------------------------------------------------------
    // ROLE 2: MANAGER / DELEGATOR
    // -------------------------------------------------------------
    const { shifts, totalCount } = await attendanceService.getShiftHistoryByWorkerId(
      workerId,
      skip,
      limit
    );

    // -------------------------------------------------------------
    // ROLE 3: PRESENTER
    // -------------------------------------------------------------
    return res.status(200).json({
      shifts,
      totalCount
    });

  } catch (error) {
    console.error('Error fetching worker shift history:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch shift history' 
    });
  }
}

module.exports = { getWorkerShiftHistory };