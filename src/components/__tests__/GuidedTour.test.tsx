import type * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { TourStep } from "../../app/tourSteps";
import { GuidedTour } from "../GuidedTour";

const steps: TourStep[] = [
  {
    id: "welcome",
    titleKey: "tour.step.welcome.title",
    bodyKey: "tour.step.welcome.body",
    target: "[data-tour='target']",
  },
  {
    id: "export",
    titleKey: "tour.step.export.title",
    bodyKey: "tour.step.export.body",
    target: "[data-tour='missing']",
  },
];

describe("GuidedTour", () => {
  it("renders the active step and advances", async () => {
    const user = userEvent.setup();
    const onIndexChange = vi.fn();

    renderTour(
      <GuidedTour
        steps={steps}
        activeIndex={0}
        onIndexChange={onIndexChange}
        onSkip={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Analyze VTA files locally" })).toBeVisible();
    expect(screen.getByText("Step 1 of 2")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("calls skip and done actions", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    const onDone = vi.fn();

    renderTour(
      <GuidedTour
        steps={steps}
        activeIndex={1}
        onIndexChange={vi.fn()}
        onSkip={onSkip}
        onDone={onDone}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("uses fallback placement when the target is missing", () => {
    renderTour(
      <GuidedTour
        steps={steps}
        activeIndex={1}
        onIndexChange={vi.fn()}
        onSkip={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Export the result" })).toHaveClass("tour-callout-fallback");
  });

  it("keeps keyboard focus in the dialog and skips on escape", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();

    renderTour(
      <GuidedTour
        steps={steps}
        activeIndex={1}
        onIndexChange={vi.fn()}
        onSkip={onSkip}
        onDone={vi.fn()}
      />,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "Skip" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Back" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Skip" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("keeps shift tab inside the dialog from initial dialog focus", async () => {
    const user = userEvent.setup();

    renderTour(
      <GuidedTour
        steps={steps}
        activeIndex={1}
        onIndexChange={vi.fn()}
        onSkip={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Export the result" })).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
  });
});

function renderTour(element: React.ReactElement) {
  return render(
    <I18nProvider>
      <div data-tour="target">Target</div>
      {element}
    </I18nProvider>,
  );
}
