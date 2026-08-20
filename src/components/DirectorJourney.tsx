import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  DIRECTOR_RECIPES,
  MASTER_PRESETS,
  PACE_RECIPES,
  deriveDirectorAudit,
  type DirectorAuditItem,
  type DirectorRecipe,
  type MasterPreset,
  type PaceRecipe,
} from "../directorRecipes";

interface DirectorJourneyProps {
  children: ReactNode;
}

type GuideKey = "thirds" | "title" | "caption" | "interface";
type GuideState = Record<GuideKey, boolean>;

const GUIDE_STORAGE_KEY = "pitchdog-drift-director-guides-v1";
const EMPTY_GUIDES: GuideState = {
  thirds: false,
  title: false,
  caption: false,
  interface: false,
};

function readStoredGuides(): GuideState {
  if (typeof window === "undefined") return { ...EMPTY_GUIDES };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GUIDE_STORAGE_KEY) ?? "null") as Partial<GuideState> | null;
    return {
      thirds: parsed?.thirds === true,
      title: parsed?.title === true,
      caption: parsed?.caption === true,
      interface: parsed?.interface === true,
    };
  } catch {
    return { ...EMPTY_GUIDES };
  }
}

function fieldName(label: HTMLLabelElement): string {
  const range = label.querySelector<HTMLElement>(".control-label > span:first-child");
  if (range?.textContent) return range.textContent.trim();
  const nested = label.querySelector<HTMLElement>(":scope > span:first-child > span:first-child");
  if (nested?.textContent) return nested.textContent.trim();
  const direct = label.querySelector<HTMLElement>(":scope > span:first-child");
  return direct?.textContent?.trim() ?? "";
}

function findControl(name: string): HTMLInputElement | HTMLSelectElement | null {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("label.control-field"));
  for (const label of labels) {
    if (fieldName(label) !== name) continue;
    return label.querySelector<HTMLInputElement | HTMLSelectElement>('input:not([type="radio"]), select');
  }
  return null;
}

