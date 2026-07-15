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
  resetToken?: number;
  onPoint?: (index: number, domainValue?: number) => void;
  onHoverDomain?: (domainValue: number) => void;
  onBrushSegment?: (startIndex: number, endIndex: number) => void;
  onBrushRange?: (start: number, end: number) => void;
}

export function ChartPanel({ title, ariaLabel, option, className, eyebrow, actions, caption, interactionMode, cursorX, resetToken, onPoint, onHoverDomain, onBrushSegment, onBrushRange }: ChartPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const cursorLineRef = useRef<echarts.graphic.Line | null>(null);
  const cursorXRef = useRef(cursorX);
  const hoverFrameRef = useRef<number | undefined>(undefined);
  const pendingHoverDomainRef = useRef<number>();
  const previousResetTokenRef = useRef(resetToken);
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
      pendingHoverDomainRef.current = undefined;
    };
    const handleClick = (...args: unknown[]) => {
      const index = chartPointIndex(args[0]);
      if (index === undefined) {
        return;
      }
      cancelPendingHover();
      onPoint?.(index, chartPointDomain(args[0]));
    };
    const handlePointerMove = (event: { offsetX: number; offsetY: number }) => {
      const pixel: [number, number] = [event.offsetX, event.offsetY];
      if (!chart.containPixel({ gridIndex: "all" }, pixel)) return;
      const converted = chart.convertFromPixel({ xAxisIndex: 0 }, event.offsetX);
      const domainValue = Array.isArray(converted) ? Number(converted[0]) : Number(converted);
      if (!Number.isFinite(domainValue)) return;
      pendingHoverDomainRef.current = domainValue;
      if (hoverFrameRef.current !== undefined) {
        return;
      }
      hoverFrameRef.current = window.requestAnimationFrame(() => {
        hoverFrameRef.current = undefined;
        const pending = pendingHoverDomainRef.current;
        pendingHoverDomainRef.current = undefined;
        if (pending === undefined) return;
        cursorXRef.current = pending;
        renderCursor(chart, cursorLineRef, pending);
        onHoverDomain?.(pending);
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
    }
    const zrender = chart.getZr();
    if (onHoverDomain) zrender.on("mousemove", handlePointerMove);
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
      zrender.off("mousemove", handlePointerMove);
      chart.off("brushSelected", handleBrush);
      chart.off("datazoom", handleDataZoom);
    };
  }, [interactionMode, option, onPoint, onHoverDomain, onBrushSegment, onBrushRange]);

  useEffect(() => {
    if (chartRef.current) {
      renderCursor(chartRef.current, cursorLineRef, cursorX);
    }
  }, [cursorX]);

  useEffect(() => {
    if (resetToken === undefined || resetToken === previousResetTokenRef.current) return;
    previousResetTokenRef.current = resetToken;
    const chart = chartRef.current;
    if (!chart) return;
    const zoomCount = Array.isArray(option.dataZoom) ? option.dataZoom.length : option.dataZoom ? 1 : 0;
    if (zoomCount > 0) {
      chart.dispatchAction({
        type: "dataZoom",
        batch: Array.from({ length: zoomCount }, (_, dataZoomIndex) => ({
          dataZoomIndex,
          start: 0,
          end: 100,
        })),
      });
    }
    chart.dispatchAction({ type: "brush", areas: [] });
    renderCursor(chart, cursorLineRef, cursorXRef.current);
  }, [option, resetToken]);

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
