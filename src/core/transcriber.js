/**
 * whisper-cli ile konusma tanima — daemon uzerinden
 */

const daemon = require("../utils/daemon");

/**
 * @typedef {Object} Word
 * @property {string} text
 * @property {number} start
 * @property {number} end
 */

/**
 * @typedef {Object} TranscriptSegment
 * @property {string} text
 * @property {number} start
 * @property {number} end
 * @property {Word[]} words
 */

/**
 * @param {string} audioPath
 * @param {object} [options]
 * @returns {Promise<TranscriptSegment[]>}
 */
async function transcribe(audioPath, { language = "auto", model = "large-v3" } = {}) {
  const res = await daemon.transcribe({ audioPath, language, model });
  const parsed = res.result;
  return parseWhisperOutput(parsed);
}

/**
 * whisper.cpp JSON ciktisini parse et
 * Format: { transcription: [{ timestamps: {from, to}, text, offsets: {from, to} }] }
 */
function parseWhisperOutput(whisperJson) {
  if (!whisperJson) return [];

  // whisper-cli -oj -ojf bazen hem "segments" hem "transcription" donduruyor.
  // Ikisi ayni metni temsil ettigi icin segments varsa onu tek kaynak kabul et.
  const rawSegments = Array.isArray(whisperJson.segments) && whisperJson.segments.length > 0
    ? whisperJson.segments
    : (Array.isArray(whisperJson.transcription) ? whisperJson.transcription : []);

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
  const text = (item.text || words.map(w => w.text).join(" ")).trim();

  const wordStart = words.length ? words[0].start : start;
  const wordEnd = words.length ? words[words.length - 1].end : end;

  return {
    text,
    start: Number.isFinite(start) ? start : wordStart,
    end: Number.isFinite(end) ? end : wordEnd,
    words,
  };
}

function normalizeWords(rawWords) {
  if (!Array.isArray(rawWords)) return [];
  return rawWords
    .map((w) => {
      const text = (w.text || w.word || w.token || "").trim();
      const start = firstNumber(w.start, w.timestamps?.from, w.offsets?.from);
      const end = firstNumber(w.end, w.timestamps?.to, w.offsets?.to);
      if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return null;
      }
      return { text, start, end };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = parseTimestamp(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

/*
  Eski format referansi:
  { transcription: [{ timestamps: {from, to}, text }] }

  Not: Bu blok bilincli olarak devre disi. Yukaridaki normalizeSegment hem
  transcription hem de segments formatini tek yoldan isliyor; iki formati ust
  uste eklemek tekrarli altyazi uretiyordu.
*/
function parseWhisperOutputLegacy(whisperJson) {
  const segments = [];

  if (whisperJson.transcription && Array.isArray(whisperJson.transcription)) {
    for (const item of whisperJson.transcription) {
      const start = parseTimestamp(item.timestamps?.from);
      const end = parseTimestamp(item.timestamps?.to);

      segments.push({
        text: (item.text || "").trim(),
        start,
        end,
        words: [], // whisper.cpp default'ta word timestamp vermez
      });
    }
  }

  // Yeni format destegi
  if (whisperJson.segments && Array.isArray(whisperJson.segments)) {
    for (const seg of whisperJson.segments) {
      const words = (seg.words || []).map(w => ({
        text: (w.text || w.word || "").trim(),
        start: typeof w.start === "number" ? w.start : parseTimestamp(w.start),
        end: typeof w.end === "number" ? w.end : parseTimestamp(w.end),
      }));

      segments.push({
        text: (seg.text || "").trim(),
        start: typeof seg.start === "number" ? seg.start : parseTimestamp(seg.start),
        end: typeof seg.end === "number" ? seg.end : parseTimestamp(seg.end),
        words,
      });
    }
  }

  return segments;
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
