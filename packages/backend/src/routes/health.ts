import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'better-backtest-api'
  });
});

export default app;
