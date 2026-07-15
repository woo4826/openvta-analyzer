import { useMemo, useState, type ReactNode, type RefObject } from "react";
import { Responsive, useContainerWidth, type Layout, type ResponsiveLayouts } from "react-grid-layout";
import { SEGMENT_WIDGET_IDS } from "../domain/segmentWorkbenchPreferences";
import type { SegmentWidgetId, SegmentWidgetLayout } from "../domain/types";

type DashboardBreakpoint = "lg" | "md" | "sm" | "xs";

interface SegmentDashboardProps {
  layouts: Record<string, SegmentWidgetLayout[]>;
  visibleWidgets: Record<SegmentWidgetId, boolean>;
  children: Partial<Record<SegmentWidgetId, ReactNode>>;
  onLayouts: (layouts: Record<string, SegmentWidgetLayout[]>) => void;
}

const breakpoints: Record<DashboardBreakpoint, number> = { lg: 1200, md: 900, sm: 680, xs: 0 };
const columns: Record<DashboardBreakpoint, number> = { lg: 12, md: 8, sm: 1, xs: 1 };

export function SegmentDashboard({ layouts, visibleWidgets, children, onLayouts }: SegmentDashboardProps) {
  const { width, containerRef } = useContainerWidth({ initialWidth: 1280 });
  const [breakpoint, setBreakpoint] = useState<DashboardBreakpoint>("lg");
  const visibleIds = useMemo(() => SEGMENT_WIDGET_IDS.filter((id) => visibleWidgets[id] && children[id]), [children, visibleWidgets]);
  const visibleLayouts = useMemo(() => Object.fromEntries(Object.entries(layouts).map(([key, items]) => [
    key,
    items.filter((item) => visibleIds.includes(item.i)),
  ])) as ResponsiveLayouts<DashboardBreakpoint>, [layouts, visibleIds]);
  const isCompact = breakpoint === "sm" || breakpoint === "xs";

  const updateLayouts = (_layout: Layout, nextLayouts: ResponsiveLayouts<DashboardBreakpoint>) => {
    const merged = Object.fromEntries(Object.entries(layouts).map(([key, savedItems]) => {
      const nextItems = (nextLayouts[key as DashboardBreakpoint] ?? []).filter(isSegmentWidgetLayout);
      const nextById = new Map(nextItems.map((item) => [item.i, item]));
      return [key, savedItems.map((saved) => ({ ...saved, ...nextById.get(saved.i), i: saved.i }))];
    }));
    onLayouts(merged);
  };

  return (
    <div className="segment-dashboard-shell" ref={containerRef as unknown as RefObject<HTMLDivElement>} data-breakpoint={breakpoint}>
      <Responsive<DashboardBreakpoint>
        width={width}
        layouts={visibleLayouts}
        breakpoints={breakpoints}
        cols={columns}
        rowHeight={64}
        margin={{ lg: [16, 16], md: [14, 14], sm: [12, 12], xs: [10, 10] }}
        containerPadding={null}
        dragConfig={{
          enabled: !isCompact,
          bounded: false,
          handle: ".dashboard-widget-handle",
          cancel: ".dashboard-widget-content",
          threshold: 3,
        }}
        resizeConfig={{ enabled: !isCompact, handles: ["se"] }}
        onBreakpointChange={(next) => setBreakpoint(next)}
        onLayoutChange={updateLayouts}
      >
        {visibleIds.map((id) => <div key={id}>{children[id]}</div>)}
      </Responsive>
    </div>
  );
}

function isSegmentWidgetLayout(item: Layout[number]): item is SegmentWidgetLayout {
  return SEGMENT_WIDGET_IDS.includes(item.i as SegmentWidgetId);
}
