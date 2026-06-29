import type { TranslationKey } from "../i18n/locales";

export type TourStepId =
  | "welcome"
  | "open-data"
  | "file-workspace"
  | "overview"
  | "workspace"
  | "charts"
  | "calibration"
  | "export";

export type TourPlacement = "auto" | "center" | "bottom";
export type TourRequiredTab = "overview" | "charts" | "tables" | "calibration" | "export";

export interface TourStep {
  id: TourStepId;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  target?: string;
  requiredTab?: TourRequiredTab;
  placement?: TourPlacement;
  requiresFile?: boolean;
  sampleAction?: boolean;
}

export function buildTourSteps(hasActiveFile: boolean): TourStep[] {
  return [
    {
      id: "welcome",
      titleKey: "tour.step.welcome.title",
      bodyKey: "tour.step.welcome.body",
      target: "[data-tour='privacy-note']",
      placement: "center",
    },
    {
      id: "open-data",
      titleKey: "tour.step.openData.title",
      bodyKey: hasActiveFile ? "tour.step.openData.loadedBody" : "tour.step.openData.body",
      target: hasActiveFile ? "[data-tour='topbar-file-actions']" : "[data-tour='file-drop']",
      sampleAction: !hasActiveFile,
    },
    {
      id: "file-workspace",
      titleKey: "tour.step.fileWorkspace.title",
      bodyKey: "tour.step.fileWorkspace.body",
      target: "[data-tour='file-rail']",
      requiresFile: true,
    },
    {
      id: "overview",
      titleKey: "tour.step.overview.title",
      bodyKey: "tour.step.overview.body",
      target: "[data-tour='overview-panel']",
      requiredTab: "overview",
      requiresFile: true,
    },
    {
      id: "workspace",
      titleKey: "tour.step.workspace.title",
      bodyKey: "tour.step.workspace.body",
      target: "[data-tour='workspace-status']",
      requiresFile: true,
    },
    {
      id: "charts",
      titleKey: "tour.step.charts.title",
      bodyKey: "tour.step.charts.body",
      target: "[data-tour='analysis-tabs']",
      requiredTab: "charts",
      requiresFile: true,
    },
    {
      id: "calibration",
      titleKey: "tour.step.calibration.title",
      bodyKey: "tour.step.calibration.body",
      target: "[data-tour='analysis-tabs']",
      requiredTab: "calibration",
      requiresFile: true,
    },
    {
      id: "export",
      titleKey: "tour.step.export.title",
      bodyKey: "tour.step.export.body",
      target: "[data-tour='analysis-tabs']",
      requiredTab: "export",
      requiresFile: true,
    },
  ];
}

export function nextAvailableTourStepIndex(
  steps: TourStep[],
  startIndex: number,
  hasActiveFile: boolean,
): number {
  const boundedStartIndex = Math.min(Math.max(0, startIndex), Math.max(0, steps.length - 1));
  for (let index = boundedStartIndex; index < steps.length; index += 1) {
    if (!steps[index].requiresFile || hasActiveFile) {
      return index;
    }
  }
  for (let index = boundedStartIndex; index >= 0; index -= 1) {
    if (!steps[index].requiresFile || hasActiveFile) {
      return index;
    }
  }
  return 0;
}
