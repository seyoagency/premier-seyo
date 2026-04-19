/**
 * Kullanici ayarlari — varsayilanlar ve persistent storage
 * UXP'de localStorage mevcut
 */

const STORAGE_KEY = "premierecut-settings-v1";

const DEFAULTS = {
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
  outputFormat: "srt",
};

let _settings = { ...DEFAULTS };

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
  } catch {}
  return _settings;
}

module.exports = { load, save, get, reset, DEFAULTS };
