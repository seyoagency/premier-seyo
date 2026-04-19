/**
 * PremiereCut — UXP Panel entry point
 */

// Erken debug: status bar'a goster
function _earlyStatus(msg) {
  try {
    const bar = document.getElementById("status-bar");
    if (bar) bar.textContent = msg;
  } catch {}
}

_earlyStatus("JS yukleniyor...");

let config, daemon, timeUtils, audioExporter, silenceDetector, breathDetector;
let segmentBuilder, transcriber, captionGrouper, srtWriter, vttWriter;
let duplicator, seqEditor, reconstructor;

try {
  config = require("./utils/config");
  daemon = require("./utils/daemon");
  timeUtils = require("./utils/time");
  audioExporter = require("./core/audio-exporter");
  silenceDetector = require("./core/silence-detector");
  breathDetector = require("./core/breath-detector");
  segmentBuilder = require("./core/segment-builder");
  transcriber = require("./core/transcriber");
  captionGrouper = require("./srt/caption-grouper");
  srtWriter = require("./srt/srt-writer");
  vttWriter = require("./srt/vtt-writer");
  duplicator = require("./timeline/duplicator");
  seqEditor = require("./timeline/sequence-editor");
  reconstructor = require("./timeline/reconstructor");
  _earlyStatus("Moduller yuklendi");
} catch (e) {
  _earlyStatus("Modul hatasi: " + e.message);
  console.error("PremiereCut require hatasi:", e);
}

// ——— State ———
let analysisResult = null;
let transcriptResult = null;
let currentAudioPath = null;

// ——— Init ———
function init() {
  try {
    _earlyStatus("Init basladi");
    if (!config) throw new Error("config yuklenmedi");
    config.load();
    setupTabs();
    setupSliders();
    setupSteppers();
    setupCollapsibles();
    setupButtons();
    restoreSettings();
    _earlyStatus("Init tamam — dep check");
    checkDependencies();
  } catch (e) {
    _earlyStatus("Init hatasi: " + e.message);
    console.error("PremiereCut init error:", e);
  }
}

// UXP'de DOMContentLoaded tetiklenmeyebilir, ikisini de dene
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ——— Tab Switching ———
function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => {
        c.style.display = "none";
      });
      tab.classList.add("active");
      const target = document.getElementById(`tab-${tab.dataset.tab}`);
      if (target) target.style.display = "block";
    });
  });
  // Ilk aktif tab'i goster
  document.getElementById("tab-autocut").style.display = "block";
}

// ——— Slider bindings ———
function setupSliders() {
  const sliders = [
    { id: "silenceThreshold", suffix: " dB" },
    { id: "minSilenceDuration", suffix: "s" },
    { id: "padding", suffix: "ms" },
    { id: "minKeepDuration", suffix: "s" },
    { id: "maxSubDuration", suffix: "s" },
    { id: "minSubDuration", suffix: "s" },
    { id: "cpsLimit", suffix: "" },
  ];

  sliders.forEach(({ id, suffix }) => {
    const slider = document.getElementById(id);
    const valueEl = document.getElementById(`${id}-val`);
    if (!slider || !valueEl) return;

    // Div-based custom slider (UXP <input type=range> mouse drag bug bypass)
    initCustomSlider(slider);

    const step = parseFloat(slider.dataset.step) || 1;
    const decimals = (String(step).split(".")[1] || "").length;
    const formatValue = (raw) => {
      const num = parseFloat(raw);
      if (isNaN(num)) return raw;
      return decimals > 0 ? num.toFixed(decimals) : String(Math.round(num));
    };

    const applyChange = () => {
      valueEl.textContent = formatValue(slider.dataset.value) + suffix;
      saveCurrentSettings();
    };

    slider.addEventListener("input", applyChange);
    slider.addEventListener("change", applyChange);

    // Value span'ine tiklayarak number input ile direkt deger girme imkani verelim.
    makeValueEditable(slider, valueEl, suffix, applyChange);

    // Ilk degeri render et
    applyChange();
  });
}

