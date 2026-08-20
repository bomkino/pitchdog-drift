import { useMemo, useState, type ChangeEvent, type CSSProperties } from "react";
import {
  BACKGROUND_COMPOSITION_COUNT,
  BACKGROUND_COMPOSITIONS,
  BACKGROUND_FAMILY_LABELS,
  BACKGROUND_LANES,
  BACKGROUND_PALETTES,
  BACKGROUND_PRESENCE_PROFILES,
  BACKGROUND_RECUTS_PER_TREATMENT,
  BACKGROUND_STUDIES,
  BACKGROUND_TREATMENTS,
  applyBackgroundPresence,
  applyBackgroundStudy,
  backgroundCompositionIndex,
  backgroundRecut,
  backgroundTreatmentIndex,
  cycleBackgroundStudy,
  filterBackgroundStudies,
  matchingBackgroundPalette,
  matchingBackgroundPresence,
  matchingBackgroundStudy,
  matchingBackgroundStudyStructure,
  surpriseBackgroundStudy,
  withBackgroundComposition,
  withBackgroundPalette,
  withBackgroundRecut,
  withBackgroundTreatment,
  type BackgroundFamilyFilter,
  type BackgroundLaneId,
  type BackgroundStudy,
} from "../backgrounds";
import type { BackgroundSettings, BackgroundStyle, StudioSettings } from "../model";
import { ColorField, InspectorGroup, RangeField, Segmented, SelectField, SwitchField } from "./controls";
import "./BackgroundDirector.css";

interface BackgroundDirectorProps {
  settings: StudioSettings;
  onSettings: (settings: StudioSettings) => void;
}

const FAMILY_FILTERS: readonly BackgroundFamilyFilter[] = [
  "all",
  "solid",
  "gradient",
  "aura",
  "paper",
  "void",
];

function studyPreviewStyle(study: BackgroundStudy): CSSProperties {
  const turn = 18 + study.composition * 19;
  const x = 18 + ((study.variation * 17) % 64);
  const y = 20 + ((study.variation * 29) % 58);
  return {
    "--atlas-a": study.background.colorA,
    "--atlas-b": study.background.colorB,
    "--atlas-accent": study.background.accent,
    "--atlas-turn": `${turn}deg`,
    "--atlas-x": `${x}%`,
    "--atlas-y": `${y}%`,
  } as CSSProperties;
}

function familyFilterLabel(family: BackgroundFamilyFilter): string {
  return family === "all" ? "All" : BACKGROUND_FAMILY_LABELS[family];
}

function backgroundSettingsEqual(a: BackgroundSettings, b: BackgroundSettings): boolean {
  return (
    a.style === b.style
    && a.colorA === b.colorA
    && a.colorB === b.colorB
    && a.accent === b.accent
    && a.intensity === b.intensity
    && a.motion === b.motion
    && a.grain === b.grain
    && a.vignette === b.vignette
    && a.seed === b.seed
  );
}

