(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __commonJS = (cb, mod) => function __require2() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/utils/config.js
  var require_config = __commonJS({
    "src/utils/config.js"(exports, module) {
      var STORAGE_KEY = "premierecut-settings-v1";
      var DEFAULTS = {
        silenceThreshold: -40,
        minSilenceDuration: 0.4,
        paddingBefore: 0.15,
        paddingAfter: 0.15,
        detectBreaths: true,
        minKeepDuration: 0.3,
        language: "auto",
        whisperModel: "large-v3",
        maxLinesPerSub: 2,
        maxWordsPerLine: 6,
        maxCharsPerLine: 42,
        maxSubDuration: 5,
        minSubDuration: 1,
        cpsLimit: 20,
        splitOnSentence: true,
        splitOnPause: true,
        outputFormat: "srt"
      };
      var _settings = { ...DEFAULTS };
      function load() {
        try {
          if (typeof localStorage !== "undefined") {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
              const parsed = JSON.parse(stored);
              _settings = { ...DEFAULTS, ...parsed };
            }
          }
        } catch (e) {
          console.warn("Ayarlar yuklenemedi:", e);
          _settings = { ...DEFAULTS };
        }
        return _settings;
      }
      function save(updates) {
        _settings = { ...DEFAULTS, ..._settings, ...updates };
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings));
          }
        } catch (e) {
          console.warn("Ayarlar kaydedilemedi:", e);
        }
        return _settings;
      }
      function get() {
        return { ..._settings };
      }
      function reset() {
        _settings = { ...DEFAULTS };
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.removeItem(STORAGE_KEY);
          }
        } catch {
        }
        return _settings;
      }
      module.exports = { load, save, get, reset, DEFAULTS };
    }
  });

  // src/utils/daemon.js
  var require_daemon = __commonJS({
    "src/utils/daemon.js"(exports, module) {
      var DAEMON_URL = "http://127.0.0.1:53117";
      var DEFAULT_TIMEOUT = 30 * 60 * 1e3;
      async function call(path, body = null, timeoutMs = DEFAULT_TIMEOUT) {
        const url = DAEMON_URL + path;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method: body ? "POST" : "GET",
            headers: body ? { "Content-Type": "application/json" } : {},
            body: body ? JSON.stringify(body) : void 0,
            signal: controller.signal
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          return data;
        } catch (err) {
          if (err.name === "AbortError") {
            throw new Error(`Daemon timeout (${timeoutMs}ms): ${path}`);
          }
          if (err.message && err.message.includes("fetch")) {
            throw new Error(
              "Helper daemon'a ulasilamadi. Lutfen daemon'un calistigindan emin olun.\nBaslatma komutu: launchctl load ~/Library/LaunchAgents/com.seyoweb.premierecut.daemon.plist"
            );
          }
          throw err;
        } finally {
          clearTimeout(timer);
        }
      }
      async function ping() {
        return call("/ping", null, 3e3);
      }
      async function check() {
        return call("/check", null, 1e4);
      }
      async function exportAudio({ inputPath, sampleRate = 48e3, mono = false, suffix = "" }) {
        return call("/export-audio", { inputPath, sampleRate, mono, suffix }, 6e5);
      }
      async function silenceDetect({ audioPath, noiseThreshold = -35, minDuration = 0.4 }) {
        return call("/silence-detect", { audioPath, noiseThreshold, minDuration }, 6e5);
      }
      async function transcribe({ audioPath, language = "auto", model = "large-v3" }) {
        return call("/transcribe", { audioPath, language, model }, 30 * 60 * 1e3);
      }
      async function writeFile({ filePath, content }) {
        return call("/write-file", { filePath, content }, 3e4);
      }
      async function reveal(filePath) {
        return call("/reveal", { filePath }, 5e3);
      }
      module.exports = {
        call,
        ping,
        check,
        exportAudio,
        silenceDetect,
        transcribe,
        writeFile,
        reveal,
        DAEMON_URL
      };
    }
  });

  // src/utils/time.js
  var require_time = __commonJS({
    "src/utils/time.js"(exports, module) {
      var TICKS_PER_SECOND = 254016e6;
      function secondsToTicks(seconds) {
        return String(Math.round(seconds * TICKS_PER_SECOND));
      }
      function ticksToSeconds(ticks) {
        return Number(ticks) / TICKS_PER_SECOND;
      }
      function secondsToSRT(seconds) {
        const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1e3));
        const h = Math.floor(totalMs / 36e5);
        const m = Math.floor(totalMs % 36e5 / 6e4);
        const s = Math.floor(totalMs % 6e4 / 1e3);
        const ms = totalMs % 1e3;
        return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + "," + String(ms).padStart(3, "0");
      }
      function srtToSeconds(srt) {
        const [time, ms] = srt.split(",");
        const [h, m, s] = time.split(":").map(Number);
        return h * 3600 + m * 60 + s + Number(ms) / 1e3;
      }
      function formatDuration(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.round(seconds % 60);
        if (m === 0) return `${s}s`;
        return `${m}m ${s}s`;
      }
      module.exports = {
        TICKS_PER_SECOND,
        secondsToTicks,
        ticksToSeconds,
        secondsToSRT,
        srtToSeconds,
        formatDuration
      };
    }
  });

  // src/core/audio-exporter.js
  var require_audio_exporter = __commonJS({
    "src/core/audio-exporter.js"(exports, module) {
      var daemon2 = require_daemon();
      async function exportAudio({ sampleRate = 48e3, mono = false, suffix = "" } = {}) {
        const ppro = __require("premierepro");
        const project = await ppro.Project.getActiveProject();
        if (!project) throw new Error("Aktif proje yok");
        const sequence = await project.getActiveSequence();
        if (!sequence) throw new Error("Aktif sequence yok");
        const clips = await collectSequenceClips(sequence);
        if (clips.length === 0) {
          throw new Error("Sequence'de ses klibi bulunamadi");
        }
        const res = await daemon2.call("/build-sequence-audio", {
          clips,
          sampleRate,
          mono
        }, 6e5);
        return res.outputPath;
      }
      async function collectSequenceClips(sequence) {
        const ppro = __require("premierepro");
        const clips = [];
        const audioTrackCount = await sequence.getAudioTrackCount();
        const videoTrackCount = await sequence.getVideoTrackCount();
        const tracks = [];
        if (audioTrackCount > 0) {
          for (let i = 0; i < audioTrackCount; i++) {
            const t = await sequence.getAudioTrack(i);
            if (t) tracks.push(t);
          }
        }
        const fallbackToVideo = tracks.length === 0 || (await Promise.all(tracks.map(async (t) => {
          const items = await t.getTrackItems(1, false);
          return items && items.length > 0;
        }))).every((x) => !x);
        const finalTracks = fallbackToVideo ? await (async () => {
          const r = [];
          for (let i = 0; i < videoTrackCount; i++) {
            const t = await sequence.getVideoTrack(i);
            if (t) r.push(t);
          }
          return r;
        })() : tracks;
        for (const track of finalTracks) {
          const items = await track.getTrackItems(1, false);
          if (!items) continue;
          for (const item of items) {
            const projectItem = await item.getProjectItem();
            if (!projectItem) continue;
            const clipItem = await ppro.ClipProjectItem.cast(projectItem);
            if (!clipItem) continue;
            const filePath = await clipItem.getMediaFilePath();
            if (!filePath) continue;
            const startTime = await item.getStartTime();
            const endTime = await item.getEndTime();
            const inPoint = await item.getInPoint();
            const outPoint = await item.getOutPoint();
            const timelineStart = startTime.seconds;
            const duration = endTime.seconds - startTime.seconds;
            const sourceIn = inPoint.seconds;
            const sourceOut = outPoint.seconds;
            clips.push({
              path: filePath,
              sourceIn,
              sourceOut,
              timelineStart,
              duration
            });
          }
        }
        const unique = [];
        const seen = /* @__PURE__ */ new Set();
        for (const c of clips) {
          const key = `${c.path}|${c.timelineStart.toFixed(3)}|${c.duration.toFixed(3)}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(c);
          }
        }
        return unique;
      }
      module.exports = { exportAudio, collectSequenceClips };
    }
  });

  // src/core/silence-detector.js
  var require_silence_detector = __commonJS({
    "src/core/silence-detector.js"(exports, module) {
      var daemon2 = require_daemon();
      async function detect(audioPath, { noiseThreshold = -35, minDuration = 0.4 } = {}) {
        const res = await daemon2.silenceDetect({
          audioPath,
          noiseThreshold,
          minDuration
        });
        return { regions: res.regions || [], duration: res.duration || 0 };
      }
      module.exports = { detect };
    }
  });

  // src/core/breath-detector.js
  var require_breath_detector = __commonJS({
    "src/core/breath-detector.js"(exports, module) {
      function findBreathCandidates(silenceRegions, {
        minDuration = 0.15,
        maxDuration = 1.5
      } = {}) {
        if (silenceRegions.length < 2) return [];
        const breaths = [];
        for (let i = 0; i < silenceRegions.length - 1; i++) {
          const gapStart = silenceRegions[i].end;
          const gapEnd = silenceRegions[i + 1].start;
          const gapDuration = gapEnd - gapStart;
          if (gapDuration >= minDuration && gapDuration <= maxDuration) {
            breaths.push({
              start: gapStart,
              end: gapEnd,
              duration: gapDuration
            });
          }
        }
        return breaths;
      }
      module.exports = { findBreathCandidates };
    }
  });

  // src/core/segment-builder.js
  var require_segment_builder = __commonJS({
    "src/core/segment-builder.js"(exports, module) {
      function build(totalDuration, silenceRegions, breathRegions = [], {
        paddingBefore = 0.15,
        paddingAfter = 0.15,
        minKeepDuration = 0.3
      } = {}) {
        let removeRanges = [
          ...silenceRegions.map((r) => ({ start: r.start, end: r.end })),
          ...breathRegions.map((r) => ({ start: r.start, end: r.end }))
        ];
        removeRanges.sort((a, b) => a.start - b.start);
        removeRanges = mergeOverlapping(removeRanges);
        const minKeepCut = 0.03;
        removeRanges = removeRanges.map((r) => {
          const dur = r.end - r.start;
          if (dur <= minKeepCut) return { start: r.start, end: r.end };
          const totalPadReq = paddingBefore + paddingAfter;
          const padAvailable = Math.max(0, dur - minKeepCut);
          const padRatio = totalPadReq > 0 ? Math.min(1, padAvailable / totalPadReq) : 0;
          const padA = paddingAfter * padRatio;
          const padB = paddingBefore * padRatio;
          return {
            start: r.start + padA,
            end: r.end - padB
          };
        }).filter((r) => r && r.end > r.start);
        const keepRanges = [];
        let cursor = 0;
        for (const r of removeRanges) {
          if (r.start > cursor) {
            keepRanges.push({ start: cursor, end: r.start });
          }
          cursor = r.end;
        }
        if (cursor < totalDuration) {
          keepRanges.push({ start: cursor, end: totalDuration });
        }
        const filteredKeep = keepRanges.filter((r) => r.end - r.start >= minKeepDuration);
        const keep = filteredKeep.map((r) => ({
          start: r.start,
          end: r.end,
          duration: r.end - r.start,
          type: "keep"
        }));
        const totalKeep = keep.reduce((sum, s) => sum + s.duration, 0);
        const totalRemove = totalDuration - totalKeep;
        const stats = {
          totalDuration,
          totalKeep,
          totalRemove,
          silenceCount: silenceRegions.length,
          breathCount: breathRegions.length,
          segmentCount: keep.length,
          reductionPercent: Math.round(totalRemove / totalDuration * 100)
        };
        const remove = removeRanges.map((r) => ({
          start: r.start,
          end: r.end,
          duration: r.end - r.start,
          type: "remove"
        }));
        return { keep, remove, stats };
      }
      function mergeOverlapping(ranges) {
        if (ranges.length === 0) return [];
        const merged = [{ ...ranges[0] }];
        for (let i = 1; i < ranges.length; i++) {
          const last = merged[merged.length - 1];
          const curr = ranges[i];
          if (curr.start <= last.end) {
            last.end = Math.max(last.end, curr.end);
          } else {
            merged.push({ ...curr });
          }
        }
        return merged;
      }
      module.exports = { build, mergeOverlapping };
    }
  });

  // src/core/transcriber.js
  var require_transcriber = __commonJS({
    "src/core/transcriber.js"(exports, module) {
      var daemon2 = require_daemon();
      async function transcribe(audioPath, { language = "auto", model = "large-v3" } = {}) {
        const res = await daemon2.transcribe({ audioPath, language, model });
        const parsed = res.result;
        return parseWhisperOutput(parsed);
      }
      function parseWhisperOutput(whisperJson) {
        if (!whisperJson) return [];
        const rawSegments = Array.isArray(whisperJson.segments) && whisperJson.segments.length > 0 ? whisperJson.segments : Array.isArray(whisperJson.transcription) ? whisperJson.transcription : [];
        const segments = [];
        for (const item of rawSegments) {
          const normalized = normalizeSegment(item);
          if (normalized && normalized.text) segments.push(normalized);
        }
        return segments.sort((a, b) => a.start - b.start);
      }
      function normalizeSegment(item) {
        if (!item) return null;
        const timestamps = item.timestamps || {};
        const start = firstNumber(
          item.start,
          timestamps.from,
          item.offsets?.from
        );
        const end = firstNumber(
          item.end,
          timestamps.to,
          item.offsets?.to
        );
        const words = normalizeWords(item.words || item.tokens || []);
        const text = (item.text || words.map((w) => w.text).join(" ")).trim();
        const wordStart = words.length ? words[0].start : start;
        const wordEnd = words.length ? words[words.length - 1].end : end;
        return {
          text,
          start: Number.isFinite(start) ? start : wordStart,
          end: Number.isFinite(end) ? end : wordEnd,
          words
        };
      }
      function normalizeWords(rawWords) {
        if (!Array.isArray(rawWords)) return [];
        return rawWords.map((w) => {
          const text = (w.text || w.word || w.token || "").trim();
          const start = firstNumber(w.start, w.timestamps?.from, w.offsets?.from);
          const end = firstNumber(w.end, w.timestamps?.to, w.offsets?.to);
          if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            return null;
          }
          return { text, start, end };
        }).filter(Boolean).sort((a, b) => a.start - b.start);
      }
      function firstNumber(...values) {
        for (const value of values) {
          if (value === void 0 || value === null || value === "") continue;
          const parsed = parseTimestamp(value);
          if (Number.isFinite(parsed)) return parsed;
        }
        return NaN;
      }
      function parseTimestamp(ts) {
        if (typeof ts === "number") return ts;
        if (!ts) return 0;
        const parts = String(ts).replace(",", ".").split(":");
        if (parts.length === 3) {
          return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        }
        if (parts.length === 2) {
          return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(ts) || 0;
      }
      module.exports = { transcribe, parseWhisperOutput, parseTimestamp };
    }
  });

  // src/srt/caption-grouper.js
  var require_caption_grouper = __commonJS({
    "src/srt/caption-grouper.js"(exports, module) {
      function group(words, {
        maxLinesPerSub = 2,
        maxWordsPerLine = 6,
        maxCharsPerLine = 999,
        // devre disi: kelime sayisi tek kontrol
        maxSubDuration = 5,
        minSubDuration = 1,
        cpsLimit = 20,
        splitOnSentence = true,
        splitOnPause = true
      } = {}) {
        if (!words || words.length === 0) return [];
        const captions = [];
        let currentLines = [];
        let currentLineWords = [];
        let captionStart = null;
        const flush = (endTime) => {
          if (currentLineWords.length > 0) {
            currentLines.push(currentLineWords.join(" "));
            currentLineWords = [];
          }
          if (currentLines.length === 0) return;
          if (captionStart === null) return;
          captions.push({
            index: captions.length + 1,
            start: captionStart,
            end: endTime,
            lines: [...currentLines],
            text: currentLines.join("\n")
          });
          currentLines = [];
          captionStart = null;
        };
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const wordText = (word.text || "").trim();
          if (!wordText) continue;
          if (captionStart === null) captionStart = word.start;
          currentLineWords.push(wordText);
          const lineFull = currentLineWords.length >= maxWordsPerLine;
          const lineJoined = currentLineWords.join(" ");
          const charFull = lineJoined.length >= maxCharsPerLine;
          if (lineFull || charFull) {
            currentLines.push(lineJoined);
            currentLineWords = [];
            if (currentLines.length >= maxLinesPerSub) {
              flush(word.end);
              continue;
            }
          }
          const duration = word.end - captionStart;
          if (duration >= maxSubDuration) {
            flush(word.end);
            continue;
          }
          if (splitOnSentence && /[.!?]$/.test(wordText)) {
            flush(word.end);
            continue;
          }
          if (splitOnPause && i + 1 < words.length) {
            const gap = words[i + 1].start - word.end;
            if (gap > 0.5) {
              flush(word.end);
              continue;
            }
          }
        }
        const last = words[words.length - 1];
        if (last) flush(last.end);
        return applyCPSLimit(captions, cpsLimit, minSubDuration);
      }
      function applyCPSLimit(captions, cpsLimit, minDur) {
        return captions.map((cap, index) => {
          const charCount = cap.text.replace(/\n/g, " ").length;
          const start = Number(cap.start || 0);
          const end = Math.max(Number(cap.end || start), start + 1e-3);
          const dur = end - start;
          let newEnd = end;
          if (cpsLimit > 0 && dur > 0) {
            const cps = charCount / dur;
            if (cps > cpsLimit) {
              const needDur = charCount / cpsLimit;
              newEnd = start + needDur;
            }
          }
          if (minDur > 0 && newEnd - start < minDur) {
            newEnd = start + minDur;
          }
          const next = captions[index + 1];
          if (next && Number.isFinite(next.start)) {
            newEnd = Math.min(newEnd, Math.max(start + 1e-3, next.start - 1e-3));
          }
          return { ...cap, index: index + 1, start, end: Math.max(start + 1e-3, newEnd) };
        });
      }
      module.exports = { group, applyCPSLimit };
    }
  });

  // src/srt/srt-writer.js
  var require_srt_writer = __commonJS({
    "src/srt/srt-writer.js"(exports, module) {
      var daemon2 = require_daemon();
      var timeUtils2 = require_time();
      function generate(captions) {
        return captions.map((cap) => {
          const startTS = timeUtils2.secondsToSRT(cap.start);
          const endTS = timeUtils2.secondsToSRT(cap.end);
          return `${cap.index}
${startTS} --> ${endTS}
${cap.text}`;
        }).join("\n\n") + "\n";
      }
      async function write(filePath, captions) {
        const content = generate(captions);
        const res = await daemon2.writeFile({ filePath, content });
        return res.path;
      }
      module.exports = { generate, write };
    }
  });

  // src/srt/vtt-writer.js
  var require_vtt_writer = __commonJS({
    "src/srt/vtt-writer.js"(exports, module) {
      var daemon2 = require_daemon();
      function secondsToVTT(seconds) {
        const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1e3));
        const h = Math.floor(totalMs / 36e5);
        const m = Math.floor(totalMs % 36e5 / 6e4);
        const s = Math.floor(totalMs % 6e4 / 1e3);
        const ms = totalMs % 1e3;
        return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + "." + String(ms).padStart(3, "0");
      }
      function generate(captions) {
        const header = "WEBVTT\n\n";
        const body = captions.map((cap) => {
          return `${cap.index}
${secondsToVTT(cap.start)} --> ${secondsToVTT(cap.end)}
${cap.text}`;
        }).join("\n\n");
        return header + body + "\n";
      }
      async function write(filePath, captions) {
        const content = generate(captions);
        const res = await daemon2.writeFile({ filePath, content });
        return res.path;
      }
      module.exports = { generate, write, secondsToVTT };
    }
  });

  // src/timeline/duplicator.js
  var require_duplicator = __commonJS({
    "src/timeline/duplicator.js"(exports, module) {
      async function duplicateActiveSequence(suffix = " - AutoCut") {
        const ppro = __require("premierepro");
        const project = await ppro.Project.getActiveProject();
        if (!project) throw new Error("Aktif proje yok");
        const sequence = await project.getActiveSequence();
        if (!sequence) throw new Error("Aktif sequence yok");
        return sequence;
      }
      module.exports = { duplicateActiveSequence };
    }
  });

  // src/timeline/sequence-editor.js
  var require_sequence_editor = __commonJS({
    "src/timeline/sequence-editor.js"(exports, module) {
      var timeUtils2 = require_time();
      async function getTrackItems(sequence) {
        const videoItems = [];
        const audioItems = [];
        const videoTrackCount = await sequence.getVideoTrackCount();
        for (let i = 0; i < videoTrackCount; i++) {
          const track = await sequence.getVideoTrack(i);
          if (track) {
            const items = await track.getTrackItems(1, false);
            if (items) {
              for (const item of items) {
                const startTime = await item.getStartTime();
                const endTime = await item.getEndTime();
                videoItems.push({
                  item,
                  trackIndex: i,
                  start: startTime.seconds,
                  end: endTime.seconds
                });
              }
            }
          }
        }
        const audioTrackCount = await sequence.getAudioTrackCount();
        for (let i = 0; i < audioTrackCount; i++) {
          const track = await sequence.getAudioTrack(i);
          if (track) {
            const items = await track.getTrackItems(1, false);
            if (items) {
              for (const item of items) {
                const startTime = await item.getStartTime();
                const endTime = await item.getEndTime();
                audioItems.push({
                  item,
                  trackIndex: i,
                  start: startTime.seconds,
                  end: endTime.seconds
                });
              }
            }
          }
        }
        return { videoItems, audioItems };
      }
      async function getSequenceDuration(sequence) {
        const endTime = await sequence.getEndTime();
        return endTime.seconds;
      }
      async function getSequenceName(sequence) {
        return sequence.name;
      }
      module.exports = {
        getTrackItems,
        getSequenceDuration,
        getSequenceName
      };
    }
  });

  // src/timeline/reconstructor.js
  var require_reconstructor = __commonJS({
    "src/timeline/reconstructor.js"(exports, module) {
      var seqEditor2 = require_sequence_editor();
      async function reconstruct(inputSequence, _removeSegments, onProgress, keepSegments) {
        const ppro = __require("premierepro");
        if (!keepSegments || keepSegments.length === 0) {
          return { success: false, message: "Tutulacak bolge yok \u2014 ayarlar cok agresif (sessizlik esigi duser, min. sessizlik artir)" };
        }
        let project = await ppro.Project.getActiveProject();
        if (!project) throw new Error("Aktif proje yok");
        let sequence = inputSequence;
        let editor = ppro.SequenceEditor.getEditor(sequence);
        if (!editor) throw new Error("SequenceEditor alinamadi");
        const { videoItems, audioItems } = await seqEditor2.getTrackItems(sequence);
        const allItems = [...videoItems, ...audioItems];
        if (allItems.length === 0) {
          return { success: false, message: "Sequence bos" };
        }
        const rootProjectItem = await findPrimaryProjectItem(videoItems, audioItems);
        if (!rootProjectItem) {
          return { success: false, message: "ProjectItem bulunamadi" };
        }
        const rootMediaPath = await getProjectItemMediaPath(ppro, rootProjectItem);
        const { videoTrackIdx, audioTrackIdx } = pickTargetTracks(videoItems, audioItems);
        const mediaTypeAny = getMediaType(ppro, "ANY", 0);
        let stage = "baslangic";
        try {
          stage = "orijinalleri silme";
          runActionTransaction(project, "PremierSEYO: Remove originals", () => {
            const action = createRemoveActionForItems(ppro, editor, allItems, true, mediaTypeAny, true);
            if (!action) throw new Error("createRemoveItemsAction null");
            return action;
          });
          await new Promise((r) => setTimeout(r, 250));
          ({ project, sequence, editor } = await refreshSequenceContext(ppro, sequence));
          let dst = ppro.TickTime.createWithSeconds(0);
          let successCount = 0;
          let resolvedProjectItem = rootProjectItem;
          let clipPI = await safeCastClipProjectItem(ppro, resolvedProjectItem);
          if (!clipPI) {
            throw new Error("ClipProjectItem.cast basarisiz");
          }
          for (let i = 0; i < keepSegments.length; i++) {
            const seg = keepSegments[i];
            const segmentNumber = i + 1;
            const srcIn = ppro.TickTime.createWithSeconds(seg.start);
            const srcOut = ppro.TickTime.createWithSeconds(seg.end);
            stage = `seg ${segmentNumber} source in/out`;
            runActionTransaction(project, `PremierSEYO: Source in/out seg ${segmentNumber}`, () => {
              const action = clipPI.createSetInOutPointsAction(srcIn, srcOut);
              if (!action) throw new Error("createSetInOutPointsAction null");
              return action;
            });
            stage = `seg ${segmentNumber} insert`;
            resolvedProjectItem = await resolveProjectItem(ppro, project, resolvedProjectItem, rootMediaPath);
            clipPI = await safeCastClipProjectItem(ppro, resolvedProjectItem);
            const dstAtInsert = dst;
            runActionTransaction(project, `PremierSEYO: Insert seg ${segmentNumber}`, () => {
              const action = editor.createInsertProjectItemAction(
                resolvedProjectItem,
                dstAtInsert,
                videoTrackIdx,
                audioTrackIdx,
                true
              );
              if (!action) throw new Error(`insert action null (seg ${segmentNumber})`);
              return action;
            });
            await new Promise((r) => setTimeout(r, 180));
            ({ project, sequence, editor } = await refreshSequenceContext(ppro, sequence));
            dst = tickAdd(ppro, dst, tickSub(ppro, srcOut, srcIn));
            successCount++;
            if (onProgress) {
              onProgress(Math.round(successCount / keepSegments.length * 95));
            }
          }
          stage = "clear source in/out";
          try {
            runActionTransaction(project, "PremierSEYO: Clear source in/out", () => {
              if (typeof clipPI.createClearInOutPointsAction !== "function") return null;
              return clipPI.createClearInOutPointsAction();
            });
          } catch (e) {
            console.warn("clear in/out uyarisi:", e.message);
          }
          if (onProgress) onProgress(100);
          return {
            success: true,
            message: `${successCount}/${keepSegments.length} segment kesildi`
          };
        } catch (e) {
          console.error("Reconstruction hatasi:", e);
          throw new Error(`Kesim uygulanamadi (${stage}): ` + (e.message || String(e)));
        }
      }
      async function safeCastClipProjectItem(ppro, projectItem) {
        if (!projectItem) return null;
        try {
          const clipPI = await ppro.ClipProjectItem.cast(projectItem);
          if (clipPI) return clipPI;
        } catch {
        }
        return null;
      }
      function tickAdd(ppro, a, b) {
        if (a && typeof a.add === "function") {
          try {
            return a.add(b);
          } catch {
          }
        }
        const secs = toSeconds(a) + toSeconds(b);
        return ppro.TickTime.createWithSeconds(secs);
      }
      function tickSub(ppro, a, b) {
        if (a && typeof a.subtract === "function") {
          try {
            return a.subtract(b);
          } catch {
          }
        }
        const secs = toSeconds(a) - toSeconds(b);
        return ppro.TickTime.createWithSeconds(secs);
      }
      function toSeconds(tickTime) {
        if (!tickTime) return 0;
        if (typeof tickTime.seconds === "number") return tickTime.seconds;
        try {
          return Number(tickTime.seconds || 0);
        } catch {
          return 0;
        }
      }
      function pickTargetTracks(videoItems, audioItems) {
        const videoTrackIdx = videoItems.length > 0 ? Math.min(...videoItems.map((i) => i.trackIndex)) : 0;
        const audioTrackIdx = audioItems.length > 0 ? Math.min(...audioItems.map((i) => i.trackIndex)) : 0;
        return { videoTrackIdx, audioTrackIdx };
      }
      async function findPrimaryProjectItem(videoItems, audioItems) {
        const candidates = [...videoItems, ...audioItems];
        for (const ti of candidates) {
          try {
            const projectItem = await ti.item.getProjectItem();
            if (projectItem) return projectItem;
          } catch {
          }
        }
        return null;
      }
      function getMediaType(ppro, name, fallback) {
        const mediaType = (ppro.Constants || ppro.constants || {}).MediaType || {};
        const variants = [name, name.toLowerCase(), name[0] + name.slice(1).toLowerCase()];
        for (const variant of variants) {
          if (mediaType[variant] !== void 0) return mediaType[variant];
        }
        return fallback;
      }
      function createRemoveActionForItems(ppro, editor, items, ripple, mediaType, shiftOverLapping) {
        const factory = ppro.TrackItemSelection;
        if (!factory || typeof factory.createEmptySelection !== "function") {
          throw new Error("TrackItemSelection API bulunamadi");
        }
        let action = null;
        let callbackError = null;
        try {
          factory.createEmptySelection((selection2) => {
            try {
              addItemsToSelection(selection2, items);
              action = createRemoveItemsAction(editor, selection2, ripple, mediaType, shiftOverLapping);
            } catch (e) {
              callbackError = e;
            }
          });
        } catch (e) {
          callbackError = e;
        }
        if (callbackError && !action) {
          console.warn("TrackItemSelection callback yolu basarisiz:", callbackError.message || callbackError);
        }
        if (action) return action;
        let selection = null;
        try {
          const result = factory.createEmptySelection();
          if (result && typeof result.addItem === "function") selection = result;
        } catch (e) {
          throw new Error("Track item selection olusturulamadi: " + (e.message || String(e)));
        }
        if (!selection) {
          throw new Error("Track item selection olusturulamadi");
        }
        addItemsToSelection(selection, items);
        return createRemoveItemsAction(editor, selection, ripple, mediaType, shiftOverLapping);
      }
      function addItemsToSelection(selection, items) {
        if (!selection || typeof selection.addItem !== "function") {
          throw new Error("Track item selection gecersiz");
        }
        for (const ti of items) {
          const ok = selection.addItem(ti.item, true);
          if (ok === false) {
            console.warn("Selection addItem basarisiz:", ti.start, ti.end);
          }
        }
      }
      function createRemoveItemsAction(editor, selection, ripple, mediaType, shiftOverLapping) {
        try {
          return editor.createRemoveItemsAction(selection, ripple, mediaType, shiftOverLapping);
        } catch (e) {
          if (!/parameter/i.test(e.message || "")) throw e;
          return editor.createRemoveItemsAction(selection, ripple, mediaType);
        }
      }
      async function refreshSequenceContext(ppro, previousSequence) {
        const project = await ppro.Project.getActiveProject();
        if (!project) throw new Error("Aktif proje yok");
        let sequence = await project.getActiveSequence();
        if (!sequence && previousSequence) sequence = previousSequence;
        if (!sequence) throw new Error("Aktif sequence yok");
        const editor = ppro.SequenceEditor.getEditor(sequence);
        if (!editor) throw new Error("SequenceEditor alinamadi");
        return { project, sequence, editor };
      }
      async function getProjectItemMediaPath(ppro, projectItem) {
        try {
          const clipItem = await ppro.ClipProjectItem.cast(projectItem);
          if (!clipItem) return "";
          return await clipItem.getMediaFilePath();
        } catch {
          return "";
        }
      }
      async function resolveProjectItem(ppro, project, cachedProjectItem, mediaPath) {
        if (cachedProjectItem) {
          try {
            if (!mediaPath) return cachedProjectItem;
            const cachedPath = await getProjectItemMediaPath(ppro, cachedProjectItem);
            if (cachedPath === mediaPath) return cachedProjectItem;
          } catch {
          }
        }
        if (!mediaPath) return cachedProjectItem;
        try {
          const rootItem = await project.getRootItem();
          const found = await findProjectItemByMediaPath(ppro, rootItem, mediaPath, /* @__PURE__ */ new Set());
          return found || cachedProjectItem;
        } catch {
          return cachedProjectItem;
        }
      }
      async function findProjectItemByMediaPath(ppro, projectItem, mediaPath, seen) {
        if (!projectItem) return null;
        let key = "";
        try {
          key = String(projectItem.guid || projectItem.name || "");
        } catch {
        }
        if (key && seen.has(key)) return null;
        if (key) seen.add(key);
        try {
          const clipItem = await ppro.ClipProjectItem.cast(projectItem);
          if (clipItem) {
            const path = await clipItem.getMediaFilePath();
            if (path === mediaPath) return projectItem;
          }
        } catch {
        }
        try {
          const folderItem = await ppro.FolderItem.cast(projectItem);
          if (folderItem && typeof folderItem.getItems === "function") {
            const children = await folderItem.getItems();
            if (Array.isArray(children)) {
              for (const child of children) {
                const found = await findProjectItemByMediaPath(ppro, child, mediaPath, seen);
                if (found) return found;
              }
            }
          }
        } catch {
        }
        return null;
      }
      function runActionTransaction(project, label, actionFactory) {
        let ok = true;
        let callbackError = null;
        try {
          project.lockedAccess(() => {
            ok = project.executeTransaction((ca) => {
              try {
                const actions = normalizeActions(actionFactory());
                for (const action of actions) ca.addAction(action);
              } catch (e) {
                callbackError = e;
              }
            }, label);
          });
        } catch (e) {
          throw new Error(`${label} fail: ${(e.message || String(e)).substring(0, 160)}`);
        }
        if (callbackError) {
          throw new Error(`${label} action fail: ${(callbackError.message || String(callbackError)).substring(0, 160)}`);
        }
        if (ok === false) throw new Error(`${label} transaction basarisiz`);
      }
      function normalizeActions(actions) {
        if (!Array.isArray(actions)) actions = [actions];
        const filtered = actions.filter(Boolean);
        if (filtered.length === 0) throw new Error("Transaction action listesi bos");
        return filtered;
      }
      module.exports = { reconstruct };
    }
  });

  // src/index.js
  function _earlyStatus(msg) {
    try {
      const bar = document.getElementById("status-bar");
      if (bar) bar.textContent = msg;
    } catch {
    }
  }
  _earlyStatus("JS yukleniyor...");
  var config;
  var daemon;
  var timeUtils;
  var audioExporter;
  var silenceDetector;
  var breathDetector;
  var segmentBuilder;
  var transcriber;
  var captionGrouper;
  var srtWriter;
  var vttWriter;
  var duplicator;
  var seqEditor;
  var reconstructor;
  try {
    config = require_config();
    daemon = require_daemon();
    timeUtils = require_time();
    audioExporter = require_audio_exporter();
    silenceDetector = require_silence_detector();
    breathDetector = require_breath_detector();
    segmentBuilder = require_segment_builder();
    transcriber = require_transcriber();
    captionGrouper = require_caption_grouper();
    srtWriter = require_srt_writer();
    vttWriter = require_vtt_writer();
    duplicator = require_duplicator();
    seqEditor = require_sequence_editor();
    reconstructor = require_reconstructor();
    _earlyStatus("Moduller yuklendi");
  } catch (e) {
    _earlyStatus("Modul hatasi: " + e.message);
    console.error("PremiereCut require hatasi:", e);
  }
  var analysisResult = null;
  var transcriptResult = null;
  var currentAudioPath = null;
  function init() {
    try {
      _earlyStatus("Init basladi");
      if (!config) throw new Error("config yuklenmedi");
      config.load();
      setupTabs();
      setupSliders();
      setupSteppers();
      setupCollapsibles();
      setupButtons();
      restoreSettings();
      _earlyStatus("Init tamam \u2014 dep check");
      checkDependencies();
    } catch (e) {
      _earlyStatus("Init hatasi: " + e.message);
      console.error("PremiereCut init error:", e);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  function setupTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((c) => {
          c.style.display = "none";
        });
        tab.classList.add("active");
        const target = document.getElementById(`tab-${tab.dataset.tab}`);
        if (target) target.style.display = "block";
      });
    });
    document.getElementById("tab-autocut").style.display = "block";
  }
  function setupSliders() {
    const sliders = [
      { id: "silenceThreshold", suffix: " dB" },
      { id: "minSilenceDuration", suffix: "s" },
      { id: "padding", suffix: "ms" },
      { id: "minKeepDuration", suffix: "s" },
      { id: "maxSubDuration", suffix: "s" },
      { id: "minSubDuration", suffix: "s" },
      { id: "cpsLimit", suffix: "" }
    ];
    sliders.forEach(({ id, suffix }) => {
      const slider = document.getElementById(id);
      const valueEl = document.getElementById(`${id}-val`);
      if (!slider || !valueEl) return;
      initCustomSlider(slider);
      const step = parseFloat(slider.dataset.step) || 1;
      const decimals = (String(step).split(".")[1] || "").length;
      const formatValue = (raw) => {
        const num = parseFloat(raw);
        if (isNaN(num)) return raw;
        return decimals > 0 ? num.toFixed(decimals) : String(Math.round(num));
      };
      const applyChange = () => {
        valueEl.textContent = formatValue(slider.dataset.value) + suffix;
        saveCurrentSettings();
      };
      slider.addEventListener("input", applyChange);
      slider.addEventListener("change", applyChange);
      makeValueEditable(slider, valueEl, suffix, applyChange);
      applyChange();
    });
  }
  function initCustomSlider(track) {
    const fill = track.querySelector(".cslider-fill");
    const thumb = track.querySelector(".cslider-thumb");
    const min = Number(track.dataset.min || 0);
    const max = Number(track.dataset.max || 100);
    const step = Number(track.dataset.step || 1);
    const decimals = (String(step).split(".")[1] || "").length;
    const clamp = (v) => Math.min(max, Math.max(min, v));
    const snap = (v) => Math.round(v / step) * step;
    const fmt = (v) => decimals > 0 ? Number(v).toFixed(decimals) : String(Math.round(v));
    function setValue(value, emit = true) {
      const next = clamp(snap(value));
      const percent = (next - min) / (max - min) * 100;
      track.dataset.value = fmt(next);
      track.style.setProperty("--percent", `${percent}%`);
      track.setAttribute("aria-valuemin", String(min));
      track.setAttribute("aria-valuemax", String(max));
      track.setAttribute("aria-valuenow", track.dataset.value);
      if (emit) {
        track.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      }
    }
    function valueFromClientX(clientX) {
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return min + ratio * (max - min);
    }
    let dragging = false;
    const onDown = (e) => {
      dragging = true;
      try {
        track.setPointerCapture && track.setPointerCapture(e.pointerId);
      } catch {
      }
      setValue(valueFromClientX(e.clientX));
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      setValue(valueFromClientX(e.clientX));
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      try {
        track.releasePointerCapture && track.releasePointerCapture(e.pointerId);
      } catch {
      }
      track.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    };
    track.addEventListener("pointerdown", onDown);
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);
    track.addEventListener("mousedown", (e) => {
      dragging = true;
      setValue(valueFromClientX(e.clientX));
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      setValue(valueFromClientX(e.clientX));
    });
    document.addEventListener("mouseup", () => {
      dragging = false;
    });
    track.addEventListener("keydown", (e) => {
      const cur = Number(track.dataset.value || min);
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        setValue(cur - step);
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        setValue(cur + step);
      }
    });
    setValue(Number(track.dataset.value || min), false);
  }
  function makeValueEditable(slider, valueEl, suffix, onChange) {
    valueEl.style.cursor = "text";
    valueEl.style.textDecoration = "underline dotted";
    valueEl.style.textUnderlineOffset = "3px";
    valueEl.title = "Degeri degistirmek icin tiklayip yazin";
    valueEl.addEventListener("click", () => {
      const getAttr = (attr) => slider.dataset ? slider.dataset[attr] : slider[attr];
      const min = parseFloat(getAttr("min"));
      const max = parseFloat(getAttr("max"));
      const step = parseFloat(getAttr("step")) || 1;
      const current = slider.dataset.value || slider.value;
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = current;
      input.style.cssText = "flex:0 0 50px;width:50px;background:#1a1a1a;color:#fff;border:1px solid #3a3a3a;border-radius:3px;font-size:11px;text-align:right;padding:2px 4px;";
      valueEl.style.display = "none";
      valueEl.parentElement.insertBefore(input, valueEl);
      input.focus();
      input.select();
      const commit = () => {
        let v = parseFloat(input.value);
        if (isNaN(v)) v = parseFloat(current);
        v = Math.max(min, Math.min(max, v));
        const decimals = (String(step).split(".")[1] || "").length;
        const valStr = decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
        if (slider.dataset && slider.dataset.min !== void 0) {
          slider.dataset.value = valStr;
          const percent = (v - min) / (max - min) * 100;
          slider.style.setProperty("--percent", `${percent}%`);
        } else {
          slider.value = valStr;
        }
        input.remove();
        valueEl.style.display = "";
        onChange();
      };
      const cancel = () => {
        input.remove();
        valueEl.style.display = "";
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") cancel();
      });
    });
  }
  function setupSteppers() {
    const stepperConfig = {
      maxLinesPerSub: { min: 1, max: 3 },
      maxWordsPerLine: { min: 2, max: 12 }
    };
    document.querySelectorAll(".stepper-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        const dir = parseInt(btn.dataset.dir);
        const valEl = document.getElementById(`${target}-val`);
        const conf = stepperConfig[target];
        if (!valEl || !conf) return;
        let val = parseInt(valEl.textContent) + dir;
        val = Math.max(conf.min, Math.min(conf.max, val));
        valEl.textContent = val;
        saveCurrentSettings();
      });
    });
  }
  function setupCollapsibles() {
    ["advanced-cut", "advanced-srt"].forEach((prefix) => {
      const toggle = document.getElementById(`${prefix}-toggle`);
      const body = document.getElementById(`${prefix}-body`);
      const arrow = document.getElementById(`${prefix}-arrow`);
      if (toggle && body) {
        toggle.addEventListener("click", () => {
          const isOpen = body.style.display === "block";
          body.style.display = isOpen ? "none" : "block";
          if (arrow) arrow.innerHTML = isOpen ? "&#9654;" : "&#9660;";
        });
      }
    });
  }
  function setupButtons() {
    document.getElementById("btn-analyze").addEventListener("click", handleAnalyze);
    document.getElementById("btn-apply-cut").addEventListener("click", handleApplyCut);
    document.getElementById("btn-transcribe").addEventListener("click", handleTranscribe);
    document.getElementById("btn-save-srt").addEventListener("click", handleSaveSRT);
    const resetBtn = document.getElementById("resetSettings");
    if (resetBtn) resetBtn.addEventListener("click", handleResetSettings);
  }
  function handleResetSettings() {
    config.reset();
    restoreSettings();
    setStatus("Ayarlar varsayilana donduruldu", "success");
  }
  async function checkDependencies() {
    try {
      const res = await daemon.check();
      updateDepBadge("ffmpeg", res.ffmpeg);
      updateDepBadge("whisper", res.whisper);
      updateDepBadge("model", res.models && res.models.length > 0);
      if (!res.ffmpeg || !res.whisper || !(res.models && res.models.length)) {
        const dc = document.getElementById("dep-check-cut");
        if (dc) dc.style.display = "block";
      }
      setStatus("Hazir", "success");
    } catch (err) {
      console.error("Dependency check failed:", err);
      updateDepBadge("ffmpeg", false);
      updateDepBadge("whisper", false);
      updateDepBadge("model", false);
      const dc = document.getElementById("dep-check-cut");
      if (dc) dc.style.display = "block";
      setStatus("Daemon baslatilmamis. install-daemon.sh calistirin.", "error");
    }
  }
  function updateDepBadge(name, ok) {
    const icon = document.getElementById(`dep-${name}-icon`);
    if (!icon) return;
    icon.textContent = ok ? "\u2713" : "\u2717";
    icon.className = `dep-icon ${ok ? "ok" : "fail"}`;
  }
  async function handleAnalyze() {
    const btn = document.getElementById("btn-analyze");
    btn.disabled = true;
    showProgress("cut", true, "Ses dosyasi hazirlaniyor...");
    setStatus("Analiz ediliyor...");
    try {
      updateProgress("cut", 10, "Sequence'den ses cikariliyor...");
      currentAudioPath = await audioExporter.exportAudio({ sampleRate: 48e3 });
      updateProgress("cut", 40, "Sessizlikler tespit ediliyor...");
      const settings = getCurrentSettings();
      const sd = await silenceDetector.detect(currentAudioPath, {
        noiseThreshold: settings.silenceThreshold,
        minDuration: settings.minSilenceDuration
      });
      const silenceRegions = sd.regions;
      const totalDuration = sd.duration;
      let breathRegions = [];
      if (settings.detectBreaths) {
        updateProgress("cut", 70, "Nefes sesleri analiz ediliyor...");
        breathRegions = breathDetector.findBreathCandidates(silenceRegions);
      }
      updateProgress("cut", 90, "Segmentler hesaplaniyor...");
      const paddingMs = parseInt(document.getElementById("padding").value);
      analysisResult = segmentBuilder.build(totalDuration, silenceRegions, breathRegions, {
        paddingBefore: paddingMs / 1e3,
        paddingAfter: paddingMs / 1e3,
        minKeepDuration: settings.minKeepDuration
      });
      updateProgress("cut", 100, "Tamamlandi");
      displayCutResults(analysisResult);
      const applyBtn = document.getElementById("btn-apply-cut");
      if (applyBtn) applyBtn.disabled = !analysisResult.keep || analysisResult.keep.length === 0;
      if (!analysisResult.keep || analysisResult.keep.length === 0) {
        setStatus("Tutulacak bolge yok \u2014 esigi dusur (-40 dB gibi) ve 'Sifirla' deneyin", "error");
      } else {
        setStatus(`Analiz tamam: ${analysisResult.remove.length} sessiz, ${analysisResult.keep.length} tutulacak bolge`, "success");
      }
    } catch (err) {
      console.error("Analiz hatasi:", err);
      setStatus(`Hata: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      setTimeout(() => showProgress("cut", false), 1e3);
    }
  }
  async function handleApplyCut() {
    if (!analysisResult) {
      setStatus("Once analiz yapin", "error");
      return;
    }
    if (!analysisResult.keep || !analysisResult.keep.length) {
      setStatus("Tutulacak bolge yok \u2014 ayarlar cok agresif", "error");
      return;
    }
    if (!analysisResult.remove || !analysisResult.remove.length) {
      setStatus("Silinecek sessizlik bulunamadi \u2014 esigi yukselt veya min. sessizligi dusur", "error");
      return;
    }
    const btn = document.getElementById("btn-apply-cut");
    btn.disabled = true;
    showProgress("cut", true, "Kesim basliyor (Cmd+Z ile geri alinabilir)...");
    try {
      updateProgress("cut", 10, "Sequence aliniyor...");
      const seq = await duplicator.duplicateActiveSequence(" - AutoCut");
      updateProgress("cut", 20, "Kesim uygulaniyor...");
      const result = await reconstructor.reconstruct(
        seq,
        analysisResult.remove,
        (pct) => updateProgress("cut", 20 + Math.round(pct * 0.8), `%${pct}`),
        analysisResult.keep
      );
      updateProgress("cut", 100, "Tamamlandi");
      setStatus(`AutoCut: ${result.message}`, result.success ? "success" : "error");
    } catch (err) {
      console.error("Cut hatasi:", err);
      setStatus(`Hata: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      setTimeout(() => showProgress("cut", false), 1500);
    }
  }
  async function handleTranscribe() {
    const btn = document.getElementById("btn-transcribe");
    btn.disabled = true;
    showProgress("srt", true, "Ses dosyasi hazirlaniyor...");
    setStatus("Transkript ediliyor...");
    try {
      updateProgress("srt", 10, "Ses cikariliyor...");
      const audioPath = await audioExporter.exportAudio({
        sampleRate: 16e3,
        mono: true,
        suffix: "-srt"
      });
      currentAudioPath = audioPath;
      updateProgress("srt", 20, "Whisper calisiyor (1-5 dakika surebilir)...");
      const language = document.getElementById("srt-language").value;
      const model = document.getElementById("srt-model").value;
      const segments = await transcriber.transcribe(audioPath, { language, model });
      updateProgress("srt", 85, "Altyazilar olusturuluyor...");
      const allWords = [];
      for (const seg of segments) {
        if (seg.words && seg.words.length > 0) {
          allWords.push(...seg.words);
        } else {
          const text = seg.text.trim();
          const words = text.split(/\s+/).filter((w) => w.length > 0);
          const wordDuration = (seg.end - seg.start) / Math.max(words.length, 1);
          words.forEach((w, i) => {
            allWords.push({
              text: w,
              start: seg.start + i * wordDuration,
              end: seg.start + (i + 1) * wordDuration
            });
          });
        }
      }
      const settings = getCurrentSettings();
      const captions = captionGrouper.group(allWords, settings);
      transcriptResult = { segments, captions };
      updateProgress("srt", 100, "Tamamlandi");
      displaySRTPreview(captions);
      setStatus(`Transkript: ${captions.length} altyazi`, "success");
    } catch (err) {
      console.error("SRT hatasi:", err);
      setStatus(`Hata: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      setTimeout(() => showProgress("srt", false), 1500);
    }
  }
  async function handleSaveSRT() {
    if (!transcriptResult || !transcriptResult.captions.length) {
      setStatus("Once transkript yapin", "error");
      return;
    }
    try {
      const ppro = __require("premierepro");
      const project = await ppro.Project.getActiveProject();
      const sequence = await project.getActiveSequence();
      const seqName = sequence.name || "sequence";
      const safeName = String(seqName).replace(/[^a-zA-Z0-9_-]/g, "_");
      const outputDir = "/Users/" + getUserName() + "/Documents/PremierSEYO";
      const savedFiles = [];
      if (document.getElementById("output-srt").checked) {
        const srtPath = `${outputDir}/${safeName}.srt`;
        const saved = await srtWriter.write(srtPath, transcriptResult.captions);
        savedFiles.push(saved);
      }
      if (document.getElementById("output-vtt").checked) {
        const vttPath = `${outputDir}/${safeName}.vtt`;
        const saved = await vttWriter.write(vttPath, transcriptResult.captions);
        savedFiles.push(saved);
      }
      if (savedFiles.length > 0) {
        try {
          const srtFile = savedFiles.find((f) => f.endsWith(".srt"));
          if (srtFile) {
            const rootItem = await project.getRootItem();
            await project.importFiles([srtFile], true, rootItem, false);
            setStatus(`Kaydedildi ve proje paneline eklendi (${savedFiles.length} dosya)`, "success");
          } else {
            setStatus(`Kaydedildi: ${savedFiles.length} dosya`, "success");
          }
        } catch (importErr) {
          console.warn("SRT import hatasi:", importErr);
          await daemon.reveal(savedFiles[0]);
          setStatus(`Kaydedildi (import manuel): ${savedFiles.length} dosya`, "success");
        }
      } else {
        setStatus("Cikti formati secin", "error");
      }
    } catch (err) {
      console.error("Save hatasi:", err);
      setStatus(`Hata: ${err.message}`, "error");
    }
  }
  function getUserName() {
    try {
      const os = __require("os");
      return os.userInfo().username;
    } catch {
      return "seyo";
    }
  }
  function displayCutResults(result) {
    const { stats } = result;
    const container = document.getElementById("results-cut");
    container.style.display = "block";
    document.getElementById("stat-silence-count").textContent = stats.silenceCount;
    document.getElementById("stat-breath-count").textContent = stats.breathCount;
    document.getElementById("stat-remove-time").textContent = timeUtils.formatDuration(stats.totalRemove);
    document.getElementById("stat-keep-time").textContent = timeUtils.formatDuration(stats.totalKeep);
    document.getElementById("stat-reduction").textContent = stats.reductionPercent + "%";
    renderWaveform(result);
  }
  function renderWaveform(result) {
    const container = document.getElementById("waveform");
    container.innerHTML = "";
    const totalDuration = result.stats.totalDuration;
    if (totalDuration === 0) return;
    const all = [
      ...result.keep.map((s) => ({ ...s, type: "keep" })),
      ...result.remove.map((s) => ({ ...s, type: "remove" }))
    ].sort((a, b) => a.start - b.start);
    for (const seg of all) {
      const widthPercent = seg.duration / totalDuration * 100;
      const el = document.createElement("div");
      el.className = `waveform-segment ${seg.type}`;
      el.style.width = `${Math.max(widthPercent, 0.5)}%`;
      container.appendChild(el);
    }
  }
  function displaySRTPreview(captions) {
    const container = document.getElementById("results-srt");
    container.style.display = "block";
    const preview = document.getElementById("srt-preview");
    const maxPreview = Math.min(captions.length, 10);
    let html = "";
    for (let i = 0; i < maxPreview; i++) {
      const cap = captions[i];
      const startTS = timeUtils.secondsToSRT(cap.start);
      const endTS = timeUtils.secondsToSRT(cap.end);
      html += `<div><span class="srt-index">${cap.index}</span></div>`;
      html += `<div><span class="srt-time">${startTS} --> ${endTS}</span></div>`;
      html += `<div><span class="srt-text">${escapeHtml(cap.text)}</span></div>`;
      html += `<br/>`;
    }
    if (captions.length > maxPreview) {
      html += `<div style="color:var(--text-muted)">... ve ${captions.length - maxPreview} altyazi daha</div>`;
    }
    preview.innerHTML = html;
  }
  function showProgress(tab, visible, text) {
    const container = document.getElementById(`progress-${tab}`);
    if (!container) return;
    container.style.display = visible ? "block" : "none";
    if (visible && text) {
      const textEl = document.getElementById(`progress-${tab}-text`);
      if (textEl) textEl.textContent = text;
    }
  }
  function updateProgress(tab, percent, text) {
    const fill = document.getElementById(`progress-${tab}-fill`);
    const textEl = document.getElementById(`progress-${tab}-text`);
    if (fill) fill.style.width = `${percent}%`;
    if (text && textEl) textEl.textContent = text;
  }
  function setStatus(text, type = "") {
    const bar = document.getElementById("status-bar");
    if (!bar) return;
    bar.textContent = text;
    bar.className = `status-bar ${type}`;
  }
  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function readSliderValue(id) {
    const el = document.getElementById(id);
    if (!el) return NaN;
    return parseFloat(el.dataset && el.dataset.value !== void 0 ? el.dataset.value : el.value);
  }
  function getCurrentSettings() {
    const paddingMs = readSliderValue("padding");
    const paddingSeconds = (isNaN(paddingMs) ? 150 : paddingMs) / 1e3;
    return {
      silenceThreshold: parseInt(readSliderValue("silenceThreshold")),
      minSilenceDuration: readSliderValue("minSilenceDuration"),
      paddingBefore: paddingSeconds,
      paddingAfter: paddingSeconds,
      detectBreaths: document.getElementById("detectBreaths").checked,
      minKeepDuration: readSliderValue("minKeepDuration"),
      maxLinesPerSub: parseInt(document.getElementById("maxLinesPerSub-val").textContent),
      maxWordsPerLine: parseInt(document.getElementById("maxWordsPerLine-val").textContent),
      maxCharsPerLine: 999,
      // devre disi
      maxSubDuration: readSliderValue("maxSubDuration"),
      minSubDuration: readSliderValue("minSubDuration"),
      cpsLimit: parseInt(readSliderValue("cpsLimit")),
      splitOnSentence: document.getElementById("splitOnSentence").checked,
      splitOnPause: document.getElementById("splitOnPause").checked
    };
  }
  function saveCurrentSettings() {
    config.save(getCurrentSettings());
  }
  function restoreSettings() {
    const s = config.get();
    setSlider("silenceThreshold", s.silenceThreshold, " dB");
    setSlider("minSilenceDuration", s.minSilenceDuration, "s");
    setSlider("padding", Math.round((s.paddingBefore || 0.15) * 1e3), "ms");
    setSlider("minKeepDuration", s.minKeepDuration, "s");
    setSlider("maxSubDuration", s.maxSubDuration, "s");
    setSlider("minSubDuration", s.minSubDuration, "s");
    setSlider("cpsLimit", s.cpsLimit, "");
    setStepperVal("maxLinesPerSub", s.maxLinesPerSub);
    setStepperVal("maxWordsPerLine", s.maxWordsPerLine);
    setCheckbox("detectBreaths", s.detectBreaths);
    setCheckbox("splitOnSentence", s.splitOnSentence);
    setCheckbox("splitOnPause", s.splitOnPause);
  }
  function setSlider(id, value, suffix) {
    const slider = document.getElementById(id);
    const valEl = document.getElementById(`${id}-val`);
    if (slider) {
      const num = parseFloat(value);
      if (slider.dataset && slider.dataset.min !== void 0) {
        const min = parseFloat(slider.dataset.min);
        const max = parseFloat(slider.dataset.max);
        const step = parseFloat(slider.dataset.step) || 1;
        const decimals = (String(step).split(".")[1] || "").length;
        const clamped = Math.max(min, Math.min(max, num));
        slider.dataset.value = decimals > 0 ? clamped.toFixed(decimals) : String(Math.round(clamped));
        const percent = (clamped - min) / (max - min) * 100;
        slider.style.setProperty("--percent", `${percent}%`);
      } else {
        slider.value = value;
      }
    }
    if (valEl) {
      const step = slider ? parseFloat(
        slider.dataset && slider.dataset.step || slider.step
      ) || 1 : 1;
      const decimals = (String(step).split(".")[1] || "").length;
      const num = parseFloat(value);
      const display = decimals > 0 ? num.toFixed(decimals) : String(Math.round(num));
      valEl.textContent = display + suffix;
    }
  }
  function setStepperVal(id, value) {
    const valEl = document.getElementById(`${id}-val`);
    if (valEl) valEl.textContent = value;
  }
  function setCheckbox(id, checked) {
    const cb = document.getElementById(id);
    if (cb) cb.checked = checked;
  }
  var { entrypoints } = __require("uxp");
  entrypoints.setup({
    panels: {
      "premierseyo-panel": {
        show() {
          console.log("PremierSEYO panel acildi");
        },
        hide() {
          console.log("PremierSEYO panel kapandi");
        }
      }
    }
  });
})();
