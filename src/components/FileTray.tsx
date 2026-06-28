import { Trash2 } from "lucide-react";
import type { VtaWorkspaceFile } from "../domain/types";
import { IconButton, Metric, Panel, StatusBadge } from "./ui";

interface FileTrayProps {
  files: VtaWorkspaceFile[];
  activeFileId?: string;
  onSelectFile: (fileId: string) => void;
  onRemoveFile: (fileId: string) => void;
}

export function FileTray({ files, activeFileId, onSelectFile, onRemoveFile }: FileTrayProps) {
  return (
    <Panel title="Files" bodyClassName="content-band">
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
                {active ? <StatusBadge tone="success">Active</StatusBadge> : null}
                <IconButton
                  label={`Remove ${file.sourceName}`}
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
              {active ? "Selected" : "Select"}
            </button>
            <div className="row-actions" aria-label={`${file.sourceName} summary counts`}>
              <StatusBadge>GPS {file.gpsPoints.length}</StatusBadge>
              <StatusBadge>Enhanced {file.enhancedPoints.length}</StatusBadge>
              <StatusBadge>Sensor {file.sensorPoints.length}</StatusBadge>
              <StatusBadge tone={file.parseWarnings.length ? "warning" : "neutral"}>
                Warnings {file.parseWarnings.length}
              </StatusBadge>
            </div>
            <div className="metric-grid" aria-label={`${file.sourceName} row counts`}>
              <Metric label="GPS" value={file.gpsPoints.length} />
              <Metric label="Enhanced" value={file.enhancedPoints.length} />
              <Metric label="Sensor" value={file.sensorPoints.length} />
              <Metric
                label="Warnings"
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