export function BackgroundDirector({ settings, onSettings }: BackgroundDirectorProps) {
  const initialFamily: BackgroundFamilyFilter = settings.background.style === "transparent"
    ? "all"
    : settings.background.style;
  const [familyFilter, setFamilyFilter] = useState<BackgroundFamilyFilter>(initialFamily);
  const [lane, setLane] = useState<BackgroundLaneId>("all");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [preservePalette, setPreservePalette] = useState(false);
  const [preserveTreatment, setPreserveTreatment] = useState(false);
  const [browseCheckpoint, setBrowseCheckpoint] = useState<BackgroundSettings | null>(null);

  const selectedStudy = matchingBackgroundStudy(settings.background);
  const selectedDirection = matchingBackgroundStudyStructure(settings.background);
  const selectedPalette = matchingBackgroundPalette(settings.background);
  const selectedPresence = matchingBackgroundPresence(settings.background);
  const compositionIndex = backgroundCompositionIndex(settings.background.seed);
  const treatmentIndex = backgroundTreatmentIndex(settings.background.seed);
  const recut = backgroundRecut(settings.background.seed);
  const opaqueStyle = settings.background.style === "transparent" ? null : settings.background.style;
  const compositions = opaqueStyle ? BACKGROUND_COMPOSITIONS[opaqueStyle] : [];
  const activeComposition = compositions[compositionIndex];
  const activeTreatment = BACKGROUND_TREATMENTS[treatmentIndex];

  const filteredStudies = useMemo(
    () => filterBackgroundStudies({ family: familyFilter, lane, query }),
    [familyFilter, lane, query],
  );
  const visibleStudies = showAll || filteredStudies.length <= 16
    ? filteredStudies
    : filteredStudies.slice(0, 16);
  const applyOptions = { preservePalette, preserveTreatment };
  const checkpointChanged = browseCheckpoint
    ? !backgroundSettingsEqual(browseCheckpoint, settings.background)
    : false;

  const commitSettings = (next: StudioSettings) => {
    if (!browseCheckpoint) setBrowseCheckpoint({ ...settings.background });
    onSettings(next);
  };

  const patchBackground = (values: Partial<BackgroundSettings>) => {
    commitSettings({
      ...settings,
      background: { ...settings.background, ...values },
    });
  };

  const setBackgroundStyle = (style: BackgroundStyle) => {
    commitSettings({
      ...settings,
      stage: { ...settings.stage, transparent: style === "transparent" },
      background: { ...settings.background, style },
    });
    if (style !== "transparent") setFamilyFilter(style);
  };

  const applyStudy = (study: BackgroundStudy) => {
    commitSettings(applyBackgroundStudy(settings, study, applyOptions));
  };

  const restoreCheckpoint = () => {
    if (!browseCheckpoint) return;
    onSettings({
      ...settings,
      stage: { ...settings.stage, transparent: browseCheckpoint.style === "transparent" },
      background: { ...browseCheckpoint },
    });
    setBrowseCheckpoint(null);
  };

  const summary = settings.background.style === "transparent"
    ? "Transparent"
    : selectedStudy?.name
      ?? (selectedDirection ? `${selectedDirection.name} · customised` : null)
      ?? `${activeComposition?.name ?? BACKGROUND_FAMILY_LABELS[settings.background.style]} · ${activeTreatment?.name ?? "Custom"}`;

  return (
    <InspectorGroup title="Atmosphere" eyebrow={summary}>
      <div className="output-spec atlas-receipt">
        <span>BACKGROUND ATLAS</span>
        <strong>
          {BACKGROUND_STUDIES.length} studies · {BACKGROUND_COMPOSITION_COUNT} compositions · {BACKGROUND_PALETTES.length} palettes
        </strong>
        <small>
          Structure, grade, recut and presence are independent. Every choice is deterministic, local and seamless-safe.
        </small>
      </div>

      <SelectField
        label="Background"
        value={settings.background.style}
        options={[
          { value: "transparent", label: "Transparent" },
          { value: "solid", label: "Solid field" },
          { value: "gradient", label: "Gradient weather" },
          { value: "aura", label: "Luminous aura" },
          { value: "paper", label: "Printed matter" },
          { value: "void", label: "Darkroom void" },
        ]}
        onChange={setBackgroundStyle}
      />

      <section className="atlas-browser" aria-labelledby="atlas-browser-title">
        <div className="atlas-section-heading">
          <div>
            <span>START WITH A FEELING</span>
            <strong id="atlas-browser-title">Director’s picks</strong>
          </div>
          <small aria-live="polite">{visibleStudies.length} of {filteredStudies.length}</small>
        </div>

        <label className="atlas-search">
          <span>Find a mood, material or genre</span>
          <input
            type="search"
            value={query}
            placeholder="Try “paper”, “horror”, “ocean”…"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setQuery(event.currentTarget.value);
              setShowAll(false);
            }}
          />
        </label>

        <fieldset className="atlas-filter">
          <legend>Family</legend>
          <div className="atlas-chip-row">
            {FAMILY_FILTERS.map((family) => (
              <button
                type="button"
                key={family}
                aria-pressed={familyFilter === family}
                onClick={() => {
                  setFamilyFilter(family);
                  setShowAll(false);
                }}
              >
                {familyFilterLabel(family)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="atlas-filter">
          <legend>Feeling</legend>
          <div className="atlas-chip-row">
            {BACKGROUND_LANES.map((entry) => (
              <button
                type="button"
                key={entry.id}
                aria-pressed={lane === entry.id}
                onClick={() => {
                  setLane(entry.id);
                  setShowAll(false);
                }}
              >
                {entry.name}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="atlas-preserve-row">
          <SwitchField
            label="Keep current colours"
            checked={preservePalette}
            hint="Switch structure without losing a colour direction you already like."
            onChange={setPreservePalette}
          />
          <SwitchField
            label="Keep current treatment"
            checked={preserveTreatment}
            hint="Quiet, cinematic, graphic or weathered stays constant while you browse."
            onChange={setPreserveTreatment}
          />
        </div>

        <div className="atlas-jump-row" aria-label="Browse filtered background studies">
          <button
            type="button"
            disabled={filteredStudies.length === 0}
            onClick={() => commitSettings(cycleBackgroundStudy(settings, filteredStudies, -1, applyOptions))}
          >
            Previous
          </button>
          <button
            type="button"
            className="atlas-surprise"
            disabled={filteredStudies.length === 0}
            onClick={() => commitSettings(surpriseBackgroundStudy(settings, filteredStudies, applyOptions))}
          >
            Surprise me
          </button>
          <button
            type="button"
            disabled={filteredStudies.length === 0}
            onClick={() => commitSettings(cycleBackgroundStudy(settings, filteredStudies, 1, applyOptions))}
          >
            Next
          </button>
        </div>

        <div className="atlas-history-row">
          <span>{browseCheckpoint ? "Starting field saved." : "Your first change creates a restore point."}</span>
          <div>
            <button
              type="button"
              disabled={!checkpointChanged}
              onClick={restoreCheckpoint}
            >
              Restore start
            </button>
            <button
              type="button"
              onClick={() => setBrowseCheckpoint({ ...settings.background })}
            >
              Mark current
            </button>
          </div>
        </div>

        {visibleStudies.length > 0 ? (
          <div className="atlas-study-grid">
            {visibleStudies.map((study) => (
              <button
                type="button"
                className="atlas-study-card"
                key={study.id}
                data-family={study.family}
                data-composition={study.composition}
                data-edition={study.edition}
                aria-pressed={selectedDirection?.id === study.id}
                aria-label={`${study.name}. ${study.genre}. ${study.description}`}
                onClick={() => applyStudy(study)}
              >
                <span className="atlas-study-preview" style={studyPreviewStyle(study)} aria-hidden="true">
                  <span />
                </span>
                <span className="atlas-study-copy">
                  <strong>{study.name}</strong>
                  <small>{study.genre} · {study.edition === "signature" ? "signature" : "counterpoint"}</small>
                  <em>{study.description}</em>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="atlas-empty" role="status">
            <strong>No matching studies.</strong>
            <span>Clear the search or widen the family and feeling filters.</span>
          </div>
        )}

        {filteredStudies.length > 16 ? (
          <button type="button" className="atlas-show-all" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show fewer studies" : `Show all ${filteredStudies.length} studies`}
          </button>
        ) : null}
      </section>

      {opaqueStyle ? (
        <>
          <section className="atlas-expert" aria-labelledby="atlas-expert-title">
            <div className="atlas-section-heading">
              <div>
                <span>DIRECT THE FIELD</span>
                <strong id="atlas-expert-title">Structure and treatment</strong>
              </div>
            </div>

            <SelectField
              label="Composition"
              value={compositionIndex}
              options={compositions.map((composition, index) => ({ value: index, label: composition.name }))}
              onChange={(composition) => patchBackground(withBackgroundComposition(settings.background, composition))}
            />

            <Segmented
              label="Treatment"
              value={treatmentIndex}
              options={BACKGROUND_TREATMENTS.map((treatment) => ({
                value: treatment.index,
                label: treatment.name.replace(" frame", "").replace(" print", "").replace(" cut", "").replace(" stock", ""),
              }))}
              onChange={(treatment) => patchBackground(withBackgroundTreatment(settings.background, treatment))}
            />
            <p className="atlas-description">{activeTreatment?.description}</p>

            <RangeField
              label="Recut"
              value={recut}
              min={0}
              max={BACKGROUND_RECUTS_PER_TREATMENT - 1}
              step={1}
              hint={activeComposition?.description}
              onChange={(value) => patchBackground(withBackgroundRecut(settings.background, value))}
            />

            <div className="atlas-jump-row">
              <button
                type="button"
                onClick={() => patchBackground(withBackgroundRecut(
                  settings.background,
                  (recut - 1 + BACKGROUND_RECUTS_PER_TREATMENT) % BACKGROUND_RECUTS_PER_TREATMENT,
                ))}
              >
                Earlier recut
              </button>
              <button
                type="button"
                className="atlas-surprise"
                onClick={() => patchBackground(withBackgroundRecut(
                  settings.background,
                  (recut + 7) % BACKGROUND_RECUTS_PER_TREATMENT,
                ))}
              >
                Recut atmosphere
              </button>
              <button
                type="button"
                onClick={() => patchBackground(withBackgroundRecut(
                  settings.background,
                  (recut + 1) % BACKGROUND_RECUTS_PER_TREATMENT,
                ))}
              >
                Later recut
              </button>
            </div>
          </section>

          <section className="atlas-expert" aria-labelledby="atlas-presence-title">
            <div className="atlas-section-heading">
              <div>
                <span>KEEP THE DECK IN CHARGE</span>
                <strong id="atlas-presence-title">Presence</strong>
              </div>
              <small>{selectedPresence?.name ?? "Custom"}</small>
            </div>
            <div className="atlas-presence-buttons">
              {BACKGROUND_PRESENCE_PROFILES.map((profile) => (
                <button
                  type="button"
                  key={profile.id}
                  aria-pressed={selectedPresence?.id === profile.id}
                  onClick={() => patchBackground(applyBackgroundPresence(settings.background, profile))}
                >
                  <strong>{profile.name}</strong>
                  <small>{profile.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="atlas-expert" aria-labelledby="atlas-palette-title">
            <div className="atlas-section-heading">
              <div>
                <span>GRADE THE WORLD</span>
                <strong id="atlas-palette-title">Palette</strong>
              </div>
              <small>{selectedPalette?.name ?? "Custom"}</small>
            </div>
            <div className="atlas-palette-grid">
              {BACKGROUND_PALETTES.map((palette) => (
                <button
                  type="button"
                  key={palette.id}
                  aria-label={`${palette.name}. ${palette.description}`}
                  aria-pressed={selectedPalette?.id === palette.id}
                  title={`${palette.name} — ${palette.description}`}
                  style={{
                    "--palette-a": palette.colorA,
                    "--palette-b": palette.colorB,
                    "--palette-accent": palette.accent,
                  } as CSSProperties}
                  onClick={() => patchBackground(withBackgroundPalette(settings.background, palette))}
                >
                  <span aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          <ColorField label="Ground" value={settings.background.colorA} onChange={(colorA) => patchBackground({ colorA })} />
          <ColorField label="Field" value={settings.background.colorB} onChange={(colorB) => patchBackground({ colorB })} />
          <ColorField label="Light" value={settings.background.accent} onChange={(accent) => patchBackground({ accent })} />
          <RangeField label="Intensity" value={settings.background.intensity * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patchBackground({ intensity: value / 100 })} />
          <RangeField label="Background breath" value={settings.background.motion * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patchBackground({ motion: value / 100 })} />
          <RangeField label="Grain" value={settings.background.grain * 100} min={0} max={60} step={1} unit="%" onChange={(value) => patchBackground({ grain: value / 100 })} />
          <RangeField label="Vignette" value={settings.background.vignette * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patchBackground({ vignette: value / 100 })} />
        </>
      ) : (
        <div className="atlas-transparent-note">
          <strong>True transparent canvas.</strong>
          <span>Nothing is rendered behind the slides. PNG stills and PNG sequences preserve alpha; H.264 does not.</span>
        </div>
      )}
    </InspectorGroup>
  );
}
