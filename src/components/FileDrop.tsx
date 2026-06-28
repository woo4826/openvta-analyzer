import { useState } from "react";
import { FileArchive, FileText } from "lucide-react";

interface FileDropProps {
  onFiles: (files: File[]) => void;
  loadError?: string;
  onSample: () => void;
}

export function FileDrop({ onFiles, loadError, onSample }: FileDropProps) {
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
        <h1>Open a VTA or ZIP file</h1>
        <p>
          Drop `.Vta` files or zipped sessions here. The analyzer supports modern OpenVTA rows, legacy phone
          rows, and standalone IMU box records.
        </p>
        <div className="row-actions">
          <label className="button primary">
            <FileText size={16} aria-hidden />
            Choose files
            <input
              hidden
              type="file"
              multiple
              accept=".vta,.Vta,.zip"
              onChange={(event) => {
                onFiles(Array.from(event.target.files ?? []));
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button type="button" className="button" onClick={onSample}>
            Load built-in sample
          </button>
        </div>
        {loadError ? <div className="warning-item">{loadError}</div> : null}
      </div>
    </section>
  );
}

