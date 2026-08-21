# Drift for macOS — CI evidence budgets

The packaged-WebKit matrix is a falsification tool, not permission for diagnostics to consume the entire release lane. Every subprocess that can wait on WindowServer, Gatekeeper, a temporary keychain, code signing, or the unified log has an explicit wall-clock budget.

## Default budgets

| Operation | Default budget | Failure meaning |
| --- | ---: | --- |
| One packaged app launch and self-test receipt | 75 seconds | The variant did not reach a complete receipt inside its runtime budget. |
| Unified-log evidence collection after one variant | 18 seconds | Preserve partial logs and mark collection as budget-limited; never hide the preceding app result. |
| `codesign`, `spctl`, `security`, `openssl`, and `ditto` subprocesses | 20 seconds each | The exact inspection/signing operation is recorded as timed out. |
| Receipt discovery after process exit | 8 seconds | The app wrote no discoverable receipt. |

The three runtime variants remain distinct:

1. production sandbox + ad-hoc local signature;
2. ad-hoc without App Sandbox, isolating sandbox effects;
3. production sandbox + temporary non-ad-hoc CI identity, isolating signing effects.

A variant timeout must not prevent the other variants, crash evidence, matrix summary, DMG checks, or release-guard checks from running when their prerequisites remain valid.

## Evidence rules

- A timeout is a result, not a reason to hang the workflow.
- Partial unified logs are retained with a clear budget-exhausted line.
- Diagnostic capture may never turn a completed app result into a job-level timeout.
- The production sandboxed variant remains the release gate. A passing diagnostic variant explains the boundary; it does not waive the production failure.
- Budget values can be reduced for focused CI investigation through `DRIFT_WEBVIEW_MATRIX_TIMEOUT`, `DRIFT_WEBVIEW_LOG_TIMEOUT`, and `DRIFT_WEBVIEW_COMMAND_TIMEOUT`.
- Raising a default requires an explicit source-contract update and evidence that the extra time measures product behavior rather than stalled diagnostics.

## Local reproduction

```bash
DRIFT_WEBVIEW_MATRIX_TIMEOUT=75 \
DRIFT_WEBVIEW_LOG_TIMEOUT=18 \
DRIFT_WEBVIEW_COMMAND_TIMEOUT=20 \
  bash scripts/probe-macos-packaged-webview.sh build/macos/Drift.app
```

Inspect:

```text
build/macos/packaged-webview/matrix-summary.json
build/macos/packaged-webview/variants/
build/macos/packaged-webview/logs/
build/macos/packaged-webview/crashes/
```

The matrix summary must distinguish product failure, sandbox/signing isolation, diagnostic timeout, and missing evidence. “The job ran out of time” is not an acceptable final diagnosis.
