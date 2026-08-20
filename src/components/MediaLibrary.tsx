import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from "react";
import { pickNativeMacFiles } from "../lib/nativeMac";
import type { StudioAsset } from "../model";

interface MediaLibraryProps {
  assets: StudioAsset[];
  presenter: StudioAsset | null;
  pinnedAssetId: string | null;
  imageInputRef: RefObject<HTMLInputElement | null>;
  presenterInputRef: RefObject<HTMLInputElement | null>;
  onAddImages: (files: File[]) => void;
  onPresenter: (file: File) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onPin: (asset: StudioAsset | null) => void;
  onRemovePresenter: () => void;
  busy: boolean;
}

function pickerMessage(error: unknown, fallback: string): string {
  if (error instanceof DOMException && error.name === "AbortError") return "";
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export function MediaLibrary({
  assets,
  presenter,
  pinnedAssetId,
  imageInputRef,
  presenterInputRef,
  onAddImages,
  onPresenter,
  onRemove,
  onReorder,
  onPin,
  onRemovePresenter,
  busy,
}: MediaLibraryProps) {
  const draggedId = useRef<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const addImages = (event: ChangeEvent<HTMLInputElement>) => {
    setPickerError(null);
    const files = Array.from(event.currentTarget.files ?? []);
    if (files.length) onAddImages(files);
    event.currentTarget.value = "";
  };

  const addPresenter = (event: ChangeEvent<HTMLInputElement>) => {
    setPickerError(null);
    const file = event.currentTarget.files?.[0];
    if (file) onPresenter(file);
    event.currentTarget.value = "";
  };

  const requestImages = useCallback(() => {
    setPickerError(null);
    void pickNativeMacFiles("slides", true)
      .then((files) => {
        if (files === null) {
          imageInputRef.current?.click();
          return;
        }
        if (files.length) onAddImages(files);
      })
      .catch((error: unknown) => {
        const message = pickerMessage(error, "Slides could not be opened.");
        if (message) setPickerError(message);
      });
  }, [imageInputRef, onAddImages]);

  const requestPresenter = useCallback(() => {
    setPickerError(null);
    void pickNativeMacFiles("presenter", false)
      .then((files) => {
        if (files === null) {
          presenterInputRef.current?.click();
          return;
        }
        const file = files[0];
        if (file) onPresenter(file);
      })
      .catch((error: unknown) => {
        const message = pickerMessage(error, "Presenter video could not be opened.");
        if (message) setPickerError(message);
      });
  }, [onPresenter, presenterInputRef]);

  const onDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    if (draggedId.current && draggedId.current !== targetId) onReorder(draggedId.current, targetId);
    draggedId.current = null;
  };

  return (
    <aside className="media-library" aria-label="Media library" aria-busy={busy}>
      <div className="panel-heading compact">
        <div>
          <span className="panel-kicker">MEDIA</span>
          <h2>Your deck.</h2>
        </div>
        <span className="media-count">{assets.length}</span>
      </div>

      <input ref={imageInputRef} hidden tabIndex={-1} disabled={busy} type="file" accept="image/png,image/jpeg,image/webp,image/avif" multiple onChange={addImages} />
      <input ref={presenterInputRef} hidden tabIndex={-1} disabled={busy} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={addPresenter} />

      <div className="media-add-row">
        <button type="button" className="media-add" disabled={busy} onClick={requestImages}>
          <span aria-hidden="true">＋</span> Add slides
        </button>
        <button type="button" className="media-add subtle" disabled={busy} onClick={requestPresenter}>
          Presenter
        </button>
      </div>
      <p className="media-note" data-error={Boolean(pickerError)} aria-live="polite">
        {pickerError ?? "Images move. One optional video can stay pinned. Original media: 64 MiB each, 80 MiB total. Files remain on this device."}
      </p>

      <ol className="asset-list" aria-label="Slide order">
        {assets.map((asset, index) => (
          <li
            key={asset.id}
            draggable={!busy}
            onDragStart={() => { if (!busy) draggedId.current = asset.id; }}
            onDragOver={(event) => { if (!busy) event.preventDefault(); }}
            onDrop={(event) => onDrop(event, asset.id)}
            data-pinned={pinnedAssetId === asset.id}
          >
            <span className="drag-handle" aria-hidden="true">⠿</span>
            <img src={asset.objectUrl} alt="" />
            <span className="asset-meta">
              <strong>{String(index + 1).padStart(2, "0")}</strong>
              <small title={asset.name}>{asset.name}</small>
            </span>
            <span className="asset-actions">
              <button
                type="button"
                onClick={() => onReorder(asset.id, assets[index - 1]!.id)}
                aria-label={`Move ${asset.name} up`}
                title="Move slide up"
                disabled={busy || index === 0}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onReorder(asset.id, assets[index + 1]!.id)}
                aria-label={`Move ${asset.name} down`}
                title="Move slide down"
                disabled={busy || index === assets.length - 1}
              >
                ↓
              </button>
              <button type="button" disabled={busy} onClick={() => onPin(pinnedAssetId === asset.id ? null : asset)} aria-label={pinnedAssetId === asset.id ? `Unpin ${asset.name}` : `Pin ${asset.name}`} title="Pin frame">
                {pinnedAssetId === asset.id ? "●" : "○"}
              </button>
              <button type="button" disabled={busy} onClick={() => onRemove(asset.id)} aria-label={`Remove ${asset.name}`} title="Remove from project">×</button>
            </span>
          </li>
        ))}
      </ol>

      <section className="presenter-slot" data-filled={Boolean(presenter)}>
        <div className="section-heading-row">
          <h3>Presenter frame</h3>
          <span>OPTIONAL</span>
        </div>
        {presenter ? (
          <div className="presenter-card">
            <video src={presenter.objectUrl} muted playsInline preload="metadata" />
            <span>
              <strong>{presenter.name}</strong>
              <small>{presenter.duration?.toFixed(1) ?? "—"} s · audio checked at export</small>
            </span>
            <button type="button" disabled={busy} onClick={() => onPin(pinnedAssetId === presenter.id ? null : presenter)}>
              {pinnedAssetId === presenter.id ? "Pinned" : "Pin"}
            </button>
            <button type="button" disabled={busy} onClick={onRemovePresenter} aria-label="Remove presenter video">×</button>
          </div>
        ) : (
          <button type="button" className="empty-presenter" disabled={busy} onClick={requestPresenter}>
            <span>Drop in your talking-head video</span>
            <small>MP4, WebM, or MOV · 64 MiB maximum · one active decoder</small>
          </button>
        )}
      </section>
    </aside>
  );
}
