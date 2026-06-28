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
import type { TranslationKey } from "../i18n/locales";
import { useI18n } from "../i18n/useI18n";
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

interface ColumnTemplate<T> {
  id: string;
  labelKey: TranslationKey;
  numeric?: boolean;
  value: (item: T) => TableValue;
  render?: (item: T) => ReactNode;
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
const defaultSorts: Record<TableTab, SortState> = {
  gps: { columnId: "index", direction: "asc" },
  enhanced: { columnId: "index", direction: "asc" },
  sensors: { columnId: "index", direction: "asc" },
  warnings: { columnId: "lineNumber", direction: "asc" },
  summary: { columnId: "metric", direction: "asc" },
  validation: { columnId: "index", direction: "asc" },
};

const gpsColumnTemplates: Array<ColumnTemplate<GpsPoint>> = [
  { id: "index", labelKey: "tables.column.index", numeric: true, value: (point) => point.index },
  { id: "source", labelKey: "tables.column.source", value: (point) => point.source },
  { id: "date", labelKey: "tables.column.date", value: (point) => point.date },
  { id: "time", labelKey: "tables.column.time", value: (point) => point.time },
  {
    id: "latitude",
    labelKey: "tables.column.latitude",
    numeric: true,
    value: (point) => point.latitude,
    render: (point) => point.latitude.toFixed(8),
  },
  {
    id: "longitude",
    labelKey: "tables.column.longitude",
    numeric: true,
    value: (point) => point.longitude,
    render: (point) => point.longitude.toFixed(8),
  },
  {
    id: "speedKmh",
    labelKey: "tables.column.speed",
    numeric: true,
    value: (point) => point.speedKmh,
    render: (point) => point.speedKmh.toFixed(1),
  },
  {
    id: "altitudeMeters",
    labelKey: "tables.column.altitude",
    numeric: true,
    value: (point) => point.altitudeMeters,
    render: (point) => point.altitudeMeters.toFixed(1),
  },
  { id: "satelliteCount", labelKey: "tables.column.satellites", numeric: true, value: (point) => point.satelliteCount },
  {
    id: "accuracyMeters",
    labelKey: "tables.column.accuracy",
    numeric: true,
    value: (point) => point.accuracyMeters ?? "",
    render: (point) => point.accuracyMeters?.toFixed(2) ?? "",
  },
];

const sensorColumnTemplates: Array<ColumnTemplate<SensorPoint>> = [
  { id: "index", labelKey: "tables.column.index", numeric: true, value: (sensor) => sensor.index },
  {
    id: "elapsedSeconds",
    labelKey: "tables.column.elapsed",
    numeric: true,
    value: (sensor) => sensor.elapsedSeconds,
    render: (sensor) => sensor.elapsedSeconds.toFixed(3),
  },
  { id: "eventCode", labelKey: "tables.column.event", numeric: true, value: (sensor) => sensor.eventCode },
  { id: "accelUnit", labelKey: "tables.column.unit", value: (sensor) => sensor.accelUnit },
  {
    id: "accelX",
    labelKey: "tables.column.gx",
    numeric: true,
    value: (sensor) => sensor.accelX,
    render: (sensor) => sensor.accelX.toFixed(3),
  },
  {
    id: "accelY",
    labelKey: "tables.column.gy",
    numeric: true,
    value: (sensor) => sensor.accelY,
    render: (sensor) => sensor.accelY.toFixed(3),
  },
  {
    id: "accelZ",
    labelKey: "tables.column.gz",
    numeric: true,
    value: (sensor) => sensor.accelZ,
    render: (sensor) => sensor.accelZ.toFixed(3),
  },
  {
    id: "orientationXDegrees",
    labelKey: "tables.column.ox",
    numeric: true,
    value: (sensor) => sensor.orientationXDegrees ?? "",
    render: (sensor) => sensor.orientationXDegrees?.toFixed(3) ?? "",
  },
  {
    id: "orientationYDegrees",
    labelKey: "tables.column.oy",
    numeric: true,
    value: (sensor) => sensor.orientationYDegrees ?? "",
    render: (sensor) => sensor.orientationYDegrees?.toFixed(3) ?? "",
  },
  {
    id: "orientationZDegrees",
    labelKey: "tables.column.oz",
    numeric: true,
    value: (sensor) => sensor.orientationZDegrees ?? "",
    render: (sensor) => sensor.orientationZDegrees?.toFixed(3) ?? "",
  },
];

const warningColumnTemplates: Array<ColumnTemplate<ParseWarning>> = [
  {
    id: "lineNumber",
    labelKey: "tables.column.line",
    numeric: true,
    value: (warning) => warning.lineNumber ?? "",
  },
  { id: "code", labelKey: "tables.column.code", value: (warning) => warning.code },
  { id: "message", labelKey: "tables.column.message", value: (warning) => warning.message },
];

const summaryColumnTemplates: Array<ColumnTemplate<SummaryCsvRow>> = [
  { id: "metric", labelKey: "tables.column.metric", value: (row) => row.metric },
  { id: "value", labelKey: "tables.column.value", value: (row) => row.value },
  { id: "detail", labelKey: "tables.column.detail", value: (row) => row.detail ?? "" },
];

const validationColumnTemplates: Array<ColumnTemplate<ValidationRow>> = [
  { id: "index", labelKey: "tables.column.index", numeric: true, value: (row) => row.index },
  {
    id: "elapsedSeconds",
    labelKey: "tables.column.elapsedSeconds",
    numeric: true,
    value: (row) => row.elapsedSeconds,
    render: (row) => row.elapsedSeconds.toFixed(3),
  },
  {
    id: "speedKmh",
    labelKey: "tables.column.speedKmh",
    numeric: true,
    value: (row) => row.speedKmh,
    render: (row) => row.speedKmh.toFixed(1),
  },
  {
    id: "deltaSpeedKmh",
    labelKey: "tables.column.deltaSpeedKmh",
    numeric: true,
    value: (row) => row.deltaSpeedKmh,
    render: (row) => row.deltaSpeedKmh.toFixed(1),
  },
  {
    id: "derivedAccelMps2",
    labelKey: "tables.column.derivedAccel",
    numeric: true,
    value: (row) => row.derivedAccelMps2,
    render: (row) => row.derivedAccelMps2.toFixed(3),
  },
];

export function Tables({ file, sensors, visiblePoints, activeSegment }: TablesProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TableTab>("gps");
  const [query, setQuery] = useState("");
  const [sortStates, setSortStates] = useState<Partial<Record<TableTab, SortState>>>({});
  const tableLabels = useMemo<Record<TableTab, string>>(
    () => ({
      gps: t("tables.tab.gps"),
      enhanced: t("tables.tab.enhanced"),
      sensors: t("tables.tab.sensors"),
      warnings: t("tables.tab.warnings"),
      summary: t("tables.tab.summary"),
      validation: t("tables.tab.validation"),
    }),
    [t],
  );
  const gpsColumns = useMemo(() => localizeColumns(gpsColumnTemplates, t), [t]);
  const sensorColumns = useMemo(() => localizeColumns(sensorColumnTemplates, t), [t]);
  const warningColumns = useMemo(() => localizeColumns(warningColumnTemplates, t), [t]);
  const summaryColumns = useMemo(() => localizeColumns(summaryColumnTemplates, t), [t]);
  const validationColumns = useMemo(() => localizeColumns(validationColumnTemplates, t), [t]);
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
        t,
      }),
    [
      activeSegment,
      file,
      pointSummary,
      points.length,
      segmentPoints.length,
      sensors,
      t,
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
    [
      file.parseWarnings,
      gpsColumns,
      sensors,
      sensorColumns,
      summaryColumns,
      summaryRows,
      tableLabels.enhanced,
      tableLabels.gps,
      tableLabels.sensors,
      tableLabels.summary,
      tableLabels.validation,
      tableLabels.warnings,
      validationColumns,
      validationRows,
      visibleEnhancedPoints,
      visibleGpsPoints,
      warningColumns,
    ],
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
      <Panel title={t("tables.title")} eyebrow={file.sourceName}>
        <div className="content-band">
          <div className="table-toolbar">
            <label className="field table-search">
              <span>{t("tables.searchRows")}</span>
              <input
                aria-label={t("tables.searchAria")}
                placeholder={t("tables.searchRows")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <ToolbarButton icon={<Download size={16} aria-hidden />} onClick={exportVisibleRows}>
              {t("tables.exportVisibleRows")}
            </ToolbarButton>
          </div>

          <Tabs
            ariaLabel={t("tables.tableViewsAria")}
            items={tableOrder.map((id) => ({ id, label: tableLabels[id] }))}
            value={activeTab}
            onChange={(value) => setActiveTab(value as TableTab)}
          />

          <div className="table-status" aria-live="polite">
            {t("tables.statusRows", {
              label: activeDefinition.label,
              visible: visibleRows.length,
              total: activeDefinition.rows.length,
            })}
          </div>

          <div role="tabpanel" aria-label={t("tables.tabPanelAria", { label: activeDefinition.label })}>
            <SortableTable
              definition={activeDefinition}
              rows={visibleRows}
              sort={activeSort}
              onSort={updateSort}
              noRowsLabel={t("tables.noRows")}
              sortByLabel={(label) => t("tables.sortBy", { label })}
            />
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
  noRowsLabel,
  sortByLabel,
}: {
  definition: TableDefinition;
  rows: TableRow[];
  sort: SortState;
  onSort: (columnId: string) => void;
  noRowsLabel: string;
  sortByLabel: (label: string) => string;
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
                    title={sortByLabel(column.label)}
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
                {noRowsLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function localizeColumns<T>(columns: Array<ColumnTemplate<T>>, t: ReturnType<typeof useI18n>["t"]): Array<ColumnBuilder<T>> {
  return columns.map((column) => ({ ...column, label: t(column.labelKey) }));
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
  t,
}: {
  file: VtaFile;
  sensors: SensorPoint[];
  visibleGpsCount: number;
  visibleEnhancedCount: number;
  visiblePointCount: number;
  selectedPointCount: number;
  pointSummary: ReturnType<typeof summarizePointRange>;
  hasSegment: boolean;
  t: ReturnType<typeof useI18n>["t"];
}): SummaryCsvRow[] {
  const scope = hasSegment
    ? t("tables.summary.scope.range", { start: pointSummary.startIndex, end: pointSummary.endIndex })
    : t("tables.summary.scope.allVisiblePoints");
  return [
    { metric: t("tables.summary.sourceName"), value: file.sourceName },
    { metric: t("tables.summary.format"), value: file.detectedFormat },
    { metric: t("tables.summary.visibleGpsCount"), value: visibleGpsCount },
    { metric: t("tables.summary.visibleEnhancedCount"), value: visibleEnhancedCount },
    { metric: t("tables.summary.sensorCount"), value: sensors.length },
    { metric: t("tables.summary.warningCount"), value: file.parseWarnings.length },
    { metric: t("tables.summary.visiblePointCount"), value: visiblePointCount },
    { metric: t("tables.summary.selectedPointCount"), value: selectedPointCount, detail: scope },
    { metric: t("tables.summary.distance"), value: `${pointSummary.distanceKm.toFixed(3)} km`, detail: scope },
    { metric: t("tables.summary.averageSpeed"), value: `${pointSummary.averageSpeedKmh.toFixed(1)} km/h`, detail: scope },
    { metric: t("tables.summary.maxSpeed"), value: `${pointSummary.maxSpeedKmh.toFixed(1)} km/h`, detail: scope },
    { metric: t("tables.summary.maxDerivedAccel"), value: `${pointSummary.maxDerivedAccelMps2.toFixed(3)} m/s^2`, detail: scope },
  ];
}
