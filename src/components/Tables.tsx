import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { buildValidationRows, normalizeSegment, summarizePointRange } from "../domain/analysis";
import {
  downloadText,
  gpsPointsCsv,
  sensorCsv,
  summaryRowsCsv,
  validationCsv,
  warningsCsv,
  type SummaryCsvRow,
} from "../domain/export";
import { displayGpsPoints } from "../domain/statistics";
import type { ActiveSegment, GpsPoint, ParseWarning, SensorPoint, ValidationRow, VtaFile } from "../domain/types";
import { Panel, Tabs, ToolbarButton } from "./ui";

type TableTab = "gps" | "enhanced" | "sensors" | "warnings" | "summary" | "validation";
type SortDirection = "asc" | "desc";
type TableValue = string | number;

interface TablesProps {
  file: VtaFile;
  sensors: SensorPoint[];
  visiblePoints?: GpsPoint[];
  activeSegment?: ActiveSegment;
}

interface SortState {
  columnId: string;
  direction: SortDirection;
}

interface TableColumn {
  id: string;
  label: string;
  numeric?: boolean;
}

interface ColumnBuilder<T> extends TableColumn {
  value: (item: T) => TableValue;
  render?: (item: T) => ReactNode;
}

interface TableRow {
  id: string;
  ordinal: number;
  item: unknown;
  values: Record<string, TableValue>;
  cells: Record<string, ReactNode>;
  searchText: string;
}

interface TableDefinition {
  id: TableTab;
  label: string;
  columns: TableColumn[];
  rows: TableRow[];
  filename: string;
}

const tableOrder: TableTab[] = ["gps", "enhanced", "sensors", "warnings", "summary", "validation"];
const tableLabels: Record<TableTab, string> = {
  gps: "GPS",
  enhanced: "Enhanced",
  sensors: "Sensors",
  warnings: "Warnings",
  summary: "Summary",
  validation: "Validation",
};
const defaultSorts: Record<TableTab, SortState> = {
  gps: { columnId: "index", direction: "asc" },
  enhanced: { columnId: "index", direction: "asc" },
  sensors: { columnId: "index", direction: "asc" },
  warnings: { columnId: "lineNumber", direction: "asc" },
  summary: { columnId: "metric", direction: "asc" },
  validation: { columnId: "index", direction: "asc" },
};

const gpsColumns: Array<ColumnBuilder<GpsPoint>> = [
  { id: "index", label: "Index", numeric: true, value: (point) => point.index },
  { id: "source", label: "Source", value: (point) => point.source },
  { id: "date", label: "Date", value: (point) => point.date },
  { id: "time", label: "Time", value: (point) => point.time },
  {
    id: "latitude",
    label: "Lat",
    numeric: true,
    value: (point) => point.latitude,
    render: (point) => point.latitude.toFixed(8),
  },
  {
    id: "longitude",
    label: "Lon",
    numeric: true,
    value: (point) => point.longitude,
    render: (point) => point.longitude.toFixed(8),
  },
  {
    id: "speedKmh",
    label: "Speed",
    numeric: true,
    value: (point) => point.speedKmh,
    render: (point) => point.speedKmh.toFixed(1),
  },
  {
    id: "altitudeMeters",
    label: "Altitude",
    numeric: true,
    value: (point) => point.altitudeMeters,
    render: (point) => point.altitudeMeters.toFixed(1),
  },
  { id: "satelliteCount", label: "Sat", numeric: true, value: (point) => point.satelliteCount },
  {
    id: "accuracyMeters",
    label: "Accuracy",
    numeric: true,
    value: (point) => point.accuracyMeters ?? "",
    render: (point) => point.accuracyMeters?.toFixed(2) ?? "",
  },
];

