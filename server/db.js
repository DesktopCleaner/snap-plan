import { PrismaClient } from '@prisma/client';

// Create a singleton instance of PrismaClient
// This prevents multiple instances in development (hot reload)
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

