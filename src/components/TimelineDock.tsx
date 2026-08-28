import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  sampleVisualTimeline,
  type VisualTimelineModel,
  type VisualTimelineSegment,
} from "../core/timeline/visualTimelineModel";
import { NextFrameIcon, PauseIcon, PlayIcon, PreviousFrameIcon } from "./icons";

export interface TimelineDockProps {
  readonly model: VisualTimelineModel;
  readonly currentTime: number;
  readonly outputFps: number;
  readonly paused: boolean;
  readonly reducedMotionPreview: boolean;
  readonly reducedMotionMaster: boolean;
  readonly focusMode: boolean;
  readonly busy: boolean;
  readonly onPausedChange: (paused: boolean) => void;
  readonly onSeek: (time: number) => void;
  readonly onToggleFocus: () => void;
}

interface ActiveScrub {
  readonly pointerId: number;
  readonly wasPlaying: boolean;
}

type TimelineNavigationKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

export function formatTimelineTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalTenths = Math.round(safe * 10);
  const minutes = Math.floor(totalTenths / 600);
  const remaining = (totalTenths - minutes * 600) / 10;
  return `${minutes}:${remaining.toFixed(1).padStart(4, "0")}`;
}

export function timelineTimeFromClientX(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  duration: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const width = Math.max(1, Number.isFinite(trackWidth) ? trackWidth : 1);
  const position = Number.isFinite(clientX) ? clientX : trackLeft;
  const progress = Math.max(0, Math.min(1, (position - trackLeft) / width));
  return progress * duration;
}

export function resolveTimelineKeyboardSeek(
  model: VisualTimelineModel,
  currentTime: number,
  key: TimelineNavigationKey,
  shiftKey: boolean,
  outputFps: number,
): number {
  const sample = sampleVisualTimeline(model, currentTime);
  if (key === "Home") return 0;
  if (key === "End") return model.totalDuration;
  if (shiftKey) {
    if (key === "ArrowLeft") return sample.previousPassBoundary?.time ?? 0;
    return sample.nextPassBoundary?.time ?? model.totalDuration;
  }
  const fps = Number.isFinite(outputFps) && outputFps > 0 ? outputFps : 30;
  const direction = key === "ArrowLeft" ? -1 : 1;
  return Math.max(0, Math.min(model.totalDuration, sample.time + direction / fps));
}

function Segment({ segment }: { readonly segment: VisualTimelineSegment }) {
  const body = segment.kind === "sequence-group" || segment.kind === "legacy-body"
    ? segment
    : null;
  const style = {
    left: `${segment.normalizedStart * 100}%`,
    width: `${segment.normalizedWidth * 100}%`,
  } satisfies CSSProperties;
  return (
    <div
      className={`timeline-segment timeline-${segment.kind}`}
      data-kind={segment.kind}
      data-label={segment.label}
      data-pace={body?.pace ?? segment.kind}
      data-start={segment.start}
      data-end={segment.end}
      data-normalized-width={segment.normalizedWidth}
      role="listitem"
      style={style}
      title={body ? `${segment.label} · ${body.paceLabel}` : segment.label}
    >
      <span className="timeline-segment-copy">
        <strong>{segment.label}</strong>
        {body ? <small>{body.paceLabel}</small> : null}
      </span>
      {body?.passTicks.slice(1).map((tick) => (
        <i
          aria-hidden="true"
          className="timeline-pass-tick"
          data-time={tick.time}
          key={`${segment.id}:${tick.index}`}
          style={{ left: `${tick.localProgress * 100}%` }}
        />
      ))}
    </div>
  );
}

