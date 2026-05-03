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
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const deepgram = require("./deepgram-client");
const platform = require("./platform");
const { runCommand, formatCommand } = require("./command-runner");

const PORT = parseInt(process.env.PREMIERSEYO_PORT || process.env.PREMIERECUT_PORT || "53117");
const TMP_DIR = platform.getTmpDir();
const TOKEN_DIR = platform.getConfigDir();
const TOKEN_FILE = platform.getTokenFile();

// TMP dizini olustur
platform.ensureDir(TMP_DIR);

// ——— Auth token: ilk baslatmada uret, plugin paylasilan dosyadan okur ———
let AUTH_TOKEN = "";
function ensureAuthToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const existing = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
      if (existing && existing.length >= 32) {
        AUTH_TOKEN = existing;
        return;
      }
    }
  } catch {}
  platform.ensureDir(TOKEN_DIR, 0o700);
  AUTH_TOKEN = crypto.randomBytes(32).toString("hex");
  platform.writePrivateFile(TOKEN_FILE, AUTH_TOKEN);
}
ensureAuthToken();

function isAuthorized(req) {
  const token = req.headers["x-premiere-cut-token"] || req.headers["X-Premiere-Cut-Token"] || "";
  if (!AUTH_TOKEN || token.length !== AUTH_TOKEN.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(AUTH_TOKEN));
  } catch {
    return false;
  }
}

// UXP plugin'i `~/.config/premier-seyo/token`'i okuyamadigi durumlarda
// (Premiere fs sandbox'i bazen `~/.config` dizinine erisemiyor) Origin=null
// + X-Premiere-Cut-Client=premierseyo-uxp ikilisi ile gelen istekler
// "trusted plugin client" sayilir. Browser kaynakli siteler custom header
// gonderebilmek icin CORS preflight'i gecmek zorunda; daemon yalnizca
// Origin=null'a izin verdigi icin disaridan exploit edilemez.
function isTrustedPluginClient(req) {
  const client = String(req.headers["x-premiere-cut-client"] || "").trim();
  if (client !== "premierseyo-uxp") return false;
  const origin = String(req.headers.origin || "").trim();
  if (origin && origin !== "null") return false;
  return true;
}

// ——— Yardimci Fonksiyonlar ———

