export interface ControlSnapshot {
  name: string;
  value: string | boolean;
}

export interface SegmentedSnapshot {
  group: string;
  option: string;
}

export interface DirectorSnapshot {
  theme: string | null;
  controls: ControlSnapshot[];
  segmented: SegmentedSnapshot[];
}

export interface NamedOperation {
  label: string;
  ready: () => boolean;
  run: () => boolean;
}

function fieldName(label: HTMLLabelElement): string {
  const range = label.querySelector<HTMLElement>(".control-label > span:first-child");
  if (range?.textContent) return range.textContent.trim();
  const nested = label.querySelector<HTMLElement>(":scope > span:first-child > span:first-child");
  if (nested?.textContent) return nested.textContent.trim();
  const direct = label.querySelector<HTMLElement>(":scope > span:first-child");
  return direct?.textContent?.trim() ?? "";
}

export function findControl(name: string): HTMLInputElement | HTMLSelectElement | null {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("label.control-field"));
  for (const label of labels) {
    if (fieldName(label) !== name) continue;
    return label.querySelector<HTMLInputElement | HTMLSelectElement>('input:not([type="radio"]), select');
  }
  return null;
}

export function writeControl(name: string, value: string | number | boolean): boolean {
  const control = findControl(name);
  if (!control) return false;

  if (control instanceof HTMLInputElement) {
    if (control.type === "checkbox") {
      const next = Boolean(value);
      if (control.checked !== next) control.click();
      return control.checked === next;
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

export function readControl(name: string): string | boolean | null {
  const control = findControl(name);
  if (!control) return null;
  if (control instanceof HTMLInputElement && control.type === "checkbox") return control.checked;
  return control.value;
}

export function numberValue(name: string, fallback = 0): number {
  const value = readControl(name);
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function findSegmented(groupName: string): HTMLFieldSetElement | null {
  const groups = Array.from(document.querySelectorAll<HTMLFieldSetElement>("fieldset.segmented-field"));
  return groups.find((candidate) => candidate.querySelector("legend")?.textContent?.trim() === groupName) ?? null;
}

export function clickSegmented(groupName: string, optionName: string): boolean {
  const group = findSegmented(groupName);
  if (!group) return false;
  const options = Array.from(group.querySelectorAll<HTMLLabelElement>("label"));
  const option = options.find((candidate) => candidate.querySelector("span")?.textContent?.trim() === optionName);
  const radio = option?.querySelector<HTMLInputElement>('input[type="radio"]');
  if (!radio) return false;
  radio.click();
  return radio.checked;
}

export function findTheme(name: string): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button.theme-card"));
  return buttons.find((candidate) => candidate.querySelector("strong")?.textContent?.trim() === name) ?? null;
}

export function clickTheme(name: string): boolean {
  const button = findTheme(name);
  if (!button) return false;
  button.click();
  return true;
}

export function settle(milliseconds = 34): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function controlOperation(
  label: string,
  name: string,
  value: string | number | boolean,
): NamedOperation {
  return {
    label,
    ready: () => findControl(name) !== null,
    run: () => writeControl(name, value),
  };
}

export function segmentedOperation(label: string, group: string, option: string): NamedOperation {
  return {
    label,
    ready: () => {
      const fieldset = findSegmented(group);
      return Boolean(
        fieldset
        && Array.from(fieldset.querySelectorAll("label span"))
          .some((span) => span.textContent?.trim() === option),
      );
    },
    run: () => clickSegmented(group, option),
  };
}

export function themeOperation(name: string): NamedOperation {
  return {
    label: `${name} film world`,
    ready: () => findTheme(name) !== null,
    run: () => clickTheme(name),
  };
}

export function captureDirectorSnapshot(): DirectorSnapshot {
  const controls: ControlSnapshot[] = [];
  const seen = new Set<string>();
  for (const label of Array.from(document.querySelectorAll<HTMLLabelElement>("label.control-field"))) {
    const name = fieldName(label);
    if (!name || seen.has(name)) continue;
    const control = label.querySelector<HTMLInputElement | HTMLSelectElement>('input:not([type="radio"]), select');
    if (!control) continue;
    const value = control instanceof HTMLInputElement && control.type === "checkbox"
      ? control.checked
      : control.value;
    controls.push({ name, value });
    seen.add(name);
  }

  const segmented: SegmentedSnapshot[] = [];
  for (const group of Array.from(document.querySelectorAll<HTMLFieldSetElement>("fieldset.segmented-field"))) {
    const groupName = group.querySelector("legend")?.textContent?.trim();
    const checked = group.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    const option = checked?.closest("label")?.querySelector("span")?.textContent?.trim();
    if (groupName && option) segmented.push({ group: groupName, option });
  }

  const theme = document
    .querySelector<HTMLElement>('button.theme-card[data-active="true"] strong')
    ?.textContent
    ?.trim() ?? null;
  return { theme, controls, segmented };
}

export async function restoreDirectorSnapshot(snapshot: DirectorSnapshot): Promise<string[]> {
  const missing: string[] = [];
  if (snapshot.theme) {
    if (!clickTheme(snapshot.theme)) missing.push(`${snapshot.theme} film world`);
    await settle(42);
  }

  for (const control of snapshot.controls) {
    if (!writeControl(control.name, control.value)) missing.push(control.name);
    await settle(18);
  }

  for (const group of snapshot.segmented) {
    if (!clickSegmented(group.group, group.option)) missing.push(group.group);
    await settle(18);
  }
  return missing;
}

export async function runDirectorOperations(
  operations: readonly NamedOperation[],
  rollback: DirectorSnapshot,
): Promise<void> {
  const missing = operations.filter((operation) => !operation.ready()).map((operation) => operation.label);
  if (missing.length > 0) {
    throw new Error(`Directed move blocked before changing the project. Missing: ${missing.join(", ")}.`);
  }

  try {
    for (const operation of operations) {
      if (!operation.run()) throw new Error(`${operation.label} rejected the requested value.`);
      await settle();
    }
  } catch (error) {
    const rollbackMissing = await restoreDirectorSnapshot(rollback);
    const suffix = rollbackMissing.length > 0
      ? ` Rollback also could not find: ${rollbackMissing.join(", ")}.`
      : " The previous inspector state was restored.";
    throw new Error(`${error instanceof Error ? error.message : "Directed move failed."}${suffix}`);
  }
}
