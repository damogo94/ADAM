'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';

interface Candle {
  t: number; // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
}

interface MiniCandleChartProps {
  candles: Candle[];
  entry?: number | null;
  stop?: number | null;
  target?: number | null;
  height?: number;
  /** Override del color de fondo si quieres integrar con un card */
  bg?: string;
}

/**
 * MiniCandleChart — TradingView lightweight-charts wrapper.
 *
 * Render mini de las últimas N velas con anotaciones de entrada/stop/target.
 * Estética alineada con Deep Space Terminal: void bg, gridless, sin axis labels
 * (sólo eje tiempo bottom ligero).
 *
 * Cleanup proper en unmount — lightweight-charts retiene la instancia si no la
 * desmontamos con .remove().
 */
export function MiniCandleChart({
  candles,
  entry,
  stop,
  target,
  height = 140,
  bg = 'transparent',
}: MiniCandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: '#475569', // slate
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 9,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.05)',
        autoScale: true,
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.05)',
        timeVisible: false,
        secondsVisible: false,
        barSpacing: 4,
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addCandlestickSeries({
      upColor: '#10b981', // emerald
      downColor: '#f43f5e', // rose
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
      borderVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? container.clientWidth;
      chart.applyOptions({ width: w });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, bg]);

  // Update data + price lines
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    const formatted = candles
      .filter((c) => Number.isFinite(c.o) && Number.isFinite(c.c))
      .map((c) => ({
        time: c.t as UTCTimestamp,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      }));
    series.setData(formatted);

    // Limpia priceLines previas (la API no expone listado; truco: re-crear series sería caro,
    // mejor mantener referencia local).
    const lines: ReturnType<typeof series.createPriceLine>[] = [];
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      lines.push(series.createPriceLine({ price: entry, color: '#a78bfa', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'entry' }));
    }
    if (typeof stop === 'number' && Number.isFinite(stop)) {
      lines.push(series.createPriceLine({ price: stop, color: '#f43f5e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'stop' }));
    }
    if (typeof target === 'number' && Number.isFinite(target)) {
      lines.push(series.createPriceLine({ price: target, color: '#10b981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'target' }));
    }

    chart.timeScale().fitContent();

    return () => {
      for (const l of lines) {
        try {
          series.removePriceLine(l);
        } catch {
          /* series ya destruida */
        }
      }
    };
  }, [candles, entry, stop, target]);

  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}
