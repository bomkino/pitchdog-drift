import type { ExportProgress } from "../../model";
import type {
  GuidedExportCompletion,
  GuidedExportSnapshot,
} from "./guidedExport";

export type ExportJobState = "running" | "canceling" | "completed" | "canceled" | "failed";

export interface ExportJobFailure {
  readonly code: "canceled" | "export-failed";
  readonly message: string;
}

export interface ExportJobStatus {
  readonly id: string;
  readonly snapshotId: string;
  readonly documentRevision: number;
  readonly format: GuidedExportSnapshot["intent"]["preferredFormat"];
  readonly state: ExportJobState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finishedAt: string | null;
  readonly progress: Readonly<ExportProgress>;
  readonly canCancel: boolean;
  readonly failure: ExportJobFailure | null;
}

export interface ExportJobReceipt {
  readonly jobId: string;
  readonly snapshotId: string;
  readonly documentRevision: number;
  readonly format: GuidedExportCompletion["format"];
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly elapsedMilliseconds: number;
  readonly completion: Readonly<GuidedExportCompletion>;
}

export type ExportJobListener = (status: ExportJobStatus) => void;

export interface ExportJobController {
  begin(
    snapshot: GuidedExportSnapshot,
    controller: AbortController,
    initialProgress: ExportProgress,
  ): ExportJobStatus;
  report(jobId: string, progress: ExportProgress): ExportJobStatus;
  cancel(jobId: string): boolean;
  complete(jobId: string, completion: GuidedExportCompletion): ExportJobReceipt;
  fail(jobId: string, error?: unknown): ExportJobStatus;
  getStatus(jobId: string): ExportJobStatus | null;
  getReceipt(jobId: string): ExportJobReceipt | null;
  getActiveStatus(): ExportJobStatus | null;
  listStatuses(): readonly ExportJobStatus[];
  subscribe(listener: ExportJobListener): () => void;
}

interface MutableJobRecord {
  readonly controller: AbortController;
  readonly startedMilliseconds: number;
  readonly expected: Readonly<{
    width: number;
    height: number;
    fps: number;
    frameCount: number;
    duration: number;
  }>;
  status: ExportJobStatus;
  receipt: ExportJobReceipt | null;
  detachAbort: () => void;
}

export interface ExportJobControllerOptions {
  readonly now?: () => Date;
  readonly maximumTerminalJobs?: number;
}

const DEFAULT_MAXIMUM_TERMINAL_JOBS = 20;

function invalidState(message: string): DOMException {
  return new DOMException(message, "InvalidStateError");
}

function freezeProgress(progress: ExportProgress, minimumRatio = 0): Readonly<ExportProgress> {
  return Object.freeze({
    ...progress,
    ratio: Math.max(minimumRatio, Math.max(0, Math.min(1, progress.ratio))),
  });
}

function freezeStatus(status: ExportJobStatus): ExportJobStatus {
  return Object.freeze({
    ...status,
    progress: freezeProgress(status.progress),
    failure: status.failure ? Object.freeze({ ...status.failure }) : null,
  });
}

function freezeReceipt(receipt: ExportJobReceipt): ExportJobReceipt {
  return Object.freeze({
    ...receipt,
    completion: Object.freeze({ ...receipt.completion }),
  });
}

