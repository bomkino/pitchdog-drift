import { useEffect, useId, useState, type ReactNode } from "react";

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

interface RangeNumberFieldProps {
  label: string;
  value: number;
  softMin: number;
  softMax: number;
  hardMin: number;
  hardMax: number;
  step: number;
  unit?: string;
  decimals?: number;
  hint?: string;
  onChange: (value: number) => void;
}

export function RangeField({ label, value, min, max, step, unit = "", decimals = 0, hint, onChange }: RangeFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="control-field range-field">
      <span className="control-label">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{value.toFixed(decimals)}{unit}</output>
      </span>
      <input
        id={id}
        aria-describedby={hint ? hintId : undefined}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      {hint ? <small id={hintId}>{hint}</small> : null}
    </div>
  );
}

/**
 * Keeps the everyday slider rail tasteful while allowing exact extreme values.
 * The typed value is authoritative; values outside the soft rail pin its thumb
 * to the nearest edge instead of being silently clamped back to the taste range.
 */
export function RangeNumberField({
  label,
  value,
  softMin,
  softMax,
  hardMin,
  hardMax,
  step,
  unit = "",
  decimals = 0,
  hint,
  onChange,
}: RangeNumberFieldProps) {
  const id = useId();
  const numberId = `${id}-number`;
  const unitId = `${id}-unit`;
  const hintId = `${id}-hint`;
  const describedBy = [unit ? unitId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commitDraft = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(hardMax, Math.max(hardMin, parsed));
    const next = Number((hardMin + Math.round((clamped - hardMin) / step) * step).toFixed(6));
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const railValue = Math.min(softMax, Math.max(softMin, value));

  return (
    <div className="control-field range-field range-number-field">
      <span className="control-label">
        <label htmlFor={id}>{label}</label>
        <span className="range-number-input-wrap">
          <input
            id={numberId}
            aria-label={`${label} exact value`}
            aria-describedby={describedBy}
            type="number"
            inputMode="decimal"
            min={hardMin}
            max={hardMax}
            step={step}
            value={draft}
            onChange={(event) => {
              const nextDraft = event.currentTarget.value;
              setDraft(nextDraft);
              const next = event.currentTarget.valueAsNumber;
              if (
                Number.isFinite(next)
                && next >= hardMin
                && next <= hardMax
                && !event.currentTarget.validity.stepMismatch
              ) onChange(next);
            }}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(String(value));
              }
            }}
          />
          {unit ? <small id={unitId}>{unit}</small> : null}
        </span>
      </span>
      <input
        id={id}
        aria-describedby={hint ? hintId : undefined}
        type="range"
        min={softMin}
        max={softMax}
        step={step}
        value={railValue}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <small className="range-number-readout" aria-hidden="true">
        {value.toFixed(decimals)}{unit}
      </small>
      {hint ? <small id={hintId}>{hint}</small> : null}
    </div>
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
  const id = useId();
  const unitId = `${id}-unit`;
  const hintId = `${id}-hint`;
  const describedBy = [unit ? unitId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
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
    <div className="control-field number-field">
      <label className="control-field-label" htmlFor={id}>{label}</label>
      <span className="number-input-wrap">
        <input
          id={id}
          aria-describedby={describedBy}
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
        {unit ? <small id={unitId}>{unit}</small> : null}
      </span>
      {hint ? <small id={hintId}>{hint}</small> : null}
    </div>
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
  onChange: (value: T) => void;
}

export function SelectField<T extends string | number>({ label, value, options, onChange }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="control-field select-field">
      <label className="control-field-label" htmlFor={id}>{label}</label>
      <select id={id} value={String(value)} onChange={(event) => {
        const option = options.find((entry) => String(entry.value) === event.currentTarget.value);
        if (option) onChange(option.value);
      }}>
        {options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
      </select>
    </div>
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
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="control-field switch-field">
      <span>
        <label className="control-field-label" htmlFor={id}>{label}</label>
        {hint ? <small id={hintId}>{hint}</small> : null}
      </span>
      <input id={id} aria-describedby={hint ? hintId : undefined} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
    </div>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const id = useId();
  return (
    <div className="control-field color-field">
      <label className="control-field-label" htmlFor={id}>{label}</label>
      <span className="color-input-wrap">
        <input id={id} type="color" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
        <code>{value.toUpperCase()}</code>
      </span>
    </div>
  );
}

interface InspectorGroupProps {
  title: string;
  eyebrow?: string;
  description?: string;
  open?: boolean;
  children: ReactNode;
}

export function InspectorGroup({ title, eyebrow, description, open = false, children }: InspectorGroupProps) {
  const [expanded, setExpanded] = useState(open);

  return (
    <details
      className="inspector-group"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <span>{title}</span>
        {eyebrow ? <small>{eyebrow}</small> : null}
      </summary>
      <div className="inspector-group-body">
        {description ? <p className="inspector-group-description">{description}</p> : null}
        {children}
      </div>
    </details>
  );
}
