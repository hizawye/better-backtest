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

    const validPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'NAS100', 'US500'];
    if (!validPairs.includes(pair)) {
      return c.json({ error: `Unsupported instrument. Valid options: ${validPairs.join(', ')}` }, 400);
    }

    // Add request timeout
    const REQUEST_TIMEOUT = 25000; // 25s total
    const fetchPromise = fetchBars(pair, from, to);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout after 25s')), REQUEST_TIMEOUT)
    );

    const bars = await Promise.race([fetchPromise, timeoutPromise]);

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
