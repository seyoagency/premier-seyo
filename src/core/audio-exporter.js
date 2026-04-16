/**
 * Premiere sequence'den audio cikarma
 *
 * MVP stratejisi (tek kamera, tek konusmaci senaryosu icin):
 * - Sequence'deki ilk video/audio klibin kaynak medya dosyasini bul
 * - Daemon'a gonder, WAV'a cevrilsin
 *
 * Not: Bu yaklasim sequence'deki trim/split'leri yansitmaz.
 * Daha kapsamli export icin Premiere EncoderManager API'si kullanilabilir.
 */

const daemon = require("../utils/daemon");

/**
 * Active sequence'den audio export
 * @param {object} options
 * @returns {Promise<string>} — export edilen WAV dosya yolu
 */
async function exportAudio({ sampleRate = 48000, mono = false, suffix = "" } = {}) {
  const ppro = require("premierepro");

  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Aktif proje yok");

  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Aktif sequence yok");

  const sourceFile = await getSequenceSourceFile(sequence);
  if (!sourceFile) throw new Error("Sequence'de medya dosyasi bulunamadi");

  const res = await daemon.exportAudio({
    inputPath: sourceFile,
    sampleRate,
    mono,
    suffix,
  });

  return res.outputPath;
}

/**
 * Sequence'in ilk klibinin kaynak dosyasini bul
 * @param {object} sequence
 * @returns {Promise<string|null>}
 */
async function getSequenceSourceFile(sequence) {
  // Once audio trackleri dene (AUTO-CUT ses odakli)
  try {
    const audioCount = await sequence.getAudioTrackCount();
    for (let i = 0; i < audioCount; i++) {
      const track = await sequence.getAudioTrack(i);
      if (!track) continue;
      const items = await track.getTrackItems(0, 0);
      if (!items || items.length === 0) continue;

      for (const item of items) {
        const projectItem = await item.getProjectItem();
        if (projectItem) {
          const mediaPath = await projectItem.getMediaPath();
          if (mediaPath) return mediaPath;
        }
      }
    }
  } catch (e) {
    console.warn("Audio track tarama hatasi:", e);
  }

  // Sonra video trackleri
  try {
    const videoCount = await sequence.getVideoTrackCount();
    for (let i = 0; i < videoCount; i++) {
      const track = await sequence.getVideoTrack(i);
      if (!track) continue;
      const items = await track.getTrackItems(0, 0);
      if (!items || items.length === 0) continue;

      for (const item of items) {
        const projectItem = await item.getProjectItem();
        if (projectItem) {
          const mediaPath = await projectItem.getMediaPath();
          if (mediaPath) return mediaPath;
        }
      }
    }
  } catch (e) {
    console.warn("Video track tarama hatasi:", e);
  }

  return null;
}

module.exports = { exportAudio, getSequenceSourceFile };
