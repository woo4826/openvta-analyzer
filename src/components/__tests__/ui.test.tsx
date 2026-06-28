import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Metric, Panel, SegmentedControl, StatusBadge, Tabs } from "../ui";

describe("UI primitives", () => {
  it("renders a panel with metric content", () => {
    render(
      <Panel title="Summary" eyebrow="Route">
        <Metric label="Distance" value="12.4 km" detail="Filtered" />
      </Panel>,
    );

    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByText("Route")).toBeInTheDocument();
    expect(screen.getByText("Distance")).toBeInTheDocument();
    expect(screen.getByText("12.4 km")).toBeInTheDocument();
    expect(screen.getByText("Filtered")).toBeInTheDocument();
  });

  it("exercises segmented control selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SegmentedControl
        ariaLabel="Coordinate mode"
        value="gps"
        onChange={onChange}
        options={[
          { value: "gps", label: "GPS" },
          { value: "sensor", label: "Sensor" },
        ]}
      />,
    );

    expect(screen.getByRole("radio", { name: "GPS" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Sensor" }));
    expect(onChange).toHaveBeenCalledWith("sensor");
  });

  it("exercises tabs with a status badge", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Tabs
        ariaLabel="Analyzer sections"
        value="overview"
        onChange={onChange}
        items={[
          { id: "overview", label: "Overview", badge: <StatusBadge tone="success">Ready</StatusBadge> },
          { id: "warnings", label: "Warnings", badge: <StatusBadge tone="warning">2</StatusBadge> },
        ]}
      />,
    );

    expect(screen.getByRole("tab", { name: /overview/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Ready")).toHaveClass("status-badge-success");
    expect(screen.getByText("2")).toHaveClass("status-badge-warning");

    await user.click(screen.getByRole("tab", { name: /warnings/i }));
    expect(onChange).toHaveBeenCalledWith("warnings");
  });
});
