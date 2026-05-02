/**
 * Kullanici ayarlari — varsayilanlar ve persistent storage
 * UXP'de localStorage mevcut
 */

// v1 → v2 migration: language default "tr" oldu, subtitleOffsetMs eklendi.
// Yeni key'e gecince localStorage'daki eski ayarlar devre disi kalir ve kullanici
// "Sifirla" butonuna basmaya gerek kalmadan yeni default'lari alir.
const STORAGE_KEY = "premierseyo-settings-v2";

const DEFAULTS = {
  silenceThreshold: -40,
  minSilenceDuration: 0.4,
  paddingBefore: 0.15,
  paddingAfter: 0.15,
  detectBreaths: true,
  minKeepDuration: 0.3,

  language: "tr",
  subtitleOffsetMs: 0,  // auto-offset varsayılan; slider sadece ince ayar için
  maxWordsPerCaption: 6,
  // Legacy keys: eski localStorage kayıtları ve eski grouper çağrıları bozulmasın.
  maxLinesPerSub: 1,
  maxWordsPerLine: 6,
  maxCharsPerLine: 999,
  maxSubDuration: 5,
  minSubDuration: 0,
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
        _settings = migrateSettings({ ...DEFAULTS, ...parsed });
      }
    }
  } catch (e) {
    console.warn("Ayarlar yuklenemedi:", e);
    _settings = { ...DEFAULTS };
  }
  return _settings;
}

function save(updates) {
  _settings = migrateSettings({ ...DEFAULTS, ..._settings, ...updates });
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings));
    }
  } catch (e) {
    console.warn("Ayarlar kaydedilemedi:", e);
  }
  return _settings;
}

function migrateSettings(settings) {
  const next = { ...settings };
  if (next.maxWordsPerCaption == null) {
    next.maxWordsPerCaption = next.maxWordsPerLine != null ? next.maxWordsPerLine : DEFAULTS.maxWordsPerCaption;
  }
  next.maxWordsPerLine = next.maxWordsPerCaption;
  next.maxLinesPerSub = 1;
  next.maxCharsPerLine = 999;
  return next;
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
