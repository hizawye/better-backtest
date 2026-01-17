import type { Bar } from '../../../shared/types';

const API_KEY = process.env.FOREXRATE_API_KEY || '';
const BASE_URL = 'https://api.forexrateapi.com/v1';

interface ForexRateResponse {
  success: boolean;
  timeseries: boolean;
  start_date: string;
  end_date: string;
  base: string;
  rates: {
    [date: string]: {
      [currency: string]: number;
    };
  };
}

export async function fetchBars(
  pair: string,
  from: number,
  to: number
): Promise<Bar[]> {
  const baseCurrency = pair.slice(0, 3);
  const quoteCurrency = pair.slice(3);

  const fromDate = new Date(from).toISOString().split('T')[0];
  const toDate = new Date(to).toISOString().split('T')[0];

  const url = new URL(`${BASE_URL}/timeseries`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('base', baseCurrency);
  url.searchParams.set('currencies', quoteCurrency);
  url.searchParams.set('start_date', fromDate);
  url.searchParams.set('end_date', toDate);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`ForexRateAPI error: ${response.statusText}`);
  }

  const data: ForexRateResponse = await response.json();

  if (!data.success) {
    throw new Error('ForexRateAPI returned unsuccessful response');
  }

  const bars: Bar[] = [];

  // ForexRateAPI returns daily data, we'll simulate 1-min bars
  // by creating synthetic bars for each day
  for (const [date, rates] of Object.entries(data.rates)) {
    const rate = rates[quoteCurrency];
    if (!rate) continue;

    const dayStart = new Date(date).getTime();

    // Create hourly bars for the day (24 bars)
    for (let hour = 0; hour < 24; hour++) {
      const timestamp = dayStart + hour * 3600000;

      // Add small random variation to simulate intraday movement
      const variation = (Math.random() - 0.5) * 0.001;
      const price = rate + variation;

      bars.push({
        timestamp,
        open: price,
        high: price + Math.abs(variation),
        low: price - Math.abs(variation),
        close: price,
        volume: 0,
      });
    }
  }

  return bars.sort((a, b) => a.timestamp - b.timestamp);
}