function initCustomSlider(track) {
  const fill = track.querySelector(".cslider-fill");
  const thumb = track.querySelector(".cslider-thumb");
  const min = Number(track.dataset.min || 0);
  const max = Number(track.dataset.max || 100);
  const step = Number(track.dataset.step || 1);
  const decimals = (String(step).split(".")[1] || "").length;

  const clamp = (v) => Math.min(max, Math.max(min, v));
  const snap = (v) => Math.round(v / step) * step;
  const fmt = (v) => decimals > 0 ? Number(v).toFixed(decimals) : String(Math.round(v));

  function setValue(value, emit = true) {
    const next = clamp(snap(value));
    const percent = ((next - min) / (max - min)) * 100;
    track.dataset.value = fmt(next);
    track.style.setProperty("--percent", `${percent}%`);
    track.setAttribute("aria-valuemin", String(min));
    track.setAttribute("aria-valuemax", String(max));
    track.setAttribute("aria-valuenow", track.dataset.value);
    if (emit) {
      track.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    }
  }

  function valueFromClientX(clientX) {
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return min + ratio * (max - min);
  }

  let dragging = false;

  const onDown = (e) => {
    dragging = true;
    try { track.setPointerCapture && track.setPointerCapture(e.pointerId); } catch {}
    setValue(valueFromClientX(e.clientX));
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!dragging) return;
    setValue(valueFromClientX(e.clientX));
  };
  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    try { track.releasePointerCapture && track.releasePointerCapture(e.pointerId); } catch {}
    track.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  };

  track.addEventListener("pointerdown", onDown);
  track.addEventListener("pointermove", onMove);
  track.addEventListener("pointerup", onUp);
  track.addEventListener("pointercancel", onUp);

  // Fallback: mouse events (UXP'de pointer event yoksa)
  track.addEventListener("mousedown", (e) => {
    dragging = true;
    setValue(valueFromClientX(e.clientX));
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    setValue(valueFromClientX(e.clientX));
  });
  document.addEventListener("mouseup", () => {
    dragging = false;
  });

  track.addEventListener("keydown", (e) => {
    const cur = Number(track.dataset.value || min);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setValue(cur - step);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setValue(cur + step);
    }
  });

  // Ilk degeri init et
  setValue(Number(track.dataset.value || min), false);
}

function makeValueEditable(slider, valueEl, suffix, onChange) {
  valueEl.style.cursor = "text";
  valueEl.style.textDecoration = "underline dotted";
  valueEl.style.textUnderlineOffset = "3px";
  valueEl.title = "Degeri degistirmek icin tiklayip yazin";
  valueEl.addEventListener("click", () => {
    const getAttr = (attr) => slider.dataset ? slider.dataset[attr] : slider[attr];
    const min = parseFloat(getAttr("min"));
    const max = parseFloat(getAttr("max"));
    const step = parseFloat(getAttr("step")) || 1;
    const current = slider.dataset.value || slider.value;
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = current;
    input.style.cssText = "flex:0 0 50px;width:50px;background:#1a1a1a;color:#fff;border:1px solid #3a3a3a;border-radius:3px;font-size:11px;text-align:right;padding:2px 4px;";
    valueEl.style.display = "none";
    valueEl.parentElement.insertBefore(input, valueEl);
    input.focus();
    input.select();

    const commit = () => {
      let v = parseFloat(input.value);
      if (isNaN(v)) v = parseFloat(current);
      v = Math.max(min, Math.min(max, v));
      const decimals = (String(step).split(".")[1] || "").length;
      const valStr = decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
      if (slider.dataset && slider.dataset.min !== undefined) {
        slider.dataset.value = valStr;
        const percent = ((v - min) / (max - min)) * 100;
        slider.style.setProperty("--percent", `${percent}%`);
      } else {
        slider.value = valStr;
      }
      input.remove();
      valueEl.style.display = "";
      onChange();
    };

    const cancel = () => {
      input.remove();
      valueEl.style.display = "";
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
      else if (e.key === "Escape") cancel();
    });
  });
}

function setupSteppers() {
  const stepperConfig = {
    maxLinesPerSub: { min: 1, max: 3 },
    maxWordsPerLine: { min: 2, max: 12 },
  };

  document.querySelectorAll(".stepper-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      const dir = parseInt(btn.dataset.dir);
      const valEl = document.getElementById(`${target}-val`);
      const conf = stepperConfig[target];
      if (!valEl || !conf) return;

      let val = parseInt(valEl.textContent) + dir;
      val = Math.max(conf.min, Math.min(conf.max, val));
      valEl.textContent = val;
      saveCurrentSettings();
    });
  });
}

