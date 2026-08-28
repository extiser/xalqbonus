import { getQueueConnection } from '#server/queues/connection';

// Соединение с очередью поднимается на старте, а не по первому обращению: иначе первая же
// проба готовности застаёт его нулевым и отвечает 503 на живом Redis.
export default defineNitroPlugin(() => {
  getQueueConnection();
});
