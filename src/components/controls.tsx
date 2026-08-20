import { useEffect, useState, type ReactNode } from "react";

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  hint?: string;
  onChange: (value: number) => void;
}

export function RangeField({ label, value, min, max, step, unit = "", decimals = 0, hint, onChange }: RangeFieldProps) {
  const id = `range-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <label className="control-field range-field" htmlFor={id}>
      <span className="control-label">
        <span>{label}</span>
        <output htmlFor={id}>{value.toFixed(decimals)}{unit}</output>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  onChange: (value: number) => void;
}

export function NumberField({ label, value, min, max, step = 1, unit = "", hint, onChange }: NumberFieldProps) {
  const id = `number-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    const next = Number((min + Math.round((clamped - min) / step) * step).toFixed(6));
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <label className="control-field number-field" htmlFor={id}>
      <span>{label}</span>
      <span className="number-input-wrap">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(event) => {
            const nextDraft = event.currentTarget.value;
            setDraft(nextDraft);
            const next = event.currentTarget.valueAsNumber;
            if (
              Number.isFinite(next)
              && next >= min
              && next <= max
              && !event.currentTarget.validity.stepMismatch
            ) onChange(next);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(String(value));
            }
          }}
        />
        {unit ? <small>{unit}</small> : null}
      </span>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <fieldset className="control-field segmented-field">
      <legend>{label}</legend>
      <div className="segmented-control">
        {options.map((option) => (
          <label key={String(option.value)} data-active={value === option.value}>
            <input
              type="radio"
              name={label}
              value={String(option.value)}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface SelectFieldProps<T extends string | number> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  hint?: string;
  onChange: (value: T) => void;
}

export function SelectField<T extends string | number>({ label, value, options, hint, onChange }: SelectFieldProps<T>) {
  return (
    <label className="control-field select-field">
      <span>{label}</span>
      <select value={String(value)} onChange={(event) => {
        const option = options.find((entry) => String(entry.value) === event.currentTarget.value);
        if (option) onChange(option.value);
      }}>
        {options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
      </select>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

interface SwitchFieldProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}

export function SwitchField({ label, checked, disabled = false, hint, onChange }: SwitchFieldProps) {
  return (
    <label className="control-field switch-field">
      <span>
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <label className="control-field color-field">
      <span>{label}</span>
      <span className="color-input-wrap">
        <input type="color" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}

interface InspectorGroupProps {
  title: string;
  eyebrow?: string;
  open?: boolean;
  children: ReactNode;
}

export function InspectorGroup({ title, eyebrow, open = false, children }: InspectorGroupProps) {
  return (
    <details className="inspector-group" open={open}>
      <summary>
        <span>{title}</span>
        {eyebrow ? <small>{eyebrow}</small> : null}
      </summary>
      <div className="inspector-group-body">{children}</div>
    </details>
  );
}