function runCmd(command, args = [], timeoutMs = 600000) {
  return runCommand(command, args, { timeoutMs });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "null",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Premiere-Cut-Token, X-Premiere-Cut-Client",
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

function humanizeFFmpegError(stderr) {
  if (!stderr) return "FFmpeg ses çıkartamadı (bilinmeyen sebep).";
  const text = String(stderr);
  if (/no such file|cannot open|does not exist/i.test(text)) {
    return "FFmpeg kaynak dosyayı bulamadı. Klipler taşınmış veya silinmiş olabilir.";
  }
  if (/invalid data|moov atom not found|corrupt|truncated|invalid header/i.test(text)) {
    return "FFmpeg medya dosyasını okuyamadı (bozuk veya desteklenmeyen format).";
  }
  if (/permission denied/i.test(text)) {
    return "FFmpeg dosyaya erişim izni alamadı. İşletim sistemi izinlerini kontrol et.";
  }
  if (/no audio stream|stream specifier .* matches no streams/i.test(text)) {
    return "FFmpeg ses kanalı bulamadı. Sequence'de ses var mı kontrol et.";
  }
  if (/disk full|no space left/i.test(text)) {
    return "Disk dolu — FFmpeg çıktı dosyası yazamıyor.";
  }
  // Fallback: son 3 satırın hata içerenleri
  const tail = text.split("\n")
    .filter((l) => /error|fail|invalid/i.test(l))
    .slice(-3)
    .join(" | ")
    .slice(-280);
  return tail ? `FFmpeg hatası: ${tail}` : "FFmpeg ses çıkartırken hata aldı.";
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isWithinRoot(filePath, root) {
  const resolved = path.resolve(filePath);
  const safeRoot = path.resolve(root);
  const a = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const b = process.platform === "win32" ? safeRoot.toLowerCase() : safeRoot;
  return a === b || a.startsWith(b + path.sep);
}

// ——— Handler'lar ———

async function handlePing(req, res) {
  sendJson(res, 200, { ok: true, service: "PremierSEYO Daemon", version: "1.1.0" });
}

async function handleCheck(req, res) {
  const ffmpeg = await runCmd(platform.getFfmpegPath(), ["-version"], 5000);
  const deepgramReady = deepgram.hasApiKey();

  sendJson(res, 200, {
    ok: true,
    ffmpeg: ffmpeg.ok,
    deepgram: deepgramReady,
    // Geriye uyum: eski plugin sürümleri whisper field'ını okuyor.
    // Yeni daemon Deepgram kullanıyor ama bu alan true döner ki "STT hazır" görünsün.
    whisper: deepgramReady,
    models: deepgramReady ? ["nova-3"] : [],
    keyFile: deepgram.KEY_FILE,
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
    const args = [
      "-y",
      "-i", inputPath,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", String(safeSampleRate),
    ];
    if (mono) args.push("-ac", "1");
    args.push(outputPath);

    const result = await runCmd(platform.getFfmpegPath(), args, 300000);

    if (!result.ok) {
      return sendJson(res, 500, { ok: false, error: humanizeFFmpegError(result.stderr), stderr: result.stderr });
    }

    sendJson(res, 200, { ok: true, outputPath });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleSilenceDetect(req, res) {
  try {
    const { audioPath, minDuration = 0.4, language = "tr", uttSplit = 0.8 } = await parseBody(req);
    if (!audioPath || !fs.existsSync(audioPath)) {
      return sendJson(res, 400, { ok: false, error: "audioPath gecersiz" });
    }

    const minSilence = finiteNumber(minDuration, 0.4);
    const t0 = Date.now();
    const response = await deepgram.transcribeFile(audioPath, { language, uttSplit });
    const regions = deepgram.deriveSilenceRegions(response, { minSilence });
    const duration = deepgram.getDuration(response);
    const cached = (Date.now() - t0) < 200; // <200ms = cache hit

    console.log(`SILENCE-DETECT ${path.basename(audioPath)} minDur=${minSilence}s → ${regions.length} region, dur=${duration.toFixed(2)}s${cached ? " (cache)" : ""}`);
    for (const r of regions) {
      console.log(`  silence ${r.start.toFixed(3)}-${r.end.toFixed(3)} (${r.duration.toFixed(3)}s)`);
    }

    sendJson(res, 200, { ok: true, regions, duration });
  } catch (err) {
    console.error("SILENCE-DETECT error:", err.message);
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleTranscribe(req, res) {
  try {
    const {
      audioPath,
      language = "tr",
      uttSplit = 0.8,
      keyterm = null,
      // model: legacy parametre (whisper "large-v3" gibi). Deepgram kullanıldığında
      // sadece yapay olarak "nova-3" sabit; gelen değer görmezden gelinir.
    } = await parseBody(req);

    if (!audioPath || !fs.existsSync(audioPath)) {
      return sendJson(res, 400, { ok: false, error: "audioPath gecersiz" });
    }

    const t0 = Date.now();
    const response = await deepgram.transcribeFile(audioPath, {
      language,
      uttSplit,
      keyterm: Array.isArray(keyterm) ? keyterm : null,
    });
    const cached = (Date.now() - t0) < 200;
    const utterances = response?.results?.utterances || [];
    console.log(`TRANSCRIBE ${path.basename(audioPath)} language=${language} → ${utterances.length} utterance, dur=${(response?.metadata?.duration || 0).toFixed(2)}s${cached ? " (cache)" : ""}`);

    sendJson(res, 200, { ok: true, result: response });
  } catch (err) {
    console.error("TRANSCRIBE error:", err.message);
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleWriteFile(req, res) {
  try {
    const { filePath, content } = await parseBody(req);
    if (!filePath || content === undefined) {
      return sendJson(res, 400, { ok: false, error: "filePath ve content gerekli" });
    }

    // Guvenlik: sadece TMP_DIR veya kullanicinin media/user dizinlerine yaz
    const safeRoots = platform.getSafeWriteRoots();

    const resolved = path.resolve(filePath);
    const isSafe = safeRoots.some((root) => isWithinRoot(resolved, root));
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
    const channelArgs = mono ? ["-ac", "1"] : ["-ac", "2"];

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
      const clipArgs = [
        "-y",
        "-ss", sourceIn.toFixed(3),
        "-t", duration.toFixed(3),
        "-i", clip.path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", String(safeSampleRate),
        ...channelArgs,
        clipPath,
      ];
      const c = await runCmd(platform.getFfmpegPath(), clipArgs, 120000);
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

    const filters = prepared.map((item, index) => `[${index}:a]adelay=${item.delayMs}:all=1[a${index}]`);
    const filter = prepared.length === 1
      ? `${filters[0]};[a0]anull[aout]`
      : `${filters.join(";")};${prepared.map((_, index) => `[a${index}]`).join("")}amix=inputs=${prepared.length}:duration=longest:normalize=0[aout]`;
    const args = ["-y"];
    for (const item of prepared) args.push("-i", item.path);
    args.push(
      "-filter_complex", filter,
      "-map", "[aout]",
      "-acodec", "pcm_s16le",
      "-ar", String(safeSampleRate),
      ...channelArgs,
      outputPath
    );

    console.log("BUILD-SEQ-AUDIO cmd:", formatCommand(platform.getFfmpegPath(), args).substring(0, 500));

    const result = await runCmd(platform.getFfmpegPath(), args, 600000);
    if (!result.ok) {
      console.error("BUILD-SEQ-AUDIO FFmpeg stderr:", result.stderr);
      return sendJson(res, 500, { ok: false, error: humanizeFFmpegError(result.stderr), stderr: result.stderr.substring(0, 3000) });
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
    const reveal = platform.getRevealCommand(filePath);
    await runCmd(reveal.command, reveal.args, 5000);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleHomeDir(req, res) {
  sendJson(res, 200, { ok: true, ...platform.getHomeDirs() });
}

async function handleLog(req, res) {
  try {
    const { tag = "plugin", message = "" } = await parseBody(req);
    console.log(`[${tag}] ${message}`);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleSetDeepgramKey(req, res) {
  try {
    const { key } = await parseBody(req);
    const trimmed = String(key || "").trim();
    if (!trimmed) {
      return sendJson(res, 400, { ok: false, error: "API key bos olamaz" });
    }
    if (trimmed.length < 20) {
      return sendJson(res, 400, { ok: false, error: "API key cok kisa (min 20 karakter)" });
    }

    const dir = path.dirname(deepgram.KEY_FILE);
    platform.ensureDir(dir, 0o700);
    platform.writePrivateFile(deepgram.KEY_FILE, trimmed);

    deepgram.clearCache();
    console.log(`SET-DEEPGRAM-KEY → ${deepgram.KEY_FILE} (${trimmed.length} char)`);
    sendJson(res, 200, { ok: true, keyFile: deepgram.KEY_FILE });
  } catch (err) {
    console.error("SET-DEEPGRAM-KEY error:", err.message);
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleDeepgramTest(req, res) {
  // Deepgram'a hafif bir auth isteği gönder; key gecerli mi dogrula.
  // /v1/projects auth gerektirir, kucuk JSON doner — pre-recorded audio gondermeyiz.
  // POST + body.key gönderilirse o key ile test edilir (stored key bozulmaz);
  // GET veya body yoksa stored key kullanılır.
  try {
    let tempKey = null;
    if (req.method === "POST") {
      try {
        const body = await parseBody(req);
        if (body && typeof body.key === "string" && body.key.trim().length >= 20) {
          tempKey = body.key.trim();
        }
      } catch {
        // body parse hatasi sessiz — stored key'e dus
      }
    }
    const apiKey = tempKey || deepgram.getApiKey();
    if (!apiKey) {
      return sendJson(res, 200, { ok: false, status: "no_key", message: "API key tanimli degil" });
    }

    const https = require("https");
    const result = await new Promise((resolve) => {
      const req2 = https.request(
        {
          method: "GET",
          hostname: "api.deepgram.com",
          path: "/v1/projects",
          headers: { Authorization: `Token ${apiKey}` },
          timeout: 10000,
        },
        (r) => {
          const chunks = [];
          r.on("data", (c) => chunks.push(c));
          r.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf-8");
            resolve({ statusCode: r.statusCode || 0, body });
          });
        }
      );
      req2.on("timeout", () => {
        req2.destroy();
        resolve({ statusCode: 0, body: "timeout" });
      });
      req2.on("error", (e) => resolve({ statusCode: 0, body: e.message }));
      req2.end();
    });

    if (result.statusCode === 200) {
      let projectCount = 0;
      try {
        const parsed = JSON.parse(result.body);
        projectCount = Array.isArray(parsed.projects) ? parsed.projects.length : 0;
      } catch {}
      return sendJson(res, 200, {
        ok: true,
        status: "valid",
        message: "Bağlandı",
        projectCount,
      });
    }
    if (result.statusCode === 401 || result.statusCode === 403) {
      return sendJson(res, 200, { ok: false, status: "invalid", message: "Key gecersiz veya yetkisiz" });
    }
    return sendJson(res, 200, {
      ok: false,
      status: "error",
      message: `Deepgram cevap kodu: ${result.statusCode || "ag hatasi"}`,
    });
  } catch (err) {
    sendJson(res, 500, { ok: false, status: "error", message: err.message });
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
  "GET /home-dir": handleHomeDir,
  "POST /log": handleLog,
  "POST /set-deepgram-key": handleSetDeepgramKey,
  "GET /deepgram-test": handleDeepgramTest,
  "POST /deepgram-test": handleDeepgramTest,
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
      "Access-Control-Allow-Origin": "null",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Premiere-Cut-Token, X-Premiere-Cut-Client",
    });
    return res.end();
  }

  const key = `${req.method} ${req.url.split("?")[0]}`;
  const handler = routes[key];

  if (!handler) {
    return sendJson(res, 404, { ok: false, error: `Route bulunamadi: ${key}` });
  }

  if (key !== "GET /ping") {
    const tokenHeader = req.headers["x-premiere-cut-token"] || req.headers["X-Premiere-Cut-Token"] || "";
    if (tokenHeader) {
      if (!isAuthorized(req)) {
        return sendJson(res, 401, { ok: false, error: "Gecersiz token" });
      }
    } else if (!isTrustedPluginClient(req)) {
      return sendJson(res, 401, { ok: false, error: "Yetki gerekli (trusted plugin client veya token)" });
    }
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
