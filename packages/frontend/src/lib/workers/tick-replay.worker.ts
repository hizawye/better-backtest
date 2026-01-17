import type { Bar, Tick } from '../../../../shared/types';

let currentIndex = 0;
let bars: Bar[] = [];
let speed = 1; // bars per second
let isPlaying = false;
let intervalId: number | null = null;
let spread = 0.00015; // default 1.5 pips

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'init':
      bars = payload.bars;
      spread = payload.spread;
      currentIndex = 0;
      break;

    case 'play':
      if (!isPlaying && bars.length > 0) {
        isPlaying = true;
        startReplay();
      }
      break;

    case 'pause':
      isPlaying = false;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      break;

    case 'setSpeed':
      speed = payload.speed;
      if (isPlaying) {
        // Restart with new speed
        if (intervalId !== null) {
          clearInterval(intervalId);
        }
        startReplay();
      }
      break;

    case 'seek':
      currentIndex = payload.index;
      if (currentIndex < bars.length) {
        sendTick(bars[currentIndex]);
      }
      break;

    case 'reset':
      currentIndex = 0;
      isPlaying = false;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      break;
  }
};

function startReplay() {
  const interval = 1000 / speed;

  intervalId = setInterval(() => {
    if (currentIndex >= bars.length) {
      // Replay complete
      isPlaying = false;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      self.postMessage({ type: 'complete' });
      return;
    }

    const bar = bars[currentIndex];
    sendTick(bar);
    currentIndex++;
  }, interval) as unknown as number;
}

function sendTick(bar: Bar) {
  const tick: Tick = {
    timestamp: bar.timestamp,
    bid: bar.close - spread / 2,
    ask: bar.close + spread / 2
  };

  self.postMessage({
    type: 'tick',
    payload: {
      bar,
      tick,
      index: currentIndex,
      total: bars.length
    }
  });
}
