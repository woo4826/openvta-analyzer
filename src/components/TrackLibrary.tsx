import { useEffect, useRef } from "react";
import { Check, Download, FileJson, Trash2, X } from "lucide-react";
import { useTrackLibrary } from "../app/useTrackLibrary";
import { downloadText } from "../domain/export";
import { exportTrackCatalog } from "../domain/trackCatalog";
import { exportTrackProfile } from "../domain/trackProfile";
import type { TrackProfileV1 } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { FilePickerButton, IconButton } from "./ui";

interface TrackLibraryProps {
  open: boolean;
  activeFileName?: string;
  onClose: () => void;
  onApply: (profile: TrackProfileV1) => void;
}

export function TrackLibrary({ open, activeFileName, onClose, onApply }: TrackLibraryProps) {
  const { t } = useI18n();
  const library = useTrackLibrary();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  async function importFiles(files: File[]) {
    await library.importTexts(await Promise.all(files.map(readTextFile)));
  }

  return (
    <div className="modal-layer">
      <button className="modal-scrim" type="button" aria-label={t("trackLibrary.closeAria")} onClick={onClose} />
      <div
        ref={dialogRef}
        className="track-library-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="track-library-title"
        tabIndex={-1}
      >
        <div className="track-library-header">
          <div>
            <span className="panel-eyebrow">{t("trackLibrary.eyebrow")}</span>
            <h2 id="track-library-title">{t("trackLibrary.title")}</h2>
            <p>{t("trackLibrary.subtitle")}</p>
          </div>
          <IconButton label={t("actions.close")} icon={<X size={18} aria-hidden />} variant="ghost" onClick={onClose} />
        </div>

        <div className="track-library-toolbar">
          <FilePickerButton
            accept=".json,application/json"
            multiple
            onFiles={(files) => void importFiles(files)}
            icon={<FileJson size={16} aria-hidden />}
            variant="primary"
          >
            {t("trackLibrary.import")}
          </FilePickerButton>
          <button
            type="button"
            className="button"
            disabled={!library.profiles.length}
            onClick={() => downloadText(
              "openvta-track-catalog.json",
              exportTrackCatalog(library.profiles),
              "application/json",
            )}
          >
            <Download size={16} aria-hidden />
            {t("trackLibrary.exportCatalog")}
          </button>
          <span className="track-library-context">
            {activeFileName ? t("trackLibrary.currentRecording", { name: activeFileName }) : t("trackLibrary.loadToApply")}
          </span>
        </div>

        {library.error ? <div className="notice error" role="alert">{library.error}</div> : null}
        {library.busy ? <div className="notice">{t("trackLibrary.busy")}</div> : null}

        <div className="track-library-list">
          {!library.busy && !library.profiles.length ? (
            <div className="empty-state compact">
              <strong>{t("trackLibrary.empty")}</strong>
              <p>{t("trackLibrary.emptyHelp")}</p>
            </div>
          ) : null}
          {library.profiles.map((profile) => (
            <article className="track-library-card" key={profile.id}>
              <div className="track-library-card-copy">
                <h3>{profile.name}</h3>
                <p>{profile.layoutName || profile.id}</p>
                <small>
                  {t("trackLibrary.summary", {
                    sections: profile.sections.length,
                    gates: profile.sectorGates.length + (profile.startFinish ? 1 : 0),
                  })}
                </small>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={!activeFileName || library.busy}
                  onClick={() => {
                    onApply(profile);
                    onClose();
                  }}
                >
                  <Check size={16} aria-hidden />
                  {t("trackLibrary.apply")}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => downloadText(
                    `${safeFilename(profile.id)}.track.json`,
                    exportTrackProfile(profile),
                    "application/json",
                  )}
                >
                  <Download size={16} aria-hidden />
                  {t("trackLibrary.export")}
                </button>
                <button
                  type="button"
                  className="button danger"
                  disabled={library.busy}
                  onClick={() => {
                    if (window.confirm(t("trackLibrary.confirmDelete", { name: profile.name }))) void library.remove(profile.id);
                  }}
                >
                  <Trash2 size={16} aria-hidden />
                  {t("trackLibrary.delete")}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

async function readTextFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error(`Unable to read ${file.name}.`));
    reader.readAsText(file);
  });
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-") || "openvta-track";
}
