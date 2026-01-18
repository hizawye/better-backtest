import { createClient } from 'redis';

let redisClient: ReturnType<typeof createClient> | null = null;
let redisAvailable = true;
let connectionAttempted = false;
let errorLogged = false;

export async function getRedisClient() {
  if (!redisAvailable) {
    return null;
  }

  if (!redisClient && !connectionAttempted) {
    connectionAttempted = true;

    try {
      redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });

      redisClient.on('error', (err) => {
        // Only log the first error to avoid spam
        if (!errorLogged) {
          console.warn('Redis unavailable - running without cache:', err?.message || 'Connection failed');
          errorLogged = true;
        }
      });

      await redisClient.connect();
      console.log('✓ Redis connected successfully');
    } catch (error) {
      if (!errorLogged) {
        console.warn('⚠ Redis unavailable - running without cache');
        errorLogged = true;
      }
      redisAvailable = false;
      redisClient = null;
      return null;
    }
  }

  return redisClient;
}

export async function getCached<T>(key: string): Promise<T | null> {
  if (!redisAvailable) {
    return null;
  }

  try {
    const client = await getRedisClient();
    if (!client) return null;

    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.warn('Redis get error:', error);
    return null;
  }
}

export async function setCache(key: string, value: any, ttl: number = 86400): Promise<void> {
  if (!redisAvailable) {
    return;
  }

  try {
    const client = await getRedisClient();
    if (!client) return;

    await client.setEx(key, ttl, JSON.stringify(value));
  } catch (error) {
    console.warn('Redis set error:', error);
  }
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
