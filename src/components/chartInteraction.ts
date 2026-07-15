import type { EChartsOption } from "echarts";

interface PointEventPayload {
  dataIndex?: unknown;
  data?: unknown;
  value?: unknown;
}

export interface BrushSelectedPayload {
  batch?: BrushBatchPayload[];
}

interface BrushBatchPayload {
  selected?: Array<{ seriesIndex?: unknown; dataIndex?: unknown }>;
  areas?: Array<{ coordRange?: unknown; coordRanges?: unknown }>;
}

export function toBrushSelectedPayload(value: unknown): BrushSelectedPayload | undefined {
  if (!isObject(value) || !("batch" in value)) return undefined;
  return value as BrushSelectedPayload;
}

export function chartPointIndex(value: unknown): number | undefined {
  const params = isObject(value) ? value as PointEventPayload : undefined;
  if (!params) return undefined;
  const coordinateIndex = sourceIndexCoordinate(params.value) ?? sourceIndexCoordinate(params.data);
  if (coordinateIndex !== undefined) return Math.round(coordinateIndex);
  return typeof params.dataIndex === "number" && Number.isFinite(params.dataIndex)
    ? Math.trunc(params.dataIndex)
    : undefined;
}

export function brushSegmentFromOption(
  params: BrushSelectedPayload,
  option: EChartsOption,
): { startIndex: number; endIndex: number } | undefined {
  const sourceIndexes = params.batch?.flatMap((batch) =>
    batch.selected?.flatMap((selection) => {
      const seriesIndex = typeof selection.seriesIndex === "number" ? selection.seriesIndex : 0;
      return numericArray(selection.dataIndex).flatMap((dataIndex) => {
        const sourceIndex = optionDataSourceIndex(option, seriesIndex, Math.trunc(dataIndex));
        return sourceIndex === undefined ? [] : [sourceIndex];
      });
    }) ?? [],
  ) ?? [];
  if (sourceIndexes.length) return toSegment(sourceIndexes);

  const selectedIndexes = params.batch?.flatMap((batch) =>
    batch.selected?.flatMap((selection) => numericArray(selection.dataIndex)) ?? [],
  ) ?? [];
  if (selectedIndexes.length) return toSegment(selectedIndexes);

  const coordinateValues = params.batch?.flatMap((batch) =>
    batch.areas?.flatMap((area) => [
      ...coordinateRangePairs(area.coordRange).flat(),
      ...coordinateRangePairs(area.coordRanges).flat(),
    ]) ?? [],
  ) ?? [];
  return coordinateValues.length >= 2 ? toSegment(coordinateValues) : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numericArray(value: unknown): number[] {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function sourceIndexCoordinate(value: unknown): number | undefined {
  const coordinates = isObject(value) && "value" in value ? value.value : value;
  if (!Array.isArray(coordinates)) return undefined;
  const sourceIndex = coordinates.length >= 3 ? coordinates[2] : coordinates[0];
  return typeof sourceIndex === "number" && Number.isFinite(sourceIndex) ? sourceIndex : undefined;
}

function optionDataSourceIndex(option: EChartsOption, seriesIndex: number, dataIndex: number): number | undefined {
  const series = option.series ? (Array.isArray(option.series) ? option.series : [option.series]) : [];
  const selectedSeries = series[seriesIndex] as { data?: unknown[] } | undefined;
  return sourceIndexCoordinate(selectedSeries?.data?.[dataIndex]);
}

function coordinateRangePairs(value: unknown): number[][] {
  if (isNumericPair(value)) return [value];
  if (!Array.isArray(value)) return [];
  const directPairs = value.filter(isNumericPair);
  if (directPairs.length) return [directPairs[0]];
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
  return { startIndex: Math.min(...rounded), endIndex: Math.max(...rounded) };
}