function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createExportJobController(
  options: ExportJobControllerOptions = {},
): ExportJobController {
  const now = options.now ?? (() => new Date());
  const maximumTerminalJobs = options.maximumTerminalJobs ?? DEFAULT_MAXIMUM_TERMINAL_JOBS;
  if (!Number.isSafeInteger(maximumTerminalJobs) || maximumTerminalJobs < 1 || maximumTerminalJobs > 100) {
    throw new RangeError("Export job history must contain between 1 and 100 terminal jobs.");
  }

  const records = new Map<string, MutableJobRecord>();
  const listeners = new Set<ExportJobListener>();
  let activeId: string | null = null;

  const timestamp = (): { iso: string; milliseconds: number } => {
    const value = now();
    const milliseconds = value.getTime();
    if (!Number.isFinite(milliseconds)) throw new TypeError("Export job clock returned an invalid date.");
    return { iso: value.toISOString(), milliseconds };
  };

  const emit = (status: ExportJobStatus) => {
    for (const listener of listeners) {
      try {
        listener(status);
      } catch {
        // Observers cannot change export authority or lifecycle settlement.
      }
    }
  };

  const update = (
    record: MutableJobRecord,
    patch: Partial<Omit<ExportJobStatus, "id" | "snapshotId" | "documentRevision" | "format" | "createdAt">>,
  ): ExportJobStatus => {
    record.status = freezeStatus({ ...record.status, ...patch });
    emit(record.status);
    return record.status;
  };

  const requireRecord = (jobId: string): MutableJobRecord => {
    const record = records.get(jobId);
    if (!record) throw invalidState("That export job is not available in this app session.");
    return record;
  };

  const trimTerminalHistory = () => {
    const terminal = [...records.entries()].filter(([, record]) => record.status.finishedAt !== null);
    while (terminal.length > maximumTerminalJobs) {
      const oldest = terminal.shift();
      if (!oldest) break;
      oldest[1].detachAbort();
      records.delete(oldest[0]);
    }
  };

  const finish = (
    record: MutableJobRecord,
    state: "canceled" | "failed",
    failure: ExportJobFailure,
  ): ExportJobStatus => {
    if (record.status.state !== "running" && record.status.state !== "canceling") {
      throw invalidState("That export job has already settled.");
    }
    const finished = timestamp();
    if (activeId === record.status.id) activeId = null;
    const status = update(record, {
      state,
      updatedAt: finished.iso,
      finishedAt: finished.iso,
      canCancel: false,
      failure,
    });
    record.detachAbort();
    trimTerminalHistory();
    return status;
  };

  const controller: ExportJobController = {
    begin(snapshot, controller, initialProgress) {
      if (activeId !== null) throw invalidState("Another export job is already active.");
      if (records.has(snapshot.id)) throw invalidState("That export job identifier was already used.");
      if (controller.signal.aborted) throw invalidState("A canceled export token cannot begin a job.");
      const started = timestamp();
      const status = freezeStatus({
        id: snapshot.id,
        snapshotId: snapshot.id,
        documentRevision: snapshot.documentRevision,
        format: snapshot.intent.preferredFormat,
        state: "running",
        createdAt: snapshot.createdAt,
        updatedAt: started.iso,
        finishedAt: null,
        progress: freezeProgress(initialProgress),
        canCancel: true,
        failure: null,
      });
      const onAbort = () => {
        const record = records.get(snapshot.id);
        if (!record || record.status.state !== "running") return;
        const changed = timestamp();
        update(record, {
          state: "canceling",
          updatedAt: changed.iso,
          canCancel: false,
        });
      };
      controller.signal.addEventListener("abort", onAbort, { once: true });
      records.set(snapshot.id, {
        controller,
        startedMilliseconds: started.milliseconds,
        expected: Object.freeze({
          width: snapshot.intent.dimensions.width,
          height: snapshot.intent.dimensions.height,
          fps: snapshot.intent.fps.numerator,
          frameCount: snapshot.intent.finiteTimeline.frameCount,
          duration: snapshot.intent.finiteTimeline.frameCount / snapshot.intent.fps.numerator,
        }),
        status,
        receipt: null,
        detachAbort: () => controller.signal.removeEventListener("abort", onAbort),
      });
      activeId = snapshot.id;
      emit(status);
      return status;
    },

    report(jobId, progress) {
      const record = requireRecord(jobId);
      if (record.status.state !== "running") return record.status;
      const changed = timestamp();
      return update(record, {
        updatedAt: changed.iso,
        progress: freezeProgress(progress, record.status.progress.ratio),
      });
    },

    cancel(jobId) {
      const record = records.get(jobId);
      if (!record || record.status.state !== "running") return false;
      const changed = timestamp();
      update(record, {
        state: "canceling",
        updatedAt: changed.iso,
        canCancel: false,
      });
      record.controller.abort(new DOMException("Export canceled.", "AbortError"));
      return true;
    },

    complete(jobId, completion) {
      const record = requireRecord(jobId);
      if (record.status.state !== "running" || record.controller.signal.aborted) {
        throw invalidState("A canceled or settled export job cannot complete.");
      }
      if (completion.snapshotId !== record.status.snapshotId || completion.format !== record.status.format) {
        throw invalidState("Export completion does not match its locked job snapshot.");
      }
      if (
        completion.width !== record.expected.width
        || completion.height !== record.expected.height
        || completion.fps !== record.expected.fps
        || completion.frameCount !== record.expected.frameCount
        || completion.duration !== record.expected.duration
        || (completion.bytes !== null && (!Number.isSafeInteger(completion.bytes) || completion.bytes < 0))
      ) {
        throw invalidState("Export completion facts do not match the locked render plan.");
      }
      const finished = timestamp();
      const receipt = freezeReceipt({
        jobId,
        snapshotId: record.status.snapshotId,
        documentRevision: record.status.documentRevision,
        format: completion.format,
        startedAt: new Date(record.startedMilliseconds).toISOString(),
        finishedAt: finished.iso,
        elapsedMilliseconds: Math.max(0, finished.milliseconds - record.startedMilliseconds),
        completion,
      });
      record.receipt = receipt;
      if (activeId === jobId) activeId = null;
      update(record, {
        state: "completed",
        updatedAt: finished.iso,
        finishedAt: finished.iso,
        progress: freezeProgress({
          ...record.status.progress,
          phase: "complete",
          ratio: 1,
          completed: Math.max(record.status.progress.completed, record.status.progress.total),
          message: "Verified export complete",
          determinate: true,
          etaSeconds: 0,
          stallKind: null,
        }),
        canCancel: false,
        failure: null,
      });
      record.detachAbort();
      trimTerminalHistory();
      return receipt;
    },

    fail(jobId, error) {
      const record = requireRecord(jobId);
      const canceled = record.controller.signal.aborted || isCancellation(error);
      return finish(record, canceled ? "canceled" : "failed", Object.freeze({
        code: canceled ? "canceled" : "export-failed",
        message: canceled
          ? "Export canceled before verified publication."
          : "Export failed before verified publication.",
      }));
    },

    getStatus(jobId) {
      return records.get(jobId)?.status ?? null;
    },

    getReceipt(jobId) {
      return records.get(jobId)?.receipt ?? null;
    },

    getActiveStatus() {
      return activeId === null ? null : records.get(activeId)?.status ?? null;
    },

    listStatuses() {
      return Object.freeze([...records.values()].map((record) => record.status));
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return Object.freeze(controller);
}
