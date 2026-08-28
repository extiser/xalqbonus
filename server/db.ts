import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '#server/generated/prisma/client';

// Prisma 7 ходит в базу через драйверный адаптер, строка подключения берётся здесь,
// а не из схемы: в схеме Prisma 7 её больше не принимает.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Одно соединение на процесс. Пересоздание клиента на горячей перезагрузке в dev
// вычерпывает пул подключений, поэтому клиент кладётся в globalThis.
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
