import { useEffect, useRef, type ReactNode } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { brushDomainRange, brushSegmentFromOption, chartPointDomain, chartPointIndex, toBrushSelectedPayload } from "./chartInteraction";

export interface ChartPanelProps {
  title: string;
  ariaLabel?: string;
  option: EChartsOption;
  className?: string;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  caption?: ReactNode;
  interactionMode?: "range" | "zoom";
  cursorX?: number;
  onPoint?: (index: number, domainValue?: number) => void;
  onBrushSegment?: (startIndex: number, endIndex: number) => void;
  onBrushRange?: (start: number, end: number) => void;
}

export function ChartPanel({ title, ariaLabel, option, className, eyebrow, actions, caption, interactionMode, cursorX, onPoint, onBrushSegment, onBrushRange }: ChartPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const cursorLineRef = useRef<echarts.graphic.Line | null>(null);
  const cursorXRef = useRef(cursorX);
  const hoverFrameRef = useRef<number | undefined>(undefined);
  const lastPointRef = useRef<{ index: number; domainValue?: number }>();
  const pendingHoverRef = useRef<{ index: number; domainValue?: number }>();
  const mergedClass = className ? `panel ${className}` : "panel";
  cursorXRef.current = cursorX;

  useEffect(() => {
    if (!ref.current) return;
    const chart = chartRef.current ?? echarts.init(ref.current);
    chartRef.current = chart;
    chart.setOption(option, true);
    renderCursor(chart, cursorLineRef, cursorXRef.current);
    if (interactionMode) {
      chart.dispatchAction({
        type: "takeGlobalCursor",
        key: "brush",
        brushOption: {
          brushType: interactionMode === "range" ? "lineX" : false,
          brushMode: "single",
        },
      });
    }

    const resize = () => {
      if (ref.current && ref.current.clientWidth > 0 && ref.current.clientHeight > 0) {
        chart.resize();
        renderCursor(chart, cursorLineRef, cursorXRef.current);
      }
    };
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : undefined;
    resizeObserver?.observe(ref.current);
    const cancelPendingHover = () => {
      if (hoverFrameRef.current !== undefined) {
        window.cancelAnimationFrame(hoverFrameRef.current);
        hoverFrameRef.current = undefined;
      }
      pendingHoverRef.current = undefined;
    };
    const emitPoint = (index: number, domainValue: number | undefined, force = false) => {
      const last = lastPointRef.current;
      if (!force && last?.index === index && last.domainValue === domainValue) {
        return;
      }
      lastPointRef.current = { index, domainValue };
      onPoint?.(index, domainValue);
    };
    const handleClick = (...args: unknown[]) => {
      const index = chartPointIndex(args[0]);
      if (index === undefined) {
        return;
      }
      cancelPendingHover();
      emitPoint(index, chartPointDomain(args[0]), true);
    };
    const handleHover = (...args: unknown[]) => {
      const index = chartPointIndex(args[0]);
      const domainValue = chartPointDomain(args[0]);
      const last = lastPointRef.current;
      if (index === undefined || last?.index === index && last.domainValue === domainValue) {
        return;
      }
      pendingHoverRef.current = { index, domainValue };
      if (hoverFrameRef.current !== undefined) {
        return;
      }
      hoverFrameRef.current = window.requestAnimationFrame(() => {
        hoverFrameRef.current = undefined;
        const pending = pendingHoverRef.current;
        pendingHoverRef.current = undefined;
        if (pending) {
          emitPoint(pending.index, pending.domainValue);
        }
      });
    };
    const handleBrush = (...args: unknown[]) => {
      const params = toBrushSelectedPayload(args[0]);
      if (!params) {
        return;
      }
      const range = brushDomainRange(params);
      if (range) {
        onBrushRange?.(range.start, range.end);
      }
      const segment = brushSegmentFromOption(params, option);
      if (segment) {
        onBrushSegment?.(segment.startIndex, segment.endIndex);
      }
    };

    window.addEventListener("resize", resize);
    if (onPoint) {
      chart.on("click", handleClick);
      chart.on("mouseover", handleHover);
    }
    if (onBrushSegment || onBrushRange) {
      chart.on("brushSelected", handleBrush);
    }
    const handleDataZoom = () => renderCursor(chart, cursorLineRef, cursorXRef.current);
    chart.on("datazoom", handleDataZoom);

    return () => {
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();
      cancelPendingHover();
      chart.off("click", handleClick);
      chart.off("mouseover", handleHover);
      chart.off("brushSelected", handleBrush);
      chart.off("datazoom", handleDataZoom);
    };
  }, [interactionMode, option, onPoint, onBrushSegment, onBrushRange]);

  useEffect(() => {
    if (chartRef.current) {
      renderCursor(chartRef.current, cursorLineRef, cursorX);
    }
  }, [cursorX]);

  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
      cursorLineRef.current = null;
    };
  }, []);

  return (
    <section className={mergedClass}>
      <div className="panel-header">
        <div>
          {eyebrow ? <span className="panel-eyebrow">{eyebrow}</span> : null}
          <h3>{title}</h3>
        </div>
        {actions ? <div className="row-actions">{actions}</div> : null}
      </div>
      <div className="panel-body">
        <div className="chart" ref={ref} role="img" aria-label={ariaLabel ?? `${title} chart`} />
        {caption}
      </div>
    </section>
  );
}

function renderCursor(
  chart: echarts.ECharts,
  lineRef: { current: echarts.graphic.Line | null },
  cursorX: number | undefined,
): void {
  if (cursorX === undefined || !Number.isFinite(cursorX)) {
    lineRef.current?.hide();
    chart.getZr().refresh();
    return;
  }

  const pixelX = chart.convertToPixel({ xAxisIndex: 0 }, cursorX);
  if (typeof pixelX !== "number" || !Number.isFinite(pixelX)) return;
  const shape = {
    x1: pixelX,
    y1: 28,
    x2: pixelX,
    y2: Math.max(28, chart.getHeight() - 38),
  };
  if (!lineRef.current) {
    lineRef.current = new echarts.graphic.Line({
      silent: true,
      z: 100,
      shape,
      style: {
        stroke: "#0f172a",
        lineWidth: 1.25,
        lineDash: [5, 4],
        opacity: 0.9,
      },
    });
    chart.getZr().add(lineRef.current);
  } else {
    lineRef.current.show();
    lineRef.current.attr({ shape });
  }
  chart.getZr().refresh();
}
