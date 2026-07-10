import type { GpsPoint } from "../domain/types";
import { useI18n } from "../i18n/useI18n";

export function PointTimeline({
  points,
  selectedPointIndex,
  onSelectedPointIndex,
}: {
  points: GpsPoint[];
  selectedPointIndex: number;
  onSelectedPointIndex: (index: number) => void;
}) {
  const { t } = useI18n();
  const selected = points[selectedPointIndex];
  return (
    <div className="point-timeline">
      <div className="point-timeline-header">
        <label htmlFor="point-timeline">{t("overview.pointTimeline")}</label>
        <output htmlFor="point-timeline">
          {selected ? selectedPointIndex + 1 : 0} / {points.length}
        </output>
      </div>
      <input
        id="point-timeline"
        type="range"
        min={0}
        max={Math.max(points.length - 1, 0)}
        step={1}
        value={selected ? selectedPointIndex : 0}
        disabled={points.length <= 1}
        aria-label={t("overview.pointTimeline")}
        aria-valuetext={selected ? t("overview.pointTimelineValue", {
          current: selectedPointIndex + 1,
          total: points.length,
          date: selected.date,
          time: selected.time,
        }) : undefined}
        onChange={(event) => onSelectedPointIndex(Number(event.currentTarget.value))}
      />
      <div className="point-timeline-meta">
        <span>{selected ? `${selected.date} ${selected.time}` : t("overview.noGpsPointSelected")}</span>
        {selected ? <span>{selected.speedKmh.toFixed(1)} km/h</span> : null}
      </div>
    </div>
  );
}
