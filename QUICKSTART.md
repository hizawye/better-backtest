# Quick Start Guide

## Setup

### 1. Get API Keys (Free)

**Alpha Vantage** (Primary - 25 requests/day):
```bash
# Visit: https://www.alphavantage.co/support/#api-key
# Sign up and get your free API key
```

**ForexRateAPI** (Fallback - 1000 requests/month):
```bash
# Visit: https://forexrateapi.com
# Sign up for free tier
```

### 2. Configure Backend

```bash
cd packages/backend
cp .env.example .env
# Edit .env and add your API keys:
# ALPHA_VANTAGE_API_KEY=your_key_here
# FOREXRATE_API_KEY=your_key_here
```

### 3. Start Redis (Optional but recommended)

```bash
# If Redis is not running, caching will be skipped
# Install Redis: sudo dnf install redis
# Start Redis: sudo systemctl start redis
# Or use Docker: docker run -d -p 6379:6379 redis
```

### 4. Run the Application

**Terminal 1 - Backend:**
```bash
cd packages/backend
bun run dev
# Server will start on http://localhost:3000
```

**Terminal 2 - Frontend:**
```bash
cd packages/frontend
bun run dev
# App will start on http://localhost:5173
```

### 5. Open Browser

Navigate to: http://localhost:5173

## Usage

### Keyboard Shortcuts
- **B**: Buy (market order)
- **S**: Sell (market order)
- **Space**: Play/Pause replay

### Workflow
1. Select currency pair from dropdown
2. Click Play or press Space to start replay
3. Adjust speed (1x to 100x) as needed
4. Press B to buy or S to sell
5. Monitor positions in the position table
6. Close positions by clicking the X button
7. View trade history and analytics below

## Troubleshooting

### API Rate Limits
- Alpha Vantage: 25 calls/day (primary)
- ForexRateAPI: 1000 calls/month (backup)
- Data is cached in Redis for 24 hours
- Data is also cached in browser IndexedDB

### No Data Loading
1. Check API keys in packages/backend/.env
2. Verify backend is running on port 3000
3. Check browser console for errors
4. Try clearing IndexedDB: Open DevTools → Application → IndexedDB → Delete database

### Redis Not Running
- App will work without Redis, but won't cache API responses
- Data will still cache in browser IndexedDB
- Just slower on repeated requests

## Performance Targets

- ✅ Initial load: <2s (including chart render)
- ✅ Bar processing: <10μs
- ✅ Order execution: <5μs
- ✅ Chart FPS: 60fps steady
- ✅ IndexedDB read: <50ms for 10k bars

## Next Steps

1. **Test with real data**: Add API keys and verify data loading
2. **Practice trading**: Try different strategies at various speeds
3. **Add features**: Implement pending limit/stop orders
4. **More pairs**: Add additional currency pairs
5. **Analytics**: Expand trade journal with screenshots
6. **Mobile**: Improve responsive layout for mobile devices
