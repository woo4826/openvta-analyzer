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
}

export function Tabs({ items, value, onChange, ariaLabel, className }: TabsProps) {
  return (
    <div className={cx("tabs", className)} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          role="tab"
          aria-selected={item.id === value}
          className={cx("tab", item.id === value && "active")}
          disabled={item.disabled}
          onClick={() => onChange(item.id)}
        >
          <span>{item.label}</span>
          {item.badge ? <span className="tab-badge">{item.badge}</span> : null}
        </button>
      ))}
    </div>
  );
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
