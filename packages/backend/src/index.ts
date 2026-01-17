import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import dataRoutes from './routes/data';
import healthRoutes from './routes/health';

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

app.route('/api/data', dataRoutes);
app.route('/api/health', healthRoutes);

const port = process.env.PORT || 3000;

console.log(`🚀 Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
