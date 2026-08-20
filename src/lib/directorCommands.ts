export type DirectorCommandMode = "click" | "focus";

export interface DirectorCommand {
  id: string;
  title: string;
  description: string;
  section: "Begin" | "Direct" | "Review" | "Recover";
  keywords: readonly string[];
  targets: readonly string[];
  mode?: DirectorCommandMode;
  shortcut?: string;
}

export const DIRECTOR_COMMANDS: readonly DirectorCommand[] = [
  {
    id: "add-slides",
    title: "Add slides",
    description: "Open the media step and bring the deck into Drift.",
    section: "Begin",
    keywords: ["import", "media", "deck", "images"],
    targets: ["Add slides", "Import slides", "Add media", "Media"],
    shortcut: "A",
  },
  {
    id: "choose-world",
    title: "Choose a film world",
    description: "Start from one coherent world before touching individual knobs.",
    section: "Begin",
    keywords: ["theme", "genre", "look", "world"],
    targets: ["Worlds", "Film worlds", "Themes", "World"],
    mode: "focus",
    shortcut: "W",
  },
  {
    id: "new-take",
    title: "Generate a new take",
    description: "Recut the current direction without compounding the previous take.",
    section: "Direct",
    keywords: ["recut", "variation", "random", "take"],
    targets: ["New take", "Recut", "Another take"],
    shortcut: "N",
  },
  {
    id: "clean-lens",
    title: "Compare against clean glass",
    description: "Remove the lens temporarily and judge what the treatment is actually doing.",
    section: "Review",
    keywords: ["before", "after", "compare", "lens", "clean"],
    targets: ["Clean lens", "Clean glass", "Compare clean", "Compare"],
    shortcut: "\\",
  },
  {
    id: "playback",
    title: "Play or pause preview",
    description: "Judge timing in motion rather than from a flattering frozen frame.",
    section: "Review",
    keywords: ["play", "pause", "motion", "preview"],
    targets: ["Pause preview", "Play preview", "Pause", "Play"],
    shortcut: "Space",
  },
  {
    id: "guides",
    title: "Cycle composition guides",
    description: "Check thirds, title-safe and social-interface-safe framing.",
    section: "Review",
    keywords: ["safe", "thirds", "social", "frame", "guides"],
    targets: ["Guides", "Cycle guides", "Composition guides"],
    shortcut: "G",
  },
  {
    id: "output",
    title: "Review output readiness",
    description: "Open the master settings and resolve blockers before export.",
    section: "Review",
    keywords: ["export", "master", "readiness", "preflight", "output"],
    targets: ["Output", "Export", "Readiness", "Preflight"],
    mode: "focus",
    shortcut: "E",
  },
  {
    id: "undo",
    title: "Undo the last direction",
    description: "Return to the last human decision, not the last slider event.",
    section: "Recover",
    keywords: ["back", "history", "undo"],
    targets: ["Undo"],
    shortcut: "⌘Z",
  },
  {
    id: "redo",
    title: "Redo the last direction",
    description: "Restore the direction you just undid.",
    section: "Recover",
    keywords: ["forward", "history", "redo"],
    targets: ["Redo"],
    shortcut: "⇧⌘Z",
  },
];

export function normalizeCommandText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function commandSearchText(command: DirectorCommand): string {
  return normalizeCommandText([
    command.title,
    command.description,
    command.section,
    ...command.keywords,
  ].join(" "));
}

export function rankDirectorCommands(
  query: string,
  commands: readonly DirectorCommand[] = DIRECTOR_COMMANDS,
): DirectorCommand[] {
  const normalized = normalizeCommandText(query);
  if (!normalized) return [...commands];
  const terms = normalized.split(" ").filter(Boolean);
  return commands
    .map((command, order) => {
      const title = normalizeCommandText(command.title);
      const haystack = commandSearchText(command);
      if (!terms.every((term) => haystack.includes(term))) return null;
      let score = 0;
      if (title === normalized) score += 100;
      if (title.startsWith(normalized)) score += 50;
      for (const term of terms) {
        if (title.includes(term)) score += 12;
        if (normalizeCommandText(command.section).includes(term)) score += 3;
      }
      return { command, order, score };
    })
    .filter((result): result is { command: DirectorCommand; order: number; score: number } => Boolean(result))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((result) => result.command);
}

export function shouldIgnoreDirectorShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[contenteditable='true']")) return true;
  return Boolean(target.closest("input, textarea, select, [role='textbox'], [role='combobox']"));
}

function visible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function accessibleText(element: HTMLElement): string {
  return normalizeCommandText([
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("title") ?? "",
    element.textContent ?? "",
  ].join(" "));
}

function findTarget(command: DirectorCommand): HTMLElement | null {
  const explicit = document.querySelector<HTMLElement>(`[data-director-command~='${command.id}']`);
  if (explicit && visible(explicit)) return explicit;
  const elements = Array.from(document.querySelectorAll<HTMLElement>(
    "button, [role='button'], [role='tab'], summary, a[href], input, select, [tabindex]",
  )).filter(visible);
  for (const candidate of command.targets) {
    const expected = normalizeCommandText(candidate);
    const exact = elements.find((element) => accessibleText(element) === expected);
    if (exact) return exact;
  }
  for (const candidate of command.targets) {
    const expected = normalizeCommandText(candidate);
    const partial = elements.find((element) => accessibleText(element).includes(expected));
    if (partial) return partial;
  }
  return null;
}

