import type { ParseWarning } from "../domain/types";
import { useI18n } from "../i18n/useI18n";

interface WarningListProps {
  warnings: ParseWarning[];
  extraWarning?: string;
}

export function WarningList({ warnings, extraWarning }: WarningListProps) {
  const { t } = useI18n();

  if (!warnings.length && !extraWarning) {
    return <div className="empty-state">{t("warnings.noWarnings")}</div>;
  }
  return (
    <div className="warning-list">
      {extraWarning ? <div className="warning-item">{extraWarning}</div> : null}
      {warnings.slice(0, 12).map((warning, index) => (
        <div className="warning-item" key={`${warning.code}-${warning.lineNumber ?? index}`}>
          {warning.lineNumber ? `${t("warnings.line", { line: warning.lineNumber })}: ` : null}
          {warning.message}
        </div>
      ))}
      {warnings.length > 12 ? (
        <div className="warning-item">{t("warnings.moreHidden", { count: warnings.length - 12 })}</div>
      ) : null}
    </div>
  );
}
