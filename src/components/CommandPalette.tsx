import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  searchStudioCommands,
  type StudioCommandDefinition,
  type StudioCommandWorkspace,
} from "../core/commands/studioCommandRegistry";

interface CommandPaletteProps {
  open: boolean;
  workspace: StudioCommandWorkspace;
  disabled: boolean;
  onClose: () => void;
  onRun: (command: StudioCommandDefinition) => void;
}

export function CommandPalette({ open, workspace, disabled, onClose, onRun }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const commands = useMemo(() => searchStudioCommands(query, { limit: 12 }), [query]);

  useEffect(() => {
    if (!open) {
      const previous = returnFocusRef.current;
      returnFocusRef.current = null;
      if (previous?.isConnected) requestAnimationFrame(() => previous.focus());
      return;
    }
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => setActiveIndex((index) => Math.min(index, Math.max(0, commands.length - 1))), [commands.length]);

  if (!open) return null;

  const run = (command: StudioCommandDefinition) => {
    if (disabled) return;
    onRun(command);
    onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => commands.length ? (index + 1) % commands.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => commands.length ? (index - 1 + commands.length) % commands.length : 0);
    } else if (event.key === "Enter") {
      const command = commands[activeIndex];
      if (command) {
        event.preventDefault();
        run(command);
      }
    }
  };
  const onDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="command-palette" role="dialog" aria-modal="true" aria-label="Drift commands" onKeyDown={onDialogKeyDown}>
        <div className="command-search-row">
          <span aria-hidden="true">⌘</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Direct Drift…"
            aria-label="Search commands"
            aria-controls="studio-command-results"
            aria-activedescendant={commands[activeIndex] ? `studio-command-${commands[activeIndex]!.id}` : undefined}
            onChange={(event) => { setQuery(event.currentTarget.value); setActiveIndex(0); }}
            onKeyDown={onKeyDown}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="command-context"><span>{workspace}</span><small aria-live="polite">{commands.length} command{commands.length === 1 ? "" : "s"}</small></div>
        <div id="studio-command-results" className="command-results" role="listbox" aria-label="Available commands">
          {commands.length ? commands.map((command, index) => (
            <button
              type="button"
              role="option"
              id={`studio-command-${command.id}`}
              aria-selected={activeIndex === index}
              data-active={activeIndex === index}
              key={command.id}
              disabled={disabled}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => run(command)}
            >
              <span>{command.label}</span>
              <small>{command.workspace}</small>
            </button>
          )) : <p className="command-empty">No command. Try “export”, “pace”, “guide”, or “slide”.</p>}
        </div>
        <footer><span>↑↓ choose</span><span>↵ run</span><span>⌘K close</span></footer>
      </section>
    </div>
  );
}
