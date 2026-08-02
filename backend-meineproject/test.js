const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
  console.log('⏳ Attempting to connect to Supabase...');
  try {
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    console.log('✅ DATABASE CONNECTION SUCCESSFUL!');
    console.log('Result:', result);
  } catch (error) {
    console.error('❌ DATABASE CONNECTION FAILED!');
    console.error('Error Details:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();