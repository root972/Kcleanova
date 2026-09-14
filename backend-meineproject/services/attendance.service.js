const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Service: Fetches paginated shift history for a specific worker
 * @param {number|string} targetWorkerId - The ID of the Worker
 * @param {number|string} skip - Number of records to skip for pagination
 * @param {number|string} limit - Number of records to fetch per page
 */
async function getShiftHistoryByWorkerId(targetWorkerId, skip = 0, limit = 10) {
  const numericWorkerId = Number(targetWorkerId);
  const numericSkip = Math.max(0, parseInt(skip, 10) || 0);
  const numericLimit = Math.max(1, parseInt(limit, 10) || 10);

  // Run both queries in parallel for better performance
  const [shifts, totalCount] = await Promise.all([
    // Query 1: Fetch the paginated page of shifts
    prisma.shift.findMany({
      where: { 
        workerId: numericWorkerId 
      },
      skip: numericSkip,
      take: numericLimit,
      orderBy: { 
        startTime: 'desc' 
      },
      select: {
        id: true,
        workerId: true,
        startTime: true,              
        endTime: true,                 
        status: true,                  
        totalBreaches: true,            
        totalDurationOutsideSec: true   
      }
    }),

    // Query 2: Get total count of shifts for pagination metadata calculations
    prisma.shift.count({
      where: { 
        workerId: numericWorkerId 
      }
    })
  ]);

  return { shifts, totalCount };
}

module.exports = { getShiftHistoryByWorkerId };