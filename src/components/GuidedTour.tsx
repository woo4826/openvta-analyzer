import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [targetBox, setTargetBox] = useState<TargetBox | undefined>();
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
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSkip]);

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

      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
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

  const calloutStyle = useMemo<CSSProperties>(() => {
    if (isMobile || !targetBox || step?.placement === "center") {
      return {};
    }

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const targetRight = targetBox.left + targetBox.width;
    const targetBottom = targetBox.top + targetBox.height;
    const sideLeft = targetRight + viewportMargin;
    const hasRightRoom = sideLeft + calloutWidth <= viewportWidth - viewportMargin;
    const left = hasRightRoom
      ? sideLeft
      : Math.min(viewportWidth - calloutWidth - viewportMargin, Math.max(viewportMargin, targetBox.left));
    const top = Math.min(viewportHeight - viewportMargin, Math.max(viewportMargin, targetBottom + viewportMargin));

    return {
      left,
      top,
      width: calloutWidth,
    };
  }, [isMobile, step?.placement, targetBox]);

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

  const useFallback = isMobile || !targetBox || step.placement === "center";

  return (
    <div className="tour-layer" aria-live="polite">
      <div className="tour-scrim" />
      {highlightStyle ? <div className="tour-highlight" style={highlightStyle} aria-hidden="true" /> : null}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(step.titleKey)}
        tabIndex={-1}
        className={[
          "tour-callout",
          isMobile ? "tour-callout-mobile" : "",
          useFallback ? "tour-callout-fallback" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={calloutStyle}
      >
        <div className="tour-progress">{t("tour.progress", { current: activeIndex + 1, total })}</div>
        <h2>{t(step.titleKey)}</h2>
        <p>{t(step.bodyKey)}</p>
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
