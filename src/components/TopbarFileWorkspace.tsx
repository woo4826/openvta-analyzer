import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileText, FileUp, Trash2, X } from "lucide-react";
import type { VtaWorkspaceFile } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { FilePickerButton, IconButton, StatusBadge } from "./ui";

interface TopbarFileWorkspaceProps {
  files: VtaWorkspaceFile[];
  activeFileId?: string;
  onFiles: (files: File[]) => void;
  onSelectFile: (fileId: string) => void;
  onRemoveFile: (fileId: string) => void;
}

export function TopbarFileWorkspace({
  files,
  activeFileId,
  onFiles,
  onSelectFile,
  onRemoveFile,
}: TopbarFileWorkspaceProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const activeFile = files.find((file) => file.id === activeFileId) ?? files[0];

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  if (!activeFile) return null;

  return (
    <div className="topbar-file-workspace" ref={popoverRef} data-tour="file-workspace">
      <button
        type="button"
        className="button ghost topbar-file-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <FileText size={16} aria-hidden />
        <span className="topbar-file-trigger-copy">
          <small>{t("fileTray.title")} · {files.length}</small>
          <strong>{activeFile.sourceName}</strong>
        </span>
        <ChevronDown size={15} aria-hidden />
      </button>

      {open ? (
        <section className="topbar-file-popover" role="dialog" aria-label={t("fileTray.title")}>
          <header className="topbar-file-popover-header">
            <div>
              <span className="panel-eyebrow">{t("app.activeFile.label")}</span>
              <h2>{activeFile.sourceName}</h2>
            </div>
            <IconButton label={t("actions.close")} icon={<X size={17} aria-hidden />} variant="ghost" onClick={() => setOpen(false)} />
          </header>

          <div className="topbar-file-list">
            {files.map((file) => {
              const active = file.id === activeFile.id;
              return (
                <article className={`topbar-file-row${active ? " is-active" : ""}`} key={file.id}>
                  <button
                    type="button"
                    className="topbar-file-select"
                    aria-pressed={active}
                    onClick={() => {
                      onSelectFile(file.id);
                      setOpen(false);
                    }}
                  >
                    <span className="topbar-file-name">
                      <strong>{file.sourceName}</strong>
                      <small>{file.detectedFormat}</small>
                    </span>
                    <span className="topbar-file-counts" aria-label={t("fileTray.summaryCounts", { name: file.sourceName })}>
                      <StatusBadge>{t("fileTray.gps")} {file.gpsPoints.length}</StatusBadge>
                      <StatusBadge>{t("fileTray.enhanced")} {file.enhancedPoints.length}</StatusBadge>
                      <StatusBadge>{t("fileTray.sensor")} {file.sensorPoints.length}</StatusBadge>
                      <StatusBadge tone={file.parseWarnings.length ? "warning" : "neutral"}>{t("fileTray.warnings")} {file.parseWarnings.length}</StatusBadge>
                    </span>
                  </button>
                  <div className="topbar-file-row-actions">
                    {active ? <StatusBadge tone="success">{t("fileTray.active")}</StatusBadge> : null}
                    <IconButton
                      label={t("fileTray.remove", { name: file.sourceName })}
                      icon={<Trash2 size={15} aria-hidden />}
                      variant="ghost"
                      onClick={() => onRemoveFile(file.id)}
                    />
                  </div>
                </article>
              );
            })}
          </div>

          <FilePickerButton
            accept=".vta,.Vta,.zip"
            multiple
            onFiles={(incoming) => {
              onFiles(incoming);
              setOpen(false);
            }}
            icon={<FileUp size={16} aria-hidden />}
          >
            {t("app.openFile")}
          </FilePickerButton>
        </section>
      ) : null}
    </div>
  );
}
