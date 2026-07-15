import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import type { SegmentWidgetId } from "../domain/types";
import { useI18n } from "../i18n/useI18n";

interface DashboardWidgetProps {
  id: SegmentWidgetId;
  title: string;
  children: ReactNode;
}

export function DashboardWidget({ id, title, children }: DashboardWidgetProps) {
  const { t } = useI18n();
  return (
    <section className={`dashboard-widget dashboard-widget-${id}`} aria-label={title} data-widget-id={id}>
      <header className="dashboard-widget-header">
        <h3>{title}</h3>
        <span className="dashboard-widget-handle" role="button" tabIndex={0} aria-label={t("lap.workbench.moveWidget", { name: title })}>
          <GripVertical size={17} aria-hidden />
        </span>
      </header>
      <div className="dashboard-widget-content">{children}</div>
    </section>
  );
}
