/**
 * Word-level timestamp'lerden altyazi gruplari olustur.
 *
 * Basit algoritma (maxWordsPerLine + maxLinesPerSub tabanli):
 * - Kelimeleri sirayla satira ekle
 * - maxWordsPerLine dolunca yeni satira gec
 * - maxLinesPerSub dolunca yeni altyaziya gec
 * - Cumle sonunda (. ? !) altyaziyi hemen bitir
 * - Uzun duraklamalarda (> 0.5s) altyaziyi bitir
 * - Max/min sure ve CPS (karakter/saniye) kontrolleri uygula
 */

function group(words, {
  maxLinesPerSub = 2,
  maxWordsPerLine = 6,
  maxCharsPerLine = 999,   // devre disi: kelime sayisi tek kontrol
  maxSubDuration = 5,
  minSubDuration = 1,
  cpsLimit = 20,
  splitOnSentence = true,
  splitOnPause = true,
} = {}) {
  if (!words || words.length === 0) return [];

  const captions = [];
  let currentLines = [];
  let currentLineWords = [];
  let captionStart = null;

  const flush = (endTime) => {
    // Son satiri kapat
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
      text: currentLines.join("\n"),
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

    // Satir kelime limiti dolu mu?
    const lineFull = currentLineWords.length >= maxWordsPerLine;
    // Ayrica karakter limiti (eger 999 degilse)
    const lineJoined = currentLineWords.join(" ");
    const charFull = lineJoined.length >= maxCharsPerLine;

    if (lineFull || charFull) {
      currentLines.push(lineJoined);
      currentLineWords = [];

      // Altyazi satir limiti dolu mu?
      if (currentLines.length >= maxLinesPerSub) {
        flush(word.end);
        continue;
      }
    }

    // Sure kontrolu
    const duration = word.end - captionStart;
    if (duration >= maxSubDuration) {
      flush(word.end);
      continue;
    }

    // Cumle sonu
    if (splitOnSentence && /[.!?]$/.test(wordText)) {
      flush(word.end);
      continue;
    }

    // Dogal durak
    if (splitOnPause && i + 1 < words.length) {
      const gap = words[i + 1].start - word.end;
      if (gap > 0.5) {
        flush(word.end);
        continue;
      }
    }
  }

  // Kalan kelimeleri son altyaziya kapat
  const last = words[words.length - 1];
  if (last) flush(last.end);

  return applyCPSLimit(captions, cpsLimit, minSubDuration);
}

function applyCPSLimit(captions, cpsLimit, minDur) {
  return captions.map((cap, index) => {
    const charCount = cap.text.replace(/\n/g, " ").length;
    const start = Number(cap.start || 0);
    let end = Math.max(Number(cap.end || start), start + 0.001);

    if (cpsLimit > 0) {
      const duration = Math.max(end - start, 0.001);
      const cps = charCount / duration;
      if (cps > cpsLimit) {
        end = start + (charCount / cpsLimit);
      }
    }

    if (minDur > 0 && (end - start) < minDur) {
      end = start + minDur;
    }

    const next = captions[index + 1];
    if (next && Number.isFinite(next.start)) {
      end = Math.min(end, Math.max(start + 0.001, next.start - 0.001));
    }

    return { ...cap, index: index + 1, start, end: Math.max(start + 0.001, end) };
  });
}

module.exports = { group, applyCPSLimit };
