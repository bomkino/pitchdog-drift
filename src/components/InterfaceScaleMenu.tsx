import type {
  InterfaceScaleCommand,
  InterfaceScaleSnapshot,
} from "../lib/interfaceScale";
import { CaretDownIcon, MinusIcon, PlusIcon } from "./icons";

interface InterfaceScaleMenuProps {
  snapshot: InterfaceScaleSnapshot;
  disabled: boolean;
  onCommand: (command: InterfaceScaleCommand) => void;
}

const SCALE_CHOICES = [75, 100, 125, 150, 200] as const;

export function InterfaceScaleMenu({ snapshot, disabled, onCommand }: InterfaceScaleMenuProps) {
  const macShortcuts = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
  return (
    <details className="interface-scale-menu">
      <summary aria-label={`Interface Scale ${snapshot.label}`}>
        <span>Interface Scale</span>
        <strong>{snapshot.label}</strong>
        <CaretDownIcon className="interface-scale-caret" />
      </summary>
      <section aria-label="Interface Scale controls">
        <header>
          <strong>Interface Scale</strong>
          <span>Chrome only. Film and export stay exact.</span>
        </header>
        <div className="interface-scale-stepper">
          <button
            type="button"
            disabled={disabled || snapshot.value <= 75}
            aria-label="Smaller Interface Scale"
            onClick={() => onCommand({ type: "smaller" })}
          ><MinusIcon /></button>
          <output aria-live="polite">{snapshot.label}</output>
          <button
            type="button"
            disabled={disabled || snapshot.value >= 200}
            aria-label="Larger Interface Scale"
            onClick={() => onCommand({ type: "larger" })}
          ><PlusIcon /></button>
        </div>
        <div className="interface-scale-presets" role="group" aria-label="Interface Scale presets">
          {SCALE_CHOICES.map((value) => (
            <button
              type="button"
              key={value}
              disabled={disabled}
              aria-pressed={snapshot.value === value}
              onClick={() => onCommand({ type: "set", value })}
            >{value}%</button>
          ))}
        </div>
        <button
          type="button"
          className="interface-scale-reset"
          disabled={disabled || snapshot.value === 100}
          onClick={() => onCommand({ type: "reset" })}
        >Reset Interface Scale</button>
        <small>Shortcuts: {macShortcuts ? "⌘− / ⌘+ / ⌘0" : "Ctrl− / Ctrl+ / Ctrl0"}</small>
      </section>
    </details>
  );
}
