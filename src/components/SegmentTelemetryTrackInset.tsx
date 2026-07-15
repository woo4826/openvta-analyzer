import type { SegmentLapRecord, SegmentTrajectorySample } from "../domain/types";
import { useI18n } from "../i18n/useI18n";

interface SegmentTelemetryTrackInsetProps {
  focused?: SegmentLapRecord;
  reference?: SegmentLapRecord;
  cursorDistanceMeters: number;
}

const WIDTH = 220;
const HEIGHT = 126;
const PADDING = 10;

export function SegmentTelemetryTrackInset({
  focused,
  reference,
  cursorDistanceMeters,
}: SegmentTelemetryTrackInsetProps) {
  const { t } = useI18n();
  const focusedPoints = focused?.trajectory ?? [];
  const referencePoints = reference?.trajectory ?? [];
  const usable = [...focusedPoints, ...referencePoints].filter(isCoordinate);
  if (focusedPoints.filter(isCoordinate).length < 2 || usable.length < 2) {
    return <p className="segment-track-inset-unavailable">{t("lap.workbench.trackInsetUnavailable")}</p>;
  }
  const project = createProjector(usable);
  const focusedMarker = nearestDistanceSample(focusedPoints, cursorDistanceMeters);
  const referenceMarker = nearestDistanceSample(referencePoints, cursorDistanceMeters);

  return (
    <figure className="segment-track-inset">
      <figcaption>{t("lap.workbench.cursorTrackPosition")}</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t("lap.workbench.cursorTrackPositionAria")}>
        {referencePoints.filter(isCoordinate).length >= 2 ? (
          <path data-testid="reference-track-path" d={pathData(referencePoints, project)} className="is-reference" />
        ) : null}
        <path data-testid="focused-track-path" d={pathData(focusedPoints, project)} className="is-focused" />
        {referenceMarker && isCoordinate(referenceMarker) ? (
          <circle data-testid="reference-track-marker" {...circlePosition(referenceMarker, project)} r="4" className="is-reference" />
        ) : null}
        {focusedMarker && isCoordinate(focusedMarker) ? (
          <circle data-testid="focused-track-marker" {...circlePosition(focusedMarker, project)} r="5" className="is-focused" />
        ) : null}
      </svg>
    </figure>
  );
}

type Project = (sample: Pick<SegmentTrajectorySample, "longitude" | "latitude">) => [number, number];

function createProjector(samples: SegmentTrajectorySample[]): Project {
  const longitudes = samples.map((sample) => sample.longitude);
  const latitudes = samples.map((sample) => sample.latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const longitudeSpan = maxLongitude - minLongitude || 1;
  const latitudeSpan = maxLatitude - minLatitude || 1;
  return (sample) => [
    PADDING + ((sample.longitude - minLongitude) / longitudeSpan) * (WIDTH - PADDING * 2),
    HEIGHT - PADDING - ((sample.latitude - minLatitude) / latitudeSpan) * (HEIGHT - PADDING * 2),
  ];
}

function pathData(samples: SegmentTrajectorySample[], project: Project): string {
  return samples.filter(isCoordinate).map((sample, index) => {
    const [x, y] = project(sample);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function circlePosition(sample: SegmentTrajectorySample, project: Project) {
  const [cx, cy] = project(sample);
  return { cx, cy };
}

function nearestDistanceSample(samples: SegmentTrajectorySample[], distanceMeters: number): SegmentTrajectorySample | undefined {
  return samples.reduce<SegmentTrajectorySample | undefined>((nearest, sample) =>
    !nearest || Math.abs(sample.distanceMeters - distanceMeters) < Math.abs(nearest.distanceMeters - distanceMeters)
      ? sample
      : nearest,
  undefined);
}

function isCoordinate(sample: SegmentTrajectorySample): boolean {
  return Number.isFinite(sample.longitude) && Number.isFinite(sample.latitude);
}