function writeControl(name: string, value: string | number | boolean): boolean {
  const control = findControl(name);
  if (!control) return false;

  if (control instanceof HTMLInputElement) {
    if (control.type === "checkbox") {
      const next = Boolean(value);
      if (control.checked !== next) control.click();
      return true;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(control, String(value));
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(control, String(value));
  control.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function readControl(name: string): string | boolean | null {
  const control = findControl(name);
  if (!control) return null;
  if (control instanceof HTMLInputElement && control.type === "checkbox") return control.checked;
  return control.value;
}

function clickSegmented(groupName: string, optionName: string): boolean {
  const groups = Array.from(document.querySelectorAll<HTMLFieldSetElement>("fieldset.segmented-field"));
  const group = groups.find((candidate) => candidate.querySelector("legend")?.textContent?.trim() === groupName);
  if (!group) return false;
  const options = Array.from(group.querySelectorAll<HTMLLabelElement>("label"));
  const option = options.find((candidate) => candidate.querySelector("span")?.textContent?.trim() === optionName);
  const radio = option?.querySelector<HTMLInputElement>('input[type="radio"]');
  if (!radio) return false;
  radio.click();
  return true;
}

function clickTheme(name: string): boolean {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button.theme-card"));
  const button = buttons.find((candidate) => candidate.querySelector("strong")?.textContent?.trim() === name);
  if (!button) return false;
  button.click();
  return true;
}

function numberValue(name: string, fallback = 0): number {
  const value = readControl(name);
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function settle(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 34));
}

interface NamedOperation {
  label: string;
  run: () => boolean;
}

async function runOperations(operations: readonly NamedOperation[]): Promise<void> {
  for (const operation of operations) {
    if (!operation.run()) throw new Error(`Could not find the ${operation.label} control.`);
    await settle();
  }
}

function guideCount(guides: GuideState): number {
  return Object.values(guides).filter(Boolean).length;
}

export function DirectorJourney({ children }: DirectorJourneyProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Choose the audience effect first. Fine controls remain underneath.");
  const [guides, setGuides] = useState<GuideState>(readStoredGuides);
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const [audit, setAudit] = useState<DirectorAuditItem[]>([]);

  const activeGuideCount = useMemo(() => guideCount(guides), [guides]);

  const refreshAudit = useCallback(() => {
    const stage = document.querySelector<HTMLElement>(".stage-frame");
    const context = stage?.dataset.context;
    setAudit(deriveDirectorAudit({
      slideCount: document.querySelectorAll(".asset-list li").length,
      speed: numberValue("Speed"),
      lensEnergy: numberValue("Lens energy"),
      slideSize: numberValue("Slide size"),
      background: String(readControl("Background") ?? ""),
      seamless: readControl("Seamless export lock") === true,
      presenterSelected: readControl("Keep one frame still") === true,
      webglReady: context === "ready" || context === "restored",
    }));
  }, []);

  useEffect(() => {
    const updateStageHost = () => setStageHost(document.querySelector<HTMLElement>(".stage-frame"));
    updateStageHost();
    const observer = new MutationObserver(updateStageHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(guides));
    } catch {
      // Guide persistence is optional; project state remains untouched.
    }
  }, [guides]);

  useEffect(() => {
    if (!open) return;
    refreshAudit();
    const timer = window.setInterval(refreshAudit, 1_500);
    return () => window.clearInterval(timer);
  }, [open, refreshAudit]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target?.isContentEditable === true;
      if (typing) return;
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
      if (event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const perform = useCallback(async (label: string, operations: readonly NamedOperation[]) => {
    if (busy) return;
    setBusy(true);
    setStatus(`Directing ${label}…`);
    try {
      await runOperations(operations);
      refreshAudit();
      setStatus(`${label} applied. The advanced inspector now contains the real saved values.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not apply ${label}.`);
    } finally {
      setBusy(false);
    }
  }, [busy, refreshAudit]);

  const applyRecipe = useCallback((recipe: DirectorRecipe) => {
    const axisName = recipe.axis === "horizontal" ? "Horizontal" : "Vertical";
    const operations: NamedOperation[] = [
      { label: `${recipe.themeName} film world`, run: () => clickTheme(recipe.themeName) },
      { label: "Autoplay", run: () => writeControl("Autoplay", true) },
      { label: "flow axis", run: () => clickSegmented("Flow axis", axisName) },
      { label: "Speed", run: () => writeControl("Speed", recipe.speed) },
      { label: "Spacing", run: () => writeControl("Spacing", recipe.gap) },
      { label: "Lens energy", run: () => writeControl("Lens energy", recipe.lensEnergy) },
      { label: "Peripheral softness", run: () => writeControl("Peripheral softness", recipe.peripheralSoftness) },
      { label: "Focus lift", run: () => writeControl("Focus lift", recipe.focusLift) },
      { label: "Slide size", run: () => writeControl("Slide size", recipe.slideSize) },
    ];
    if (recipe.presenter) {
      operations.push(
        { label: "pinned-frame width", run: () => writeControl("Width", recipe.presenter!.width) },
        { label: "pinned-frame horizontal position", run: () => writeControl("Horizontal position", recipe.presenter!.x) },
        { label: "pinned-frame vertical position", run: () => writeControl("Vertical position", recipe.presenter!.y) },
      );
    }
    void perform(recipe.name, operations);
  }, [perform]);

  const applyPace = useCallback((pace: PaceRecipe) => {
    void perform(pace.name, [
      { label: "Autoplay", run: () => writeControl("Autoplay", true) },
      { label: "Speed", run: () => writeControl("Speed", pace.speed) },
      { label: "Lens energy", run: () => writeControl("Lens energy", pace.lensEnergy) },
      { label: "Spacing", run: () => writeControl("Spacing", pace.gap) },
    ]);
  }, [perform]);

  const applyMaster = useCallback((master: MasterPreset) => {
    void perform(`${master.name} master`, [
      { label: "Stage width", run: () => writeControl("Stage width", master.width) },
      { label: "Stage height", run: () => writeControl("Stage height", master.height) },
      { label: "Duration", run: () => writeControl("Duration", master.duration) },
      { label: "Frame rate", run: () => clickSegmented("Frame rate", String(master.fps)) },
      { label: "Seamless export lock", run: () => writeControl("Seamless export lock", master.seamless) },
    ]);
  }, [perform]);

  const applyAuditFix = useCallback((item: DirectorAuditItem) => {
    switch (item.fix) {
      case "speed":
        void perform("Readable pace", [{ label: "Speed", run: () => writeControl("Speed", 0.44) }]);
        break;
      case "lens":
        void perform("Bounded lens", [{ label: "Lens energy", run: () => writeControl("Lens energy", 58) }]);
        break;
      case "size":
        void perform("Readable slide scale", [{ label: "Slide size", run: () => writeControl("Slide size", 58) }]);
        break;
      case "seamless":
        void perform("Seamless loop", [{ label: "Seamless export lock", run: () => writeControl("Seamless export lock", true) }]);
        break;
      default:
        break;
    }
  }, [perform]);

  const toggleGuide = useCallback((key: GuideKey) => {
    setGuides((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const openAdvancedControls = useCallback(() => {
    const navigation = document.querySelector<HTMLElement>('[aria-label="Studio panels"]');
    const directorButton = Array.from(navigation?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.trim().toLowerCase() === "director");
    directorButton?.click();
    setOpen(false);
  }, []);

  const panel = (
    <>
      <button
        type="button"
        className="director-entry"
        aria-expanded={open}
        aria-controls="intent-director"
        onClick={() => setOpen((current) => !current)}
      >
        <span>DIRECT</span>
        <small>{activeGuideCount > 0 ? `${activeGuideCount} GUIDE${activeGuideCount === 1 ? "" : "S"}` : "INTENT FIRST"}</small>
      </button>

      {open ? (
        <aside id="intent-director" className="intent-director" aria-label="Intent director" aria-busy={busy}>
          <header className="intent-director-header">
            <div>
              <span>DIRECTOR'S TABLE</span>
              <h2>Start with the effect on the viewer.</h2>
            </div>
            <button type="button" aria-label="Close intent director" onClick={() => setOpen(false)}>×</button>
          </header>

          <p className="director-status" role="status">{status}</p>

          <details className="director-section" open>
            <summary>
              <span>Audience effect</span>
              <small>{DIRECTOR_RECIPES.length} authored moves</small>
            </summary>
            <div className="director-recipe-grid">
              {DIRECTOR_RECIPES.map((recipe) => (
                <button type="button" key={recipe.id} disabled={busy} onClick={() => applyRecipe(recipe)}>
                  <strong>{recipe.name}</strong>
                  <span>{recipe.effect}</span>
                  <small>{recipe.reason}</small>
                </button>
              ))}
            </div>
          </details>

          <details className="director-section" open>
            <summary>
              <span>Rhythm</span>
              <small>One coherent move</small>
            </summary>
            <div className="director-pace-row">
              {PACE_RECIPES.map((pace) => (
                <button type="button" key={pace.id} disabled={busy} onClick={() => applyPace(pace)}>
                  <strong>{pace.name}</strong>
                  <small>{pace.description}</small>
                </button>
              ))}
            </div>
          </details>

          <details className="director-section">
            <summary>
              <span>Master shape</span>
              <small>Format + closure</small>
            </summary>
            <div className="director-master-grid">
              {MASTER_PRESETS.map((master) => (
                <button type="button" key={master.id} disabled={busy} onClick={() => applyMaster(master)}>
                  <strong>{master.name}</strong>
                  <span>{master.description}</span>
                  <small>{master.width} × {master.height} · {master.fps} fps · {master.duration} s</small>
                </button>
              ))}
            </div>
          </details>

          <details className="director-section">
            <summary>
              <span>Composition guides</span>
              <small>Editor only · never exported</small>
            </summary>
            <div className="director-guide-list">
              <label>
                <span><strong>Rule of thirds</strong><small>Simple spatial tension and eyeline checks.</small></span>
                <input type="checkbox" checked={guides.thirds} onChange={() => toggleGuide("thirds")} />
              </label>
              <label>
                <span><strong>Title safe</strong><small>Keep essential copy away from fragile edges.</small></span>
                <input type="checkbox" checked={guides.title} onChange={() => toggleGuide("title")} />
              </label>
              <label>
                <span><strong>Caption reserve</strong><small>Hold the lower field for subtitles or social captions.</small></span>
                <input type="checkbox" checked={guides.caption} onChange={() => toggleGuide("caption")} />
              </label>
              <label>
                <span><strong>Interface reserve</strong><small>A conservative working area for platform UI.</small></span>
                <input type="checkbox" checked={guides.interface} onChange={() => toggleGuide("interface")} />
              </label>
              {activeGuideCount > 0 ? <button type="button" className="director-clear-guides" onClick={() => setGuides({ ...EMPTY_GUIDES })}>Clear guides</button> : null}
            </div>
          </details>

          <details className="director-section" open>
            <summary>
              <span>Master check</span>
              <button type="button" onClick={(event) => { event.preventDefault(); refreshAudit(); }}>Recheck</button>
            </summary>
            <div className="director-audit-list">
              {audit.map((item) => (
                <article key={item.id} data-tone={item.tone}>
                  <span className="director-audit-mark" aria-hidden="true" />
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </div>
                  {item.fix ? <button type="button" disabled={busy} onClick={() => applyAuditFix(item)}>Fix</button> : null}
                </article>
              ))}
            </div>
          </details>

          <footer className="intent-director-footer">
            <button type="button" onClick={openAdvancedControls}>Open advanced controls</button>
            <span><kbd>⇧</kbd><kbd>D</kbd> toggle · <kbd>Esc</kbd> close</span>
          </footer>
        </aside>
      ) : null}
    </>
  );

  const guideOverlay = stageHost && activeGuideCount > 0
    ? createPortal(
        <div className="director-guides" aria-hidden="true">
          {guides.thirds ? <div className="director-thirds" /> : null}
          {guides.title ? <div className="director-title-safe"><span>TITLE SAFE</span></div> : null}
          {guides.caption ? <div className="director-caption-safe"><span>CAPTION RESERVE</span></div> : null}
          {guides.interface ? <div className="director-interface-safe"><span>WORKING UI SAFE</span></div> : null}
        </div>,
        stageHost,
      )
    : null;

  return (
    <>
      {children}
      {typeof document !== "undefined" ? createPortal(panel, document.body) : null}
      {guideOverlay}
    </>
  );
}