const sensorColumns: Array<ColumnBuilder<SensorPoint>> = [
  { id: "index", label: "Index", numeric: true, value: (sensor) => sensor.index },
  {
    id: "elapsedSeconds",
    label: "Elapsed",
    numeric: true,
    value: (sensor) => sensor.elapsedSeconds,
    render: (sensor) => sensor.elapsedSeconds.toFixed(3),
  },
  { id: "eventCode", label: "Event", numeric: true, value: (sensor) => sensor.eventCode },
  { id: "accelUnit", label: "Unit", value: (sensor) => sensor.accelUnit },
  {
    id: "accelX",
    label: "GX",
    numeric: true,
    value: (sensor) => sensor.accelX,
    render: (sensor) => sensor.accelX.toFixed(3),
  },
  {
    id: "accelY",
    label: "GY",
    numeric: true,
    value: (sensor) => sensor.accelY,
    render: (sensor) => sensor.accelY.toFixed(3),
  },
  {
    id: "accelZ",
    label: "GZ",
    numeric: true,
    value: (sensor) => sensor.accelZ,
    render: (sensor) => sensor.accelZ.toFixed(3),
  },
  {
    id: "orientationXDegrees",
    label: "OX",
    numeric: true,
    value: (sensor) => sensor.orientationXDegrees ?? "",
    render: (sensor) => sensor.orientationXDegrees?.toFixed(3) ?? "",
  },
  {
    id: "orientationYDegrees",
    label: "OY",
    numeric: true,
    value: (sensor) => sensor.orientationYDegrees ?? "",
    render: (sensor) => sensor.orientationYDegrees?.toFixed(3) ?? "",
  },
  {
    id: "orientationZDegrees",
    label: "OZ",
    numeric: true,
    value: (sensor) => sensor.orientationZDegrees ?? "",
    render: (sensor) => sensor.orientationZDegrees?.toFixed(3) ?? "",
  },
];

const warningColumns: Array<ColumnBuilder<ParseWarning>> = [
  {
    id: "lineNumber",
    label: "Line",
    numeric: true,
    value: (warning) => warning.lineNumber ?? "",
  },
  { id: "code", label: "Code", value: (warning) => warning.code },
  { id: "message", label: "Message", value: (warning) => warning.message },
];

const summaryColumns: Array<ColumnBuilder<SummaryCsvRow>> = [
  { id: "metric", label: "Metric", value: (row) => row.metric },
  { id: "value", label: "Value", value: (row) => row.value },
  { id: "detail", label: "Detail", value: (row) => row.detail ?? "" },
];

const validationColumns: Array<ColumnBuilder<ValidationRow>> = [
  { id: "index", label: "Index", numeric: true, value: (row) => row.index },
  {
    id: "elapsedSeconds",
    label: "Elapsed seconds",
    numeric: true,
    value: (row) => row.elapsedSeconds,
    render: (row) => row.elapsedSeconds.toFixed(3),
  },
  {
    id: "speedKmh",
    label: "Speed km/h",
    numeric: true,
    value: (row) => row.speedKmh,
    render: (row) => row.speedKmh.toFixed(1),
  },
  {
    id: "deltaSpeedKmh",
    label: "Delta speed km/h",
    numeric: true,
    value: (row) => row.deltaSpeedKmh,
    render: (row) => row.deltaSpeedKmh.toFixed(1),
  },
  {
    id: "derivedAccelMps2",
    label: "Derived accel",
    numeric: true,
    value: (row) => row.derivedAccelMps2,
    render: (row) => row.derivedAccelMps2.toFixed(3),
  },
];