export function TimelineDock({
  model,
  currentTime,
  outputFps,
  paused,
  reducedMotionPreview,
  reducedMotionMaster,
  focusMode,
  busy,
  onPausedChange,
  onSeek,
  onToggleFocus,
}: TimelineDockProps) {
  const activeScrubRef = useRef<ActiveScrub | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [announcement, setAnnouncement] = useState("Timeline ready.");
  const time = Math.max(0, Math.min(model.totalDuration, currentTime));

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = timelineTimeFromClientX(
      event.clientX,
      bounds.left,
      bounds.width,
      model.totalDuration,
    );
    onSeek(next);
    return next;
  };

  const finishScrub = (event: PointerEvent<HTMLDivElement>) => {
    const active = activeScrubRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const finalTime = seekFromPointer(event);
    activeScrubRef.current = null;
    setScrubbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (active.wasPlaying) onPausedChange(false);
    setAnnouncement(`Playhead ${formatTimelineTime(finalTime)}.`);
  };

  const navigate = (key: TimelineNavigationKey, shiftKey = false) => {
    const next = resolveTimelineKeyboardSeek(model, time, key, shiftKey, outputFps);
    if (!paused) onPausedChange(true);
    onSeek(next);
    setAnnouncement(`Playhead ${formatTimelineTime(next)}.`);
  };

  const onTimelineKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (busy) return;
    if (event.code === "Space") {
      event.preventDefault();
      onPausedChange(!paused);
      setAnnouncement(paused ? "Playback started." : "Playback paused.");
      return;
    }
    if (
      event.key !== "ArrowLeft"
      && event.key !== "ArrowRight"
      && event.key !== "Home"
      && event.key !== "End"
    ) return;
    event.preventDefault();
    navigate(event.key, event.shiftKey);
  };

  return (
    <section
      className="timeline-dock"
      data-authority={model.authority}
      data-scrubbing={scrubbing}
      data-timeline-dock
      aria-label="Editing timeline"
    >
      <div className="timeline-transport" aria-label="Timeline transport">
        <button
          type="button"
          disabled={busy}
          onClick={() => navigate("ArrowLeft")}
          aria-label="Previous output frame"
        >
          <PreviousFrameIcon />
        </button>
        <button
          type="button"
          className="timeline-play-button"
          disabled={busy}
          onClick={() => onPausedChange(!paused)}
          aria-label={paused ? "Play preview" : "Pause preview"}
          aria-pressed={!paused}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => navigate("ArrowRight")}
          aria-label="Next output frame"
        >
          <NextFrameIcon />
        </button>
        <output className="timeline-time" aria-label="Playhead time">
          <strong>{formatTimelineTime(time)}</strong>
          <span>/</span>
          <small>{formatTimelineTime(model.totalDuration)}</small>
        </output>
      </div>

      <div className="timeline-editor">
        <div
          className="timeline-track"
          data-testid="timeline-track"
          role="slider"
          aria-label="Master timeline playhead"
          aria-describedby="timeline-keyboard-help"
          aria-valuemin={0}
          aria-valuemax={model.totalDuration}
          aria-valuenow={Number(time.toFixed(3))}
          aria-valuetext={`${formatTimelineTime(time)} of ${formatTimelineTime(model.totalDuration)}`}
          aria-orientation="horizontal"
          aria-keyshortcuts="Space ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Home End"
          tabIndex={busy ? -1 : 0}
          onKeyDown={onTimelineKeyDown}
          onPointerDown={(event) => {
            if (busy || event.button !== 0 || activeScrubRef.current) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            activeScrubRef.current = { pointerId: event.pointerId, wasPlaying: !paused };
            setScrubbing(true);
            if (!paused) onPausedChange(true);
            seekFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (activeScrubRef.current?.pointerId !== event.pointerId) return;
            seekFromPointer(event);
          }}
          onPointerUp={finishScrub}
          onPointerCancel={finishScrub}
          onLostPointerCapture={(event) => {
            const active = activeScrubRef.current;
            if (!active || active.pointerId !== event.pointerId) return;
            activeScrubRef.current = null;
            setScrubbing(false);
            if (active.wasPlaying) onPausedChange(false);
            setAnnouncement(`Playhead ${formatTimelineTime(time)}.`);
          }}
        >
          <div className="timeline-segments" role="list" aria-label="Authored timeline segments">
            {model.segments.map((segment) => <Segment segment={segment} key={segment.id} />)}
          </div>
          <div
            className="timeline-playhead"
            data-time={time}
            style={{ left: `${time / model.totalDuration * 100}%` }}
            aria-hidden="true"
          >
            <i />
          </div>
        </div>
        <p id="timeline-keyboard-help" className="visually-hidden">
          Space plays or pauses. Left and Right move one output frame. Hold Shift to jump to the previous or next deck-pass boundary. Home and End move to the master endpoints.
        </p>
        <span className="timeline-hint" aria-hidden="true">
          {reducedMotionPreview
            ? "OS motion hold · scrub still works"
            : reducedMotionMaster
              ? "Reduced-motion master · spatial travel held"
              : "Drag to scrub · Shift + arrows jump passes"}
        </span>
        <output className="visually-hidden" aria-live="polite" aria-atomic="true">
          {announcement}
        </output>
      </div>

      <button
        type="button"
        disabled={busy}
        className="timeline-focus-button"
        onClick={onToggleFocus}
      >
        {focusMode ? "Exit full frame" : "Full frame"}
      </button>
    </section>
  );
}
