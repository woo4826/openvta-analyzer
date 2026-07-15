import { useState } from "react";
import { Layers3, X } from "lucide-react";
import type { LapMapLayerOverride, LapMapLayerStyle } from "../domain/lapMapLayers";
import { useI18n } from "../i18n/useI18n";

interface SegmentLapLayerControlsProps {
  layers: LapMapLayerStyle[];
  onLayer: (lapId: string, update: LapMapLayerOverride) => void;
  onShowComparison: () => void;
  onShowAll: () => void;
  onReset: () => void;
}

export function SegmentLapLayerControls({
  layers,
  onLayer,
  onShowComparison,
  onShowAll,
  onReset,
}: SegmentLapLayerControlsProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="segment-lap-layer-controls">
      <button
        type="button"
        className="button segment-lap-layer-trigger"
        aria-label={t("lap.workbench.lapLayers")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Layers3 size={16} aria-hidden />
        {t("lap.workbench.lapLayers")}
        <span>{layers.filter((layer) => layer.visible).length}/{layers.length}</span>
      </button>
      {open ? (
        <section className="segment-lap-layer-panel" role="dialog" aria-label={t("lap.workbench.lapLayers")}>
          <header>
            <div>
              <span className="panel-eyebrow">{t("lap.workbench.mapComparison")}</span>
              <h3>{t("lap.workbench.lapLayers")}</h3>
            </div>
            <button type="button" className="icon-button" aria-label={t("lap.workbench.closeLapLayers")} onClick={() => setOpen(false)}>
              <X size={17} aria-hidden />
            </button>
          </header>
          <div className="segment-lap-layer-actions">
            <button type="button" className="button" onClick={onShowComparison}>{t("lap.workbench.showComparison")}</button>
            <button type="button" className="button" onClick={onShowAll}>{t("lap.workbench.showAllLayers")}</button>
            <button type="button" className="button ghost" onClick={onReset}>{t("lap.workbench.autoStyles")}</button>
          </div>
          <div className="segment-lap-layer-list">
            {layers.map((layer) => {
              const lapLabel = `${t("lap.lap")} ${layer.ordinal}`;
              const roleLabel = layer.role === "focused"
                ? t("lap.workbench.focusedLap")
                : layer.role === "reference"
                  ? t("lap.workbench.referenceLap")
                  : t("lap.workbench.otherLap");
              return (
                <article className={`segment-lap-layer-row is-${layer.role}`} key={layer.id}>
                  <label className="segment-lap-layer-visible">
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      aria-label={t("lap.workbench.layerVisible", { lap: lapLabel })}
                      onChange={(event) => onLayer(layer.id, { visible: event.target.checked })}
                    />
                    <i
                      className={`segment-lap-line-sample is-${layer.lineStyle}`}
                      style={{ color: layer.color, opacity: layer.opacity }}
                      aria-hidden
                    />
                    <span><strong>{lapLabel}</strong><small>{roleLabel}</small></span>
                  </label>
                  <label className="segment-lap-layer-field is-color">
                    <span>{t("lap.workbench.layerColor")}</span>
                    <input
                      type="color"
                      value={layer.color}
                      aria-label={t("lap.workbench.layerColorLabel", { lap: lapLabel })}
                      onChange={(event) => onLayer(layer.id, { color: event.target.value })}
                    />
                  </label>
                  <label className="segment-lap-layer-field">
                    <span>{t("lap.workbench.layerStyle")}</span>
                    <select
                      value={layer.lineStyle}
                      aria-label={t("lap.workbench.layerStyleLabel", { lap: lapLabel })}
                      onChange={(event) => onLayer(layer.id, { lineStyle: event.target.value as LapMapLayerStyle["lineStyle"] })}
                    >
                      <option value="solid">{t("lap.workbench.lineSolid")}</option>
                      <option value="dashed">{t("lap.workbench.lineDashed")}</option>
                      <option value="dotted">{t("lap.workbench.lineDotted")}</option>
                    </select>
                  </label>
                  <label className="segment-lap-layer-field is-opacity">
                    <span>{t("lap.workbench.layerOpacity")} · {Math.round(layer.opacity * 100)}%</span>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={1}
                      value={Math.round(layer.opacity * 100)}
                      aria-label={t("lap.workbench.layerOpacityLabel", { lap: lapLabel })}
                      onChange={(event) => onLayer(layer.id, { opacity: Number(event.target.value) / 100 })}
                    />
                  </label>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