export function Tables({ file, sensors, visiblePoints, activeSegment }: TablesProps) {
  const [activeTab, setActiveTab] = useState<TableTab>("gps");
  const [query, setQuery] = useState("");
  const [sortStates, setSortStates] = useState<Partial<Record<TableTab, SortState>>>({});
  const points = useMemo(() => visiblePoints ?? displayGpsPoints(file), [file, visiblePoints]);
  const gpsPointKeys = useMemo(() => buildPointLookup(file.gpsPoints), [file.gpsPoints]);
  const enhancedPointKeys = useMemo(() => buildPointLookup(file.enhancedPoints), [file.enhancedPoints]);
  const visibleGpsPoints = useMemo(
    () => points.filter((point) => isPointInLookup(point, gpsPointKeys)),
    [gpsPointKeys, points],
  );
  const visibleEnhancedPoints = useMemo(
    () => points.filter((point) => isPointInLookup(point, enhancedPointKeys)),
    [enhancedPointKeys, points],
  );
  const segmentPoints = useMemo(() => {
    if (!points.length || !activeSegment) {
      return points;
    }
    const normalized = normalizeSegment(activeSegment, points.length);
    return points.slice(normalized.startIndex, normalized.endIndex + 1);
  }, [activeSegment, points]);
  const pointSummary = useMemo(() => summarizePointRange(points, activeSegment), [activeSegment, points]);
  const validationRows = useMemo(() => buildValidationRows(segmentPoints), [segmentPoints]);
  const summaryRows = useMemo(
    () =>
      buildSummaryRows({
        file,
        sensors,
        visibleGpsCount: visibleGpsPoints.length,
        visibleEnhancedCount: visibleEnhancedPoints.length,
        visiblePointCount: points.length,
        selectedPointCount: segmentPoints.length,
        pointSummary,
        hasSegment: Boolean(activeSegment),
      }),
    [
      activeSegment,
      file,
      pointSummary,
      points.length,
      segmentPoints.length,
      sensors,
      visibleEnhancedPoints.length,
      visibleGpsPoints.length,
    ],
  );
  const definitions = useMemo<Record<TableTab, TableDefinition>>(
    () => ({
      gps: {
        id: "gps",
        label: tableLabels.gps,
        columns: gpsColumns,
        rows: createRows(visibleGpsPoints, gpsColumns, (point, index) => `gps-${point.lineNumber}-${point.index}-${index}`),
        filename: "gps-visible.csv",
      },
      enhanced: {
        id: "enhanced",
        label: tableLabels.enhanced,
        columns: gpsColumns,
        rows: createRows(
          visibleEnhancedPoints,
          gpsColumns,
          (point, index) => `enhanced-${point.lineNumber}-${point.index}-${index}`,
        ),
        filename: "enhanced-visible.csv",
      },
      sensors: {
        id: "sensors",
        label: tableLabels.sensors,
        columns: sensorColumns,
        rows: createRows(sensors, sensorColumns, (sensor, index) => `sensor-${sensor.lineNumber}-${sensor.index}-${index}`),
        filename: "sensors-visible.csv",
      },
      warnings: {
        id: "warnings",
        label: tableLabels.warnings,
        columns: warningColumns,
        rows: createRows(
          file.parseWarnings,
          warningColumns,
          (warning, index) => `warning-${warning.lineNumber ?? "file"}-${warning.code}-${index}`,
        ),
        filename: "warnings-visible.csv",
      },
      summary: {
        id: "summary",
        label: tableLabels.summary,
        columns: summaryColumns,
        rows: createRows(summaryRows, summaryColumns, (row) => `summary-${row.metric}`),
        filename: "summary-visible.csv",
      },
      validation: {
        id: "validation",
        label: tableLabels.validation,
        columns: validationColumns,
        rows: createRows(validationRows, validationColumns, (row, index) => `validation-${row.index}-${index}`),
        filename: "validation-visible.csv",
      },
    }),
    [file.parseWarnings, sensors, summaryRows, validationRows, visibleEnhancedPoints, visibleGpsPoints],
  );
  const activeDefinition = definitions[activeTab];
  const activeSort = sortStates[activeTab] ?? defaultSorts[activeTab];
  const visibleRows = useMemo(
    () => filterAndSortRows(activeDefinition.rows, activeDefinition.columns, activeSort, query),
    [activeDefinition, activeSort, query],
  );

  function updateSort(columnId: string) {
    setSortStates((current) => {
      const previous = current[activeTab] ?? defaultSorts[activeTab];
      const direction: SortDirection =
        previous.columnId === columnId && previous.direction === "asc" ? "desc" : "asc";
      return { ...current, [activeTab]: { columnId, direction } };
    });
  }

  function exportVisibleRows() {
    downloadText(activeDefinition.filename, csvForRows(activeTab, visibleRows), "text/csv");
  }

  return (
    <section className="content-band">
      <Panel title="Tables" eyebrow={file.sourceName}>
        <div className="content-band">
          <div className="table-toolbar">
            <label className="field table-search">
              <span>Search rows</span>
              <input
                aria-label="Search tables"
                placeholder="Search rows"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <ToolbarButton icon={<Download size={16} aria-hidden />} onClick={exportVisibleRows}>
              Export visible rows
            </ToolbarButton>
          </div>

          <Tabs
            ariaLabel="Table views"
            items={tableOrder.map((id) => ({ id, label: tableLabels[id] }))}
            value={activeTab}
            onChange={(value) => setActiveTab(value as TableTab)}
          />

          <div className="table-status" aria-live="polite">
            {activeDefinition.label}: {visibleRows.length} of {activeDefinition.rows.length} rows
          </div>

          <div role="tabpanel" aria-label={`${activeDefinition.label} table`}>
            <SortableTable definition={activeDefinition} rows={visibleRows} sort={activeSort} onSort={updateSort} />
          </div>
        </div>
      </Panel>
    </section>
  );
}