function runCommand(command: DirectorCommand): boolean {
  const target = findTarget(command);
  if (!target) {
    if (command.id === "undo" || command.id === "redo") {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        ctrlKey: true,
        shiftKey: command.id === "redo",
        bubbles: true,
      }));
      return true;
    }
    return false;
  }
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.focus({ preventScroll: true });
  const activatesDestination = target.matches("button, [role='button'], [role='tab'], summary, a[href]");
  if ((command.mode ?? "click") === "click" || activatesDestination) target.click();
  target.dataset.directorTarget = "true";
  window.setTimeout(() => delete target.dataset.directorTarget, 1800);
  return true;
}

const STYLE_ID = "drift-director-command-style";
const ROOT_ID = "drift-director-command-root";

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .director-command-launcher { position: fixed; right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom)); z-index: 9000; display: inline-flex; align-items: center; gap: 9px; min-height: 34px; padding: 0 11px; border: 1px solid rgba(255,255,255,.13); border-radius: 999px; background: rgba(16,16,19,.78); color: rgba(245,241,232,.76); box-shadow: 0 12px 36px rgba(0,0,0,.24); backdrop-filter: blur(14px); font: 650 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
    .director-command-launcher:hover, .director-command-launcher:focus-visible { color: #fffaf0; border-color: rgba(255,255,255,.27); outline: none; }
    .director-command-launcher kbd { padding: 4px 6px; border: 1px solid rgba(255,255,255,.13); border-radius: 7px; background: rgba(255,255,255,.055); font: inherit; }
    [data-director-target='true'] { outline: 2px solid rgba(255,235,194,.92) !important; outline-offset: 5px !important; }
    .director-command-live { position: fixed; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .director-command-root { position: fixed; inset: 0; z-index: 10000; display: none; place-items: start center; padding: max(8vh, 56px) 18px 24px; background: rgba(5,5,7,.62); backdrop-filter: blur(18px) saturate(.82); }
    .director-command-root[data-open='true'] { display: grid; }
    .director-command-dialog { width: min(680px, 100%); max-height: min(78vh, 760px); overflow: hidden; border: 1px solid rgba(255,255,255,.16); border-radius: 24px; background: color-mix(in srgb, #151518 92%, transparent); color: #f5f1e8; box-shadow: 0 36px 120px rgba(0,0,0,.58); }
    .director-command-head { padding: 18px 18px 14px; border-bottom: 1px solid rgba(255,255,255,.1); }
    .director-command-kicker { margin: 0 0 8px; font: 600 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; text-transform: uppercase; opacity: .58; }
    .director-command-search { box-sizing: border-box; width: 100%; border: 0; outline: 0; background: transparent; color: inherit; font: 500 22px/1.25 system-ui, sans-serif; }
    .director-command-search::placeholder { color: rgba(245,241,232,.42); }
    .director-command-path { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 6px; padding: 10px 18px; border-bottom: 1px solid rgba(255,255,255,.08); }
    .director-command-path span { padding: 7px 8px; border-radius: 999px; background: rgba(255,255,255,.055); font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .09em; text-align: center; text-transform: uppercase; opacity: .72; }
    .director-command-list { overflow: auto; max-height: 54vh; padding: 8px; }
    .director-command-item { display: grid; grid-template-columns: 1fr auto; gap: 16px; width: 100%; padding: 13px 12px; border: 0; border-radius: 15px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .director-command-item:hover, .director-command-item[aria-selected='true'] { background: rgba(255,255,255,.095); }
    .director-command-title { display: block; font: 620 14px/1.3 system-ui,sans-serif; }
    .director-command-description { display: block; margin-top: 3px; color: rgba(245,241,232,.58); font: 450 11px/1.45 system-ui,sans-serif; }
    .director-command-meta { align-self: center; display: flex; align-items: center; gap: 7px; }
    .director-command-section, .director-command-key { border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: 5px 7px; font: 600 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing: .06em; text-transform: uppercase; opacity: .58; white-space: nowrap; }
    .director-command-empty { padding: 34px 18px; text-align: center; color: rgba(245,241,232,.56); font: 500 12px/1.5 system-ui,sans-serif; }
    .director-command-foot { display: flex; justify-content: space-between; gap: 12px; padding: 11px 18px 13px; border-top: 1px solid rgba(255,255,255,.08); color: rgba(245,241,232,.46); font: 500 9px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing: .06em; text-transform: uppercase; }
    @media (max-width: 620px) { .director-command-root { padding-top: 18px; } .director-command-dialog { border-radius: 20px; } .director-command-path { grid-template-columns: repeat(2,1fr); } .director-command-meta { display: none; } .director-command-launcher span { display: none; } }
    @media (prefers-reduced-motion: reduce) { .director-command-root, .director-command-launcher { backdrop-filter: none; } }
  `;
  document.head.append(style);
}

export function installDirectorCommandPalette(): () => void {
  if (document.getElementById(ROOT_ID)) return () => undefined;
  installStyles();
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "director-command-root";
  root.dataset.open = "false";
  root.innerHTML = `
    <section class="director-command-dialog" role="dialog" aria-modal="true" aria-label="Director commands">
      <header class="director-command-head">
        <p class="director-command-kicker">Director path · not another settings panel</p>
        <input class="director-command-search" type="search" autocomplete="off" spellcheck="false" aria-label="Search director commands" aria-controls="director-command-list" placeholder="What are you trying to do?" />
      </header>
      <div class="director-command-path" aria-label="Recommended workflow"><span>1 · Slides</span><span>2 · World</span><span>3 · Direct</span><span>4 · Master</span></div>
      <div id="director-command-list" class="director-command-list" role="listbox" aria-label="Commands"></div>
      <footer class="director-command-foot"><span>↑ ↓ choose · ↵ run</span><span>Esc closes · ⌘K opens</span></footer>
    </section>`;
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "director-command-launcher";
  launcher.setAttribute("aria-haspopup", "dialog");
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = `<span>Commands</span><kbd>⌘K</kbd>`;
  const live = document.createElement("div");
  live.className = "director-command-live";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  document.body.append(root, launcher, live);
  const search = root.querySelector<HTMLInputElement>(".director-command-search")!;
  const list = root.querySelector<HTMLDivElement>(".director-command-list")!;
  let filtered = [...DIRECTOR_COMMANDS];
  let selected = 0;
  let returnFocus: HTMLElement | null = null;

  const render = (): void => {
    filtered = rankDirectorCommands(search.value);
    selected = Math.max(0, Math.min(selected, Math.max(0, filtered.length - 1)));
    if (filtered.length === 0) {
      search.removeAttribute("aria-activedescendant");
      list.innerHTML = `<div class="director-command-empty">No command matches. Try “new take”, “clean lens”, “guides” or “output”.</div>`;
      return;
    }
    list.innerHTML = filtered.map((command, index) => `
      <button id="director-command-${command.id}" class="director-command-item" type="button" role="option" aria-selected="${index === selected}" data-command="${command.id}">
        <span><span class="director-command-title">${command.title}</span><span class="director-command-description">${command.description}</span></span>
        <span class="director-command-meta"><span class="director-command-section">${command.section}</span>${command.shortcut ? `<span class="director-command-key">${command.shortcut}</span>` : ""}</span>
      </button>`).join("");
    search.setAttribute("aria-activedescendant", `director-command-${filtered[selected]!.id}`);
    list.querySelector<HTMLElement>(`[data-command='${filtered[selected]!.id}']`)?.scrollIntoView({ block: "nearest" });
  };
  const close = (): void => {
    root.dataset.open = "false";
    launcher.setAttribute("aria-expanded", "false");
    search.value = "";
    selected = 0;
    returnFocus?.focus({ preventScroll: true });
    returnFocus = null;
  };
  const open = (): void => {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : launcher;
    root.dataset.open = "true";
    launcher.setAttribute("aria-expanded", "true");
    render();
    requestAnimationFrame(() => search.focus());
  };
  const execute = (command: DirectorCommand): void => {
    close();
    requestAnimationFrame(() => {
      if (!runCommand(command)) {
        live.textContent = `${command.title} is unavailable in the current project state.`;
        window.dispatchEvent(new CustomEvent("drift:director-command-missed", { detail: command.id }));
        open();
        search.value = command.title;
        render();
        return;
      }
      live.textContent = `${command.title} opened.`;
    });
  };
  const onInput = (): void => { selected = 0; render(); };
  const onClick = (event: MouseEvent): void => {
    if (event.target === root) { close(); return; }
    const button = (event.target as Element).closest<HTMLElement>("[data-command]");
    if (!button) return;
    const command = DIRECTOR_COMMANDS.find((item) => item.id === button.dataset.command);
    if (command) execute(command);
  };
  const onKeydown = (event: KeyboardEvent): void => {
    const openShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    const helpShortcut = event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (openShortcut || (helpShortcut && !shouldIgnoreDirectorShortcut(event.target))) {
      event.preventDefault();
      root.dataset.open === "true" ? close() : open();
      return;
    }
    if (root.dataset.open !== "true") return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "Tab") {
      const focusable = Array.from(root.querySelectorAll<HTMLElement>("input, button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")).filter(visible);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first && last && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (first && last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.key === "ArrowDown") { event.preventDefault(); selected = Math.min(filtered.length - 1, selected + 1); render(); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); selected = Math.max(0, selected - 1); render(); return; }
    if (event.key === "Enter" && filtered[selected]) { event.preventDefault(); execute(filtered[selected]!); }
  };
  const onLauncherClick = (): void => open();
  launcher.addEventListener("click", onLauncherClick);
  search.addEventListener("input", onInput);
  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  render();
  return () => {
    launcher.removeEventListener("click", onLauncherClick);
    search.removeEventListener("input", onInput);
    root.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeydown);
    root.remove();
    launcher.remove();
    live.remove();
  };
}
