import {
  CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, LineStyle, type IChartApi, type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { Technicals } from "../api";

const RANGES = [["3 months", 63], ["6 months", 126], ["1 year", 252], ["2 years", 504]] as const;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function PriceChart({ data }: { data: Technicals }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<number>(126);
  const [bands, setBands] = useState(false);

  useEffect(() => {
    if (!box.current) return;
    const ink = css("--ink-soft");
    const line = css("--line");
    const up = css("--up");
    const down = css("--down");
    const instance = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" }, textColor: ink,
        fontFamily: "'Hanken Grotesk Variable', sans-serif", fontSize: 12,
        panes: { separatorColor: line }, attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: line } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });
    chart.current = instance;
    const point = (values: (number | null)[]) => data.bars.flatMap((b, i) => {
      const value = values[i];
      return value == null ? [] : [{ time: b.time, value }];
    });
    const overlay = (values: (number | null)[], color: string, pane = 0, width: 1 | 2 = 2, style = LineStyle.Solid) => {
      const s = instance.addSeries(LineSeries, {
        color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      }, pane);
      s.setData(point(values));
      return s;
    };

    const candles = instance.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false,
    });
    candles.setData(data.bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    overlay(data.series.sma20, css("--series-1"));
    overlay(data.series.sma50, css("--series-2"));
    overlay(data.series.sma200, css("--series-3"));
    if (bands) {
      overlay(data.series.bollinger.upper, ink, 0, 1, LineStyle.Dotted);
      overlay(data.series.bollinger.lower, ink, 0, 1, LineStyle.Dotted);
    }

    const rsi = overlay(data.series.rsi, css("--series-1"), 1);
    rsi.createPriceLine({ price: 70, color: ink, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "" });
    rsi.createPriceLine({ price: 30, color: ink, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "" });

    const hist = instance.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 2);
    hist.setData(data.bars.flatMap((b, i) => {
      const value = data.series.macd.histogram[i];
      return value == null ? [] : [{ time: b.time, value, color: value >= 0 ? up : down }];
    }));
    overlay(data.series.macd.line, css("--series-1"), 2, 1);
    overlay(data.series.macd.signal, css("--series-2"), 2, 1);

    const panes = instance.panes();
    panes[0]?.setStretchFactor(5);
    panes[1]?.setStretchFactor(1.6);
    panes[2]?.setStretchFactor(1.6);
    return () => {
      chart.current = null;
      instance.remove();
    };
  }, [data, bands]);

  useEffect(() => {
    const last = data.bars.length - 1;
    chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(last - range, 0), to: last + 3 });
  }, [data, range, bands]);

  return (
    <section>
      <div className="chart-controls">
        <div className="segmented" role="group" aria-label="Time range">
          {RANGES.map(([label, days]) => (
            <button key={days} aria-pressed={range === days} onClick={() => setRange(days)}>{label}</button>
          ))}
        </div>
        <ul className="legend">
          <li><i style={{ background: "var(--series-1)" }} />20-day</li>
          <li><i style={{ background: "var(--series-2)" }} />50-day</li>
          <li><i style={{ background: "var(--series-3)" }} />200-day</li>
          <li><label><input type="checkbox" checked={bands} onChange={(e) => setBands(e.target.checked)} /> Bollinger bands</label></li>
        </ul>
      </div>
      <div className="price-chart" ref={box} role="img" aria-label="Daily price chart with RSI and MACD panes" />
      <p className="chart-note">Lower panes: RSI (14) with 30 and 70 levels, then MACD (12, 26, 9). Charts by <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a>.</p>
    </section>
  );
}