function SortableTable({
  definition,
  rows,
  sort,
  onSort,
}: {
  definition: TableDefinition;
  rows: TableRow[];
  sort: SortState;
  onSort: (columnId: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {definition.columns.map((column) => {
              const isActive = column.id === sort.columnId;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className="sort-header"
                    onClick={() => onSort(column.id)}
                    title={`Sort by ${column.label}`}
                  >
                    <span>{column.label}</span>
                    <span className="sort-indicator" aria-hidden="true">
                      {isActive ? (sort.direction === "asc" ? "^" : "v") : "-"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id}>
                {definition.columns.map((column) => (
                  <td key={column.id} className={column.numeric ? "numeric-cell" : undefined}>
                    {row.cells[column.id]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={definition.columns.length} className="empty-table-cell">
                No rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function createRows<T>(
  items: T[],
  columns: Array<ColumnBuilder<T>>,
  getId: (item: T, index: number) => string,
): TableRow[] {
  return items.map((item, ordinal) => {
    const values: Record<string, TableValue> = {};
    const cells: Record<string, ReactNode> = {};
    for (const column of columns) {
      const value = column.value(item);
      values[column.id] = value;
      cells[column.id] = column.render ? column.render(item) : value;
    }
    return {
      id: getId(item, ordinal),
      ordinal,
      item,
      values,
      cells,
      searchText: Object.values(values).join(" ").toLowerCase(),
    };
  });
}

function filterAndSortRows(rows: TableRow[], columns: TableColumn[], sort: SortState, query: string): TableRow[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = normalizedQuery ? rows.filter((row) => row.searchText.includes(normalizedQuery)) : rows;
  const columnId = columns.some((column) => column.id === sort.columnId) ? sort.columnId : columns[0]?.id;
  if (!columnId) {
    return filteredRows;
  }

  return [...filteredRows].sort((left, right) => {
    const comparison = compareValues(left.values[columnId] ?? "", right.values[columnId] ?? "");
    if (comparison !== 0) {
      return sort.direction === "asc" ? comparison : -comparison;
    }
    return left.ordinal - right.ordinal;
  });
}

function compareValues(left: TableValue, right: TableValue): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function csvForRows(tab: TableTab, rows: TableRow[]): string {
  switch (tab) {
    case "gps":
    case "enhanced":
      return gpsPointsCsv(toItems<GpsPoint>(rows));
    case "sensors":
      return sensorCsv(toItems<SensorPoint>(rows));
    case "warnings":
      return warningsCsv(toItems<ParseWarning>(rows));
    case "summary":
      return summaryRowsCsv(toItems<SummaryCsvRow>(rows));
    case "validation":
      return validationCsv(toItems<ValidationRow>(rows));
  }
}

function toItems<T>(rows: TableRow[]): T[] {
  return rows.map((row) => row.item as T);
}

function buildPointLookup(points: GpsPoint[]): { objects: Set<GpsPoint>; keys: Set<string> } {
  return {
    objects: new Set(points),
    keys: new Set(points.map(pointKey)),
  };
}

function isPointInLookup(point: GpsPoint, lookup: { objects: Set<GpsPoint>; keys: Set<string> }): boolean {
  return lookup.objects.has(point) || lookup.keys.has(pointKey(point));
}

function pointKey(point: GpsPoint): string {
  return `${point.source}:${point.lineNumber}:${point.index}:${point.rawLine}`;
}

function buildSummaryRows({
  file,
  sensors,
  visibleGpsCount,
  visibleEnhancedCount,
  visiblePointCount,
  selectedPointCount,
  pointSummary,
  hasSegment,
}: {
  file: VtaFile;
  sensors: SensorPoint[];
  visibleGpsCount: number;
  visibleEnhancedCount: number;
  visiblePointCount: number;
  selectedPointCount: number;
  pointSummary: ReturnType<typeof summarizePointRange>;
  hasSegment: boolean;
}): SummaryCsvRow[] {
  const scope = hasSegment ? `Range ${pointSummary.startIndex}-${pointSummary.endIndex}` : "All visible points";
  return [
    { metric: "Source name", value: file.sourceName },
    { metric: "Format", value: file.detectedFormat },
    { metric: "Visible GPS count", value: visibleGpsCount },
    { metric: "Visible enhanced count", value: visibleEnhancedCount },
    { metric: "Sensor count", value: sensors.length },
    { metric: "Warning count", value: file.parseWarnings.length },
    { metric: "Visible point count", value: visiblePointCount },
    { metric: "Selected point count", value: selectedPointCount, detail: scope },
    { metric: "Distance", value: `${pointSummary.distanceKm.toFixed(3)} km`, detail: scope },
    { metric: "Average speed", value: `${pointSummary.averageSpeedKmh.toFixed(1)} km/h`, detail: scope },
    { metric: "Max speed", value: `${pointSummary.maxSpeedKmh.toFixed(1)} km/h`, detail: scope },
    { metric: "Max derived accel", value: `${pointSummary.maxDerivedAccelMps2.toFixed(3)} m/s^2`, detail: scope },
  ];
}
