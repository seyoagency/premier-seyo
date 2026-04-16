/**
 * Word-level timestamp'lerden altyazi gruplari olustur
 * Profesyonel SRT uretimi icin akilli gruplama
 */

/**
 * @typedef {Object} Caption
 * @property {number} index — altyazi numarasi (1-based)
 * @property {number} start — baslangic saniye
 * @property {number} end — bitis saniye
 * @property {string[]} lines — altyazi satirlari
 * @property {string} text — tum metin (birlesmis)
 */

/**
 * Kelime listesinden altyazi gruplari olustur
 *
 * @param {import('../core/transcriber').Word[]} words — kelime listesi
 * @param {object} options
 * @param {number} [options.maxLinesPerSub=2]
 * @param {number} [options.maxWordsPerLine=6]
 * @param {number} [options.maxCharsPerLine=42]
 * @param {number} [options.maxSubDuration=5] — saniye
 * @param {number} [options.minSubDuration=1] — saniye
 * @param {number} [options.cpsLimit=20] — karakter/saniye
 * @param {boolean} [options.splitOnSentence=true]
 * @param {boolean} [options.splitOnPause=true]
 * @returns {Caption[]}
 */
function group(words, {
  maxLinesPerSub = 2,
  maxWordsPerLine = 6,
  maxCharsPerLine = 42,
  maxSubDuration = 5,
  minSubDuration = 1,
  cpsLimit = 20,
  splitOnSentence = true,
  splitOnPause = true,
} = {}) {
  if (!words || words.length === 0) return [];

  const captions = [];
  let currentLines = [];
  let currentLine = "";
  let currentLineWordCount = 0;
  let captionStart = words[0].start;
  let captionWordStart = words[0].start;
  let lastWordEnd = words[0].end;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordText = word.text.trim();
    if (!wordText) continue;

    const nextWord = words[i + 1];
    const gap = nextWord ? nextWord.start - word.end : 0;

    // Kelimeyi mevcut satira eklemeyi dene
    const testLine = currentLine ? currentLine + " " + wordText : wordText;
    const testLineWordCount = currentLineWordCount + 1;

    // Yeni satir gerekli mi?
    let needNewLine = false;
    if (testLine.length > maxCharsPerLine) needNewLine = true;
    if (testLineWordCount > maxWordsPerLine) needNewLine = true;

    // Yeni altyazi gerekli mi?
    let needNewCaption = false;
    const captionDuration = word.end - captionStart;

    if (captionDuration > maxSubDuration) needNewCaption = true;
    if (needNewLine && currentLines.length >= maxLinesPerSub) needNewCaption = true;

    // Cumle sonu kontrolu
    const isSentenceEnd = splitOnSentence && /[.!?]$/.test(wordText);

    // Dogal durakla kontrolu (500ms+)
    const isPause = splitOnPause && gap > 0.5;

    if (needNewCaption && currentLine) {
      // Mevcut altyaziyi kapat
      currentLines.push(currentLine);
      captions.push(makeCaption(captions.length + 1, captionStart, lastWordEnd, currentLines));
      currentLines = [];
      currentLine = wordText;
      currentLineWordCount = 1;
      captionStart = word.start;

    } else if (needNewLine && currentLine) {
      // Yeni satir
      currentLines.push(currentLine);

      if (currentLines.length >= maxLinesPerSub) {
        // Altyaziyi kapat, yeni basla
        captions.push(makeCaption(captions.length + 1, captionStart, lastWordEnd, currentLines));
        currentLines = [];
        currentLine = wordText;
        currentLineWordCount = 1;
        captionStart = word.start;
      } else {
        currentLine = wordText;
        currentLineWordCount = 1;
      }

    } else {
      // Kelimeyi mevcut satira ekle
      currentLine = testLine;
      currentLineWordCount = testLineWordCount;
    }

    lastWordEnd = word.end;

    // Cumle sonu veya dogal duraklada altyaziyi kapat
    if ((isSentenceEnd || isPause) && currentLine) {
      currentLines.push(currentLine);
      const duration = lastWordEnd - captionStart;

      // Cok kisa altyazilari bir sonrakiyle birlestirme, ama minimum sure kontrolu yap
      if (duration >= minSubDuration || i === words.length - 1) {
        captions.push(makeCaption(captions.length + 1, captionStart, lastWordEnd, currentLines));
        currentLines = [];
        currentLine = "";
        currentLineWordCount = 0;
        captionStart = nextWord ? nextWord.start : lastWordEnd;
      }
    }
  }

  // Kalan kelimeleri isle
  if (currentLine) {
    currentLines.push(currentLine);
  }
  if (currentLines.length > 0) {
    captions.push(makeCaption(captions.length + 1, captionStart, lastWordEnd, currentLines));
  }

  // CPS kontrolu — cok hizli altyazilari uzat
  return applyCPSLimit(captions, cpsLimit);
}

/**
 * Caption nesnesi olustur
 */
function makeCaption(index, start, end, lines) {
  return {
    index,
    start,
    end,
    lines: [...lines],
    text: lines.join("\n"),
  };
}

/**
 * CPS (karakter/saniye) limitini uygula
 * Cok hizli gecen altyazilarin suresini uzat
 */
function applyCPSLimit(captions, cpsLimit) {
  return captions.map(cap => {
    const charCount = cap.text.replace(/\n/g, "").length;
    const duration = cap.end - cap.start;
    const cps = charCount / duration;

    if (cps > cpsLimit && duration > 0) {
      // Minimum sure = karakter sayisi / cps limiti
      const minDuration = charCount / cpsLimit;
      return {
        ...cap,
        end: cap.start + minDuration,
      };
    }
    return cap;
  });
}

module.exports = { group, applyCPSLimit };
