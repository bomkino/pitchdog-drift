import { useState, type CSSProperties, type FocusEvent } from "react";
import {
  BACKGROUND_FAMILY_LABELS,
  backgroundCompositionIndex,
  type BackgroundStudy,
  type OpaqueBackgroundStyle,
} from "../backgrounds";
import type { BackgroundSettings } from "../model";
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon } from "./icons";

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
  curatedStudies: readonly BackgroundStudy[];
  totalStudyCount: number;
  stageAspectRatio: number;
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
  curatedStudies,
  totalStudyCount,
  stageAspectRatio,
  query,
  family,
  onQuery,
  onFamily,
  onSelect,
  onTransparent,
}: BackgroundBrowserProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<BackgroundStudy | "transparent" | null>(null);
  const opaqueFamily = background.style === "transparent" ? null : background.style as OpaqueBackgroundStyle;
  const composition = opaqueFamily ? backgroundCompositionIndex(background.seed) : 0;
  const normalizedQuery = query.trim().toLowerCase();
  const showTransparent = !libraryOpen || (
    family === "all"
    && (!normalizedQuery || "transparent clear alpha no background".includes(normalizedQuery))
  );
  const filtersActive = family !== "all" || query.length > 0;
  const currentName = background.style === "transparent"
    ? "Transparent"
    : activeStudy?.name ?? `Custom ${BACKGROUND_FAMILY_LABELS[opaqueFamily!]}`;
  const currentDescription = background.style === "transparent"
    ? "No background pixels. Slides export over alpha where output format supports it."
    : activeStudy?.description ?? "Your edited family, composition, palette, and controls.";
  const previewStudy = previewTarget && previewTarget !== "transparent" ? previewTarget : null;
  const previewing = previewTarget !== null;
  const previewTransparent = previewTarget === "transparent";
  const displayedName = previewing
    ? previewTransparent ? "Transparent" : previewStudy!.name
    : currentName;
  const displayedDescription = previewing
    ? previewTransparent
      ? "No background pixels. Slides export over alpha where the output format supports it."
      : previewStudy!.description
    : currentDescription;
  const displayedFamily = previewStudy?.family ?? opaqueFamily;
  const displayedComposition = previewStudy?.composition ?? composition;
  const displayedBackground = previewStudy?.background ?? background;
  const visibleStudies = libraryOpen ? studies : curatedStudies;
  const resultCount = visibleStudies.length + (showTransparent ? 1 : 0);
  const safeStageAspectRatio = Number.isFinite(stageAspectRatio) && stageAspectRatio > 0 ? stageAspectRatio : 16 / 9;
  const browserStyle = {
    "--background-stage-aspect": `${safeStageAspectRatio}`,
  } as CSSProperties;

  const clearPreviewOnBlur = (event: FocusEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setPreviewTarget(null);
  };

  const chooseStudy = (study: BackgroundStudy) => {
    setPreviewTarget(null);
    onSelect(study);
  };

  const chooseTransparent = () => {
    setPreviewTarget(null);
    onTransparent();
  };

  return (
    <section
      className="visual-background-browser"
      data-browser-mode={libraryOpen ? "all" : "curated"}
      data-stage-orientation={safeStageAspectRatio > 1.04 ? "landscape" : safeStageAspectRatio < 0.96 ? "portrait" : "square"}
      aria-labelledby="background-library-title"
      style={browserStyle}
    >
      <div
        className="current-background"
        data-transparent={previewing ? previewTransparent : background.style === "transparent"}
        data-previewing={previewing}
      >
        <span className="current-background-stage" aria-hidden="true">
          {displayedFamily && !previewTransparent ? (
            <BackgroundPreview
              background={displayedBackground}
              family={displayedFamily}
              composition={displayedComposition}
            />
          ) : <span className="background-preview transparent-preview" />}
        </span>
        <div>
          <span>{previewing ? "PREVIEW · NOT APPLIED" : "ON CANVAS"}</span>
          <strong>{displayedName}</strong>
          <p>{displayedDescription}</p>
          {previewing ? <small>Click the card to put it on canvas.</small> : null}
        </div>
      </div>

      <div className="background-browser-heading">
        <div>
          <h4 id="background-library-title">{libraryOpen ? "All backgrounds" : "Choose a background"}</h4>
          <p>{libraryOpen
            ? "Search the complete atlas. Hover or focus previews; click applies."
            : "A small, varied first shelf. Hover or focus previews; click applies."}</p>
        </div>
        <span aria-live="polite">{resultCount} shown</span>
      </div>

      {libraryOpen ? (
        <>
          <button
            type="button"
            className="background-library-back"
            onClick={() => { setLibraryOpen(false); setPreviewTarget(null); }}
          >
            <ArrowLeftIcon /> Curated shelf
          </button>
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
        </>
      ) : null}

      {!libraryOpen ? (
        <button
          type="button"
          className="background-browse-all"
          onClick={() => { setLibraryOpen(true); setPreviewTarget(null); }}
        >
          <span>Browse all backgrounds</span>
          <small>{totalStudyCount} directions · {Object.keys(BACKGROUND_FAMILY_LABELS).length} families</small>
          <ArrowRightIcon />
        </button>
      ) : null}

      <div className="background-study-grid" role="group" aria-label="Visual background choices">
        {showTransparent ? (
          <button
            type="button"
            className="background-study-card"
            data-background-id="transparent"
            data-active={background.style === "transparent"}
            aria-pressed={background.style === "transparent"}
            aria-label="Transparent. Clear. No background pixels."
            onPointerEnter={() => setPreviewTarget("transparent")}
            onPointerLeave={() => setPreviewTarget(null)}
            onFocus={() => setPreviewTarget("transparent")}
            onBlur={clearPreviewOnBlur}
            onClick={chooseTransparent}
          >
            {background.style === "transparent" ? <CheckCircleIcon className="background-active-icon" /> : null}
            <span className="background-card-stage" aria-hidden="true">
              <span className="background-preview transparent-preview" />
            </span>
            <span className="background-study-copy">
              <strong>Transparent</strong>
              <small>Clear · no background</small>
            </span>
          </button>
        ) : null}
        {visibleStudies.map((study) => (
          <button
            type="button"
            className="background-study-card"
            data-background-id={study.id}
            data-active={activeStudy?.id === study.id}
            aria-pressed={activeStudy?.id === study.id}
            aria-label={`${study.name}. ${study.genre}. ${study.description}`}
            key={study.id}
            onPointerEnter={() => setPreviewTarget(study)}
            onPointerLeave={() => setPreviewTarget(null)}
            onFocus={() => setPreviewTarget(study)}
            onBlur={clearPreviewOnBlur}
            onClick={() => chooseStudy(study)}
          >
            {activeStudy?.id === study.id ? <CheckCircleIcon className="background-active-icon" /> : null}
            <span className="background-card-stage" aria-hidden="true">
              <BackgroundStudyPreview study={study} />
            </span>
            <span className="background-study-copy">
              <strong>{study.name}</strong>
              <small>{study.genre} · {BACKGROUND_FAMILY_LABELS[study.family]}</small>
            </span>
          </button>
        ))}
      </div>

      {!visibleStudies.length && !showTransparent ? (
        <div className="background-empty" role="status">
          <strong>No matching background.</strong>
          <span>Try another word or clear filters.</span>
        </div>
      ) : null}

    </section>
  );
}
