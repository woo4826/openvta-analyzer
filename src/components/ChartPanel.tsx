import { useEffect, useRef, type ReactNode } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { brushDomainRange, brushSegmentFromOption, chartPointIndex, toBrushSelectedPayload } from "./chartInteraction";

export interface ChartPanelProps {
  title: string;
  ariaLabel?: string;
  option: EChartsOption;
  className?: string;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  caption?: ReactNode;
  interactionMode?: "range" | "zoom";
  onPoint?: (index: number) => void;
  onBrushSegment?: (startIndex: number, endIndex: number) => void;
  onBrushRange?: (start: number, end: number) => void;
}

export function ChartPanel({ title, ariaLabel, option, className, eyebrow, actions, caption, interactionMode, onPoint, onBrushSegment, onBrushRange }: ChartPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const hoverFrameRef = useRef<number | undefined>(undefined);
  const lastPointIndexRef = useRef<number | undefined>(undefined);
  const pendingHoverIndexRef = useRef<number | undefined>(undefined);
  const mergedClass = className ? `panel ${className}` : "panel";

  useEffect(() => {
    if (!ref.current) return;
    const chart = chartRef.current ?? echarts.init(ref.current);
    chartRef.current = chart;
    chart.setOption(option, true);
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
      }
    };
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : undefined;
    resizeObserver?.observe(ref.current);
    const cancelPendingHover = () => {
      if (hoverFrameRef.current !== undefined) {
        window.cancelAnimationFrame(hoverFrameRef.current);
        hoverFrameRef.current = undefined;
      }
      pendingHoverIndexRef.current = undefined;
    };
    const emitPoint = (index: number, force = false) => {
      if (!force && lastPointIndexRef.current === index) {
        return;
      }
      lastPointIndexRef.current = index;
      onPoint?.(index);
    };
    const handleClick = (...args: unknown[]) => {
      const index = chartPointIndex(args[0]);
      if (index === undefined) {
        return;
      }
      cancelPendingHover();
      emitPoint(index, true);
    };
    const handleHover = (...args: unknown[]) => {
      const index = chartPointIndex(args[0]);
      if (index === undefined || lastPointIndexRef.current === index) {
        return;
      }
      pendingHoverIndexRef.current = index;
      if (hoverFrameRef.current !== undefined) {
        return;
      }
      hoverFrameRef.current = window.requestAnimationFrame(() => {
        hoverFrameRef.current = undefined;
        const pendingIndex = pendingHoverIndexRef.current;
        pendingHoverIndexRef.current = undefined;
        if (pendingIndex !== undefined) {
          emitPoint(pendingIndex);
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

    return () => {
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();
      cancelPendingHover();
      chart.off("click", handleClick);
      chart.off("mouseover", handleHover);
      chart.off("brushSelected", handleBrush);
    };
  }, [interactionMode, option, onPoint, onBrushSegment, onBrushRange]);

  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
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