function setupCollapsibles() {
  ["advanced-cut", "advanced-srt"].forEach(prefix => {
    const toggle = document.getElementById(`${prefix}-toggle`);
    const body = document.getElementById(`${prefix}-body`);
    const arrow = document.getElementById(`${prefix}-arrow`);
    if (toggle && body) {
      toggle.addEventListener("click", () => {
        const isOpen = body.style.display === "block";
        body.style.display = isOpen ? "none" : "block";
        if (arrow) arrow.innerHTML = isOpen ? "&#9654;" : "&#9660;";
      });
    }
  });
}

function setupButtons() {
  document.getElementById("btn-analyze").addEventListener("click", handleAnalyze);
  document.getElementById("btn-apply-cut").addEventListener("click", handleApplyCut);
  document.getElementById("btn-transcribe").addEventListener("click", handleTranscribe);
  document.getElementById("btn-save-srt").addEventListener("click", handleSaveSRT);
  const resetBtn = document.getElementById("resetSettings");
  if (resetBtn) resetBtn.addEventListener("click", handleResetSettings);
}

function handleResetSettings() {
  config.reset();
  restoreSettings();
  setStatus("Ayarlar varsayilana donduruldu", "success");
}

// ——— Dependency Check ———
async function checkDependencies() {
  try {
    const res = await daemon.check();
    updateDepBadge("ffmpeg", res.ffmpeg);
    updateDepBadge("whisper", res.whisper);
    updateDepBadge("model", res.models && res.models.length > 0);

    if (!res.ffmpeg || !res.whisper || !(res.models && res.models.length)) {
      const dc = document.getElementById("dep-check-cut");
      if (dc) dc.style.display = "block";
    }

    setStatus("Hazir", "success");
  } catch (err) {
    console.error("Dependency check failed:", err);
    updateDepBadge("ffmpeg", false);
    updateDepBadge("whisper", false);
    updateDepBadge("model", false);
    const dc = document.getElementById("dep-check-cut");
    if (dc) dc.style.display = "block";
    setStatus("Daemon baslatilmamis. install-daemon.sh calistirin.", "error");
  }
}

function updateDepBadge(name, ok) {
  const icon = document.getElementById(`dep-${name}-icon`);
  if (!icon) return;
  icon.textContent = ok ? "\u2713" : "\u2717";
  icon.className = `dep-icon ${ok ? "ok" : "fail"}`;
}

