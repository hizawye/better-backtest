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

    // Reject excessive date ranges
    const daysDiff = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
    const MAX_DAYS = 30;

    if (daysDiff > MAX_DAYS) {
      return c.json({
        error: `Date range too large: ${daysDiff} days requested, max ${MAX_DAYS} days allowed`
      }, 400);
    }

    if (from >= to) {
      return c.json({ error: 'Invalid date range: from must be before to' }, 400);
    }

    // Add request timeout
    const REQUEST_TIMEOUT = 35000; // 35s total
    const fetchPromise = fetchBars(pair, from, to);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout after 35s')), REQUEST_TIMEOUT)
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
