import Redis from 'ioredis';

// BullMQ требует maxRetriesPerRequest: null — иначе воркер падает на первой же
// заминке Redis вместо того, чтобы дождаться восстановления связи.
const createConnection = (): Redis =>
  new Redis(process.env.REDIS_URL ?? 'redis://localhost:6381', {
    maxRetriesPerRequest: null,
  });

const globalForQueue = globalThis as typeof globalThis & { queueConnection?: Redis };

export const getQueueConnection = (): Redis => {
  if (!globalForQueue.queueConnection) {
    globalForQueue.queueConnection = createConnection();
  }

  return globalForQueue.queueConnection;
};
