const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'kcleanova',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

async function seed() {
  try {
    const query = \n      INSERT INTO shifts (worker_id, clock_in, clock_out, status, created_at)
      VALUES 
        (3, '2026-09-08 08:00:00+00', '2026-09-08 16:30:00+00', 'COMPLETED', NOW() - INTERVAL '5 days'),
        (3, '2026-09-09 08:15:00+00', '2026-09-09 16:45:00+00', 'COMPLETED', NOW() - INTERVAL '4 days'),
        (3, '2026-09-10 07:55:00+00', '2026-09-10 16:00:00+00', 'COMPLETED', NOW() - INTERVAL '3 days'),
        (3, '2026-09-11 08:00:00+00', '2026-09-11 16:30:00+00', 'COMPLETED', NOW() - INTERVAL '2 days'),
        (3, '2026-09-12 08:30:00+00', '2026-09-12 17:00:00+00', 'COMPLETED', NOW() - INTERVAL '1 day'),
        (3, '2026-09-13 08:00:00+00', NULL,                  'ACTIVE',    NOW());
    ;

    await pool.query(query);
    console.log('Successfully seeded 6 dummy shifts for worker ID 3!');
  } catch (err) {
    console.error('Error seeding database:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
