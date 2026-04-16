/**
 * WebVTT dosya yazici — daemon araciligiyla
 */

const daemon = require("../utils/daemon");

/**
 * Saniyeyi VTT timestamp formatina cevir (HH:MM:SS.mmm)
 */
function secondsToVTT(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    String(h).padStart(2, "0") + ":" +
    String(m).padStart(2, "0") + ":" +
    String(s).padStart(2, "0") + "." +
    String(ms).padStart(3, "0")
  );
}

function generate(captions) {
  const header = "WEBVTT\n\n";
  const body = captions.map(cap => {
    return `${cap.index}\n${secondsToVTT(cap.start)} --> ${secondsToVTT(cap.end)}\n${cap.text}`;
  }).join("\n\n");
  return header + body + "\n";
}

async function write(filePath, captions) {
  const content = generate(captions);
  const res = await daemon.writeFile({ filePath, content });
  return res.path;
}

module.exports = { generate, write, secondsToVTT };
