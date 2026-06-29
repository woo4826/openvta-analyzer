import { useState } from "react";
import { FileArchive, FileText } from "lucide-react";
import { useI18n } from "../i18n/useI18n";
import { FilePickerButton } from "./ui";

interface FileDropProps {
  onFiles: (files: File[]) => void;
  loadError?: string;
  onSample: () => void;
}

export function FileDrop({ onFiles, loadError, onSample }: FileDropProps) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  return (
    <section
      className={dragging ? "dropzone dragging" : "dropzone"}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="dropzone-content">
        <FileArchive size={42} aria-hidden />
        <h1>{t("fileDrop.title")}</h1>
        <p>{t("fileDrop.body")}</p>
        <div className="row-actions">
          <FilePickerButton
            accept=".vta,.Vta,.zip"
            multiple
            onFiles={onFiles}
            variant="primary"
            icon={<FileText size={16} aria-hidden />}
          >
            {t("fileDrop.chooseFiles")}
          </FilePickerButton>
          <button type="button" className="button" onClick={onSample}>
            {t("fileDrop.loadBuiltInSample")}
          </button>
        </div>
        {loadError ? (
          <div className="warning-item" role="alert">
            {loadError}
          </div>
        ) : null}
      </div>
    </section>
  );
}
