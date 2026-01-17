import { Hono } from 'hono';
import { fetchBars } from '../services/aggregator';

const app = new Hono();

app.get('/:pair/:from/:to', async (c) => {
  try {
    const pair = c.req.param('pair').toUpperCase();
    const from = parseInt(c.req.param('from'));
    const to = parseInt(c.req.param('to'));

    // Validate inputs
    if (!pair || isNaN(from) || isNaN(to)) {
      return c.json({ error: 'Invalid parameters' }, 400);
    }

    if (!['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF'].includes(pair)) {
      return c.json({ error: 'Unsupported currency pair' }, 400);
    }

    const bars = await fetchBars(pair, from, to);

    return c.json({
      pair,
      from,
      to,
      count: bars.length,
      bars,
    });
  } catch (error) {
    console.error('Data route error:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, 500);
  }
});

export default app;
