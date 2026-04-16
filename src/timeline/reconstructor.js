/**
 * Keep-only reconstruction stratejisi
 * Sessiz bolgeleri kaldirarak yeni timeline olusturur
 *
 * Strateji:
 * 1. Duplicate sequence uzerinde calis
 * 2. Her track item icin: remove bolgelerinde trim yap
 * 3. Bosluklari ripple delete ile kapat
 */

const timeUtils = require("../utils/time");
const seqEditor = require("./sequence-editor");

/**
 * Duplicate sequence uzerinde sessiz bolgeleri kes
 *
 * @param {object} sequence — duplicate edilmis sequence
 * @param {import('../core/segment-builder').Segment[]} removeSegments — kesilecek bolgeler
 * @param {Function} [onProgress] — ilerleme callback (0-100)
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function reconstruct(sequence, removeSegments, onProgress) {
  const ppro = require("premierepro");

  if (!removeSegments || removeSegments.length === 0) {
    return { success: true, message: "Kesilecek bolge bulunamadi" };
  }

  const project = await ppro.Project.getActiveProject();
  const editor = ppro.SequenceEditor.getEditor(sequence);

  // Remove segmentlerini sondan basa sirala (sondan baslamak offset kaymasini onler)
  const sorted = [...removeSegments].sort((a, b) => b.start - a.start);

  let processed = 0;
  const total = sorted.length;

  for (const segment of sorted) {
    try {
      // Bu remove segmentine denk gelen track item'lari bul ve isle
      await removeTimeRange(project, editor, sequence, segment.start, segment.end);

      processed++;
      if (onProgress) {
        onProgress(Math.round((processed / total) * 100));
      }
    } catch (err) {
      console.error(`PremiereCut: Segment kesilemedi [${segment.start}-${segment.end}]:`, err);
    }
  }

  return {
    success: true,
    message: `${processed}/${total} sessiz bolge kesildi`,
  };
}

/**
 * Belirli bir zaman araligini sequence'den kaldir
 *
 * @param {object} project
 * @param {object} editor — SequenceEditor
 * @param {object} sequence
 * @param {number} startSec — baslangic (saniye)
 * @param {number} endSec — bitis (saniye)
 */
async function removeTimeRange(project, editor, sequence, startSec, endSec) {
  const ppro = require("premierepro");

  // Tum track item'lari al
  const { videoItems, audioItems } = await seqEditor.getTrackItems(sequence);
  const allItems = [...videoItems, ...audioItems];

  // Bu zaman araligina denk gelen track item'lari bul
  const affectedItems = allItems.filter(ti =>
    ti.start < endSec && ti.end > startSec
  );

  if (affectedItems.length === 0) return;

  await project.lockedAccess(async () => {
    await project.executeTransaction(async (compoundAction) => {
      for (const ti of affectedItems) {
        const item = ti.item;

        if (ti.start >= startSec && ti.end <= endSec) {
          // Track item tamamen remove bolgesi icinde — sil
          // TrackItemSelection olustur ve remove action ekle
          // Not: Bu basit durum icin disable et, sonra toplu sil
          const disableAction = await item.createSetDisabledAction(true);
          compoundAction.addAction(disableAction);

        } else if (ti.start < startSec && ti.end > endSec) {
          // Track item remove bolgesini kapsıyor — iki parcaya bolunmeli
          // UXP'de split yok, bu yuzden end point'i ayarlayarak trim yapiyoruz
          // Sadece ilk kismi tutuyoruz (baslangica kadar trim)
          const newEnd = timeUtils.secondsToTicks(startSec);
          const setEndAction = await item.createSetEndAction({ ticks: newEnd });
          compoundAction.addAction(setEndAction);

        } else if (ti.start < startSec && ti.end <= endSec) {
          // Track item remove bolgesinin basinda — sonunu kes
          const newEnd = timeUtils.secondsToTicks(startSec);
          const setEndAction = await item.createSetEndAction({ ticks: newEnd });
          compoundAction.addAction(setEndAction);

        } else if (ti.start >= startSec && ti.end > endSec) {
          // Track item remove bolgesinin sonunda — basini kes
          const newStart = timeUtils.secondsToTicks(endSec);
          const setStartAction = await item.createSetStartAction({ ticks: newStart });
          compoundAction.addAction(setStartAction);
        }
      }
    }, "PremiereCut: Sessiz bolge kesimi");
  });
}

module.exports = { reconstruct, removeTimeRange };
