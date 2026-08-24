import type { CSSProperties } from "react";
import {
  BACKGROUND_FAMILY_LABELS,
  backgroundCompositionIndex,
  type BackgroundStudy,
  type OpaqueBackgroundStyle,
} from "../backgrounds";
import type { BackgroundSettings } from "../model";

type PreviewVariables = CSSProperties & {
  "--background-a": string;
  "--background-b": string;
  "--background-accent": string;
  "--preview-x": string;
  "--preview-y": string;
  "--preview-angle": string;
  "--preview-scale": string;
};

function previewVariables(background: BackgroundSettings, composition: number): PreviewVariables {
  return {
    "--background-a": background.colorA,
    "--background-b": background.colorB,
    "--background-accent": background.accent,
    "--preview-x": `${18 + (composition * 19) % 64}%`,
    "--preview-y": `${22 + (composition * 23) % 58}%`,
    "--preview-angle": `${-24 + composition * 17}deg`,
    "--preview-scale": `${12 + (composition % 4) * 3}px`,
  };
}

interface BackgroundPreviewProps {
  background: BackgroundSettings;
  family: OpaqueBackgroundStyle;
  composition: number;
  className?: string;
}

export function BackgroundPreview({ background, family, composition, className = "" }: BackgroundPreviewProps) {
  return (
    <span
      className={`background-preview ${className}`.trim()}
      data-family={family}
      data-composition={composition}
      style={previewVariables(background, composition)}
      aria-hidden="true"
    >
      <i />
    </span>
  );
}

interface BackgroundStudyPreviewProps {
  study: BackgroundStudy;
  className?: string;
}

export function BackgroundStudyPreview({ study, className }: BackgroundStudyPreviewProps) {
  return (
    <BackgroundPreview
      background={study.background}
      family={study.family}
      composition={study.composition}
      className={className}
    />
  );
}

interface BackgroundBrowserProps {
  background: BackgroundSettings;
  activeStudy: BackgroundStudy | null;
  studies: readonly BackgroundStudy[];
  query: string;
  family: "all" | OpaqueBackgroundStyle;
  onQuery: (query: string) => void;
  onFamily: (family: "all" | OpaqueBackgroundStyle) => void;
  onSelect: (study: BackgroundStudy) => void;
  onTransparent: () => void;
}

export function BackgroundBrowser({
  background,
  activeStudy,
  studies,
  query,
  family,
  onQuery,
  onFamily,
  onSelect,
  onTransparent,
}: BackgroundBrowserProps) {
  const opaqueFamily = background.style === "transparent" ? null : background.style as OpaqueBackgroundStyle;
  const composition = opaqueFamily ? backgroundCompositionIndex(background.seed) : 0;
  const normalizedQuery = query.trim().toLowerCase();
  const showTransparent = family === "all"
    && (!normalizedQuery || "transparent clear alpha no background".includes(normalizedQuery));
  const filtersActive = family !== "all" || query.length > 0;
  const currentName = background.style === "transparent"
    ? "Transparent"
    : activeStudy?.name ?? "Custom direction";
  const currentDescription = background.style === "transparent"
    ? "No background pixels. Slides export over alpha where output format supports it."
    : activeStudy?.description ?? "Your edited family, composition, palette, and controls.";

  return (
    <section className="visual-background-browser" aria-labelledby="background-library-title">
      <div className="current-background" data-transparent={background.style === "transparent"}>
        {opaqueFamily ? (
          <BackgroundPreview background={background} family={opaqueFamily} composition={composition} />
        ) : <span className="background-preview transparent-preview" aria-hidden="true" />}
        <div>
          <span>ON CANVAS</span>
          <strong>{currentName}</strong>
          <p>{currentDescription}</p>
        </div>
      </div>

      <div className="background-browser-heading">
        <div>
          <h4 id="background-library-title">Background library</h4>
          <p>See a direction before choosing it. Canvas updates live.</p>
        </div>
        <span aria-live="polite">{studies.length}{showTransparent ? " + clear" : ""}</span>
      </div>

      <div className="background-browser-tools">
        <label>
          <span>Find a look</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.currentTarget.value)}
            placeholder="Try horror, paper, blue…"
          />
        </label>
        <label>
          <span>Visual family</span>
          <select value={family} onChange={(event) => onFamily(event.currentTarget.value as "all" | OpaqueBackgroundStyle)}>
            <option value="all">All {Object.keys(BACKGROUND_FAMILY_LABELS).length} families</option>
            {Object.entries(BACKGROUND_FAMILY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {filtersActive ? (
        <button type="button" className="background-clear-filters" onClick={() => { onQuery(""); onFamily("all"); }}>
          Clear filters
        </button>
      ) : null}

      <div className="background-study-grid" role="group" aria-label="Visual background choices">
        {showTransparent ? (
          <button
            type="button"
            className="background-study-card"
            data-active={background.style === "transparent"}
            aria-pressed={background.style === "transparent"}
            onClick={onTransparent}
          >
            <span className="background-preview transparent-preview" aria-hidden="true" />
            <span className="background-study-copy">
              <strong>Transparent</strong>
              <small>Clear · no background</small>
            </span>
          </button>
        ) : null}
        {studies.map((study) => (
          <button
            type="button"
            className="background-study-card"
            data-active={activeStudy?.id === study.id}
            aria-pressed={activeStudy?.id === study.id}
            aria-label={`${study.name}. ${study.genre}. ${study.description}`}
            key={study.id}
            onClick={() => onSelect(study)}
          >
            <BackgroundStudyPreview study={study} />
            <span className="background-study-copy">
              <strong>{study.name}</strong>
              <small>{study.genre} · {BACKGROUND_FAMILY_LABELS[study.family]}</small>
            </span>
          </button>
        ))}
      </div>

      {!studies.length && !showTransparent ? (
        <div className="background-empty" role="status">
          <strong>No matching background.</strong>
          <span>Try another word or clear filters.</span>
        </div>
      ) : null}
    </section>
  );
}
