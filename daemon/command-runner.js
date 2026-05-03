const { spawn } = require("child_process");
const platform = require("./platform");

const DEFAULT_MAX_BUFFER = 1024 * 1024 * 100;

function runCommand(command, args = [], options = {}) {
  const timeoutMs = options.timeoutMs || 600000;
  const maxBuffer = options.maxBuffer || DEFAULT_MAX_BUFFER;
  const env = {
    ...process.env,
    ...(options.env || {}),
    PATH: options.pathEnv || platform.getPathEnv(),
  };

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const append = (current, chunk) => {
      current += chunk.toString();
      if (current.length > maxBuffer) {
        current = current.slice(current.length - maxBuffer);
      }
      return current;
    };

    const child = spawn(command, args, {
      cwd: options.cwd,
      env,
      shell: false,
      windowsHide: true,
    });

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: payload.ok,
        stdout,
        stderr,
        code: payload.code,
        signal: payload.signal || null,
        timedOut,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      stderr = append(stderr, `\nCommand timed out after ${timeoutMs}ms`);
      try { child.kill("SIGTERM"); } catch {}
    }, timeoutMs);

    if (child.stdout) child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    if (child.stderr) child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => {
      stderr = append(stderr, error.message || String(error));
      finish({ ok: false, code: error.code || 1 });
    });
    child.on("close", (code, signal) => {
      finish({ ok: !timedOut && code === 0, code: code == null ? 1 : code, signal });
    });
  });
}

function formatCommand(command, args = []) {
  return [command, ...args].map((part) => {
    const value = String(part);
    return /\s|"/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
  }).join(" ");
}

module.exports = { runCommand, formatCommand };
