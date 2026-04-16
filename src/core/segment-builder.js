/**
 * Sessizlik + nefes bolgelerinden keep/remove segment listesi uret
 */

/**
 * @typedef {Object} Segment
 * @property {number} start — baslangic saniye
 * @property {number} end — bitis saniye
 * @property {number} duration — sure saniye
 * @property {'keep'|'remove'} type
 */

/**
 * Sessizlik ve nefes bolgelerinden konusma segmentleri uret
 *
 * @param {number} totalDuration — toplam medya suresi (saniye)
 * @param {import('./silence-detector').SilenceRegion[]} silenceRegions
 * @param {import('./breath-detector').BreathRegion[]} breathRegions
 * @param {object} options
 * @param {number} [options.paddingBefore=0.15] — kesim oncesi bosluk (saniye)
 * @param {number} [options.paddingAfter=0.15] — kesim sonrasi bosluk (saniye)
 * @param {number} [options.minKeepDuration=0.3] — minimum konusma suresi (saniye)
 * @returns {{ keep: Segment[], remove: Segment[], stats: object }}
 */
function build(totalDuration, silenceRegions, breathRegions = [], {
  paddingBefore = 0.15,
  paddingAfter = 0.15,
  minKeepDuration = 0.3,
} = {}) {
  // Tum "remove" bolgelerini birlestir (sessizlik + nefes)
  let removeRanges = [
    ...silenceRegions.map(r => ({ start: r.start, end: r.end })),
    ...breathRegions.map(r => ({ start: r.start, end: r.end })),
  ];

  // Siralama
  removeRanges.sort((a, b) => a.start - b.start);

  // Cakisan bolgeleri birlestir (merge overlapping)
  removeRanges = mergeOverlapping(removeRanges);

  // Padding uygula — remove bolgelerini daralt, keep bolgelerini genislet
  removeRanges = removeRanges.map(r => ({
    start: Math.min(r.start + paddingAfter, r.end),
    end: Math.max(r.end - paddingBefore, r.start),
  })).filter(r => r.end > r.start);

  // Keep bolgelerini hesapla (remove'un tersi)
  const keepRanges = [];
  let cursor = 0;

  for (const r of removeRanges) {
    if (r.start > cursor) {
      keepRanges.push({ start: cursor, end: r.start });
    }
    cursor = r.end;
  }

  // Son keep bolgesini ekle
  if (cursor < totalDuration) {
    keepRanges.push({ start: cursor, end: totalDuration });
  }

  // Cok kisa keep bolgelerini filtrele
  const filteredKeep = keepRanges.filter(r => (r.end - r.start) >= minKeepDuration);

  // Segment nesnelerine cevir
  const keep = filteredKeep.map(r => ({
    start: r.start,
    end: r.end,
    duration: r.end - r.start,
    type: "keep",
  }));

  // Istatistikler
  const totalKeep = keep.reduce((sum, s) => sum + s.duration, 0);
  const totalRemove = totalDuration - totalKeep;

  const stats = {
    totalDuration,
    totalKeep,
    totalRemove,
    silenceCount: silenceRegions.length,
    breathCount: breathRegions.length,
    segmentCount: keep.length,
    reductionPercent: Math.round((totalRemove / totalDuration) * 100),
  };

  // Remove segmentleri de uret (gorsellestirme icin)
  const remove = removeRanges.map(r => ({
    start: r.start,
    end: r.end,
    duration: r.end - r.start,
    type: "remove",
  }));

  return { keep, remove, stats };
}

/**
 * Cakisan araliklari birlestir
 * @param {{ start: number, end: number }[]} ranges — sirali
 * @returns {{ start: number, end: number }[]}
 */
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
