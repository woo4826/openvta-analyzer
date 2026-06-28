import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

export interface ChartPanelProps {
  title: string;
  option: EChartsOption;
  className?: string;
  onPoint?: (index: number) => void;
  onBrushSegment?: (startIndex: number, endIndex: number) => void;
}

interface PointEventPayload {
  dataIndex?: unknown;
}

interface BrushSelectedPayload {
  batch?: BrushBatchPayload[];
}

interface BrushBatchPayload {
  selected?: Array<{ dataIndex?: unknown }>;
  areas?: Array<{ coordRange?: unknown; range?: unknown }>;
}

export function ChartPanel({ title, option, className, onPoint, onBrushSegment }: ChartPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const mergedClass = className ? `panel ${className}` : "panel";

  useEffect(() => {
    if (!ref.current) return;
    const chart = chartRef.current ?? echarts.init(ref.current);
    chartRef.current = chart;
    chart.setOption(option, true);

    const resize = () => chart.resize();
    const handlePoint = (...args: unknown[]) => {
      const params = toPointEventPayload(args[0]);
      if (params && typeof params.dataIndex === "number" && Number.isFinite(params.dataIndex)) {
        onPoint?.(params.dataIndex);
      }
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
    chart.off("click");
    chart.off("mouseover");
    chart.off("brushSelected");
    if (onPoint) {
      chart.on("click", handlePoint);
      chart.on("mouseover", handlePoint);
    }
    if (onBrushSegment) {
      chart.on("brushSelected", handleBrush);
    }

    return () => {
      window.removeEventListener("resize", resize);
      chart.off("click", handlePoint);
      chart.off("mouseover", handlePoint);
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
        <div className="chart" ref={ref} role="img" aria-label={`${title} chart`} />
      </div>
    </section>
  );
}

function toPointEventPayload(value: unknown): PointEventPayload | undefined {
  return isObject(value) ? value : undefined;
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

  const rangeValues =
    params.batch?.flatMap((batch) =>
      batch.areas?.flatMap((area) => firstNumericPair(area.coordRange) ?? firstNumericPair(area.range) ?? []) ?? [],
    ) ?? [];
  if (rangeValues.length >= 2) {
    return toSegment(rangeValues);
  }

  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numericArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function firstNumericPair(value: unknown): number[] | undefined {
  const values = collectNumbers(value);
  return values.length >= 2 ? values.slice(0, 2) : undefined;
}

function collectNumbers(value: unknown): number[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => collectNumbers(item));
}

function toSegment(values: number[]): { startIndex: number; endIndex: number } {
  const rounded = values.map((value) => Math.round(value));
  return {
    startIndex: Math.min(...rounded),
    endIndex: Math.max(...rounded),
  };
}
