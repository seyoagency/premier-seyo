/**
 * Legacy shim — eski shell.js yerine daemon HTTP client kullaniliyor.
 * Bu dosya geri uyumluluk icin birakildi.
 */

const daemon = require("./daemon");

module.exports = {
  run: () => { throw new Error("Use daemon.call() instead"); },
  checkFFmpeg: async () => (await daemon.check()).ffmpeg,
  checkWhisper: async () => (await daemon.check()).whisper,
  findWhisperModel: async (name) => {
    const res = await daemon.check();
    return res.models.find(m => m.includes(name)) || null;
  },
  ensureTmpDir: async () => "/tmp/premiere-cut",
  TMP_DIR: "/tmp/premiere-cut",
};
