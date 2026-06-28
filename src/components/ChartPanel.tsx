import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

export interface ChartPanelProps {
  title: string;
  ariaLabel?: string;
  option: EChartsOption;
  className?: string;
  onPoint?: (index: number) => void;
  onBrushSegment?: (startIndex: number, endIndex: number) => void;
}

interface PointEventPayload {
  dataIndex?: unknown;
  data?: unknown;
  value?: unknown;
}

interface BrushSelectedPayload {
  batch?: BrushBatchPayload[];
}

interface BrushBatchPayload {
  selected?: Array<{ dataIndex?: unknown }>;
  areas?: Array<{ coordRange?: unknown; coordRanges?: unknown }>;
}

export function ChartPanel({ title, ariaLabel, option, className, onPoint, onBrushSegment }: ChartPanelProps) {
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

    const resize = () => chart.resize();
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
      const index = toPointIndex(args[0]);
      if (index === undefined) {
        return;
      }
      cancelPendingHover();
      emitPoint(index, true);
    };
    const handleHover = (...args: unknown[]) => {
      const index = toPointIndex(args[0]);
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
      const segment = getBrushSegment(params);
      if (segment) {
        onBrushSegment?.(segment.startIndex, segment.endIndex);
      }
    };

    window.addEventListener("resize", resize);
    if (onPoint) {
      chart.on("click", handleClick);
      chart.on("mouseover", handleHover);
    }
    if (onBrushSegment) {
      chart.on("brushSelected", handleBrush);
    }

    return () => {
      window.removeEventListener("resize", resize);
      cancelPendingHover();
      chart.off("click", handleClick);
      chart.off("mouseover", handleHover);
      chart.off("brushSelected", handleBrush);
    };
  }, [option, onPoint, onBrushSegment]);

  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  return (
    <section className={mergedClass}>
      <div className="panel-header">
        <h3>{title}</h3>
      </div>
      <div className="panel-body">
        <div className="chart" ref={ref} role="img" aria-label={ariaLabel ?? `${title} chart`} />
      </div>
    </section>
  );
}

function toPointEventPayload(value: unknown): PointEventPayload | undefined {
  return isObject(value) ? value : undefined;
}

function toPointIndex(value: unknown): number | undefined {
  const params = toPointEventPayload(value);
  if (!params) {
    return undefined;
  }
  const coordinateIndex = firstCoordinateValue(params.value) ?? firstCoordinateValue(params.data);
  if (coordinateIndex !== undefined) {
    return Math.round(coordinateIndex);
  }
  return typeof params.dataIndex === "number" && Number.isFinite(params.dataIndex) ? Math.trunc(params.dataIndex) : undefined;
}

function toBrushSelectedPayload(value: unknown): BrushSelectedPayload | undefined {
  if (!isObject(value) || !("batch" in value)) {
    return undefined;
  }
  return value as BrushSelectedPayload;
}

function getBrushSegment(params: BrushSelectedPayload): { startIndex: number; endIndex: number } | undefined {
  const selectedIndexes =
    params.batch?.flatMap((batch) =>
      batch.selected?.flatMap((selection) => numericArray(selection.dataIndex)) ?? [],
    ) ?? [];
  if (selectedIndexes.length) {
    return toSegment(selectedIndexes);
  }

  const coordinateValues =
    params.batch?.flatMap((batch) =>
      batch.areas?.flatMap((area) => [
        ...coordinateRangePairs(area.coordRange).flat(),
        ...coordinateRangePairs(area.coordRanges).flat(),
      ]) ?? [],
    ) ?? [];
  if (coordinateValues.length >= 2) {
    return toSegment(coordinateValues);
  }

  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numericArray(value: unknown): number[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function firstCoordinateValue(value: unknown): number | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const first = value[0];
  return typeof first === "number" && Number.isFinite(first) ? first : undefined;
}

function coordinateRangePairs(value: unknown): number[][] {
  if (isNumericPair(value)) {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const directPairs = value.filter(isNumericPair);
  if (directPairs.length) {
    return [directPairs[0]];
  }
  return value.flatMap((item) => coordinateRangePairs(item));
}

function isNumericPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function toSegment(values: number[]): { startIndex: number; endIndex: number } {
  const rounded = values.map((value) => Math.round(value));
  return {
    startIndex: Math.min(...rounded),
    endIndex: Math.max(...rounded),
  };
}
