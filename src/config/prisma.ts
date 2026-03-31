import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error', 'warn'],
});

/**
 * Gracefully disconnect PrismaClient on application shutdown.
 * This ensures all database connections are properly closed.
 */
const gracefulShutdown = async () => {
  console.log('🔄 Shutting down PrismaClient...');
  try {
    await prisma.$disconnect();
    console.log('✅ PrismaClient disconnected successfully');
  } catch (error) {
    console.error('❌ Error disconnecting PrismaClient:', error);
  }
};

// Handle process termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught Exception:', error);
  await gracefulShutdown();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  await gracefulShutdown();
  process.exit(1);
});

export default prisma;