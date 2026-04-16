#!/usr/bin/env node
/**
 * PremiereCut Helper Daemon
 *
 * UXP plugin'in shell komutu calistiramadigi icin HTTP uzerinden
 * FFmpeg/whisper-cli gibi islemleri bu daemon yapar.
 *
 * Plugin ile iletisim: http://127.0.0.1:53117
 *
 * Kullanim:
 *   node server.js           # Varsayilan port (53117)
 *   PORT=53118 node server.js
 */

const http = require("http");
const { exec, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = parseInt(process.env.PREMIERECUT_PORT || "53117");
const TMP_DIR = path.join(os.tmpdir(), "premiere-cut");
const PATH_ENV = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`;

// TMP dizini olustur
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ——— Yardimci Fonksiyonlar ———

function runCmd(cmd, timeoutMs = 600000) {
  return new Promise((resolve) => {
    exec(
      cmd,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 100, env: { ...process.env, PATH: PATH_ENV } },
      (error, stdout, stderr) => {
        resolve({
          ok: !error || error.code === 0,
          stdout: stdout || "",
          stderr: stderr || "",
          code: error ? (error.code || 1) : 0,
        });
      }
    );
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// ——— Handler'lar ———

async function handlePing(req, res) {
  sendJson(res, 200, { ok: true, service: "PremiereCut Daemon", version: "1.0.0" });
}

async function handleCheck(req, res) {
  const ffmpeg = await runCmd("ffmpeg -version", 5000);
  const whisper = await runCmd("which whisper-cli", 5000);
  const modelPaths = [
    path.join(os.homedir(), ".local/share/whisper/ggml-large-v3.bin"),
    path.join(os.homedir(), ".local/share/whisper/ggml-medium.bin"),
    path.join(os.homedir(), ".local/share/whisper/ggml-small.bin"),
    path.join(os.homedir(), ".local/share/whisper/ggml-base.bin"),
  ];
  const availableModels = modelPaths.filter((p) => fs.existsSync(p)).map((p) => path.basename(p));

  sendJson(res, 200, {
    ok: true,
    ffmpeg: ffmpeg.ok,
    whisper: whisper.ok,
    models: availableModels,
  });
}

async function handleExportAudio(req, res) {
  try {
    const { inputPath, sampleRate = 48000, mono = false, suffix = "" } = await parseBody(req);
    if (!inputPath || !fs.existsSync(inputPath)) {
      return sendJson(res, 400, { ok: false, error: "inputPath gecersiz: " + inputPath });
    }

    const name = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(TMP_DIR, `${name}${suffix}.wav`);
    const monoFlag = mono ? "-ac 1" : "";

    const cmd = `ffmpeg -y -i "${inputPath}" -vn -acodec pcm_s16le -ar ${sampleRate} ${monoFlag} "${outputPath}"`;
    const result = await runCmd(cmd, 300000);

    if (!result.ok) {
      return sendJson(res, 500, { ok: false, error: "FFmpeg hatasi", stderr: result.stderr });
    }

    sendJson(res, 200, { ok: true, outputPath });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleSilenceDetect(req, res) {
  try {
    const { audioPath, noiseThreshold = -35, minDuration = 0.4 } = await parseBody(req);
    if (!audioPath || !fs.existsSync(audioPath)) {
      return sendJson(res, 400, { ok: false, error: "audioPath gecersiz" });
    }

    const cmd = `ffmpeg -i "${audioPath}" -af silencedetect=noise=${noiseThreshold}dB:d=${minDuration} -f null - 2>&1`;
    const result = await runCmd(cmd, 300000);

    const output = result.stdout + "\n" + result.stderr;
    const regions = parseSilenceOutput(output);
    const duration = parseDuration(output);

    sendJson(res, 200, { ok: true, regions, duration });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleTranscribe(req, res) {
  try {
    const { audioPath, language = "auto", model = "large-v3" } = await parseBody(req);
    if (!audioPath || !fs.existsSync(audioPath)) {
      return sendJson(res, 400, { ok: false, error: "audioPath gecersiz" });
    }

    const modelPath = path.join(os.homedir(), `.local/share/whisper/ggml-${model}.bin`);
    if (!fs.existsSync(modelPath)) {
      return sendJson(res, 400, { ok: false, error: `Model bulunamadi: ${modelPath}` });
    }

    // 16kHz mono WAV'a cevir (whisper icin ideal)
    const whisperInput = path.join(TMP_DIR, "whisper-input.wav");
    const convertCmd = `ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 -acodec pcm_s16le "${whisperInput}"`;
    const conv = await runCmd(convertCmd, 120000);
    if (!conv.ok) {
      return sendJson(res, 500, { ok: false, error: "Audio format donusumu basarisiz", stderr: conv.stderr });
    }

    // whisper-cli calistir
    // -oj: JSON cikti  -ojf: full JSON (word timestamps dahil)  -ml 1: her kelime ayri segment
    const langFlag = language === "auto" ? "" : `-l ${language}`;
    const outputJson = path.join(TMP_DIR, "whisper-output");
    const cmd = `whisper-cli -m "${modelPath}" ${langFlag} -f "${whisperInput}" -oj -ojf -of "${outputJson}" -ml 1 --split-on-word 2>&1`;

    const result = await runCmd(cmd, 1800000); // 30 dakika
    if (!result.ok) {
      return sendJson(res, 500, { ok: false, error: "Whisper hatasi", stderr: result.stderr });
    }

    // JSON oku
    const jsonPath = outputJson + ".json";
    if (!fs.existsSync(jsonPath)) {
      return sendJson(res, 500, { ok: false, error: "Whisper JSON ciktisi bulunamadi" });
    }
    const jsonRaw = fs.readFileSync(jsonPath, "utf-8");
    const parsed = JSON.parse(jsonRaw);

    sendJson(res, 200, { ok: true, result: parsed });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleWriteFile(req, res) {
  try {
    const { filePath, content } = await parseBody(req);
    if (!filePath || content === undefined) {
      return sendJson(res, 400, { ok: false, error: "filePath ve content gerekli" });
    }

    // Guvenlik: sadece TMP_DIR veya kullanicinin Documents/Desktop dizinine yaz
    const safeRoots = [
      TMP_DIR,
      path.join(os.homedir(), "Documents"),
      path.join(os.homedir(), "Desktop"),
      path.join(os.homedir(), "Downloads"),
      path.join(os.homedir(), "Movies"),
    ];

    const resolved = path.resolve(filePath);
    const isSafe = safeRoots.some((root) => resolved.startsWith(path.resolve(root)));
    if (!isSafe) {
      return sendJson(res, 403, { ok: false, error: `Bu konuma yazmaya izin yok: ${resolved}` });
    }

    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, "utf-8");

    sendJson(res, 200, { ok: true, path: resolved });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleReveal(req, res) {
  try {
    const { filePath } = await parseBody(req);
    if (!filePath) {
      return sendJson(res, 400, { ok: false, error: "filePath gerekli" });
    }
    await runCmd(`open -R "${filePath}"`, 5000);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

// ——— Parser'lar ———

function parseSilenceOutput(output) {
  const regions = [];
  const lines = output.split("\n");
  let currentStart = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (endMatch && currentStart !== null) {
      regions.push({
        start: currentStart,
        end: parseFloat(endMatch[1]),
        duration: parseFloat(endMatch[2]),
      });
      currentStart = null;
    }
  }
  return regions;
}

function parseDuration(output) {
  // "Duration: 00:05:23.45" satirini bul
  const match = output.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (!match) return 0;
  return parseFloat(match[1]) * 3600 + parseFloat(match[2]) * 60 + parseFloat(match[3]);
}

// ——— Router ———

const routes = {
  "GET /ping": handlePing,
  "GET /check": handleCheck,
  "POST /export-audio": handleExportAudio,
  "POST /silence-detect": handleSilenceDetect,
  "POST /transcribe": handleTranscribe,
  "POST /write-file": handleWriteFile,
  "POST /reveal": handleReveal,
};

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  const key = `${req.method} ${req.url.split("?")[0]}`;
  const handler = routes[key];

  if (!handler) {
    return sendJson(res, 404, { ok: false, error: `Route bulunamadi: ${key}` });
  }

  try {
    await handler(req, res);
  } catch (err) {
    console.error(`Handler error [${key}]:`, err);
    sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\u{1F3AC} PremiereCut Daemon listening on http://127.0.0.1:${PORT}`);
  console.log(`   tmp dir: ${TMP_DIR}`);
});

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  server.close(() => process.exit(0));
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});
