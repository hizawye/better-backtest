<script lang="ts">
  import '../app.css';
</script>

<div class="landing">
  <div class="hero">
    <h1>Better Backtest</h1>
    <p class="tagline">Fast, offline-capable forex backtesting platform</p>
    <p class="description">
      Practice forex trading with historical data. Better performance, better UX, better results.
    </p>
    <a href="/trade" class="cta-button">Start Trading</a>
  </div>

  <div class="features">
    <div class="feature">
      <div class="icon">⚡</div>
      <h3>Lightning Fast</h3>
      <p>60fps chart rendering, sub-10μs bar processing</p>
    </div>

    <div class="feature">
      <div class="icon">📴</div>
      <h3>Offline Mode</h3>
      <p>Cache weeks of data in IndexedDB, trade without internet</p>
    </div>

    <div class="feature">
      <div class="icon">📊</div>
      <h3>Advanced Charts</h3>
      <p>TradingView Lightweight Charts with full indicators</p>
    </div>

    <div class="feature">
      <div class="icon">⌨️</div>
      <h3>Keyboard Shortcuts</h3>
      <p>Trade like a pro with B/S/Space shortcuts</p>
    </div>

    <div class="feature">
      <div class="icon">🎯</div>
      <h3>Real-time Analytics</h3>
      <p>Win rate, drawdown, Sharpe ratio, and more</p>
    </div>

    <div class="feature">
      <div class="icon">🚀</div>
      <h3>Variable Speed</h3>
      <p>Replay at 1x to 100x speed for efficient practice</p>
    </div>
  </div>
</div>

<style>
  .landing {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
  }

  .hero {
    text-align: center;
    max-width: 600px;
    margin-bottom: 80px;
  }

  .hero h1 {
    font-size: 56px;
    font-weight: 800;
    margin: 0 0 20px 0;
    background: linear-gradient(135deg, var(--accent-color), var(--success-color));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .tagline {
    font-size: 24px;
    color: var(--text-primary);
    margin: 0 0 16px 0;
    font-weight: 600;
  }

  .description {
    font-size: 16px;
    color: var(--text-secondary);
    margin: 0 0 40px 0;
    line-height: 1.6;
  }

  .cta-button {
    display: inline-block;
    padding: 16px 48px;
    background: var(--accent-color);
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-size: 18px;
    font-weight: 600;
    transition: transform 0.2s, opacity 0.2s;
  }

  .cta-button:hover {
    transform: translateY(-2px);
    opacity: 0.9;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 32px;
    max-width: 1200px;
    width: 100%;
  }

  .feature {
    text-align: center;
    padding: 32px 24px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    transition: transform 0.2s, border-color 0.2s;
  }

  .feature:hover {
    transform: translateY(-4px);
    border-color: var(--accent-color);
  }

  .icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .feature h3 {
    font-size: 20px;
    color: var(--text-primary);
    margin: 0 0 12px 0;
    font-weight: 600;
  }

  .feature p {
    font-size: 14px;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }
</style>