// ——— AUTO-CUT: Analyze ———
async function handleAnalyze() {
  const btn = document.getElementById("btn-analyze");
  btn.disabled = true;
  showProgress("cut", true, "Ses dosyasi hazirlaniyor...");
  setStatus("Analiz ediliyor...");

  try {
    updateProgress("cut", 10, "Sequence'den ses cikariliyor...");
    currentAudioPath = await audioExporter.exportAudio({ sampleRate: 48000 });

    updateProgress("cut", 40, "Sessizlikler tespit ediliyor...");
    const settings = getCurrentSettings();
    const sd = await silenceDetector.detect(currentAudioPath, {
      noiseThreshold: settings.silenceThreshold,
      minDuration: settings.minSilenceDuration,
    });
    const silenceRegions = sd.regions;
    const totalDuration = sd.duration;

    let breathRegions = [];
    if (settings.detectBreaths) {
      updateProgress("cut", 70, "Nefes sesleri analiz ediliyor...");
      breathRegions = breathDetector.findBreathCandidates(silenceRegions);
    }

    updateProgress("cut", 90, "Segmentler hesaplaniyor...");
    const paddingMs = parseInt(document.getElementById("padding").value);
    analysisResult = segmentBuilder.build(totalDuration, silenceRegions, breathRegions, {
      paddingBefore: paddingMs / 1000,
      paddingAfter: paddingMs / 1000,
      minKeepDuration: settings.minKeepDuration,
    });

    updateProgress("cut", 100, "Tamamlandi");
    displayCutResults(analysisResult);
    const applyBtn = document.getElementById("btn-apply-cut");
    if (applyBtn) applyBtn.disabled = !analysisResult.keep || analysisResult.keep.length === 0;
    if (!analysisResult.keep || analysisResult.keep.length === 0) {
      setStatus("Tutulacak bolge yok — esigi dusur (-40 dB gibi) ve 'Sifirla' deneyin", "error");
    } else {
      setStatus(`Analiz tamam: ${analysisResult.remove.length} sessiz, ${analysisResult.keep.length} tutulacak bolge`, "success");
    }

  } catch (err) {
    console.error("Analiz hatasi:", err);
    setStatus(`Hata: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    setTimeout(() => showProgress("cut", false), 1000);
  }
}

// ——— AUTO-CUT: Apply ———
async function handleApplyCut() {
  if (!analysisResult) {
    setStatus("Once analiz yapin", "error");
    return;
  }
  if (!analysisResult.keep || !analysisResult.keep.length) {
    setStatus("Tutulacak bolge yok — ayarlar cok agresif", "error");
    return;
  }
  if (!analysisResult.remove || !analysisResult.remove.length) {
    setStatus("Silinecek sessizlik bulunamadi — esigi yukselt veya min. sessizligi dusur", "error");
    return;
  }

  const btn = document.getElementById("btn-apply-cut");
  btn.disabled = true;
  showProgress("cut", true, "Kesim basliyor (Cmd+Z ile geri alinabilir)...");

  try {
    updateProgress("cut", 10, "Sequence aliniyor...");
    const seq = await duplicator.duplicateActiveSequence(" - AutoCut");

    updateProgress("cut", 20, "Kesim uygulaniyor...");
    const result = await reconstructor.reconstruct(
      seq,
      analysisResult.remove,
      (pct) => updateProgress("cut", 20 + Math.round(pct * 0.8), `%${pct}`),
      analysisResult.keep
    );

    updateProgress("cut", 100, "Tamamlandi");
    setStatus(`AutoCut: ${result.message}`, result.success ? "success" : "error");
  } catch (err) {
    console.error("Cut hatasi:", err);
    setStatus(`Hata: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    setTimeout(() => showProgress("cut", false), 1500);
  }
}

// ——— AUTO-SRT: Transcribe ———
async function handleTranscribe() {
  const btn = document.getElementById("btn-transcribe");
  btn.disabled = true;
  showProgress("srt", true, "Ses dosyasi hazirlaniyor...");
  setStatus("Transkript ediliyor...");

  try {
    updateProgress("srt", 10, "Ses cikariliyor...");
    const audioPath = await audioExporter.exportAudio({
      sampleRate: 16000,
      mono: true,
      suffix: "-srt",
    });
    currentAudioPath = audioPath;

    updateProgress("srt", 20, "Whisper calisiyor (1-5 dakika surebilir)...");
    const language = document.getElementById("srt-language").value;
    const model = document.getElementById("srt-model").value;

    const segments = await transcriber.transcribe(audioPath, { language, model });

    updateProgress("srt", 85, "Altyazilar olusturuluyor...");

    // Kelime listesi topla (word-level yoksa segment-level kullan)
    const allWords = [];
    for (const seg of segments) {
      if (seg.words && seg.words.length > 0) {
        allWords.push(...seg.words);
      } else {
        // Word-level yoksa segment'i parcalara bol
        const text = seg.text.trim();
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const wordDuration = (seg.end - seg.start) / Math.max(words.length, 1);
        words.forEach((w, i) => {
          allWords.push({
            text: w,
            start: seg.start + i * wordDuration,
            end: seg.start + (i + 1) * wordDuration,
          });
        });
      }
    }

    const settings = getCurrentSettings();
    const captions = captionGrouper.group(allWords, settings);

    transcriptResult = { segments, captions };
    updateProgress("srt", 100, "Tamamlandi");
    displaySRTPreview(captions);
    setStatus(`Transkript: ${captions.length} altyazi`, "success");

  } catch (err) {
    console.error("SRT hatasi:", err);
    setStatus(`Hata: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    setTimeout(() => showProgress("srt", false), 1500);
  }
}

// ——— AUTO-SRT: Save ———
async function handleSaveSRT() {
  if (!transcriptResult || !transcriptResult.captions.length) {
    setStatus("Once transkript yapin", "error");
    return;
  }

  try {
    const ppro = require("premierepro");
    const project = await ppro.Project.getActiveProject();
    const sequence = await project.getActiveSequence();
    const seqName = sequence.name || "sequence";
    const safeName = String(seqName).replace(/[^a-zA-Z0-9_-]/g, "_");

    // macOS user Documents dizinine kaydet
    const outputDir = "/Users/" + getUserName() + "/Documents/PremierSEYO";
    const savedFiles = [];

    if (document.getElementById("output-srt").checked) {
      const srtPath = `${outputDir}/${safeName}.srt`;
      const saved = await srtWriter.write(srtPath, transcriptResult.captions);
      savedFiles.push(saved);
    }

    if (document.getElementById("output-vtt").checked) {
      const vttPath = `${outputDir}/${safeName}.vtt`;
      const saved = await vttWriter.write(vttPath, transcriptResult.captions);
      savedFiles.push(saved);
    }

    if (savedFiles.length > 0) {
      // SRT'yi otomatik olarak proje bin'e import et
      try {
        const srtFile = savedFiles.find(f => f.endsWith(".srt"));
        if (srtFile) {
          const rootItem = await project.getRootItem();
          await project.importFiles([srtFile], true, rootItem, false);
          setStatus(`Kaydedildi ve proje paneline eklendi (${savedFiles.length} dosya)`, "success");
        } else {
          setStatus(`Kaydedildi: ${savedFiles.length} dosya`, "success");
        }
      } catch (importErr) {
        console.warn("SRT import hatasi:", importErr);
        await daemon.reveal(savedFiles[0]);
        setStatus(`Kaydedildi (import manuel): ${savedFiles.length} dosya`, "success");
      }
    } else {
      setStatus("Cikti formati secin", "error");
    }
  } catch (err) {
    console.error("Save hatasi:", err);
    setStatus(`Hata: ${err.message}`, "error");
  }
}

// ——— UI Helpers ———

function getUserName() {
  // UXP'de os.userInfo() sinirli olabilir — path'ten cikar
  try {
    const os = require("os");
    return os.userInfo().username;
  } catch {
    return "seyo"; // fallback
  }
}

function displayCutResults(result) {
  const { stats } = result;
  const container = document.getElementById("results-cut");
  container.style.display = "block";

  document.getElementById("stat-silence-count").textContent = stats.silenceCount;
  document.getElementById("stat-breath-count").textContent = stats.breathCount;
  document.getElementById("stat-remove-time").textContent = timeUtils.formatDuration(stats.totalRemove);
  document.getElementById("stat-keep-time").textContent = timeUtils.formatDuration(stats.totalKeep);
  document.getElementById("stat-reduction").textContent = stats.reductionPercent + "%";
  renderWaveform(result);
}

function renderWaveform(result) {
  const container = document.getElementById("waveform");
  container.innerHTML = "";

  const totalDuration = result.stats.totalDuration;
  if (totalDuration === 0) return;

  const all = [
    ...result.keep.map(s => ({ ...s, type: "keep" })),
    ...result.remove.map(s => ({ ...s, type: "remove" })),
  ].sort((a, b) => a.start - b.start);

  for (const seg of all) {
    const widthPercent = (seg.duration / totalDuration) * 100;
    const el = document.createElement("div");
    el.className = `waveform-segment ${seg.type}`;
    el.style.width = `${Math.max(widthPercent, 0.5)}%`;
    container.appendChild(el);
  }
}

function displaySRTPreview(captions) {
  const container = document.getElementById("results-srt");
  container.style.display = "block";

  const preview = document.getElementById("srt-preview");
  const maxPreview = Math.min(captions.length, 10);

  let html = "";
  for (let i = 0; i < maxPreview; i++) {
    const cap = captions[i];
    const startTS = timeUtils.secondsToSRT(cap.start);
    const endTS = timeUtils.secondsToSRT(cap.end);
    html += `<div><span class="srt-index">${cap.index}</span></div>`;
    html += `<div><span class="srt-time">${startTS} --> ${endTS}</span></div>`;
    html += `<div><span class="srt-text">${escapeHtml(cap.text)}</span></div>`;
    html += `<br/>`;
  }

  if (captions.length > maxPreview) {
    html += `<div style="color:var(--text-muted)">... ve ${captions.length - maxPreview} altyazi daha</div>`;
  }

  preview.innerHTML = html;
}

function showProgress(tab, visible, text) {
  const container = document.getElementById(`progress-${tab}`);
  if (!container) return;
  container.style.display = visible ? "block" : "none";
  if (visible && text) {
    const textEl = document.getElementById(`progress-${tab}-text`);
    if (textEl) textEl.textContent = text;
  }
}

function updateProgress(tab, percent, text) {
  const fill = document.getElementById(`progress-${tab}-fill`);
  const textEl = document.getElementById(`progress-${tab}-text`);
  if (fill) fill.style.width = `${percent}%`;
  if (text && textEl) textEl.textContent = text;
}

function setStatus(text, type = "") {
  const bar = document.getElementById("status-bar");
  if (!bar) return;
  bar.textContent = text;
  bar.className = `status-bar ${type}`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ——— Settings ———

function readSliderValue(id) {
  const el = document.getElementById(id);
  if (!el) return NaN;
  // cslider: data-value; native range: value
  return parseFloat(el.dataset && el.dataset.value !== undefined ? el.dataset.value : el.value);
}

function getCurrentSettings() {
  const paddingMs = readSliderValue("padding");
  const paddingSeconds = (isNaN(paddingMs) ? 150 : paddingMs) / 1000;
  return {
    silenceThreshold: parseInt(readSliderValue("silenceThreshold")),
    minSilenceDuration: readSliderValue("minSilenceDuration"),
    paddingBefore: paddingSeconds,
    paddingAfter: paddingSeconds,
    detectBreaths: document.getElementById("detectBreaths").checked,
    minKeepDuration: readSliderValue("minKeepDuration"),
    maxLinesPerSub: parseInt(document.getElementById("maxLinesPerSub-val").textContent),
    maxWordsPerLine: parseInt(document.getElementById("maxWordsPerLine-val").textContent),
    maxCharsPerLine: 999, // devre disi
    maxSubDuration: readSliderValue("maxSubDuration"),
    minSubDuration: readSliderValue("minSubDuration"),
    cpsLimit: parseInt(readSliderValue("cpsLimit")),
    splitOnSentence: document.getElementById("splitOnSentence").checked,
    splitOnPause: document.getElementById("splitOnPause").checked,
  };
}

function saveCurrentSettings() {
  config.save(getCurrentSettings());
}

function restoreSettings() {
  const s = config.get();
  setSlider("silenceThreshold", s.silenceThreshold, " dB");
  setSlider("minSilenceDuration", s.minSilenceDuration, "s");
  setSlider("padding", Math.round((s.paddingBefore || 0.15) * 1000), "ms");
  setSlider("minKeepDuration", s.minKeepDuration, "s");
  setSlider("maxSubDuration", s.maxSubDuration, "s");
  setSlider("minSubDuration", s.minSubDuration, "s");
  setSlider("cpsLimit", s.cpsLimit, "");
  setStepperVal("maxLinesPerSub", s.maxLinesPerSub);
  setStepperVal("maxWordsPerLine", s.maxWordsPerLine);
  setCheckbox("detectBreaths", s.detectBreaths);
  setCheckbox("splitOnSentence", s.splitOnSentence);
  setCheckbox("splitOnPause", s.splitOnPause);
}

function setSlider(id, value, suffix) {
  const slider = document.getElementById(id);
  const valEl = document.getElementById(`${id}-val`);
  if (slider) {
    const num = parseFloat(value);
    if (slider.dataset && slider.dataset.min !== undefined) {
      // cslider: data-value + CSS custom property
      const min = parseFloat(slider.dataset.min);
      const max = parseFloat(slider.dataset.max);
      const step = parseFloat(slider.dataset.step) || 1;
      const decimals = (String(step).split(".")[1] || "").length;
      const clamped = Math.max(min, Math.min(max, num));
      slider.dataset.value = decimals > 0 ? clamped.toFixed(decimals) : String(Math.round(clamped));
      const percent = ((clamped - min) / (max - min)) * 100;
      slider.style.setProperty("--percent", `${percent}%`);
    } else {
      slider.value = value;
    }
  }
  if (valEl) {
    const step = slider ? parseFloat(
      (slider.dataset && slider.dataset.step) || slider.step
    ) || 1 : 1;
    const decimals = (String(step).split(".")[1] || "").length;
    const num = parseFloat(value);
    const display = decimals > 0 ? num.toFixed(decimals) : String(Math.round(num));
    valEl.textContent = display + suffix;
  }
}

function setStepperVal(id, value) {
  const valEl = document.getElementById(`${id}-val`);
  if (valEl) valEl.textContent = value;
}

function setCheckbox(id, checked) {
  const cb = document.getElementById(id);
  if (cb) cb.checked = checked;
}

// ——— UXP Entrypoint ———
const { entrypoints } = require("uxp");

entrypoints.setup({
  panels: {
    "premierseyo-panel": {
      show() { console.log("PremierSEYO panel acildi"); },
      hide() { console.log("PremierSEYO panel kapandi"); },
    },
  },
});
