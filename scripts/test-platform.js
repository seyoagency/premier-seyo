#!/usr/bin/env node

const assert = require("node:assert/strict");
const platform = require("../daemon/platform");

const win = platform.resolvePaths({
  platform: "win32",
  env: {
    APPDATA: "C:\\Users\\seyo\\AppData\\Roaming",
    LOCALAPPDATA: "C:\\Users\\seyo\\AppData\\Local",
    USERPROFILE: "C:\\Users\\seyo",
  },
  homeDir: "C:\\Users\\seyo",
  tmpDir: "C:\\Temp",
  daemonDir: "C:\\Users\\seyo\\AppData\\Local\\Programs\\PremierSEYO\\daemon",
});

assert.equal(win.configDir, "C:\\Users\\seyo\\AppData\\Roaming\\PremierSEYO");
assert.equal(win.tokenFile, "C:\\Users\\seyo\\AppData\\Roaming\\PremierSEYO\\token");
assert.equal(win.deepgramKeyFile, "C:\\Users\\seyo\\AppData\\Roaming\\PremierSEYO\\deepgram.key");
assert.equal(win.logDir, "C:\\Users\\seyo\\AppData\\Local\\PremierSEYO\\logs");
assert.equal(win.installRoot, "C:\\Users\\seyo\\AppData\\Local\\Programs\\PremierSEYO");
assert.equal(win.ffmpegPath, "C:\\Users\\seyo\\AppData\\Local\\Programs\\PremierSEYO\\runtime\\ffmpeg\\bin\\ffmpeg.exe");
assert.equal(win.documentsDir, "C:\\Users\\seyo\\Documents");

const mac = platform.resolvePaths({
  platform: "darwin",
  env: {},
  homeDir: "/Users/seyo",
  tmpDir: "/tmp",
  daemonDir: "/Users/seyo/projects/premiere-cut/daemon",
});

assert.equal(mac.configDir, "/Users/seyo/.config/premier-seyo");
assert.equal(mac.tokenFile, "/Users/seyo/.config/premier-seyo/token");
assert.equal(mac.deepgramKeyFile, "/Users/seyo/.config/premier-seyo/deepgram.key");
assert.equal(mac.logDir, "/Users/seyo/Library/Logs");
assert.equal(mac.ffmpegPath, "ffmpeg");
assert.equal(mac.documentsDir, "/Users/seyo/Documents");

console.log("platform path tests passed");
