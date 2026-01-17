import type { Bar } from '../../../shared/types';

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
const BASE_URL = 'https://www.alphavantage.co/query';

export interface AlphaVantageResponse {
  'Meta Data': {
    '1: Symbol': string;
    '2: Indicator': string;
    '3: Last Refreshed': string;
    '4: Interval': string;
    '5: Time Zone': string;
  };
  'Time Series (1min)': {
    [timestamp: string]: {
      '1. open': string;
      '2. high': string;
      '3. low': string;
      '4. close': string;
      '5. volume': string;
    };
  };
}

export async function fetchBars(
  pair: string,
  from: number,
  to: number
): Promise<Bar[]> {
  // Alpha Vantage uses symbols like EUR/USD
  const symbol = pair.slice(0, 3) + '/' + pair.slice(3);

  const url = new URL(BASE_URL);
  url.searchParams.set('function', 'FX_INTRADAY');
  url.searchParams.set('from_symbol', pair.slice(0, 3));
  url.searchParams.set('to_symbol', pair.slice(3));
  url.searchParams.set('interval', '1min');
  url.searchParams.set('apikey', API_KEY);
  url.searchParams.set('outputsize', 'full');
  url.searchParams.set('datatype', 'json');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Alpha Vantage API error: ${response.statusText}`);
  }

  const data = await response.json();

  // Check for API limit error
  if (data.Note || data['Error Message']) {
    throw new Error(data.Note || data['Error Message']);
  }

  const timeSeries = data['Time Series FX (1min)'] || data['Time Series (1min)'];

  if (!timeSeries) {
    throw new Error('No time series data in response');
  }

  const bars: Bar[] = [];

  for (const [timestamp, values] of Object.entries(timeSeries)) {
    const time = new Date(timestamp).getTime();

    // Filter by date range
    if (time >= from && time <= to) {
      bars.push({
        timestamp: time,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseFloat(values['5. volume'] || '0'),
      });
    }
  }

  // Sort by timestamp ascending
  return bars.sort((a, b) => a.timestamp - b.timestamp);
}
