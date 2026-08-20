import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import type { StudioAsset } from "../model";

interface MediaLibraryProps {
  assets: StudioAsset[];
  presenter: StudioAsset | null;
  pinnedAssetId: string | null;
  onAddImages: (files: File[]) => void;
  onPresenter: (file: File) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onPin: (asset: StudioAsset | null) => void;
  onRemovePresenter: () => void;
  busy: boolean;
}

export function MediaLibrary({
  assets,
  presenter,
  pinnedAssetId,
  onAddImages,
  onPresenter,
  onRemove,
  onReorder,
  onPin,
  onRemovePresenter,
  busy,
}: MediaLibraryProps) {
  const draggedId = useRef<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const presenterInput = useRef<HTMLInputElement>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [fileDropActive, setFileDropActive] = useState(false);

  const addImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    if (files.length) onAddImages(files);
    event.currentTarget.value = "";
  };
  const addPresenter = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) onPresenter(file);
    event.currentTarget.value = "";
  };
  const onDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedId.current && draggedId.current !== targetId) onReorder(draggedId.current, targetId);
    draggedId.current = null;
    setDragOverId(null);
  };
  const reorderFromKeyboard = (event: KeyboardEvent, asset: StudioAsset, index: number) => {
    if (!event.altKey || busy) return;
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      onReorder(asset.id, assets[index - 1]!.id);
    } else if (event.key === "ArrowDown" && index < assets.length - 1) {
      event.preventDefault();
      onReorder(asset.id, assets[index + 1]!.id);
    }
  };

  return (
    <aside
      className="media-library"
      aria-label="Media library"
      aria-busy={busy}
      data-file-drop={fileDropActive}
      onDragEnter={(event) => {
        if (!busy && event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setFileDropActive(true);
        }
      }}
      onDragOver={(event) => {
        if (!busy && event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setFileDropActive(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileDropActive(false);
      }}
      onDrop={(event) => {
        setFileDropActive(false);
        if (busy || !event.dataTransfer.files.length) return;
        event.preventDefault();
        const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
        if (files.length) onAddImages(files);
      }}
    >
      <div className="panel-heading compact">
        <div>
          <span className="panel-kicker">MEDIA</span>
          <h2>Your deck.</h2>
        </div>
        <span className="media-count">{assets.length}</span>
      </div>

      <input ref={imageInput} hidden tabIndex={-1} disabled={busy} type="file" accept="image/png,image/jpeg,image/webp,image/avif" multiple onChange={addImages} />
      <input ref={presenterInput} hidden tabIndex={-1} disabled={busy} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={addPresenter} />

      <div className="media-add-row">
        <button type="button" className="media-add" disabled={busy} onClick={() => imageInput.current?.click()}>
          <span aria-hidden="true">＋</span> Add slides
        </button>
        <button type="button" className="media-add subtle" disabled={busy} onClick={() => presenterInput.current?.click()}>
          Presenter
        </button>
      </div>
      <p className="media-note">Drag to sequence. Alt + ↑/↓ also reorders. One optional image or video can stay pinned. Files remain on this device.</p>

      {fileDropActive ? (
        <div className="media-drop-target" aria-hidden="true">
          <span>DROP DECK</span>
          <strong>{assets.every((asset) => asset.demo) ? "Replace the live study" : "Add to this sequence"}</strong>
        </div>
      ) : null}

      <ol className="asset-list" aria-label="Slide order">
        {assets.map((asset, index) => (
          <li
            key={asset.id}
            draggable={!busy}
            tabIndex={busy ? -1 : 0}
            aria-label={`Slide ${index + 1}: ${asset.name}. Hold Alt and use arrow keys to reorder.`}
            onKeyDown={(event) => reorderFromKeyboard(event, asset, index)}
            onDragStart={(event) => {
              if (busy) return;
              draggedId.current = asset.id;
              setDragOverId(asset.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", asset.id);
            }}
            onDragEnd={() => {
              draggedId.current = null;
              setDragOverId(null);
            }}
            onDragOver={(event) => {
              if (!busy && draggedId.current) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverId(asset.id);
              }
            }}
            onDragLeave={() => {
              if (dragOverId === asset.id) setDragOverId(null);
            }}
            onDrop={(event) => onDrop(event, asset.id)}
            data-pinned={pinnedAssetId === asset.id}
            data-dragging={draggedId.current === asset.id}
            data-drag-over={dragOverId === asset.id && draggedId.current !== asset.id}
            data-demo={asset.demo === true}
          >
            <span className="drag-handle" aria-hidden="true">⠿</span>
            <img src={asset.objectUrl} alt="" />
            <span className="asset-meta">
              <span className="asset-index-row">
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                {asset.demo ? <em>STUDY</em> : null}
              </span>
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
          <button type="button" className="empty-presenter" disabled={busy} onClick={() => presenterInput.current?.click()}>
            <span>Drop in your talking-head video</span>
            <small>MP4, WebM, or MOV · one active decoder</small>
          </button>
        )}
      </section>
    </aside>
  );
}
