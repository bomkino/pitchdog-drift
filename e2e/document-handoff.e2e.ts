import { test, expect } from '@playwright/test';

test('interrupted Open leaves A durable; accepting B swaps manifest and originals atomically', async ({ page }) => {
  await page.goto('/');
  const staged = await page.evaluate(async () => {
    const { ProjectStore } = await import('/src/lib/projectStore.ts');
    const databaseName = `drift-handoff-${crypto.randomUUID()}`;
    const store = new ProjectStore({ databaseName });
    const make = (name: string) => ({ projectId: name, payload: { name }, engineVersion: 'test', themeVersion: 'test', assets: [{ id: name, name: `${name}.png`, blob: new Blob([`original-${name}`], { type: 'image/png' }) }] });
    await store.save(make('A'));
    const token = await store.stageReplacement(make('B'));
    return { databaseName, token };
  });
  // A real new page/store instance, not an in-memory mocked history array.
  await page.reload();
  const interrupted = await page.evaluate(async ({ databaseName, token }) => {
    const { ProjectStore } = await import('/src/lib/projectStore.ts');
    const store = new ProjectStore({ databaseName });
    const a = await store.load<{ name: string }>();
    let rejected = false;
    try { await store.commitReplacement('stale-open'); } catch { rejected = true; }
    const unchanged = await store.load<{ name: string }>();
    await store.commitReplacement(token);
    return { name: a?.payload.name, original: await a?.assets[0]?.blob.text(), rejected, afterFailure: unchanged?.payload.name };
  }, staged);
  expect(interrupted).toEqual({ name: 'A', original: 'original-A', rejected: true, afterFailure: 'A' });
  await page.reload();
  const accepted = await page.evaluate(async ({ databaseName }) => {
    const { ProjectStore } = await import('/src/lib/projectStore.ts');
    const store = new ProjectStore({ databaseName });
    const b = await store.load<{ name: string }>();
    const result = { name: b?.payload.name, media: await b?.assets[0]?.blob.text(), count: b?.assets.length };
    await store.clear();
    indexedDB.deleteDatabase(databaseName);
    return result;
  }, staged);
  expect(accepted).toEqual({ name: 'B', media: 'original-B', count: 1 });
});
