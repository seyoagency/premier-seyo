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
  const segments = [];

  if (!whisperJson) return segments;

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
