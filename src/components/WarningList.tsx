import type { ParseWarning } from "../domain/types";

interface WarningListProps {
  warnings: ParseWarning[];
  extraWarning?: string;
}

export function WarningList({ warnings, extraWarning }: WarningListProps) {
  if (!warnings.length && !extraWarning) {
    return <div className="empty-state">No parse or transform warnings.</div>;
  }
  return (
    <div className="warning-list">
      {extraWarning ? <div className="warning-item">{extraWarning}</div> : null}
      {warnings.slice(0, 12).map((warning, index) => (
        <div className="warning-item" key={`${warning.code}-${warning.lineNumber ?? index}`}>
          {warning.lineNumber ? `Line ${warning.lineNumber}: ` : null}
          {warning.message}
        </div>
      ))}
      {warnings.length > 12 ? <div className="warning-item">{warnings.length - 12} more warnings hidden.</div> : null}
    </div>
  );
}

