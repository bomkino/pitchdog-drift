import { useState } from "react";
import type { DirectorLook } from "../lib/lookLibrary";

interface LookLibrarySectionProps {
  looks: readonly DirectorLook[];
  busy: boolean;
  onSave: (name: string) => void;
  onApply: (look: DirectorLook) => void;
  onRemove: (look: DirectorLook) => void;
}

export function LookLibrarySection({
  looks,
  busy,
  onSave,
  onApply,
  onRemove,
}: LookLibrarySectionProps) {
  const [name, setName] = useState("");

  return (
    <details className="director-section">
      <summary>
        <span>My looks</span>
        <small>{looks.length === 0 ? "Local signature library" : `${looks.length} saved`}</small>
      </summary>
      <div className="director-look-library">
        <div className="director-look-save">
          <label>
            <span>Look name</span>
            <input
              type="text"
              value={name}
              maxLength={48}
              autoComplete="off"
              placeholder="e.g. pitch.dog quiet glass"
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (name.trim()) onSave(name);
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy || name.trim().length === 0}
            onClick={() => onSave(name)}
          >
            Save current look
          </button>
          <small>Stores visual direction only. Media, presenter placement, master shape, duration, loop policy, and accessibility output stay with the destination project.</small>
        </div>

        {looks.length > 0 ? (
          <div className="director-look-list">
            {looks.map((look) => (
              <article key={look.id}>
                <button
                  type="button"
                  className="director-look-apply"
                  disabled={busy}
                  onClick={() => onApply(look)}
                >
                  <strong>{look.name}</strong>
                  <span>{look.state.theme ?? "Custom direction"}</span>
                  <small>{look.state.controls.length} controls · {look.state.segmented.length} choices</small>
                </button>
                <button
                  type="button"
                  className="director-look-remove"
                  aria-label={`Delete ${look.name}`}
                  disabled={busy}
                  onClick={() => onRemove(look)}
                >
                  ×
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="director-look-empty">Tune one authored move until it feels like yours, then save it here for the next deck.</p>
        )}
      </div>
    </details>
  );
}
