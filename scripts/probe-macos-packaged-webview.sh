#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-${DRIFT_MACOS_OUTPUT_DIR:-$ROOT/build/macos}/Drift.app}"
EVIDENCE="${DRIFT_WEBVIEW_MATRIX_DIR:-$ROOT/build/macos/packaged-webview}"
TIMEOUT_SECONDS="${DRIFT_WEBVIEW_MATRIX_TIMEOUT:-75}"
LOG_TIMEOUT_SECONDS="${DRIFT_WEBVIEW_LOG_TIMEOUT:-18}"
COMMAND_TIMEOUT_SECONDS="${DRIFT_WEBVIEW_COMMAND_TIMEOUT:-20}"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/drift-webview-matrix.XXXXXX")"
KEYCHAIN="$(cd "$TEMP_ROOT" && pwd -P)/DriftCIRuntime.keychain-db"
KEYCHAIN_PASSWORD="drift-ci-$(uuidgen | tr '[:upper:]' '[:lower:]')"
KEYCHAIN_REGISTRATION_EVIDENCE="$TEMP_ROOT/user-keychain-registration.json"

cleanup() {
  python3 - "$KEYCHAIN" <<'PY' >/dev/null 2>&1 || true
import fcntl
import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

keychain_real = os.path.realpath(sys.argv[1])
lock_path = Path(tempfile.gettempdir()) / f"pitchdog-drift-keychain-list-{os.getuid()}.lock"
with lock_path.open("a+") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    try:
        listed = subprocess.run(
            ["security", "list-keychains", "-d", "user"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout
        current = shlex.split(listed)
        retained = [
            value for value in current if os.path.realpath(value) != keychain_real
        ]
        if retained != current:
            subprocess.run(
                ["security", "list-keychains", "-d", "user", "-s", *retained],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
PY
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT

fail() {
  echo "packaged-webview-matrix(mac): $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "the packaged WKWebView matrix must run on macOS"
[[ -d "$APP" ]] || fail "app bundle is missing: $APP"
for command in codesign ditto grep log node open openssl plutil python3 security spctl uuidgen; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done

python3 - "$ROOT/build/macos" "$EVIDENCE" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
evidence = Path(sys.argv[2]).resolve()
try:
    relative = evidence.relative_to(root)
except ValueError:
    raise SystemExit(f"unsafe evidence path outside the repository Mac build root: {evidence}")
if not relative.parts:
    raise SystemExit(f"unsafe evidence path is the Mac build root itself: {evidence}")
PY

mkdir -p "$EVIDENCE"
touch "$EVIDENCE/.drift-packaged-webview-evidence-v1"
# Clear only probe-owned children. Keep workflow checkout identity and any
# unrelated evidence placed beside the matrix.
rm -rf "$EVIDENCE/variants" "$EVIDENCE/logs" "$EVIDENCE/crashes"
rm -f "$EVIDENCE/matrix-summary.json"
mkdir -p "$EVIDENCE/variants" "$EVIDENCE/logs" "$EVIDENCE/crashes" "$TEMP_ROOT/variants"

cat > "$TEMP_ROOT/run-receipt.py" <<'PY'
from __future__ import annotations

import ctypes
import hashlib
import json
import os
import re
import secrets
import signal
import socket
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path

variant, app_raw, receipt_name, output_raw, timeout_raw = sys.argv[1:]
app = Path(app_raw).resolve()
output = Path(output_raw).resolve()
timeout = float(timeout_raw)
info = app / "Contents" / "Info.plist"
expected_bundle_id = subprocess.check_output(
    ["plutil", "-extract", "CFBundleIdentifier", "raw", "-o", "-", str(info)],
    text=True,
).strip()
expected_bundle_version = subprocess.check_output(
    ["plutil", "-extract", "CFBundleVersion", "raw", "-o", "-", str(info)],
    text=True,
).strip()
expected_source_revision = subprocess.check_output(
    ["plutil", "-extract", "DriftSourceRevision", "raw", "-o", "-", str(info)],
    text=True,
).strip()
expected_build_channel = subprocess.check_output(
    ["plutil", "-extract", "DriftBuildChannel", "raw", "-o", "-", str(info)],
    text=True,
).strip()
expected_cache_namespace = subprocess.check_output(
    ["plutil", "-extract", "DriftCacheNamespace", "raw", "-o", "-", str(info)],
    text=True,
).strip()
expected_storage_namespace = subprocess.check_output(
    ["plutil", "-extract", "DriftStorageNamespace", "raw", "-o", "-", str(info)],
    text=True,
).strip()
expected_website_data_store_identifier = subprocess.check_output(
    ["plutil", "-extract", "DriftWebsiteDataStoreIdentifier", "raw", "-o", "-", str(info)],
    text=True,
).strip()
expected_executable_name = subprocess.check_output(
    ["plutil", "-extract", "CFBundleExecutable", "raw", "-o", "-", str(info)],
    text=True,
).strip()
expected_app_executable = (app / "Contents" / "MacOS" / expected_executable_name).resolve()


@dataclass(frozen=True)
class ProcessIdentity:
    pid: int
    executablePath: str
    startSeconds: int
    startMicroseconds: int


@dataclass(frozen=True)
class ExecutableSnapshot:
    resolvedPath: str
    device: int
    inode: int
    size: int
    modificationTimeNanoseconds: int
    changeTimeNanoseconds: int


class ProcBSDInfo(ctypes.Structure):
    _fields_ = [
        ("pbi_flags", ctypes.c_uint32),
        ("pbi_status", ctypes.c_uint32),
        ("pbi_xstatus", ctypes.c_uint32),
        ("pbi_pid", ctypes.c_uint32),
        ("pbi_ppid", ctypes.c_uint32),
        ("pbi_uid", ctypes.c_uint32),
        ("pbi_gid", ctypes.c_uint32),
        ("pbi_ruid", ctypes.c_uint32),
        ("pbi_rgid", ctypes.c_uint32),
        ("pbi_svuid", ctypes.c_uint32),
        ("pbi_svgid", ctypes.c_uint32),
        ("rfu_1", ctypes.c_uint32),
        ("pbi_comm", ctypes.c_char * 16),
        ("pbi_name", ctypes.c_char * 32),
        ("pbi_nfiles", ctypes.c_uint32),
        ("pbi_pgid", ctypes.c_uint32),
        ("pbi_pjobc", ctypes.c_uint32),
        ("e_tdev", ctypes.c_uint32),
        ("e_tpgid", ctypes.c_uint32),
        ("pbi_nice", ctypes.c_int32),
        ("pbi_start_tvsec", ctypes.c_uint64),
        ("pbi_start_tvusec", ctypes.c_uint64),
    ]


PROC_PIDTBSDINFO = 3
if ctypes.sizeof(ProcBSDInfo) != 136:
    raise RuntimeError("unexpected public proc_bsdinfo ABI size")

libproc = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
libproc.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
libproc.proc_pidpath.restype = ctypes.c_int
libproc.proc_pidinfo.argtypes = [
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_uint64,
    ctypes.c_void_p,
    ctypes.c_int,
]
libproc.proc_pidinfo.restype = ctypes.c_int
libproc.proc_listallpids.argtypes = [ctypes.c_void_p, ctypes.c_int]
libproc.proc_listallpids.restype = ctypes.c_int


def process_path(pid: int) -> Path | None:
    buffer = ctypes.create_string_buffer(4096)
    length = libproc.proc_pidpath(pid, buffer, len(buffer))
    if length <= 0:
        return None
    try:
        return Path(os.fsdecode(buffer.value)).resolve()
    except (OSError, ValueError):
        return None


def process_bsd_info(pid: int) -> ProcBSDInfo | None:
    info = ProcBSDInfo()
    received = libproc.proc_pidinfo(
        pid,
        PROC_PIDTBSDINFO,
        0,
        ctypes.byref(info),
        ctypes.sizeof(info),
    )
    if received != ctypes.sizeof(info):
        return None
    return info


def process_start_identity(pid: int) -> tuple[int, int] | None:
    info = process_bsd_info(pid)
    if info is None:
        return None
    seconds = int(info.pbi_start_tvsec)
    microseconds = int(info.pbi_start_tvusec)
    if seconds <= 0 or not 0 <= microseconds < 1_000_000:
        return None
    return seconds, microseconds


def all_pids() -> list[int]:
    estimated = libproc.proc_listallpids(None, 0)
    if estimated <= 0:
        return []
    values = (ctypes.c_int * (estimated + 512))()
    count = libproc.proc_listallpids(values, ctypes.sizeof(values))
    if count <= 0:
        return []
    return [pid for pid in values[:count] if pid > 1]


def process_identity(pid: int, expected_executable: Path) -> ProcessIdentity | None:
    path_before = process_path(pid)
    start = process_start_identity(pid)
    path_after = process_path(pid)
    if path_before != expected_executable or path_after != expected_executable or start is None:
        return None
    return ProcessIdentity(
        pid=pid,
        executablePath=str(expected_executable),
        startSeconds=start[0],
        startMicroseconds=start[1],
    )


def matching_identities(executable: Path) -> set[ProcessIdentity]:
    return {
        identity
        for pid in all_pids()
        if (identity := process_identity(pid, executable)) is not None
    }


def identity_is_current(identity: ProcessIdentity) -> bool:
    return process_identity(identity.pid, Path(identity.executablePath)) == identity


def executable_snapshot(executable: Path) -> ExecutableSnapshot:
    status = executable.stat()
    return ExecutableSnapshot(
        resolvedPath=str(executable),
        device=status.st_dev,
        inode=status.st_ino,
        size=status.st_size,
        modificationTimeNanoseconds=status.st_mtime_ns,
        changeTimeNanoseconds=status.st_ctime_ns,
    )


def executable_snapshot_is_current(snapshot: ExecutableSnapshot) -> bool:
    try:
        return executable_snapshot(Path(snapshot.resolvedPath)) == snapshot
    except OSError:
        return False


def write_json_atomic(path: Path, value: dict[str, object]) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def terminate_exact_app(identity: ProcessIdentity) -> None:
    if (
        not identity_is_current(identity)
        or not executable_snapshot_is_current(expected_app_executable_snapshot)
    ):
        return
    try:
        os.kill(identity.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline and identity_is_current(identity):
        time.sleep(0.05)
    if (
        identity_is_current(identity)
        and executable_snapshot_is_current(expected_app_executable_snapshot)
    ):
        os.kill(identity.pid, signal.SIGKILL)


def utf8_hex(value: str) -> str:
    return value.encode("utf-8").hex()


def canonical_request_material(request: dict[str, object]) -> str:
    return "\n".join([
        "drift-webcontent-termination-request-v2",
        "schemaVersion=2",
        f"receiptNameHex={utf8_hex(request['receiptName'])}",
        f"runNonceHex={utf8_hex(request['runNonce'])}",
        f"bundleIdentifierHex={utf8_hex(request['bundleIdentifier'])}",
        f"bundleVersionHex={utf8_hex(request['bundleVersion'])}",
        f"sourceRevisionHex={utf8_hex(request['sourceRevision'])}",
        f"appExecutablePathHex={utf8_hex(request['appExecutablePath'])}",
        f"appPID={request['appPID']}",
        f"appStartSeconds={request['appStartSeconds']}",
        f"appStartMicroseconds={request['appStartMicroseconds']}",
        f"phaseHex={utf8_hex(request['phase'])}",
        f"sequence={request['sequence']}",
        f"documentEpoch={request['documentEpoch']}",
        f"authorityGenerationDigestHex={utf8_hex(request['authorityGenerationDigest'])}",
        f"networkPolicyIdentifierHex={utf8_hex(request['networkPolicyIdentifier'])}",
    ]) + "\n"


def canonical_request_digest(request: dict[str, object]) -> str:
    return hashlib.sha256(canonical_request_material(request).encode("utf-8")).hexdigest()


def resolve_existing_executable_binding(value: object) -> Path | None:
    if not isinstance(value, str) or not value.startswith("/"):
        return None
    try:
        return Path(value).resolve(strict=True)
    except (OSError, RuntimeError):
        return None


expected_app_executable_snapshot = executable_snapshot(expected_app_executable)
if resolve_existing_executable_binding(str(expected_app_executable)) != expected_app_executable:
    raise RuntimeError("the executable-binding canonicalizer failed its exact-path self-test")
run_nonce = secrets.token_hex(32)
probe_token = f"drift-{secrets.token_hex(16)}"
probe_listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
probe_listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
probe_listener.bind(("127.0.0.1", 0))
probe_listener.listen(8)
probe_listener.settimeout(0.2)
probe_port = probe_listener.getsockname()[1]
probe_url = f"http://127.0.0.1:{probe_port}/{probe_token}"
web_rtc_udp_listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
# TCP and UDP have independent port spaces. Reuse the token-bound HTTP probe's
# random port so the page needs no second privileged launch argument.
web_rtc_udp_listener.bind(("127.0.0.1", probe_port))
web_rtc_udp_listener.settimeout(0.2)
probe_stop = threading.Event()
probe_tcp_connections: list[dict[str, object]] = []
web_rtc_udp_datagrams: list[dict[str, object]] = []
probe_lock = threading.Lock()


def read_bounded_http_request(connection: socket.socket, maximum: int = 8192) -> bytes:
    request_parts: list[bytes] = []
    request_size = 0
    while request_size < maximum:
        try:
            chunk = connection.recv(maximum - request_size)
        except OSError:
            break
        if not chunk:
            break
        request_parts.append(chunk)
        request_size += len(chunk)
        joined = b"".join(request_parts)
        if b"\r\n\r\n" in joined or b"\n\n" in joined:
            break
    return b"".join(request_parts)


def run_tcp_detector_self_test() -> bool:
    reader, writer = socket.socketpair()
    reader.settimeout(0.5)
    expected = b"GET /drift-fragmented?lane=fetch HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"

    def send_fragments() -> None:
        try:
            writer.sendall(b"GET /drift-")
            time.sleep(0.01)
            writer.sendall(expected[len(b"GET /drift-"):])
        finally:
            writer.close()

    sender = threading.Thread(target=send_fragments, name="drift-tcp-detector-self-test")
    sender.start()
    try:
        observed = read_bounded_http_request(reader)
    finally:
        reader.close()
    sender.join(timeout=1)
    return not sender.is_alive() and observed == expected


def serve_network_probe() -> None:
    token = probe_token.encode("ascii")
    while not probe_stop.is_set():
        try:
            connection, source = probe_listener.accept()
        except TimeoutError:
            continue
        except OSError:
            break
        connection_record: dict[str, object] = {
            "acceptedAtMonotonicSeconds": time.monotonic(),
            "sourceHost": source[0],
            "sourcePort": source[1],
            "requestByteCount": 0,
            "tokenPresent": False,
            "lane": "unclassified",
        }
        # An accepted connection is already proof that the TCP boundary opened.
        # Record it before reading: TCP is a stream, so the token is not
        # guaranteed to arrive in the first recv() (or at all).
        with probe_lock:
            probe_tcp_connections.append(connection_record)
        with connection:
            connection.settimeout(0.5)
            request = read_bounded_http_request(connection)
            lane = "unknown" if token in request else "unbound"
            if token in request:
                for candidate in ("fetch", "image", "beacon", "websocket", "attachment"):
                    if f"lane={candidate}".encode("ascii") in request:
                        lane = candidate
                        break
            with probe_lock:
                connection_record.update({
                    "requestByteCount": len(request),
                    "tokenPresent": token in request,
                    "lane": lane,
                })
            try:
                connection.sendall(
                    b"HTTP/1.1 204 No Content\r\n"
                    b"Content-Length: 0\r\n"
                    b"Connection: close\r\n\r\n"
                )
            except OSError:
                pass


def serve_web_rtc_udp_probe() -> None:
    token = probe_token.encode("ascii")
    stun_magic_cookie = b"\x21\x12\xa4\x42"
    while not probe_stop.is_set():
        try:
            packet, source = web_rtc_udp_listener.recvfrom(65_535)
        except TimeoutError:
            continue
        except OSError:
            break
        is_stun = (
            len(packet) >= 20
            and packet[0] & 0xC0 == 0
            and packet[4:8] == stun_magic_cookie
        )
        with probe_lock:
            web_rtc_udp_datagrams.append({
                "byteCount": len(packet),
                "isSTUN": is_stun,
                "tokenPresent": token in packet,
                "sourceHost": source[0],
                "sourcePort": source[1],
            })


probe_thread = threading.Thread(target=serve_network_probe, name="drift-network-probe", daemon=True)
web_rtc_udp_thread = threading.Thread(
    target=serve_web_rtc_udp_probe,
    name="drift-webrtc-udp-probe",
    daemon=True,
)
tcp_probe_detector_self_test_passed = run_tcp_detector_self_test()
if not tcp_probe_detector_self_test_passed:
    raise RuntimeError("the loopback TCP detector missed a fragmented request")
probe_thread.start()
web_rtc_udp_thread.start()

home = Path.home()
roots = [
    home / "Library" / "Containers" / expected_bundle_id / "Data" / "Library" / "Caches" / expected_cache_namespace / "SelfTests",
    home / "Library" / "Caches" / expected_cache_namespace / "SelfTests",
]
for root in roots:
    for suffix in ("", ".termination-request.json", ".termination-ack.json"):
        (root / f"{receipt_name}{suffix}").unlink(missing_ok=True)

baseline_app_identities = matching_identities(expected_app_executable)

command = [
    "open", "-W", "-n", str(app), "--args",
    "--webview-self-test",
    f"--webview-self-test-report-name={receipt_name}",
    f"--webview-self-test-network-probe-url={probe_url}",
    f"--webview-self-test-run-nonce={run_nonce}",
]
launch_started = time.monotonic()
launch_started_wall = time.time()
launcher = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
deadline = launch_started + timeout
app_identity: ProcessIdentity | None = None
termination_requested = False
termination_request_digest: str | None = None
request_app_executable_raw: str | None = None
request_app_executable_resolved: str | None = None
request_app_executable_snapshot: ExecutableSnapshot | None = None
request_app_executable_same_snapshot: bool | None = None
coordination_failures: list[str] = []

while time.monotonic() < deadline:
    if not executable_snapshot_is_current(expected_app_executable_snapshot):
        coordination_failures.append("the exact app executable changed after the launch snapshot")
        break
    current_app_identities = matching_identities(expected_app_executable)
    new_app_identities = current_app_identities - baseline_app_identities
    if len(new_app_identities) == 1:
        observed_app_identity = next(iter(new_app_identities))
        if app_identity is None:
            app_identity = observed_app_identity
        elif app_identity != observed_app_identity:
            coordination_failures.append("the exact app process identity changed during the controlled run")
            break
    elif len(new_app_identities) > 1:
        coordination_failures.append("more than one new exact app identity appeared; refusing ambiguous cleanup")
        break

    request_path: Path | None = None
    request: dict[str, object] | None = None
    for root in roots:
        candidate = root / f"{receipt_name}.termination-request.json"
        if candidate.is_file():
            request_path = candidate
            try:
                request = json.loads(candidate.read_text(encoding="utf-8"))
            except Exception as error:  # noqa: BLE001 - hostile evidence
                coordination_failures.append(f"termination request was unreadable: {type(error).__name__}: {error}")
            break

    if request_path is not None and not termination_requested:
        termination_requested = True
        if request is None:
            break
        exact_integer_fields = [
            "appPID",
            "appStartSeconds",
            "appStartMicroseconds",
            "sequence",
            "documentEpoch",
        ]
        if any(
            not isinstance(request.get(field), int) or isinstance(request.get(field), bool)
            for field in exact_integer_fields
        ):
            coordination_failures.append("termination request contained a non-integral identity field")
            break
        exact_string_fields = [
            "receiptName",
            "runNonce",
            "bundleIdentifier",
            "bundleVersion",
            "sourceRevision",
            "appExecutablePath",
            "phase",
            "authorityGenerationDigest",
            "networkPolicyIdentifier",
            "requestDigest",
        ]
        if any(not isinstance(request.get(field), str) for field in exact_string_fields):
            coordination_failures.append("termination request contained a non-string binding field")
            break
        if request.get("schemaVersion") != 2 or request.get("receiptName") != receipt_name:
            coordination_failures.append("termination request identity did not match this run")
            break
        if request.get("runNonce") != run_nonce or re.fullmatch(r"[0-9a-f]{64}", run_nonce) is None:
            coordination_failures.append("termination request did not echo the launcher's 256-bit run nonce")
            break
        exact_bundle_bindings = {
            "bundleIdentifier": expected_bundle_id,
            "bundleVersion": expected_bundle_version,
            "sourceRevision": expected_source_revision,
        }
        mismatched_bundle_bindings = sorted(
            field
            for field, expected in exact_bundle_bindings.items()
            if request.get(field) != expected
        )
        request_app_executable_raw = request["appExecutablePath"]
        canonical_request_app_executable = resolve_existing_executable_binding(
            request_app_executable_raw
        )
        if canonical_request_app_executable is not None:
            try:
                request_app_executable_snapshot = executable_snapshot(
                    canonical_request_app_executable
                )
            except OSError:
                request_app_executable_snapshot = None
        request_app_executable_same_snapshot = (
            request_app_executable_snapshot == expected_app_executable_snapshot
        )
        if (
            canonical_request_app_executable != expected_app_executable
            or not request_app_executable_same_snapshot
        ):
            mismatched_bundle_bindings.append("appExecutablePath")
        if mismatched_bundle_bindings:
            coordination_failures.append(
                "termination request did not bind the exact bundle fields: "
                + ", ".join(mismatched_bundle_bindings)
            )
            break
        request_app_executable_resolved = str(canonical_request_app_executable)
        if (
            request.get("phase") != "awaiting-webcontent-termination"
            or request.get("sequence") != 1
            or request.get("documentEpoch", 0) <= 0
            or re.fullmatch(r"[0-9a-f]{64}", request.get("authorityGenerationDigest", "")) is None
            or request.get("networkPolicyIdentifier") != "dog.pitch.drift.network-lock.v3"
        ):
            coordination_failures.append("termination request phase, sequence, authority generation, or policy was invalid")
            break
        if canonical_request_digest(request) != request.get("requestDigest"):
            coordination_failures.append("termination request canonical digest did not verify")
            break
        termination_request_digest = request["requestDigest"]
        if app_identity is None or not identity_is_current(app_identity):
            coordination_failures.append("no one exact newly launched app identity remained current")
            break
        request_app_identity = ProcessIdentity(
            pid=request["appPID"],
            executablePath=request_app_executable_resolved,
            startSeconds=request["appStartSeconds"],
            startMicroseconds=request["appStartMicroseconds"],
        )
        if request_app_identity != app_identity:
            coordination_failures.append("termination request app identity did not match the public libproc launch snapshot")
            break

        acknowledgement = {
            key: request[key]
            for key in [
                "receiptName",
                "runNonce",
                "bundleIdentifier",
                "bundleVersion",
                "sourceRevision",
                "appExecutablePath",
                "appPID",
                "appStartSeconds",
                "appStartMicroseconds",
                "phase",
                "sequence",
                "documentEpoch",
                "authorityGenerationDigest",
                "networkPolicyIdentifier",
                "requestDigest",
            ]
        }
        acknowledgement.update({
            "schemaVersion": 2,
            "recoveryMode": "simulated-public-delegate-seam",
            "externalProcessKilled": False,
            "signalSentToWebContent": False,
            "publicAPIOwnershipClaimed": False,
            "processTerminationClaimed": False,
        })
        write_json_atomic(
            request_path.with_name(f"{receipt_name}.termination-ack.json"),
            acknowledgement,
        )

    if launcher.poll() is not None:
        break
    time.sleep(0.05)

timed_out = launcher.poll() is None
if timed_out:
    if app_identity is not None:
        terminate_exact_app(app_identity)
    else:
        remaining = matching_identities(expected_app_executable) - baseline_app_identities
        if len(remaining) == 1:
            terminate_exact_app(next(iter(remaining)))
        elif remaining:
            coordination_failures.append("timed out with ambiguous exact app identities; no broad kill attempted")

try:
    stdout, stderr = launcher.communicate(timeout=4)
except subprocess.TimeoutExpired:
    launcher.terminate()
    stdout, stderr = launcher.communicate(timeout=2)
probe_stop.set()
probe_listener.close()
web_rtc_udp_listener.close()
probe_thread.join(timeout=1)
web_rtc_udp_thread.join(timeout=1)
probe_coordinators_stopped = not probe_thread.is_alive() and not web_rtc_udp_thread.is_alive()

launch: dict[str, object] = {
    "timedOut": timed_out,
    "returnCode": launcher.returncode,
    "stdout": stdout[-16_384:],
    "stderr": stderr[-16_384:],
    "elapsedSeconds": time.monotonic() - launch_started,
    "startedAtUnix": launch_started_wall,
    "runNonce": run_nonce,
    "appPID": app_identity.pid if app_identity is not None else None,
    "appIdentity": asdict(app_identity) if app_identity is not None else None,
    "appExecutableSnapshot": asdict(expected_app_executable_snapshot),
    "recoveryRequested": termination_requested,
    "recoveryMode": "simulated-public-delegate-seam",
    "externalProcessKilled": False,
    "signalSentToWebContent": False,
    "publicAPIOwnershipClaimed": False,
    "processTerminationClaimed": False,
    "recoveryRequestDigest": termination_request_digest,
    "requestAppExecutableBinding": {
        "requestPath": request_app_executable_raw,
        "requestResolvedPath": request_app_executable_resolved,
        "expectedResolvedPath": str(expected_app_executable),
        "requestSnapshot": (
            asdict(request_app_executable_snapshot)
            if request_app_executable_snapshot is not None else None
        ),
        "expectedSnapshot": asdict(expected_app_executable_snapshot),
        "sameSnapshot": request_app_executable_same_snapshot,
    },
    "coordinationFailures": coordination_failures,
    "networkProbeCoordinatorsStopped": probe_coordinators_stopped,
    "tcpProbeDetectorSelfTestPassed": tcp_probe_detector_self_test_passed,
    "networkProbeAttemptCount": 5,
    "networkProbeAcceptedConnections": len(probe_tcp_connections),
    "networkProbeAcceptedRequests": sum(
        1 for value in probe_tcp_connections if value["requestByteCount"] > 0
    ),
    "networkProbeAcceptedLanes": sorted(
        str(value["lane"]) for value in probe_tcp_connections
    ),
    "networkProbeTCPConnections": probe_tcp_connections,
    "webRTCUDPProbeToken": probe_token,
    "webRTCUDPProbePort": probe_port,
    "webRTCUDPSTUNDatagramCount": sum(1 for value in web_rtc_udp_datagrams if value["isSTUN"]),
    "webRTCUDPSTUNTokenHitCount": sum(
        1 for value in web_rtc_udp_datagrams if value["isSTUN"] and value["tokenPresent"]
    ),
    "webRTCUDPNonSTUNDatagramCount": sum(1 for value in web_rtc_udp_datagrams if not value["isSTUN"]),
    "webRTCUDPZeroHit": not web_rtc_udp_datagrams,
    "webRTCUDPDatagrams": web_rtc_udp_datagrams,
}

receipt_path: Path | None = None
deadline = time.monotonic() + 8
while time.monotonic() < deadline and receipt_path is None:
    for root in roots:
        candidate = root / receipt_name
        if candidate.is_file():
            receipt_path = candidate
            break
    if receipt_path is None:
        time.sleep(0.1)

container = home / "Library" / "Containers" / expected_bundle_id
if receipt_path is None and container.is_dir():
    matches = list(container.rglob(receipt_name))
    if len(matches) == 1:
        receipt_path = matches[0]

receipt: dict[str, object] | None = None
receipt_error: str | None = None
if receipt_path is not None:
    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001 - evidence path
        receipt_error = f"{type(error).__name__}: {error}"
    finally:
        receipt_path.unlink(missing_ok=True)
for root in roots:
    (root / f"{receipt_name}.termination-request.json").unlink(missing_ok=True)
    (root / f"{receipt_name}.termination-ack.json").unlink(missing_ok=True)

failures: list[str] = []
def expect(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)

expect(receipt is not None, "application wrote no self-test receipt")
expect(not timed_out, "application exceeded its packaged-runtime deadline")
expect(not coordination_failures, "; ".join(coordination_failures))
expect(probe_coordinators_stopped, "a loopback probe coordinator did not stop before evidence was sealed")
expect(tcp_probe_detector_self_test_passed, "the loopback TCP detector failed its fragmented-stream self-test")
expect(termination_requested, "application never requested the run-bound recovery seam")
expect(
    not probe_tcp_connections,
    f"WebKit outbound policy accepted loopback TCP connections: {probe_tcp_connections}",
)
expect(
    not web_rtc_udp_datagrams,
    f"page-world WebRTC capability leaked UDP/STUN datagrams: {web_rtc_udp_datagrams}",
)
if receipt is not None:
    expect(receipt.get("schemaVersion") == 2, "unknown receipt schema")
    expect(receipt.get("ok") is True, str(receipt.get("message") or "packaged WebView self-test failed"))
    expect(receipt.get("bundleIdentifier") == expected_bundle_id, "receipt bundle identifier changed")
    expect(receipt.get("bundleVersion") == expected_bundle_version, "receipt bundle version changed")
    expect(receipt.get("sourceRevision") == expected_source_revision, "receipt source revision changed")
    expect(receipt.get("buildChannel") == expected_build_channel, "runtime build channel changed")
    expect(receipt.get("cacheNamespace") == expected_cache_namespace, "runtime cache namespace changed")
    expect(receipt.get("storageNamespace") == expected_storage_namespace, "runtime storage namespace changed")
    expect(receipt.get("websiteDataStoreIdentifier") == expected_website_data_store_identifier, "runtime website data-store identifier changed")
    expect(receipt.get("runtimeBuildIdentityVerified") is True, "signed Web runtime and native build identity disagree")
    expect(receipt.get("startedNavigation") is True, "WKWebView never started navigation")
    expect(receipt.get("committedNavigation") is True, "WKWebView never committed navigation")
    expect(receipt.get("finishedNavigation") is True, "WKWebView never finished navigation")
    expect(receipt.get("documentAuthorityDelivered") is True, "AppKit document authority was never delivered")
    expect(receipt.get("nativeDocumentActive") is True, "native document authority was not active at receipt time")
    expect(int(receipt.get("contentProcessTerminationCount", -1)) == 0, "the safe packaged test observed an actual WebContent termination")
    expect(receipt.get("terminationInduced") is False, "the safe packaged test overclaimed a WebContent termination")
    expect(receipt.get("recoveryMode") == "simulated-public-delegate-seam", "the receipt misstated the recovery mode")
    expect(receipt.get("recoveryDelegateSeamSimulated") is True, "the shared public delegate seam was not simulated")
    expect(int(receipt.get("recoveryDelegateSeamInvocationCount", -1)) == 1, "the shared recovery seam did not run exactly once")
    expect(receipt.get("externalProcessKilled") is False, "the packaged gauntlet killed an external process")
    expect(receipt.get("signalSentToWebContent") is False, "the packaged gauntlet signaled WebContent")
    expect(receipt.get("publicAPIOwnershipClaimed") is False, "the receipt claimed unavailable public PID ownership")
    expect(receipt.get("processTerminationClaimed") is False, "the receipt claimed a process termination")
    expect(receipt.get("terminationAcknowledgementValidated") is True, "the app did not validate every external acknowledgement binding")
    expect(receipt.get("terminationRunNonce") == run_nonce, "the receipt did not retain the launcher's exact run binding")
    expect(
        isinstance(receipt.get("terminationRequestDigest"), str)
        and re.fullmatch(r"[0-9a-f]{64}", receipt["terminationRequestDigest"]) is not None,
        "the app retained no canonical termination-request digest",
    )
    expect(
        receipt.get("terminationRequestDigest") == termination_request_digest,
        "the app receipt and external coordinator disagree on the canonical request digest",
    )
    expect(
        isinstance(receipt.get("terminationDocumentEpoch"), int)
        and isinstance(receipt.get("recoveredDocumentEpoch"), int)
        and receipt["recoveredDocumentEpoch"] > receipt["terminationDocumentEpoch"] > 0,
        "the replacement document did not advance AppKit's authority generation",
    )
    expect(receipt.get("staleDocumentRejected") is True, "the replaced document authority was not rejected after recovery")
    expect(receipt.get("recoveredCommandVerified") is True, "the replacement document did not reach a fresh non-mutating host authority probe")
    expect(receipt.get("persistedAssetVerified") is True, "the native-imported asset did not survive WebContent recovery")
    expect(receipt.get("webKitFileInputVerified") is True, "typed native file ingestion was not verified")
    expect(receipt.get("nativeImportCompletionVerified") is True, "AppKit import completion preceded durable React persistence")
    expect(receipt.get("isolatedDatabaseCleanupVerified") is True, "isolated packaged-test database was not deleted")
    expect(receipt.get("networkPolicyInstalled") is True, "the production WebKit outbound policy was not installed")
    expect(receipt.get("outboundProbeAttempted") is True, "the page did not issue the WebKit outbound falsification lanes")
    expect(receipt.get("outboundProbeCompleted") is True, "the page did not settle the WebKit outbound falsification lanes")
    expect(receipt.get("webRTCCapabilityBoundary") == "page-world-document-start-lockdown", "the WebRTC boundary was misstated")
    expect(receipt.get("webRTCCapabilityLockdownVerified") is True, "the page-world WebRTC constructors were not locked")
    expect(receipt.get("webRTCProbeToken") == probe_token, "the WebRTC UDP probe was not bound to this run token")
    expect(receipt.get("arbitraryRendererCompromiseContainmentClaimed") is False, "the page capability test overclaimed arbitrary renderer containment")
    expect(receipt.get("webKitOutboundPolicyInstalled") is True, "the runtime did not report its WebKit outbound policy")
    expect(receipt.get("webKitOutboundPolicyVersion") == 3, "the runtime used an unknown WebKit outbound policy")
    expect(receipt.get("nativeNetworkClientSurface") == "none-shipped", "the bundle reports an unexpected native network client surface")
    expect(receipt.get("networkBoundary") == "app-entitled-webkit-blocked", "the runtime network boundary is misstated")
    if variant == "unsandboxed-adhoc":
        expect(receipt.get("sandboxed") is False, "the unsandboxed control still reports App Sandbox")
        expect(receipt.get("networkClientEntitled") is False, "the unsandboxed control falsely reports a network-client entitlement")
    else:
        expect(receipt.get("sandboxed") is True, "the sandboxed variant does not report App Sandbox")
        expect(receipt.get("networkClientEntitled") is True, "the sandboxed variant lacks its required network-client entitlement")
    expect(receipt.get("saveState") == "saved", "React project was not durably saved")
    expect(receipt.get("projectBusy") is False, "React project operation remained busy")
    expect(receipt.get("exportInProgress") is False, "React export remained in progress")
if receipt_error:
    failures.append(f"receipt could not be decoded: {receipt_error}")

result = {
    "schemaVersion": 1,
    "variant": variant,
    "app": str(app),
    "bundleIdentifier": expected_bundle_id,
    "passed": not failures,
    "failures": failures,
    "launch": launch,
    "receipt": receipt,
    "receiptError": receipt_error,
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2, sort_keys=True))
raise SystemExit(0 if result["passed"] else 1)
PY

cat > "$TEMP_ROOT/run-bounded.py" <<'PY'
from __future__ import annotations

import subprocess
import sys

timeout = float(sys.argv[1])
command = sys.argv[2:]
try:
    completed = subprocess.run(command, check=False, timeout=timeout)
except subprocess.TimeoutExpired:
    print(
        f"bounded command exceeded {timeout:g}s: {' '.join(command)}",
        file=sys.stderr,
    )
    raise SystemExit(124)
raise SystemExit(completed.returncode)
PY

bounded() {
  local seconds="$1"
  shift
  python3 "$TEMP_ROOT/run-bounded.py" "$seconds" "$@"
}

capture_signature() {
  local app_path="$1"
  local variant="$2"
  bounded "$COMMAND_TIMEOUT_SECONDS" codesign -dv --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-signature.txt" 2>&1 || true
  bounded "$COMMAND_TIMEOUT_SECONDS" codesign -d --entitlements :- "$app_path" >"$EVIDENCE/variants/$variant-entitlements.plist" 2>"$EVIDENCE/variants/$variant-entitlements.stderr" || true
  bounded "$COMMAND_TIMEOUT_SECONDS" codesign --verify --deep --strict --all-architectures --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-codesign-verify.txt" 2>&1 || true
  bounded "$COMMAND_TIMEOUT_SECONDS" spctl --assess --type execute --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-spctl.txt" 2>&1 || true
}

capture_runtime_logs() {
  local variant="$1"
  local result="$2"
  python3 - \
    "$EVIDENCE/logs/$variant-system.log" \
    "$LOG_TIMEOUT_SECONDS" \
    "$result" \
    "$EVIDENCE/crashes" \
    "$variant" <<'PY'
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

output = Path(sys.argv[1])
timeout = float(sys.argv[2])
result_path = Path(sys.argv[3])
crash_output = Path(sys.argv[4])
variant = sys.argv[5]
try:
    result = json.loads(result_path.read_text(encoding="utf-8"))
except Exception as error:  # noqa: BLE001 - evidence path
    output.write_text(f"Exact runtime result unavailable: {type(error).__name__}: {error}\n", encoding="utf-8")
    raise SystemExit(0)

launch = result.get("launch") if isinstance(result.get("launch"), dict) else {}
pids: set[int] = set()
app_pid = launch.get("appPID")
if isinstance(app_pid, int) and app_pid > 1:
    pids.add(app_pid)
started_at = launch.get("startedAtUnix")
if not isinstance(started_at, (int, float)):
    started_at = 0
if not pids:
    output.write_text("No exact app PID was recorded; broad logs were intentionally not collected.\n", encoding="utf-8")
    raise SystemExit(0)

predicate = " OR ".join(f"processIdentifier == {pid}" for pid in sorted(pids))
start_text = datetime.fromtimestamp(max(0, float(started_at) - 2)).strftime("%Y-%m-%d %H:%M:%S")
command = [
    "log", "show",
    "--start", start_text,
    "--style", "compact",
    "--predicate", predicate,
]
try:
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    text = completed.stdout
    if completed.stderr:
        text += "\n--- stderr ---\n" + completed.stderr
    if completed.returncode != 0:
        text += f"\nlog show returned {completed.returncode}\n"
except subprocess.TimeoutExpired as error:
    stdout = error.stdout if isinstance(error.stdout, str) else ""
    stderr = error.stderr if isinstance(error.stderr, str) else ""
    text = (
        stdout
        + ("\n--- stderr ---\n" + stderr if stderr else "")
        + f"\nlog collection stopped after its {timeout:g}s evidence budget.\n"
    )
output.write_text(text, encoding="utf-8")

diagnostics = Path.home() / "Library" / "Logs" / "DiagnosticReports"
if diagnostics.is_dir():
    crash_output.mkdir(parents=True, exist_ok=True)
    pid_patterns = [re.compile(rf'"pid"\s*:\s*{pid}(?:\D|$)') for pid in pids]
    for report in diagnostics.iterdir():
        try:
            if not report.is_file() or report.stat().st_mtime < float(started_at) - 2:
                continue
            sample = report.read_text(encoding="utf-8", errors="replace")[:1_048_576]
        except OSError:
            continue
        if any(pattern.search(sample) for pattern in pid_patterns):
            shutil.copy2(report, crash_output / f"{variant}-{report.name}")
PY
}

run_variant() {
  local variant="$1"
  local app_path="$2"
  local result="$EVIDENCE/variants/$variant.json"
  local receipt="matrix-$variant-$(date +%s)-${RANDOM}.json"

  capture_signature "$app_path" "$variant"
  set +e
  python3 "$TEMP_ROOT/run-receipt.py" \
    "$variant" "$app_path" "$receipt" "$result" "$TIMEOUT_SECONDS"
  local status=$?
  set -e
  capture_runtime_logs "$variant" "$result"
  return "$status"
}

write_setup_failure() {
  local variant="$1"
  local failure_class="$2"
  local setup_status="$3"
  python3 - "$EVIDENCE/variants/$variant.json" "$variant" "$failure_class" "$setup_status" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
variant = sys.argv[2]
failure_class = sys.argv[3]
status = int(sys.argv[4])
if failure_class not in {"diagnostic-setup-failure", "identity-setup-failure"}:
    raise SystemExit(f"unknown setup failure class: {failure_class}")
path.write_text(json.dumps({
    "schemaVersion": 1,
    "variant": variant,
    "passed": False,
    "failures": [f"{failure_class} with status {status}"],
    "setupFailureClass": failure_class,
}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY
}

SANDBOX_ADHOC_STATUS=0
run_variant "sandbox-adhoc" "$APP" || SANDBOX_ADHOC_STATUS=$?

UNSANDBOXED="$TEMP_ROOT/variants/Drift-unsandboxed-adhoc.app"
UNSANDBOXED_SETUP_STATUS=0
set +e
bounded "$COMMAND_TIMEOUT_SECONDS" ditto "$APP" "$UNSANDBOXED"
UNSANDBOXED_SETUP_STATUS=$?
if [[ $UNSANDBOXED_SETUP_STATUS -eq 0 ]]; then
  bounded "$COMMAND_TIMEOUT_SECONDS" codesign \
    --force --options runtime --sign - --timestamp=none "$UNSANDBOXED"
  UNSANDBOXED_SETUP_STATUS=$?
fi
set -e
if [[ $UNSANDBOXED_SETUP_STATUS -eq 0 ]]; then
  UNSANDBOXED_STATUS=0
  run_variant "unsandboxed-adhoc" "$UNSANDBOXED" || UNSANDBOXED_STATUS=$?
else
  UNSANDBOXED_STATUS=$UNSANDBOXED_SETUP_STATUS
  write_setup_failure \
    "unsandboxed-adhoc" "diagnostic-setup-failure" "$UNSANDBOXED_SETUP_STATUS"
fi

SELF_SIGNED="$TEMP_ROOT/variants/Drift-sandbox-self-signed.app"
SELF_SIGNED_COPY_STATUS=0
set +e
bounded "$COMMAND_TIMEOUT_SECONDS" ditto "$APP" "$SELF_SIGNED"
SELF_SIGNED_COPY_STATUS=$?
set -e
cat > "$TEMP_ROOT/certificate.cnf" <<'EOF'
[req]
prompt = no
distinguished_name = distinguished_name
x509_extensions = extensions

[distinguished_name]
CN = Drift CI Runtime
OU = DRFTCI001
O = pitch.dog
C = US

[extensions]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
EOF

SELF_SIGNED_STATUS=125
set +e
OPENSSL_VERSION_STATUS=0
bounded "$COMMAND_TIMEOUT_SECONDS" openssl version -a \
  >"$EVIDENCE/variants/self-signed-openssl-version.txt" 2>&1
OPENSSL_VERSION_STATUS=$?
OPENSSL_HELP_STATUS=0
bounded "$COMMAND_TIMEOUT_SECONDS" openssl pkcs12 -help \
  >"$EVIDENCE/variants/self-signed-openssl-pkcs12-help.txt" 2>&1
OPENSSL_HELP_STATUS=$?
OPENSSL_LEGACY_SUPPORTED=false
if grep -q -- "-legacy" "$EVIDENCE/variants/self-signed-openssl-pkcs12-help.txt"; then
  OPENSSL_LEGACY_SUPPORTED=true
fi
python3 - \
  "$EVIDENCE/variants/self-signed-openssl-version.txt" \
  "$EVIDENCE/variants/self-signed-openssl-pkcs12-help.txt" \
  "$EVIDENCE/variants/self-signed-openssl-capability.json" \
  "$OPENSSL_VERSION_STATUS" \
  "$OPENSSL_HELP_STATUS" \
  "$OPENSSL_LEGACY_SUPPORTED" \
  "$(command -v openssl)" <<'PY'
import json
import sys
from pathlib import Path

version_path, help_path, output_path = map(Path, sys.argv[1:4])
version_status = int(sys.argv[4])
help_status = int(sys.argv[5])
legacy_supported = sys.argv[6] == "true"
command_path = sys.argv[7]
version_text = version_path.read_text(encoding="utf-8", errors="replace")
help_text = help_path.read_text(encoding="utf-8", errors="replace")
output_path.write_text(json.dumps({
    "schemaVersion": 1,
    "commandPath": command_path,
    "versionStatus": version_status,
    "versionFirstLine": version_text.splitlines()[0] if version_text.splitlines() else None,
    "pkcs12HelpStatus": help_status,
    "legacyOptionAdvertised": legacy_supported,
    "selectedCompatibilityMode": "legacy-option" if legacy_supported else "provider-default",
    "pkcs12HelpCaptured": bool(help_text),
}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY
OPENSSL_CAPABILITY_STATUS=$?

CERT_STATUS=0
if [[ $SELF_SIGNED_COPY_STATUS -ne 0 ]]; then
  CERT_STATUS=$SELF_SIGNED_COPY_STATUS
elif [[ $OPENSSL_VERSION_STATUS -ne 0 || $OPENSSL_CAPABILITY_STATUS -ne 0 ]]; then
  CERT_STATUS=1
elif [[ $OPENSSL_HELP_STATUS -ne 0 && $OPENSSL_HELP_STATUS -ne 1 ]]; then
  CERT_STATUS=$OPENSSL_HELP_STATUS
fi
if [[ $CERT_STATUS -eq 0 ]]; then
  bounded "$COMMAND_TIMEOUT_SECONDS" openssl req \
    -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
    -config "$TEMP_ROOT/certificate.cnf" \
    -keyout "$TEMP_ROOT/private-key.pem" \
    -out "$TEMP_ROOT/certificate.pem" \
    >"$EVIDENCE/variants/self-signed-openssl.txt" 2>&1
  CERT_STATUS=$?
fi
if [[ $CERT_STATUS -eq 0 ]]; then
  if [[ "$OPENSSL_LEGACY_SUPPORTED" == true ]]; then
    bounded "$COMMAND_TIMEOUT_SECONDS" openssl pkcs12 -export -legacy \
      -inkey "$TEMP_ROOT/private-key.pem" \
      -in "$TEMP_ROOT/certificate.pem" \
      -out "$TEMP_ROOT/identity.p12" \
      -passout "pass:$KEYCHAIN_PASSWORD" \
      >>"$EVIDENCE/variants/self-signed-openssl.txt" 2>&1
  else
    bounded "$COMMAND_TIMEOUT_SECONDS" openssl pkcs12 -export \
      -inkey "$TEMP_ROOT/private-key.pem" \
      -in "$TEMP_ROOT/certificate.pem" \
      -out "$TEMP_ROOT/identity.p12" \
      -passout "pass:$KEYCHAIN_PASSWORD" \
      >>"$EVIDENCE/variants/self-signed-openssl.txt" 2>&1
  fi
  CERT_STATUS=$?
fi
if [[ $CERT_STATUS -eq 0 ]]; then
  bounded "$COMMAND_TIMEOUT_SECONDS" security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
  bounded "$COMMAND_TIMEOUT_SECONDS" security set-keychain-settings -lut 3600 "$KEYCHAIN"
  bounded "$COMMAND_TIMEOUT_SECONDS" security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
  bounded "$COMMAND_TIMEOUT_SECONDS" security import "$TEMP_ROOT/identity.p12" \
    -k "$KEYCHAIN" -P "$KEYCHAIN_PASSWORD" -T /usr/bin/codesign \
    >"$EVIDENCE/variants/self-signed-security-import.txt" 2>&1
  CERT_STATUS=$?
fi
if [[ $CERT_STATUS -eq 0 ]]; then
  bounded "$COMMAND_TIMEOUT_SECONDS" security set-key-partition-list \
    -S apple-tool:,apple:,codesign: \
    -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" \
    >>"$EVIDENCE/variants/self-signed-security-import.txt" 2>&1
  CERT_STATUS=$?
fi
if [[ $CERT_STATUS -eq 0 ]]; then
  bounded "$COMMAND_TIMEOUT_SECONDS" python3 - \
    "$KEYCHAIN" "$KEYCHAIN_REGISTRATION_EVIDENCE" \
    >>"$EVIDENCE/variants/self-signed-security-import.txt" 2>&1 <<'PY'
import fcntl
import json
import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

keychain = str(Path(sys.argv[1]).resolve(strict=True))
evidence = Path(sys.argv[2])
keychain_real = os.path.realpath(keychain)
lock_path = Path(tempfile.gettempdir()) / f"pitchdog-drift-keychain-list-{os.getuid()}.lock"
with lock_path.open("a+") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    listed = subprocess.run(
        ["security", "list-keychains", "-d", "user"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    existing = shlex.split(listed)
    registered = [keychain, *(
        value for value in existing if os.path.realpath(value) != keychain_real
    )]
    subprocess.run(
        ["security", "list-keychains", "-d", "user", "-s", *registered],
        check=True,
    )
registration = {
    "originalUserKeychains": existing,
    "registeredUserKeychains": registered,
    "cleanupPolicy": "compositionally-remove-only-this-probe-keychain",
}
evidence.write_text(json.dumps(registration, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(registration, sort_keys=True))
PY
  CERT_STATUS=$?
fi
if [[ $CERT_STATUS -eq 0 ]]; then
  bounded "$COMMAND_TIMEOUT_SECONDS" security find-key \
    -t private -s "$KEYCHAIN" \
    >>"$EVIDENCE/variants/self-signed-security-import.txt" 2>&1
  CERT_STATUS=$?
fi
IDENTITY=""
if [[ $CERT_STATUS -eq 0 ]]; then
  bounded "$COMMAND_TIMEOUT_SECONDS" openssl x509 \
    -in "$TEMP_ROOT/certificate.pem" \
    -noout -fingerprint -sha1 \
    >"$EVIDENCE/variants/self-signed-certificate-fingerprint.txt" 2>&1
  CERT_STATUS=$?
fi
if [[ $CERT_STATUS -eq 0 ]]; then
  IDENTITY="$(python3 - \
    "$EVIDENCE/variants/self-signed-certificate-fingerprint.txt" <<'PY'
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
match = re.fullmatch(r"[^=\n]+\s*=\s*((?:[0-9A-Fa-f]{2}:){19}[0-9A-Fa-f]{2})\s*", text)
if match is None:
    raise SystemExit(1)
print(match.group(1).replace(":", "").upper())
PY
)"
  CERT_STATUS=$?
  if [[ ! "$IDENTITY" =~ ^[0-9A-F]{40}$ ]]; then
    IDENTITY=""
    CERT_STATUS=1
  fi
fi
if [[ $CERT_STATUS -eq 0 ]]; then
  bounded "$COMMAND_TIMEOUT_SECONDS" codesign \
    --keychain "$KEYCHAIN" \
    --force \
    --options runtime \
    --entitlements "$ROOT/macos/Drift.entitlements" \
    --sign "$IDENTITY" \
    --timestamp=none \
    "$SELF_SIGNED" \
    >"$EVIDENCE/variants/self-signed-codesign.txt" 2>&1
  CERT_STATUS=$?
else
  echo "No usable code-signing identity was discovered in the temporary keychain." \
    >"$EVIDENCE/variants/self-signed-codesign.txt"
fi
set -e

if [[ $CERT_STATUS -eq 0 ]]; then
  SELF_SIGNED_STATUS=0
  run_variant "sandbox-self-signed" "$SELF_SIGNED" || SELF_SIGNED_STATUS=$?
else
  write_setup_failure \
    "sandbox-self-signed" "identity-setup-failure" "$CERT_STATUS"
fi

python3 - \
  "$EVIDENCE/variants/sandbox-adhoc.json" \
  "$EVIDENCE/variants/unsandboxed-adhoc.json" \
  "$EVIDENCE/variants/sandbox-self-signed.json" \
  "$EVIDENCE/matrix-summary.json" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

sandbox_path, unsandboxed_path, self_signed_path, output_path = map(Path, sys.argv[1:])
def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001 - evidence synthesis
        return {
            "variant": path.stem,
            "passed": False,
            "failures": [f"unreadable result: {error}"],
            "evidenceLoadError": f"{type(error).__name__}: {error}",
        }


def classify_variant(value: dict, expected_variant: str) -> dict[str, object]:
    variant = str(value.get("variant") or expected_variant)
    failures = value.get("failures")
    failure_text = [str(item) for item in failures] if isinstance(failures, list) else []
    envelope_is_valid = (
        type(value.get("schemaVersion")) is int
        and value.get("schemaVersion") == 1
        and value.get("variant") == expected_variant
        and type(value.get("passed")) is bool
        and isinstance(failures, list)
        and all(isinstance(item, str) for item in failures)
    )
    setup_failure_class = value.get("setupFailureClass")
    if value.get("evidenceLoadError") is not None or not envelope_is_valid:
        outcome_class = "missing-evidence"
    elif setup_failure_class == "identity-setup-failure" or any(
        text.startswith("temporary signing identity setup failed") for text in failure_text
    ):
        outcome_class = "identity-setup-failure"
    elif setup_failure_class == "diagnostic-setup-failure":
        outcome_class = "diagnostic-setup-failure"
    else:
        launch = value.get("launch")
        if not isinstance(launch, dict):
            outcome_class = "missing-evidence"
        elif not isinstance(launch.get("coordinationFailures"), list) or type(launch.get("timedOut")) is not bool:
            outcome_class = "missing-evidence"
        elif launch["coordinationFailures"]:
            outcome_class = "harness-binding-failure"
        elif launch["timedOut"] is True:
            outcome_class = "diagnostic-timeout"
        elif (
            not isinstance(value.get("receipt"), dict)
            or value.get("receiptError") is not None
            or type(value["receipt"].get("schemaVersion")) is not int
            or value["receipt"].get("schemaVersion") != 2
            or type(value["receipt"].get("ok")) is not bool
        ):
            outcome_class = "missing-evidence"
        elif value["passed"] is True and value["receipt"]["ok"] is True and not failures:
            outcome_class = "completed-product-pass"
        elif value["passed"] is True:
            outcome_class = "missing-evidence"
        else:
            outcome_class = "completed-product-failure"
    return {
        "variant": variant,
        "class": outcome_class,
        "completedComparableRuntime": outcome_class.startswith("completed-product-"),
    }


classifier_self_tests = [
    (
        {"schemaVersion": 1, "variant": "identity", "passed": False, "failures": ["temporary signing identity setup failed with status 1"]},
        "identity",
        "identity-setup-failure",
    ),
    (
        {"schemaVersion": 1, "variant": "binding", "passed": False, "failures": [], "launch": {"coordinationFailures": ["binding"], "timedOut": True}},
        "binding",
        "harness-binding-failure",
    ),
    (
        {"schemaVersion": 1, "variant": "timeout", "passed": False, "failures": [], "launch": {"coordinationFailures": [], "timedOut": True}},
        "timeout",
        "diagnostic-timeout",
    ),
    (
        {"schemaVersion": 1, "variant": "missing", "passed": False, "failures": [], "launch": {"coordinationFailures": [], "timedOut": False}, "receipt": None},
        "missing",
        "missing-evidence",
    ),
    (
        {"schemaVersion": 1, "variant": "product", "passed": False, "failures": ["product assertion"], "launch": {"coordinationFailures": [], "timedOut": False}, "receipt": {"schemaVersion": 2, "ok": False}, "receiptError": None},
        "product",
        "completed-product-failure",
    ),
    (
        {"schemaVersion": 1, "variant": "truthy", "passed": "false", "failures": [], "launch": {"coordinationFailures": [], "timedOut": False}, "receipt": {"schemaVersion": 2, "ok": True}, "receiptError": None},
        "truthy",
        "missing-evidence",
    ),
    (
        {"schemaVersion": 1, "variant": "wrong-lane", "passed": True, "failures": [], "launch": {"coordinationFailures": [], "timedOut": False}, "receipt": {"schemaVersion": 2, "ok": True}, "receiptError": None},
        "expected-lane",
        "missing-evidence",
    ),
    (
        {"schemaVersion": 1, "variant": "inconsistent-pass", "passed": True, "failures": ["contradiction"], "launch": {"coordinationFailures": [], "timedOut": False}, "receipt": {"schemaVersion": 2, "ok": True}, "receiptError": None},
        "inconsistent-pass",
        "missing-evidence",
    ),
]
for synthetic, expected_variant, expected_class in classifier_self_tests:
    observed_class = classify_variant(synthetic, expected_variant)["class"]
    if observed_class != expected_class:
        raise RuntimeError(
            f"variant outcome classifier self-test failed: expected {expected_class}, got {observed_class}"
        )

sandbox = load(sandbox_path)
unsandboxed = load(unsandboxed_path)
self_signed = load(self_signed_path)
variants = [sandbox, unsandboxed, self_signed]
expected_variants = ["sandbox-adhoc", "unsandboxed-adhoc", "sandbox-self-signed"]
variant_outcomes = [
    classify_variant(value, expected_variant)
    for value, expected_variant in zip(variants, expected_variants, strict=True)
]
outcome_by_variant = {value["variant"]: value for value in variant_outcomes}
production_outcome = outcome_by_variant.get("sandbox-adhoc", {})
unsandboxed_outcome = outcome_by_variant.get("unsandboxed-adhoc", {})
self_signed_outcome = outcome_by_variant.get("sandbox-self-signed", {})
control_outcomes = [unsandboxed_outcome, self_signed_outcome]
controls_comparable = all(
    value.get("completedComparableRuntime") is True for value in control_outcomes
)
matrix_comparable = (
    production_outcome.get("completedComparableRuntime") is True
    and controls_comparable
)


def inconclusive_controls() -> str:
    return ", ".join(
        f"{value.get('variant', 'unknown')}={value.get('class', 'missing-evidence')}"
        for value in control_outcomes
        if value.get("completedComparableRuntime") is not True
    )


def control_outcome_summary() -> str:
    return ", ".join(
        f"{value.get('variant', 'unknown')}={value.get('class', 'missing-evidence')}"
        for value in control_outcomes
    )


if production_outcome.get("class") == "completed-product-pass":
    diagnosis = (
        "The production sandboxed app survived its packaged WKWebView lifecycle. "
        f"Diagnostic control outcomes: {control_outcome_summary()}."
    )
elif production_outcome.get("class") != "completed-product-failure":
    diagnosis = (
        "The production variant did not produce comparable product evidence "
        f"({production_outcome.get('class', 'missing-evidence')}); causal diagnosis is inconclusive."
    )
elif not controls_comparable:
    diagnosis = (
        "The production sandboxed variant completed with a product failure, but causal diagnosis "
        f"is inconclusive because {inconclusive_controls()}."
    )
elif self_signed_outcome.get("class") == "completed-product-pass" and controls_comparable:
    diagnosis = "The sandboxed temporary non-ad-hoc control passed while the production ad-hoc variant failed; the observed difference is isolated to their signing boundary."
elif unsandboxed_outcome.get("class") == "completed-product-pass" and controls_comparable:
    diagnosis = "The unsandboxed ad-hoc control passed while both sandboxed variants completed with product failures; the observed difference is isolated to their App Sandbox boundary."
else:
    diagnosis = "No successful diagnostic control isolates the production failure; causal diagnosis remains inconclusive. Inspect each completed variant's failures independently."

production_variant_passed = (
    sandbox.get("passed") is True
    and production_outcome.get("class") == "completed-product-pass"
)
summary = {
    "schemaVersion": 1,
    "productionVariantPassed": production_variant_passed,
    "productionOutcomeClass": production_outcome.get("class", "missing-evidence"),
    "controlsComparable": controls_comparable,
    "matrixComparable": matrix_comparable,
    "diagnosis": diagnosis,
    "variantOutcomes": variant_outcomes,
    "variants": variants,
}
output_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2, sort_keys=True))
raise SystemExit(0 if production_variant_passed is True else 1)
PY
