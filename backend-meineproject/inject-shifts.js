const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  let workerId = null;

  const workerById = await prisma.worker.findUnique({
    where: { id: 3 },
  });

  if (workerById) {
    workerId = workerById.id;
    console.log("Found worker with id 3, using workerId: " + workerId);
  } else {
    console.log("Worker with id 3 not found, falling back to first available worker...");
    const firstWorker = await prisma.worker.findFirst();
    if (!firstWorker) {
      console.error("No workers found in the database. Exiting.");
      process.exit(1);
    }
    workerId = firstWorker.id;
    console.log("Using fallback workerId: " + workerId);
  }

  const result = await prisma.shift.createMany({
    data: [
      // Week 1 (Aug 11-15)
      { workerId: workerId, startTime: new Date("2026-08-11T08:00:00Z"), endTime: new Date("2026-08-11T16:30:00Z"), status: "COMPLETED", totalBreaches: 1, totalDurationOutsideSec: 120 },
      { workerId: workerId, startTime: new Date("2026-08-12T08:10:00Z"), endTime: new Date("2026-08-12T16:45:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      { workerId: workerId, startTime: new Date("2026-08-13T07:55:00Z"), endTime: new Date("2026-08-13T16:00:00Z"), status: "COMPLETED", totalBreaches: 2, totalDurationOutsideSec: 300 },
      { workerId: workerId, startTime: new Date("2026-08-14T08:00:00Z"), endTime: new Date("2026-08-14T16:30:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      { workerId: workerId, startTime: new Date("2026-08-15T08:30:00Z"), endTime: new Date("2026-08-15T17:00:00Z"), status: "COMPLETED", totalBreaches: 1, totalDurationOutsideSec: 90 },
      // Week 2 (Aug 18-22)
      { workerId: workerId, startTime: new Date("2026-08-18T08:00:00Z"), endTime: new Date("2026-08-18T16:30:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      { workerId: workerId, startTime: new Date("2026-08-19T08:05:00Z"), endTime: new Date("2026-08-19T16:35:00Z"), status: "COMPLETED", totalBreaches: 3, totalDurationOutsideSec: 450 },
      { workerId: workerId, startTime: new Date("2026-08-20T07:50:00Z"), endTime: new Date("2026-08-20T16:20:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      { workerId: workerId, startTime: new Date("2026-08-21T08:00:00Z"), endTime: new Date("2026-08-21T16:30:00Z"), status: "COMPLETED", totalBreaches: 1, totalDurationOutsideSec: 60 },
      { workerId: workerId, startTime: new Date("2026-08-22T08:15:00Z"), endTime: new Date("2026-08-22T17:00:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      // Week 3 (Aug 25-29)
      { workerId: workerId, startTime: new Date("2026-08-25T08:00:00Z"), endTime: new Date("2026-08-25T16:30:00Z"), status: "COMPLETED", totalBreaches: 2, totalDurationOutsideSec: 200 },
      { workerId: workerId, startTime: new Date("2026-08-26T08:00:00Z"), endTime: new Date("2026-08-26T16:00:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      { workerId: workerId, startTime: new Date("2026-08-27T07:45:00Z"), endTime: new Date("2026-08-27T16:15:00Z"), status: "COMPLETED", totalBreaches: 1, totalDurationOutsideSec: 75 },
      { workerId: workerId, startTime: new Date("2026-08-28T08:00:00Z"), endTime: new Date("2026-08-28T16:30:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      { workerId: workerId, startTime: new Date("2026-08-29T08:20:00Z"), endTime: new Date("2026-08-29T17:00:00Z"), status: "COMPLETED", totalBreaches: 4, totalDurationOutsideSec: 600 },
      // Week 4 (Sep 1-5)
      { workerId: workerId, startTime: new Date("2026-09-01T08:00:00Z"), endTime: new Date("2026-09-01T16:30:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      { workerId: workerId, startTime: new Date("2026-09-02T08:10:00Z"), endTime: new Date("2026-09-02T16:40:00Z"), status: "COMPLETED", totalBreaches: 1, totalDurationOutsideSec: 110 },
      { workerId: workerId, startTime: new Date("2026-09-03T07:55:00Z"), endTime: new Date("2026-09-03T16:00:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      { workerId: workerId, startTime: new Date("2026-09-04T08:00:00Z"), endTime: new Date("2026-09-04T16:30:00Z"), status: "COMPLETED", totalBreaches: 2, totalDurationOutsideSec: 240 },
      { workerId: workerId, startTime: new Date("2026-09-05T08:30:00Z"), endTime: new Date("2026-09-05T17:00:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      // Week 5 (Sep 8-12)
      { workerId: workerId, startTime: new Date("2026-09-08T08:00:00Z"), endTime: new Date("2026-09-08T16:30:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      { workerId: workerId, startTime: new Date("2026-09-09T08:15:00Z"), endTime: new Date("2026-09-09T16:45:00Z"), status: "COMPLETED", totalBreaches: 1, totalDurationOutsideSec: 150 },
      { workerId: workerId, startTime: new Date("2026-09-10T07:55:00Z"), endTime: new Date("2026-09-10T16:00:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      { workerId: workerId, startTime: new Date("2026-09-11T08:00:00Z"), endTime: new Date("2026-09-11T16:30:00Z"), status: "COMPLETED", totalBreaches: 3, totalDurationOutsideSec: 390 },
      { workerId: workerId, startTime: new Date("2026-09-12T08:30:00Z"), endTime: new Date("2026-09-12T17:00:00Z"), status: "COMPLETED", totalBreaches: 0, totalDurationOutsideSec: 0 },
      // Today - active
      { workerId: workerId, startTime: new Date("2026-09-13T08:00:00Z"), endTime: null, status: "active", totalBreaches: 0, totalDurationOutsideSec: 0 },
    ],
  });

  console.log("Inserted " + result.count + " shift(s) for workerId: " + workerId);
}

main()
  .catch(function(err) {
    console.error("Error inserting shifts:", err);
    process.exit(1);
  })
  .finally(async function() {
    await prisma.$disconnect();
    console.log("Prisma disconnected.");
  });