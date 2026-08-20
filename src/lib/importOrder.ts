export interface ImportableFileLike {
  name: string;
  type: string;
  webkitRelativePath?: string;
}

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
  punctuation: false,
});

function sourcePath(file: ImportableFileLike): string {
  const relative = file.webkitRelativePath?.trim();
  return relative || file.name;
}

export function orderImportedImageFiles<T extends ImportableFileLike>(
  files: readonly T[],
): T[] {
  return files
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => file.type.startsWith("image/"))
    .sort((a, b) => {
      const pathOrder = NATURAL_COLLATOR.compare(sourcePath(a.file), sourcePath(b.file));
      if (pathOrder !== 0) return pathOrder;
      const nameOrder = NATURAL_COLLATOR.compare(a.file.name, b.file.name);
      return nameOrder !== 0 ? nameOrder : a.index - b.index;
    })
    .map(({ file }) => file);
}
