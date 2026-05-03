const fs = require("fs");
const os = require("os");
const path = require("path");

const APP_NAME = "PremierSEYO";
const LEGACY_CONFIG_NAME = "premier-seyo";

function pathApiFor(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function resolvePaths(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const homeDir = options.homeDir || os.homedir();
  const tmpDir = options.tmpDir || os.tmpdir();
  const daemonDir = options.daemonDir || __dirname;
  const p = pathApiFor(platform);
  const isWindows = platform === "win32";

  if (isWindows) {
    const appData = env.APPDATA || p.join(homeDir, "AppData", "Roaming");
    const localAppData = env.LOCALAPPDATA || p.join(homeDir, "AppData", "Local");
    const installRoot = p.join(localAppData, "Programs", APP_NAME);
    const runtimeRoot = p.join(p.dirname(daemonDir), "runtime");
    const ffmpegPath = env.PREMIERSEYO_FFMPEG_PATH ||
      p.join(runtimeRoot, "ffmpeg", "bin", "ffmpeg.exe");
    const nodePath = env.PREMIERSEYO_NODE_PATH ||
      p.join(runtimeRoot, "node", "node.exe");

    return {
      platform,
      isWindows: true,
      homeDir,
      tmpDir: p.join(tmpDir, "premier-seyo"),
      configDir: p.join(appData, APP_NAME),
      tokenFile: p.join(appData, APP_NAME, "token"),
      deepgramKeyFile: p.join(appData, APP_NAME, "deepgram.key"),
      logDir: p.join(localAppData, APP_NAME, "logs"),
      installRoot,
      documentsDir: p.join(env.USERPROFILE || homeDir, "Documents"),
      desktopDir: p.join(env.USERPROFILE || homeDir, "Desktop"),
      downloadsDir: p.join(env.USERPROFILE || homeDir, "Downloads"),
      moviesDir: p.join(env.USERPROFILE || homeDir, "Videos"),
      ffmpegPath,
      ffmpegBinDir: p.dirname(ffmpegPath),
      nodePath,
      pathDelimiter: ";",
    };
  }

  const configDir = p.join(homeDir, ".config", LEGACY_CONFIG_NAME);
  return {
    platform,
    isWindows: false,
    homeDir,
    tmpDir: p.join(tmpDir, "premier-seyo"),
    configDir,
    tokenFile: p.join(configDir, "token"),
    deepgramKeyFile: p.join(configDir, "deepgram.key"),
    logDir: p.join(homeDir, "Library", "Logs"),
    installRoot: null,
    documentsDir: p.join(homeDir, "Documents"),
    desktopDir: p.join(homeDir, "Desktop"),
    downloadsDir: p.join(homeDir, "Downloads"),
    moviesDir: p.join(homeDir, "Movies"),
    ffmpegPath: env.PREMIERSEYO_FFMPEG_PATH || "ffmpeg",
    ffmpegBinDir: "",
    nodePath: env.PREMIERSEYO_NODE_PATH || process.execPath,
    pathDelimiter: ":",
  };
}

function paths() {
  return resolvePaths();
}

function ensureDir(dir, mode) {
  fs.mkdirSync(dir, { recursive: true });
  if (mode && process.platform !== "win32") {
    try { fs.chmodSync(dir, mode); } catch {}
  }
}

function writePrivateFile(filePath, content) {
  ensureDir(path.dirname(filePath), 0o700);
  fs.writeFileSync(filePath, content, { mode: 0o600 });
  if (process.platform !== "win32") {
    try { fs.chmodSync(filePath, 0o600); } catch {}
  }
}

function getPathEnv() {
  const p = paths();
  const entries = p.isWindows
    ? [p.ffmpegBinDir, process.env.PATH || ""]
    : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH || ""];
  return entries.filter(Boolean).join(p.pathDelimiter);
}

function getRevealCommand(filePath) {
  const p = paths();
  if (p.isWindows) {
    return { command: "explorer.exe", args: [`/select,${filePath}`] };
  }
  return { command: "open", args: ["-R", filePath] };
}

function getSafeWriteRoots() {
  const p = paths();
  return [p.tmpDir, p.documentsDir, p.desktopDir, p.downloadsDir, p.moviesDir];
}

function getHomeDirs() {
  const p = paths();
  return { homeDir: p.homeDir, documentsDir: p.documentsDir };
}

module.exports = {
  APP_NAME,
  resolvePaths,
  ensureDir,
  writePrivateFile,
  getPathEnv,
  getRevealCommand,
  getSafeWriteRoots,
  getHomeDirs,
  getTmpDir: () => paths().tmpDir,
  getConfigDir: () => paths().configDir,
  getTokenFile: () => paths().tokenFile,
  getDeepgramKeyFile: () => paths().deepgramKeyFile,
  getFfmpegPath: () => paths().ffmpegPath,
  getLogDir: () => paths().logDir,
};
