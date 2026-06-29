import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { TourStep } from "../app/tourSteps";
import { useI18n } from "../i18n/useI18n";

interface GuidedTourProps {
  steps: TourStep[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onSkip: () => void;
  onDone: () => void;
  onLoadSample?: () => void;
}

interface TargetBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

const calloutWidth = 360;
const viewportMargin = 14;

export function GuidedTour({
  steps,
  activeIndex,
  onIndexChange,
  onSkip,
  onDone,
  onLoadSample,
}: GuidedTourProps) {
  const { t } = useI18n();
  const step = steps[activeIndex];
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [targetBox, setTargetBox] = useState<TargetBox | undefined>();
  const [dialogSize, setDialogSize] = useState({ width: calloutWidth, height: 220 });
  const [isMobile, setIsMobile] = useState(false);

  const total = steps.length;
  const isFinalStep = activeIndex >= total - 1;

  useEffect(() => {
    previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    return () => {
      previousActiveElement.current?.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
        return;
      }

      if (event.key === "Tab") {
        keepFocusInDialog(event, dialogRef.current);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSkip]);

  useEffect(() => {
    if (!step?.target) {
      return;
    }
    const target = document.querySelector(step.target);
    if (target instanceof HTMLElement && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }, [step]);

  useLayoutEffect(() => {
    function measure() {
      const mobile = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 680px)").matches;
      setIsMobile(mobile);

      if (!step?.target) {
        setTargetBox(undefined);
        return;
      }

      const target = document.querySelector(step.target);
      if (!(target instanceof HTMLElement)) {
        setTargetBox(undefined);
        return;
      }

      const rect = target.getBoundingClientRect();
      setTargetBox({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    function measureDialog() {
      const rect = dialogRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setDialogSize({ width: rect.width || calloutWidth, height: rect.height || 220 });
    }

    measureDialog();
    const observer =
      typeof ResizeObserver === "function" && dialogRef.current ? new ResizeObserver(measureDialog) : undefined;
    if (dialogRef.current) {
      observer?.observe(dialogRef.current);
    }
    window.addEventListener("resize", measureDialog);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureDialog);
    };
  }, [activeIndex, step]);

  const calloutPlacement = useMemo<{ fallback: boolean; style: CSSProperties }>(() => {
    if (isMobile || !targetBox || step?.placement === "center") {
      return { fallback: true, style: {} };
    }

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const targetRight = targetBox.left + targetBox.width;
    const targetBottom = targetBox.top + targetBox.height;
    const sideLeft = targetRight + viewportMargin;
    const sideRight = targetBox.left - dialogSize.width - viewportMargin;
    const hasRightRoom = sideLeft + dialogSize.width <= viewportWidth - viewportMargin;
    const hasLeftRoom = sideRight >= viewportMargin;
    const hasBelowRoom = targetBottom + viewportMargin + dialogSize.height <= viewportHeight - viewportMargin;
    const hasAboveRoom = targetBox.top - viewportMargin - dialogSize.height >= viewportMargin;
    const maxTop = Math.max(viewportMargin, viewportHeight - dialogSize.height - viewportMargin);

    if (hasRightRoom || hasLeftRoom) {
      return {
        fallback: false,
        style: {
          left: hasRightRoom ? sideLeft : sideRight,
          top: Math.min(maxTop, Math.max(viewportMargin, targetBox.top)),
          width: calloutWidth,
        },
      };
    }

    if (hasBelowRoom || hasAboveRoom) {
      return {
        fallback: false,
        style: {
          left: Math.min(
            viewportWidth - dialogSize.width - viewportMargin,
            Math.max(viewportMargin, targetBox.left),
          ),
          top: hasBelowRoom ? targetBottom + viewportMargin : targetBox.top - dialogSize.height - viewportMargin,
          width: calloutWidth,
        },
      };
    }

    return { fallback: true, style: {} };
  }, [dialogSize.height, dialogSize.width, isMobile, step?.placement, targetBox]);

  if (!step) {
    return null;
  }

  const highlightStyle: CSSProperties | undefined = targetBox
    ? {
        top: targetBox.top,
        left: targetBox.left,
        width: targetBox.width,
        height: targetBox.height,
      }
    : undefined;

  const useFallback = calloutPlacement.fallback;

  return (
    <div className="tour-layer" aria-live="polite">
      <div className="tour-scrim" />
      {highlightStyle ? <div className="tour-highlight" style={highlightStyle} aria-hidden="true" /> : null}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className={[
          "tour-callout",
          isMobile ? "tour-callout-mobile" : "",
          useFallback ? "tour-callout-fallback" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={calloutPlacement.style}
      >
        <div className="tour-progress">{t("tour.progress", { current: activeIndex + 1, total })}</div>
        <h2 id={titleId}>{t(step.titleKey)}</h2>
        <p id={bodyId}>{t(step.bodyKey)}</p>
        {step.sampleAction && onLoadSample ? (
          <button type="button" className="button" onClick={onLoadSample}>
            {t("tour.loadSample")}
          </button>
        ) : null}
        <div className="tour-actions">
          <button type="button" className="button ghost" onClick={onSkip}>
            {t("tour.skip")}
          </button>
          <div className="row-actions">
            <button
              type="button"
              className="button"
              disabled={activeIndex === 0}
              onClick={() => onIndexChange(Math.max(0, activeIndex - 1))}
            >
              {t("tour.back")}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                if (isFinalStep) {
                  onDone();
                  return;
                }
                onIndexChange(activeIndex + 1);
              }}
            >
              {isFinalStep ? t("tour.done") : t("tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function keepFocusInDialog(event: KeyboardEvent, dialog: HTMLDivElement | null): void {
  if (!dialog) {
    return;
  }
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      [
        "a[href]",
        "button:not(:disabled)",
        "input:not(:disabled)",
        "select:not(:disabled)",
        "textarea:not(:disabled)",
        "[tabindex]:not([tabindex='-1'])",
      ].join(","),
    ),
  );

  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeElement = document.activeElement;

  if (activeElement === dialog || !dialog.contains(activeElement)) {
    event.preventDefault();
    if (event.shiftKey) {
      last.focus();
      return;
    }
    first.focus();
    return;
  }

  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
