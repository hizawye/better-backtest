<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';
  import type { Bar } from '../../../../shared/types';

  export let bars: Bar[] = [];
  export let currentBar: Bar | null = null;

  let chartContainer: HTMLDivElement;
  let chart: IChartApi | null = null;
  let candlestickSeries: ISeriesApi<'Candlestick'> | null = null;

  onMount(() => {
    chart = createChart(chartContainer, {
      width: chartContainer.clientWidth,
      height: chartContainer.clientHeight,
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2a2e39' },
        horzLines: { color: '#2a2e39' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    candlestickSeries = chart.addCandlestickSeries({
      upColor: '#089981',
      downColor: '#f23645',
      borderUpColor: '#089981',
      borderDownColor: '#f23645',
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (chart && chartContainer) {
        chart.applyOptions({
          width: chartContainer.clientWidth,
          height: chartContainer.clientHeight,
        });
      }
    });
    resizeObserver.observe(chartContainer);

    return () => {
      resizeObserver.disconnect();
    };
  });

  onDestroy(() => {
    if (chart) {
      chart.remove();
    }
  });

  // Update chart when bars change
  $: if (candlestickSeries && bars.length > 0) {
    const chartData = bars.map(bar => ({
      time: Math.floor(bar.timestamp / 1000) as any,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
    candlestickSeries.setData(chartData);
  }

  // Update current bar
  $: if (candlestickSeries && currentBar) {
    const chartBar = {
      time: Math.floor(currentBar.timestamp / 1000) as any,
      open: currentBar.open,
      high: currentBar.high,
      low: currentBar.low,
      close: currentBar.close,
    };
    candlestickSeries.update(chartBar);
  }
</script>

<div class="chart-wrapper">
  <div bind:this={chartContainer} class="chart-container"></div>
</div>

<style>
  .chart-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
  }

  .chart-container {
    width: 100%;
    height: 100%;
  }
</style>
