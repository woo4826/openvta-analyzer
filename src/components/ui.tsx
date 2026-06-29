import { useRef } from "react";
import type * as React from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
type ButtonVariant = "default" | "primary" | "ghost";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface PanelProps {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({ title, eyebrow, actions, children, className, bodyClassName }: PanelProps) {
  const hasHeader = Boolean(title || eyebrow || actions);

  return (
    <section className={cx("panel", className)}>
      {hasHeader ? (
        <div className="panel-header">
          <div>
            {eyebrow ? <span className="panel-eyebrow">{eyebrow}</span> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
          {actions ? <div className="row-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cx("panel-body", bodyClassName)}>{children}</div>
    </section>
  );
}

export interface MetricProps {
  label: React.ReactNode;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: Tone;
  className?: string;
}

export function Metric({ label, value, detail, tone = "neutral", className }: MetricProps) {
  return (
    <div className={cx("metric", `metric-${tone}`, className)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}

export function StatusBadge({ children, tone = "neutral", className }: StatusBadgeProps) {
  return <span className={cx("status-badge", `status-badge-${tone}`, className)}>{children}</span>;
}

export interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  variant?: ButtonVariant;
}

export function ToolbarButton({ icon, variant = "default", className, children, type = "button", ...props }: ToolbarButtonProps) {
  return (
    <button type={type} className={cx("button", variant !== "default" && variant, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

export interface FilePickerButtonProps {
  children: React.ReactNode;
  accept: string;
  onFiles: (files: File[]) => void;
  className?: string;
  icon?: React.ReactNode;
  multiple?: boolean;
  variant?: ButtonVariant;
}

export function FilePickerButton({
  children,
  accept,
  onFiles,
  className,
  icon,
  multiple = false,
  variant = "default",
}: FilePickerButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <button
        type="button"
        className={cx("button", variant !== "default" && variant, className)}
        onClick={() => inputRef.current?.click()}
      >
        {icon}
        {children}
      </button>
      <input
        ref={inputRef}
        className="visually-hidden-file-input"
        tabIndex={-1}
        aria-hidden="true"
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />
    </>
  );
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: React.ReactNode;
  variant?: ButtonVariant;
}

export function IconButton({ label, icon, variant = "default", className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx("button", "icon-button", variant !== "default" && variant, className)}
      aria-label={label}
      title={props.title ?? label}
      {...props}
    >
      {icon}
    </button>
  );
}

export interface TabItem {
  id: string;
  label: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  getPanelId?: (id: string) => string;
  getTabId?: (id: string) => string;
}

export function Tabs({ items, value, onChange, ariaLabel, className, getPanelId, getTabId }: TabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(currentIndex: number, direction: 1 | -1) {
    const nextIndex = nextEnabledTabIndex(items, currentIndex, direction);
    if (nextIndex === -1) {
      return;
    }
    onChange(items[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  function focusTab(index: number) {
    if (!items[index] || items[index].disabled) {
      return;
    }
    onChange(items[index].id);
    tabRefs.current[index]?.focus();
  }

  return (
    <div className={cx("tabs", className)} role="tablist" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <button
          type="button"
          key={item.id}
          role="tab"
          ref={(element) => {
            tabRefs.current[index] = element;
          }}
          id={getTabId?.(item.id)}
          aria-controls={getPanelId?.(item.id)}
          aria-selected={item.id === value}
          tabIndex={item.id === value ? 0 : -1}
          className={cx("tab", item.id === value && "active")}
          disabled={item.disabled}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              moveFocus(index, 1);
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              moveFocus(index, -1);
            }
            if (event.key === "Home") {
              event.preventDefault();
              focusTab(firstEnabledTabIndex(items));
            }
            if (event.key === "End") {
              event.preventDefault();
              focusTab(lastEnabledTabIndex(items));
            }
          }}
        >
          <span>{item.label}</span>
          {item.badge ? <span className="tab-badge">{item.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

function firstEnabledTabIndex(items: TabItem[]): number {
  return items.findIndex((item) => !item.disabled);
}

function lastEnabledTabIndex(items: TabItem[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!items[index].disabled) {
      return index;
    }
  }
  return -1;
}

function nextEnabledTabIndex(items: TabItem[], currentIndex: number, direction: 1 | -1): number {
  if (!items.length) {
    return -1;
  }
  for (let offset = 1; offset <= items.length; offset += 1) {
    const index = (currentIndex + offset * direction + items.length) % items.length;
    if (!items[index].disabled) {
      return index;
    }
  }
  return -1;
}

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  selectionRole?: "radio" | "button";
}

export function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  selectionRole = "radio",
}: SegmentedControlProps) {
  const isRadioGroup = selectionRole === "radio";

  return (
    <div className={cx("segmented", className)} role={isRadioGroup ? "radiogroup" : undefined} aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          role={isRadioGroup ? "radio" : undefined}
          aria-checked={isRadioGroup ? option.value === value : undefined}
          aria-pressed={!isRadioGroup ? option.value === value : undefined}
          className={option.value === value ? "active" : undefined}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface FieldProps {
  label: React.ReactNode;
  children: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
}

export function Field({ label, children, htmlFor, hint, error, required = false, className }: FieldProps) {
  return (
    <div className={cx("field", Boolean(error) && "field-error", className)}>
      <label htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint ? <small>{hint}</small> : null}
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}

export interface EmptyStateProps {
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, children, icon, actions, className }: EmptyStateProps) {
  return (
    <div className={cx("empty-state", className)}>
      {icon ? <div className="empty-state-icon">{icon}</div> : null}
      {title ? <strong>{title}</strong> : null}
      {children ? <p>{children}</p> : null}
      {actions ? <div className="row-actions">{actions}</div> : null}
    </div>
  );
}

export interface WarningBannerProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  tone?: "warning" | "danger";
  className?: string;
}

export function WarningBanner({ title, children, tone = "warning", className }: WarningBannerProps) {
  return (
    <div className={cx("warning-item", "warning-banner", `warning-banner-${tone}`, className)} role="alert">
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}
