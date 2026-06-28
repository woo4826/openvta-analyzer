import { Trash2 } from "lucide-react";
import type { VtaWorkspaceFile } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { IconButton, Metric, Panel, StatusBadge } from "./ui";

interface FileTrayProps {
  files: VtaWorkspaceFile[];
  activeFileId?: string;
  onSelectFile: (fileId: string) => void;
  onRemoveFile: (fileId: string) => void;
}

export function FileTray({ files, activeFileId, onSelectFile, onRemoveFile }: FileTrayProps) {
  const { t } = useI18n();

  return (
    <Panel title={t("fileTray.title")} bodyClassName="content-band">
      {files.map((file) => {
        const active = file.id === activeFileId;
        return (
          <article key={file.id} className="metric">
            <div className="panel-header">
              <div>
                <h3>{file.sourceName}</h3>
                <span>{file.detectedFormat}</span>
              </div>
              <div className="row-actions">
                {active ? <StatusBadge tone="success">{t("fileTray.active")}</StatusBadge> : null}
                <IconButton
                  label={t("fileTray.remove", { name: file.sourceName })}
                  icon={<Trash2 size={15} aria-hidden />}
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveFile(file.id);
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              className={active ? "tab active" : "tab"}
              aria-pressed={active}
              onClick={() => onSelectFile(file.id)}
            >
              {active ? t("fileTray.selected") : t("fileTray.select")}
            </button>
            <div className="row-actions" aria-label={t("fileTray.summaryCounts", { name: file.sourceName })}>
              <StatusBadge>
                {t("fileTray.gps")} {file.gpsPoints.length}
              </StatusBadge>
              <StatusBadge>
                {t("fileTray.enhanced")} {file.enhancedPoints.length}
              </StatusBadge>
              <StatusBadge>
                {t("fileTray.sensor")} {file.sensorPoints.length}
              </StatusBadge>
              <StatusBadge tone={file.parseWarnings.length ? "warning" : "neutral"}>
                {t("fileTray.warnings")} {file.parseWarnings.length}
              </StatusBadge>
            </div>
            <div className="metric-grid" aria-label={t("fileTray.rowCounts", { name: file.sourceName })}>
              <Metric label={t("fileTray.gps")} value={file.gpsPoints.length} />
              <Metric label={t("fileTray.enhanced")} value={file.enhancedPoints.length} />
              <Metric label={t("fileTray.sensor")} value={file.sensorPoints.length} />
              <Metric
                label={t("fileTray.warnings")}
                value={file.parseWarnings.length}
                tone={file.parseWarnings.length ? "warning" : "neutral"}
              />
            </div>
          </article>
        );
      })}
    </Panel>
  );
}
