import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useContainedPanelFocus } from "../useContainedPanelFocus";

describe("useContainedPanelFocus", () => {
  it("focuses, contains, closes, and restores a panel lifecycle", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open panel" });

    await user.click(trigger);
    const close = screen.getByRole("button", { name: "Close panel" });
    expect(close).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Last action" })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

function Harness() {
  const [open, setOpen] = useState(false);
  const { panelRef, triggerRef } = useContainedPanelFocus(open, () => setOpen(false));
  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>Open panel</button>
    {open ? <aside ref={panelRef} role="dialog" aria-label="Test panel">
      <button type="button" onClick={() => setOpen(false)}>Close panel</button>
      <button type="button">Last action</button>
    </aside> : null}
  </>;
}
