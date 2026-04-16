/**
 * Daemon HTTP client — UXP plugin ile local helper daemon arasinda kopru
 *
 * UXP'de child_process olmadigi icin FFmpeg/whisper gibi islemler
 * daemon uzerinden HTTP ile yapilir.
 */

const DAEMON_URL = "http://127.0.0.1:53117";
const DEFAULT_TIMEOUT = 30 * 60 * 1000; // 30 dk (whisper icin)

/**
 * Daemon'a HTTP istegi gonder
 * @param {string} path — endpoint (/ping, /silence-detect, vb)
 * @param {object} [body] — POST body (yoksa GET)
 * @param {number} [timeoutMs]
 * @returns {Promise<object>} — response JSON
 */
async function call(path, body = null, timeoutMs = DEFAULT_TIMEOUT) {
  const url = DAEMON_URL + path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Daemon timeout (${timeoutMs}ms): ${path}`);
    }
    if (err.message && err.message.includes("fetch")) {
      throw new Error(
        "Helper daemon'a ulasilamadi. Lutfen daemon'un calistigindan emin olun.\n" +
        "Baslatma komutu: launchctl load ~/Library/LaunchAgents/com.seyoweb.premierecut.daemon.plist"
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function ping() {
  return call("/ping", null, 3000);
}

async function check() {
  return call("/check", null, 10000);
}

async function exportAudio({ inputPath, sampleRate = 48000, mono = false, suffix = "" }) {
  return call("/export-audio", { inputPath, sampleRate, mono, suffix }, 600000);
}

async function silenceDetect({ audioPath, noiseThreshold = -35, minDuration = 0.4 }) {
  return call("/silence-detect", { audioPath, noiseThreshold, minDuration }, 600000);
}

async function transcribe({ audioPath, language = "auto", model = "large-v3" }) {
  return call("/transcribe", { audioPath, language, model }, 30 * 60 * 1000);
}

async function writeFile({ filePath, content }) {
  return call("/write-file", { filePath, content }, 30000);
}

async function reveal(filePath) {
  return call("/reveal", { filePath }, 5000);
}

module.exports = {
  call,
  ping,
  check,
  exportAudio,
  silenceDetect,
  transcribe,
  writeFile,
  reveal,
  DAEMON_URL,
};
