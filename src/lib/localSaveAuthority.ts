export interface LocalSaveRevisionAuthority {
  current: number;
}

export interface DirectPersistenceSnapshot<TSettings, TAssets, TPresenter> {
  settings: TSettings;
  assets: TAssets;
  presenter: TPresenter;
}

export function createLocalSaveRevisionAuthority(): LocalSaveRevisionAuthority {
  return { current: 0 };
}

export function advanceLocalSaveRevision(authority: LocalSaveRevisionAuthority): number {
  if (!Number.isSafeInteger(authority.current) || authority.current < 0) {
    throw new Error("Local save revision authority is invalid.");
  }
  const next = authority.current + 1;
  if (!Number.isSafeInteger(next)) throw new Error("Local save revision authority is exhausted.");
  authority.current = next;
  return next;
}

export function ownsLocalSaveRevision(
  authority: LocalSaveRevisionAuthority,
  revision: number,
): boolean {
  return revision === authority.current;
}

export function matchesDirectPersistenceSnapshot<TSettings, TAssets, TPresenter>(
  snapshot: DirectPersistenceSnapshot<TSettings, TAssets, TPresenter>,
  settings: TSettings,
  assets: TAssets,
  presenter: TPresenter,
): boolean {
  return snapshot.settings === settings
    && snapshot.assets === assets
    && snapshot.presenter === presenter;
}
