/**
 * Sequence'in TUM audio'sunu mixdown olarak WAV'a cikar
 *
 * Yaklasim:
 * 1. Sequence'deki tum audio + video clip'lerin source path, source in/out,
 *    timeline start bilgilerini topla
 * 2. Daemon'daki /build-sequence-audio endpoint'ine gonder
 * 3. Daemon FFmpeg concat+atrim ile mixdown WAV uretir
 *
 * Bu sequence'in trim/split edit'lerini yansitir (onceki "ilk klip" yaklasimi
 * yapmiyordu).
 */

const daemon = require("../utils/daemon");

/**
 * Active sequence'in tum audio mixdown'ini WAV olarak export et
 */
async function exportAudio({ sampleRate = 48000, mono = false, suffix = "" } = {}) {
  const ppro = require("premierepro");

  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Aktif proje yok");

  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Aktif sequence yok");

  const clips = await collectSequenceClips(sequence);
  if (clips.length === 0) {
    throw new Error("Sequence'de ses klibi bulunamadi");
  }

  // outputPath'i gonderme — daemon kendi TMP_DIR'ine yazsin
  const res = await daemon.call("/build-sequence-audio", {
    clips,
    sampleRate,
    mono,
  }, 600000);

  return res.outputPath;
}

/**
 * Sequence'deki TUM audio track clip'lerini, source info + timeline position
 * ile topla. Eger audio yoksa video track'leri kullan (videonun ses kanalini
 * FFmpeg cikaracak).
 *
 * Her clip objesi: { path, sourceIn, sourceOut, timelineStart, duration }
 */
async function collectSequenceClips(sequence) {
  const ppro = require("premierepro");
  const clips = [];

  const audioTrackCount = await sequence.getAudioTrackCount();
  const videoTrackCount = await sequence.getVideoTrackCount();

  // Audio tracks varsa onu kullan
  const tracks = [];
  if (audioTrackCount > 0) {
    for (let i = 0; i < audioTrackCount; i++) {
      const t = await sequence.getAudioTrack(i);
      if (t) tracks.push(t);
    }
  }

  // Hic audio clip yoksa video'lardan cekelim
  const fallbackToVideo = tracks.length === 0 ||
    (await Promise.all(tracks.map(async t => {
      const items = await t.getTrackItems(1, false);
      return items && items.length > 0;
    }))).every(x => !x);

  const finalTracks = fallbackToVideo
    ? await (async () => {
        const r = [];
        for (let i = 0; i < videoTrackCount; i++) {
          const t = await sequence.getVideoTrack(i);
          if (t) r.push(t);
        }
        return r;
      })()
    : tracks;

  for (const track of finalTracks) {
    const items = await track.getTrackItems(1, false); // Clip only
    if (!items) continue;

    for (const item of items) {
      const projectItem = await item.getProjectItem();
      if (!projectItem) continue;

      const clipItem = await ppro.ClipProjectItem.cast(projectItem);
      if (!clipItem) continue;

      const filePath = await clipItem.getMediaFilePath();
      if (!filePath) continue;

      // Zaman bilgileri
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
        duration,
      });
    }
  }

  // Aynı source file + aynı range çakışmalarını dedupe et
  // (audio + video track'lerde aynı klip varsa sadece birini al)
  const unique = [];
  const seen = new Set();
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
