import AppKit
import Foundation
import WebKit

private let reportPath = ProcessInfo.processInfo.environment["DRIFT_CODEC_REPORT"]
private let requireMP4 = ProcessInfo.processInfo.environment["DRIFT_REQUIRE_NATIVE_MP4"] == "1"
private let timeoutSeconds = Double(ProcessInfo.processInfo.environment["DRIFT_CODEC_TIMEOUT"] ?? "75") ?? 75

private final class CodecProbe: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var timeoutTimer: Timer?
    private var completed = false

    func run() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(self, name: "driftCodecProbe")

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 720, height: 900), configuration: configuration)
        webView.navigationDelegate = self
        webView.underPageBackgroundColor = NSColor(calibratedWhite: 0.03, alpha: 1)

        // WebCodecs and WebGL are backed by WebKit media/GPU processes. Attach
        // the probe to a genuine on-screen window so the hosted-runner receipt
        // exercises the same compositor lifecycle as the actual application.
        window = NSWindow(
            contentRect: NSRect(x: 80, y: 80, width: 720, height: 900),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        window.title = "Drift codec verification"
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)

        webView.loadHTMLString(Self.document(requireMP4: requireMP4), baseURL: nil)

        timeoutTimer = Timer.scheduledTimer(withTimeInterval: timeoutSeconds, repeats: false) { [weak self] _ in
            self?.finish([
                "schemaVersion": 1,
                "ok": false,
                "fatal": "WKWebView codec probe timed out after \(timeoutSeconds) seconds.",
            ], exitCode: 2)
        }
        RunLoop.current.add(timeoutTimer!, forMode: .common)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "driftCodecProbe", let dictionary = message.body as? [String: Any] else {
            finish(["schemaVersion": 1, "ok": false, "fatal": "Codec probe returned an unreadable result."], exitCode: 2)
            return
        }
        finish(dictionary, exitCode: dictionary["ok"] as? Bool == true ? 0 : 1)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish([
            "schemaVersion": 1,
            "ok": false,
            "fatal": "WKWebView navigation failed: \(error.localizedDescription)",
        ], exitCode: 2)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish([
            "schemaVersion": 1,
            "ok": false,
            "fatal": "WKWebView provisional navigation failed: \(error.localizedDescription)",
        ], exitCode: 2)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        finish([
            "schemaVersion": 1,
            "ok": false,
            "fatal": "WKWebView content process terminated during codec verification.",
        ], exitCode: 2)
    }

    private func finish(_ dictionary: [String: Any], exitCode: Int32) {
        guard !completed else { return }
        completed = true
        timeoutTimer?.invalidate()
        timeoutTimer = nil
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "driftCodecProbe")

        do {
            let data = try JSONSerialization.data(withJSONObject: dictionary, options: [.prettyPrinted, .sortedKeys])
            if let reportPath {
                let url = URL(fileURLWithPath: reportPath)
                try FileManager.default.createDirectory(
                    at: url.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                try data.write(to: url, options: .atomic)
            }
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8))
        } catch {
            FileHandle.standardError.write(Data("Could not serialize codec report: \(error)\n".utf8))
            Darwin.exit(2)
        }

        window?.orderOut(nil)
        window?.close()
        DispatchQueue.main.async {
            NSApplication.shared.terminate(nil)
            Darwin.exit(exitCode)
        }
    }

    private static func document(requireMP4: Bool) -> String {
        let required = requireMP4 ? "true" : "false"
        return #"""
        <!doctype html>
        <meta charset="utf-8">
        <title>Drift codec probe</title>
        <style>html,body{margin:0;background:#08090c;color:#f4efe5;font:14px system-ui}body{padding:24px}</style>
        <body>Drift is checking the system rendering and media stack…
        <script>
        (() => {
          "use strict";
          const startedAt = performance.now();
          const result = {
            schemaVersion: 1,
            requiredMp4: \#(required),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            secureContext: self.isSecureContext,
            crossOriginIsolated: self.crossOriginIsolated,
            apis: {},
            webgl2: null,
            png: null,
            avc: null,
            aac: null,
            failures: [],
          };

          const describeError = (error) => ({
            name: error?.name || "Error",
            message: error?.message || String(error),
          });
          const recordFailure = (area, error) => {
            result.failures.push({ area, ...describeError(error) });
          };
          const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

          const probeWebGL2 = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 64;
            canvas.height = 64;
            const gl = canvas.getContext("webgl2", {
              alpha: true,
              antialias: true,
              preserveDrawingBuffer: true,
            });
            if (!gl) return { available: false };
            gl.clearColor(0.125, 0.25, 0.5, 0.75);
            gl.clear(gl.COLOR_BUFFER_BIT);
            const pixel = new Uint8Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return {
              available: true,
              version: gl.getParameter(gl.VERSION),
              renderer: gl.getParameter(gl.RENDERER),
              vendor: gl.getParameter(gl.VENDOR),
              maximumTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
              readback: Array.from(pixel),
              noError: gl.getError() === gl.NO_ERROR,
            };
          };

          const probePng = async () => {
            const canvas = document.createElement("canvas");
            canvas.width = 32;
            canvas.height = 24;
            const context = canvas.getContext("2d", { alpha: true });
            if (!context) return { available: false, reason: "2D canvas context is unavailable" };
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = "rgba(30, 120, 220, 0.5)";
            context.fillRect(3, 4, 20, 12);
            const blob = await new Promise((resolve, reject) => {
              canvas.toBlob((value) => value ? resolve(value) : reject(new Error("canvas.toBlob returned null")), "image/png");
            });
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const signature = [137, 80, 78, 71, 13, 10, 26, 10];
            return {
              available: true,
              type: blob.type,
              bytes: blob.size,
              signatureValid: signature.every((value, index) => bytes[index] === value),
            };
          };

          const probeAvcCandidate = async (candidate) => {
            const config = candidate.config;
            const support = await VideoEncoder.isConfigSupported(config);
            if (!support.supported) {
              return { label: candidate.label, available: true, supported: false, requestedConfig: config, supportedConfig: support.config };
            }

            const chunks = [];
            const metadata = [];
            const errors = [];
            let encoder;
            let frame;
            try {
              encoder = new VideoEncoder({
                output(chunk, meta) {
                  chunks.push({ type: chunk.type, timestamp: chunk.timestamp, duration: chunk.duration, bytes: chunk.byteLength });
                  metadata.push({
                    decoderConfig: meta?.decoderConfig ? {
                      codec: meta.decoderConfig.codec,
                      codedWidth: meta.decoderConfig.codedWidth,
                      codedHeight: meta.decoderConfig.codedHeight,
                      descriptionBytes: meta.decoderConfig.description?.byteLength || 0,
                    } : null,
                  });
                },
                error(error) { errors.push(describeError(error)); },
              });
              encoder.configure(support.config);
              // Configuration is asynchronous in WebKit. Give an immediate
              // hardware-encoder failure time to reach the error callback before
              // we call encode and accidentally replace it with InvalidStateError.
              await delay(40);
              const stateAfterConfigure = encoder.state;
              if (stateAfterConfigure !== "configured") {
                return {
                  label: candidate.label,
                  available: true,
                  supported: support.supported,
                  requestedConfig: config,
                  supportedConfig: support.config,
                  stateAfterConfigure,
                  chunks,
                  metadata,
                  errors,
                  encoded: false,
                };
              }

              const canvas = document.createElement("canvas");
              canvas.width = config.width;
              canvas.height = config.height;
              const context = canvas.getContext("2d", { alpha: false });
              if (!context) throw new Error("2D canvas context is unavailable for AVC input");
              const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
              gradient.addColorStop(0, "#07080a");
              gradient.addColorStop(1, "#c7a05c");
              context.fillStyle = gradient;
              context.fillRect(0, 0, canvas.width, canvas.height);
              frame = new VideoFrame(canvas, { timestamp: 0, duration: 33_333 });
              encoder.encode(frame, { keyFrame: true });
              try {
                await encoder.flush();
              } catch (error) {
                errors.push(describeError(error));
              }
              await delay(20);
              return {
                label: candidate.label,
                available: true,
                supported: support.supported,
                requestedConfig: config,
                supportedConfig: support.config,
                finalState: encoder.state,
                chunks,
                metadata,
                errors,
                encoded: chunks.length > 0 && chunks.some((chunk) => chunk.bytes > 0) && errors.length === 0,
              };
            } catch (error) {
              errors.push(describeError(error));
              return {
                label: candidate.label,
                available: true,
                supported: support.supported,
                requestedConfig: config,
                supportedConfig: support.config,
                finalState: encoder?.state ?? null,
                chunks,
                metadata,
                errors,
                encoded: false,
              };
            } finally {
              frame?.close();
              // WebCodecs closes an encoder after an asynchronous codec error.
              // Calling close again throws and used to erase the useful receipt.
              if (encoder && encoder.state !== "closed") encoder.close();
            }
          };

          const probeAvc = async () => {
            if (typeof VideoEncoder !== "function" || typeof VideoFrame !== "function") {
              return { available: false, reason: "VideoEncoder or VideoFrame is unavailable", encoded: false, attempts: [] };
            }
            const common = {
              width: 1080,
              height: 1920,
              bitrate: 16_000_000,
              framerate: 30,
              latencyMode: "quality",
              hardwareAcceleration: "prefer-hardware",
              avc: { format: "avc" },
            };
            // 1080 × 1920 exceeds AVC level 3.1. The old probe requested
            // avc1.42001f, then blamed WebKit when the hardware encoder closed.
            // Level 4.0 is the first level whose frame-size limit covers this
            // portrait master. Probe common hardware profiles without lowering
            // Drift's default dimensions or bitrate.
            const candidates = [
              { label: "high-4.0", config: { ...common, codec: "avc1.640028" } },
              { label: "main-4.0", config: { ...common, codec: "avc1.4d0028" } },
              { label: "baseline-4.0", config: { ...common, codec: "avc1.420028" } },
            ];
            const attempts = [];
            for (const candidate of candidates) {
              const attempt = await probeAvcCandidate(candidate);
              attempts.push(attempt);
              if (attempt.encoded) {
                return {
                  available: true,
                  supported: true,
                  encoded: true,
                  selectedProfile: candidate.label,
                  attempts,
                  chunks: attempt.chunks,
                  metadata: attempt.metadata,
                  errors: [],
                };
              }
            }
            return {
              available: true,
              supported: attempts.some((attempt) => attempt.supported === true),
              encoded: false,
              selectedProfile: null,
              attempts,
              chunks: [],
              metadata: [],
              errors: attempts.flatMap((attempt) => attempt.errors || []),
            };
          };

          const probeAac = async () => {
            if (typeof AudioEncoder !== "function" || typeof AudioData !== "function") {
              return { available: false, reason: "AudioEncoder or AudioData is unavailable", encoded: false };
            }
            const config = {
              codec: "mp4a.40.2",
              sampleRate: 48_000,
              numberOfChannels: 2,
              bitrate: 192_000,
              bitrateMode: "variable",
            };
            const support = await AudioEncoder.isConfigSupported(config);
            if (!support.supported) return { available: true, supported: false, config: support.config, encoded: false };

            const chunks = [];
            const errors = [];
            let encoder;
            let audio;
            try {
              encoder = new AudioEncoder({
                output(chunk, meta) {
                  chunks.push({ timestamp: chunk.timestamp, duration: chunk.duration, bytes: chunk.byteLength, decoderConfig: meta?.decoderConfig?.codec || null });
                },
                error(error) { errors.push(describeError(error)); },
              });
              encoder.configure(support.config);
              await delay(20);
              if (encoder.state !== "configured") {
                return { available: true, supported: true, config: support.config, stateAfterConfigure: encoder.state, chunks, errors, encoded: false };
              }
              const frameCount = 1024;
              const channels = 2;
              const samples = new Float32Array(frameCount * channels);
              audio = new AudioData({
                format: "f32-planar",
                sampleRate: config.sampleRate,
                numberOfFrames: frameCount,
                numberOfChannels: channels,
                timestamp: 0,
                data: samples,
              });
              encoder.encode(audio);
              try { await encoder.flush(); }
              catch (error) { errors.push(describeError(error)); }
              return {
                available: true,
                supported: support.supported,
                config: support.config,
                chunks,
                errors,
                encoded: chunks.length > 0 && chunks.some((chunk) => chunk.bytes > 0) && errors.length === 0,
              };
            } finally {
              audio?.close();
              if (encoder && encoder.state !== "closed") encoder.close();
            }
          };

          const run = async () => {
            for (const api of [
              "VideoEncoder", "VideoDecoder", "VideoFrame",
              "AudioEncoder", "AudioDecoder", "AudioData",
              "ImageDecoder", "OffscreenCanvas", "createImageBitmap",
            ]) result.apis[api] = typeof self[api];

            try { result.webgl2 = probeWebGL2(); }
            catch (error) { recordFailure("webgl2", error); }
            try { result.png = await probePng(); }
            catch (error) { recordFailure("png", error); }
            try { result.avc = await probeAvc(); }
            catch (error) { recordFailure("avc", error); }
            try { result.aac = await probeAac(); }
            catch (error) { recordFailure("aac", error); }

            const webglHolds = result.webgl2?.available === true && result.webgl2?.noError === true;
            const pngHolds = result.png?.available === true && result.png?.signatureValid === true && result.png?.bytes > 0;
            const avcHolds = result.avc?.encoded === true;
            result.ok = webglHolds && pngHolds && (!result.requiredMp4 || avcHolds);
            result.elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
            webkit.messageHandlers.driftCodecProbe.postMessage(result);
          };

          run().catch((error) => {
            recordFailure("fatal", error);
            result.ok = false;
            result.elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
            webkit.messageHandlers.driftCodecProbe.postMessage(result);
          });
        })();
        </script>
        </body>
        """#
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
application.finishLaunching()
private let probe = CodecProbe()
application.delegate = nil
probe.run()
application.run()
