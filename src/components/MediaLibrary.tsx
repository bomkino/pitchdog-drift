import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from "react";
import { pickNativeMacFiles } from "../lib/nativeMac";
import type { StudioAsset } from "../model";
import type { SlideHealth } from "../core/media/slideHealth";
import { ArrowDownIcon, ArrowUpIcon, GripIcon, PinIcon, PlusIcon, TrashIcon, XIcon } from "./icons";

interface MediaLibraryProps {
  assets: StudioAsset[];
  presenter: StudioAsset | null;
  pinnedAssetId: string | null;
  selectedAssetId: string | null;
  slideHealth: Readonly<Record<string, SlideHealth>>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  presenterInputRef: RefObject<HTMLInputElement | null>;
  onAddImages: (files: File[]) => void;
  onPresenter: (file: File) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onPin: (asset: StudioAsset | null) => void;
  onSelect: (assetId: string) => void;
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
  selectedAssetId,
  slideHealth,
  imageInputRef,
  presenterInputRef,
  onAddImages,
  onPresenter,
  onRemove,
  onReorder,
  onPin,
  onSelect,
  onRemovePresenter,
  busy,
}: MediaLibraryProps) {
  const draggedId = useRef<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<string | null>(null);

  useEffect(() => {
    if (removeCandidate === null) return;
    const present = removeCandidate.startsWith("slide:")
      ? assets.some((asset) => removeCandidate === `slide:${asset.id}`)
      : presenter !== null && removeCandidate === `presenter:${presenter.id}`;
    if (!present || busy) setRemoveCandidate(null);
  }, [assets, busy, presenter, removeCandidate]);

  const requestRemoval = (key: string, remove: () => void) => {
    if (removeCandidate !== key) {
      setRemoveCandidate(key);
      return;
    }
    setRemoveCandidate(null);
    remove();
  };

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
          <PlusIcon /> <span>Add slides</span>
        </button>
        <button type="button" className="media-add subtle" disabled={busy} onClick={requestPresenter}>
          Presenter
        </button>
      </div>
      <p className="media-note" data-error={Boolean(pickerError)} aria-live="polite">
        {pickerError ?? "Any one image or presenter video can stay still. Original media: 64 MiB each, 80 MiB total. Files remain on this device."}
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
            data-selected={selectedAssetId === asset.id}
          >
            <span className="drag-handle" aria-hidden="true"><GripIcon /></span>
            <button
              type="button"
              className="asset-select"
              disabled={busy}
              aria-pressed={selectedAssetId === asset.id}
              onClick={() => onSelect(asset.id)}
            >
              <img src={asset.objectUrl} alt="" />
              <span className="asset-meta">
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                <small title={asset.name}>{asset.name}</small>
                <span className="asset-state-row">
                  {pinnedAssetId === asset.id ? <em className="asset-state">STILL</em> : null}
                  {slideHealth[asset.id]?.severity !== "healthy" ? (
                    <em className="asset-health" data-severity={slideHealth[asset.id]?.severity} title={slideHealth[asset.id]?.issues.map((issue) => issue.message).join(" ")}>
                      {slideHealth[asset.id]?.severity}
                    </em>
                  ) : null}
                </span>
              </span>
            </button>
            <span className="asset-actions">
              <button
                type="button"
                onClick={() => onReorder(asset.id, assets[index - 1]!.id)}
                aria-label={`Move ${asset.name} up`}
                title="Move slide up"
                disabled={busy || index === 0}
              >
                <ArrowUpIcon />
              </button>
              <button
                type="button"
                onClick={() => onReorder(asset.id, assets[index + 1]!.id)}
                aria-label={`Move ${asset.name} down`}
                title="Move slide down"
                disabled={busy || index === assets.length - 1}
              >
                <ArrowDownIcon />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPin(pinnedAssetId === asset.id ? null : asset)}
                aria-label={pinnedAssetId === asset.id ? `Return ${asset.name} to the carousel` : `Keep ${asset.name} still`}
                aria-pressed={pinnedAssetId === asset.id}
                title={pinnedAssetId === asset.id ? "Return to carousel" : "Keep still"}
              >
                <PinIcon />
              </button>
              <button
                type="button"
                disabled={busy}
                data-confirm-remove={removeCandidate === `slide:${asset.id}`}
                onClick={() => requestRemoval(`slide:${asset.id}`, () => onRemove(asset.id))}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setRemoveCandidate(null);
                  }
                }}
                aria-label={removeCandidate === `slide:${asset.id}` ? `Confirm removal of ${asset.name}` : `Remove ${asset.name}`}
                title={removeCandidate === `slide:${asset.id}` ? "Click YES to remove · Escape to keep" : "Remove from project"}
              >
                {removeCandidate === `slide:${asset.id}` ? "YES" : <TrashIcon />}
              </button>
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
            <button
              type="button"
              disabled={busy}
              onClick={() => onPin(pinnedAssetId === presenter.id ? null : presenter)}
              aria-label={pinnedAssetId === presenter.id ? `Return ${presenter.name} to its media slot` : `Keep ${presenter.name} still`}
              aria-pressed={pinnedAssetId === presenter.id}
            >
              {pinnedAssetId === presenter.id ? "Unpin" : "Keep still"}
            </button>
            <button
              type="button"
              disabled={busy}
              data-confirm-remove={removeCandidate === `presenter:${presenter.id}`}
              onClick={() => requestRemoval(`presenter:${presenter.id}`, onRemovePresenter)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setRemoveCandidate(null);
                }
              }}
              aria-label={removeCandidate === `presenter:${presenter.id}` ? `Confirm removal of ${presenter.name}` : "Remove presenter video"}
              title={removeCandidate === `presenter:${presenter.id}` ? "Click YES to remove · Escape to keep" : "Remove presenter video"}
            >
              {removeCandidate === `presenter:${presenter.id}` ? "YES" : <XIcon />}
            </button>
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
