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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function safeToken(value, fallback) {
  const token = String(value || "");
  return /^[a-zA-Z0-9_.-]+$/.test(token) ? token : fallback;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
    const safeSampleRate = Math.max(8000, Math.min(192000, parseInt(sampleRate) || 48000));
    const monoFlag = mono ? "-ac 1" : "";

    const cmd = `ffmpeg -y -i ${shellQuote(inputPath)} -vn -acodec pcm_s16le -ar ${safeSampleRate} ${monoFlag} ${shellQuote(outputPath)}`;
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

    const threshold = finiteNumber(noiseThreshold, -35);
    const minSilence = finiteNumber(minDuration, 0.4);
    const filter = `silencedetect=noise=${threshold}dB:d=${minSilence}`;
    const cmd = `ffmpeg -i ${shellQuote(audioPath)} -af ${shellQuote(filter)} -f null - 2>&1`;
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

    const safeModel = safeToken(model, "large-v3");
    const safeLanguage = language === "auto" ? "auto" : safeToken(language, "auto");
    const modelPath = path.join(os.homedir(), `.local/share/whisper/ggml-${safeModel}.bin`);
    if (!fs.existsSync(modelPath)) {
      return sendJson(res, 400, { ok: false, error: `Model bulunamadi: ${modelPath}` });
    }

    // 16kHz mono WAV'a cevir (whisper icin ideal)
    const jobId = `whisper-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const whisperInput = path.join(TMP_DIR, `${jobId}.wav`);
    const convertCmd = `ffmpeg -y -i ${shellQuote(audioPath)} -ar 16000 -ac 1 -acodec pcm_s16le ${shellQuote(whisperInput)}`;
    const conv = await runCmd(convertCmd, 120000);
    if (!conv.ok) {
      return sendJson(res, 500, { ok: false, error: "Audio format donusumu basarisiz", stderr: conv.stderr });
    }

    // whisper-cli calistir
    // -oj: JSON cikti  -ojf: full JSON (word timestamps dahil)  -ml 1: her kelime ayri segment
    const langFlag = safeLanguage === "auto" ? "" : `-l ${safeLanguage}`;
    const outputJson = path.join(TMP_DIR, jobId);
    const cmd = `whisper-cli -m ${shellQuote(modelPath)} ${langFlag} -f ${shellQuote(whisperInput)} -oj -ojf -of ${shellQuote(outputJson)} -ml 1 --split-on-word 2>&1`;

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
    const isSafe = safeRoots.some((root) => {
      const safeRoot = path.resolve(root);
      return resolved === safeRoot || resolved.startsWith(safeRoot + path.sep);
    });
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

async function handleBuildSequenceAudio(req, res) {
  try {
    const { clips, outputPath: outP, sampleRate = 48000, mono = false } = await parseBody(req);
    if (!Array.isArray(clips) || clips.length === 0) {
      return sendJson(res, 400, { ok: false, error: "clips listesi bos" });
    }

    const outputPath = outP || path.join(TMP_DIR, `sequence-mixdown-${Date.now()}.wav`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const safeSampleRate = Math.max(8000, Math.min(192000, parseInt(sampleRate) || 48000));
    const monoFlag = mono ? "-ac 1" : "-ac 2";

    const sorted = [...clips]
      .filter((clip) => clip && clip.path && fs.existsSync(clip.path))
      .sort((a, b) => finiteNumber(a.timelineStart) - finiteNumber(b.timelineStart));

    console.log("BUILD-SEQ-AUDIO request:", JSON.stringify({ clipCount: sorted.length, outputPath }));

    const prepared = [];
    const tmpSeg = path.join(TMP_DIR, `mix-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.mkdirSync(tmpSeg, { recursive: true });

    for (let i = 0; i < sorted.length; i++) {
      const clip = sorted[i];
      const sourceIn = Math.max(0, finiteNumber(clip.sourceIn));
      const sourceOut = finiteNumber(clip.sourceOut);
      const fallbackDuration = sourceOut > sourceIn ? sourceOut - sourceIn : 0;
      const duration = Math.max(0, finiteNumber(clip.duration, fallbackDuration));
      if (duration <= 0.001) continue;

      const clipPath = path.join(tmpSeg, `clip-${i}.wav`);
      const clipCmd = [
        "ffmpeg -y",
        "-ss", sourceIn.toFixed(3),
        "-t", duration.toFixed(3),
        "-i", shellQuote(clip.path),
        "-vn -acodec pcm_s16le",
        "-ar", safeSampleRate,
        monoFlag,
        shellQuote(clipPath),
      ].join(" ");
      const c = await runCmd(clipCmd, 120000);
      if (!c.ok) {
        console.error(`clip ${i} trim hatasi:`, c.stderr.slice(-500));
        continue;
      }
      prepared.push({
        path: clipPath,
        delayMs: Math.max(0, Math.round(finiteNumber(clip.timelineStart) * 1000)),
      });
    }

    if (prepared.length === 0) {
      return sendJson(res, 500, { ok: false, error: "Hicbir clip segment'i olusturulamadi" });
    }

    const inputArgs = prepared.map((item) => `-i ${shellQuote(item.path)}`).join(" ");
    const filters = prepared.map((item, index) => `[${index}:a]adelay=${item.delayMs}:all=1[a${index}]`);
    const filter = prepared.length === 1
      ? `${filters[0]};[a0]anull[aout]`
      : `${filters.join(";")};${prepared.map((_, index) => `[a${index}]`).join("")}amix=inputs=${prepared.length}:duration=longest:normalize=0[aout]`;
    const cmd = [
      "ffmpeg -y",
      inputArgs,
      "-filter_complex", shellQuote(filter),
      "-map", shellQuote("[aout]"),
      "-acodec pcm_s16le",
      "-ar", safeSampleRate,
      monoFlag,
      shellQuote(outputPath),
    ].join(" ");

    console.log("BUILD-SEQ-AUDIO cmd:", cmd.substring(0, 500));

    const result = await runCmd(cmd, 600000);
    if (!result.ok) {
      console.error("BUILD-SEQ-AUDIO FFmpeg stderr:", result.stderr);
      return sendJson(res, 500, { ok: false, error: "FFmpeg mixdown: " + (result.stderr.split("\n").filter(l => l.includes("Error") || l.includes("error")).slice(-3).join(" | ") || "unknown").substring(0, 200), stderr: result.stderr.substring(0, 3000) });
    }

    try { fs.rmSync(tmpSeg, { recursive: true, force: true }); } catch {}
    console.log("BUILD-SEQ-AUDIO success:", outputPath);
    sendJson(res, 200, { ok: true, outputPath, clipCount: sorted.length });
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
    await runCmd(`open -R ${shellQuote(filePath)}`, 5000);
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
  "POST /build-sequence-audio": handleBuildSequenceAudio,
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
