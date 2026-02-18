<script lang="ts">
  import '../app.css';
</script>

<svelte:head>
  <title>Better Backtest - Forex Practice Platform</title>
</svelte:head>

<div class="landing">
  <div class="hero">
    <p class="kicker">Precision Replay Workspace</p>
    <h1>Better Backtest</h1>
    <p class="tagline">Fast, offline-capable forex and index backtesting</p>
    <p class="description">
      Review sessions without clutter. Execute with keyboard speed, replay dense datasets, and
      capture clean trade context in one flow.
    </p>
    <div class="hero-actions">
      <a href="/trade" class="cta-button">Open Trading Desk</a>
      <a href="#features" class="ghost-button">Explore Features</a>
    </div>
  </div>

  <div class="features" id="features">
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
    padding: 56px 20px 44px;
    gap: 34px;
    position: relative;
    overflow: hidden;
  }

  .landing::before,
  .landing::after {
    content: '';
    position: absolute;
    width: 52vw;
    height: 52vw;
    border-radius: 999px;
    pointer-events: none;
    filter: blur(6px);
  }

  .landing::before {
    top: -38vw;
    left: -20vw;
    background: radial-gradient(circle at center, rgba(66, 132, 210, 0.34), rgba(66, 132, 210, 0));
  }

  .landing::after {
    right: -28vw;
    bottom: -44vw;
    background: radial-gradient(circle at center, rgba(28, 175, 143, 0.2), rgba(28, 175, 143, 0));
  }

  .hero {
    text-align: center;
    max-width: 700px;
    position: relative;
    z-index: 1;
  }

  .kicker {
    margin: 0 0 10px 0;
    color: var(--text-low);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.46px;
    font-weight: 700;
  }

  .hero h1 {
    font-size: clamp(42px, 7vw, 68px);
    font-weight: 800;
    margin: 0 0 14px 0;
    line-height: 1.02;
    background: linear-gradient(132deg, #7bb8ff, #8be6c7 62%, #d6f8ff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-wrap: balance;
  }

  .tagline {
    font-size: clamp(20px, 3.4vw, 28px);
    color: var(--text-primary);
    margin: 0 0 14px 0;
    font-weight: 600;
  }

  .description {
    font-size: 16px;
    color: var(--text-secondary);
    margin: 0 auto 28px;
    line-height: 1.6;
    max-width: 640px;
  }

  .hero-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .cta-button {
    display: inline-block;
    padding: 14px 28px;
    background: linear-gradient(136deg, #4d9af7, #68c6e8);
    color: white;
    text-decoration: none;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 700;
    transition: transform var(--motion-fast), filter var(--motion-fast);
    box-shadow: 0 18px 32px rgba(20, 60, 103, 0.32);
  }

  .ghost-button {
    display: inline-block;
    padding: 14px 20px;
    color: var(--text-mid);
    text-decoration: none;
    border-radius: 12px;
    background: rgba(34, 53, 79, 0.55);
    font-size: 15px;
    font-weight: 600;
    transition: transform var(--motion-fast), background var(--motion-fast);
  }

  .cta-button:hover {
    transform: translateY(-1px);
    filter: brightness(1.05);
  }

  .ghost-button:hover {
    transform: translateY(-1px);
    background: rgba(45, 73, 108, 0.62);
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 14px;
    max-width: 1200px;
    width: 100%;
    position: relative;
    z-index: 1;
  }

  .feature {
    text-align: left;
    padding: 18px 16px;
    background: linear-gradient(155deg, rgba(29, 46, 69, 0.78), rgba(24, 38, 56, 0.68));
    border-radius: 14px;
    transition: transform var(--motion-fast), filter var(--motion-fast);
    box-shadow: var(--shadow-soft);
  }

  .feature:hover {
    transform: translateY(-2px);
    filter: brightness(1.04);
  }

  .icon {
    font-size: 30px;
    margin-bottom: 8px;
  }

  .feature h3 {
    font-size: 17px;
    color: var(--text-primary);
    margin: 0 0 7px 0;
    font-weight: 600;
  }

  .feature p {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  @media (max-width: 767px) {
    .landing {
      padding-top: 42px;
      gap: 24px;
    }

    .features {
      grid-template-columns: 1fr;
    }

    .hero-actions {
      width: 100%;
    }

    .cta-button,
    .ghost-button {
      width: 100%;
      text-align: center;
    }
  }
</style>
