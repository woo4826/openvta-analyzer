import { useMemo } from "react";
import type { SegmentAnalysisResult } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { ChartPanel } from "./ChartPanel";
import { buildSegmentVariationOption } from "./segmentVariationOptions";

interface SegmentVariationChartProps {
  analysis: SegmentAnalysisResult;
  focusedLapId?: string;
  referenceLapId?: string;
  visibleLapIds: string[];
}

export function SegmentVariationChart({ analysis, focusedLapId, referenceLapId, visibleLapIds }: SegmentVariationChartProps) {
  const { t } = useI18n();
  const option = useMemo(() => buildSegmentVariationOption(analysis, focusedLapId, referenceLapId, {
    lap: t("lap.lap"),
    segmentTime: t("lap.workbench.segmentTime"),
    drivenPath: t("lap.workbench.path"),
    focused: t("lap.workbench.focusedLap"),
    reference: t("lap.workbench.referenceLap"),
    average: t("lap.workbench.average"),
  }, visibleLapIds), [analysis, focusedLapId, referenceLapId, t, visibleLapIds]);

  return (
    <ChartPanel
      title={t("lap.workbench.variationTitle")}
      eyebrow={t("lap.workbench.variationEyebrow")}
      ariaLabel={t("lap.workbench.variationAria")}
      className="segment-variation-panel"
      option={option}
    />
  );
}
