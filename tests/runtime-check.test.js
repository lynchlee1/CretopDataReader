const assert = require("assert");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

const {
  REQUIRED_PYTHON_MODULES,
  checkPythonRuntime,
  formatPythonRuntimeError,
} = require("../electron/runtime-check");

test("checkPythonRuntime reports ready runtime", () => {
  const result = checkPythonRuntime({
    command: "python3",
    cwd: "/tmp",
    env: {},
    spawnSyncImpl: () => ({
      status: 0,
      stdout: JSON.stringify({ missing: [] }),
      stderr: "",
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("checkPythonRuntime maps missing modules to install packages", () => {
  const result = checkPythonRuntime({
    command: "python3",
    cwd: "/tmp",
    env: {},
    spawnSyncImpl: () => ({
      status: 0,
      stdout: JSON.stringify({ missing: ["playwright", "bs4"] }),
      stderr: "",
    }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.missing.map((item) => item.packageName),
    ["playwright", "beautifulsoup4"],
  );
});

test("formatPythonRuntimeError includes install command", () => {
  const message = formatPythonRuntimeError({
    ok: false,
    command: "python3",
    message: "Python 패키지가 설치되어 있지 않습니다.",
    missing: [REQUIRED_PYTHON_MODULES[0]],
  });

  assert.match(message, /playwright/);
  assert.match(message, /python3 -m pip install -e \./);
});

test("desktop and Python package versions stay aligned", () => {
  const root = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const pyproject = fs.readFileSync(path.join(root, "pyproject.toml"), "utf8");
  const match = pyproject.match(/^version\s*=\s*["']([^"']+)["']/m);

  assert.ok(match, "pyproject.toml must include a project version");
  assert.equal(packageJson.version, match[1]);
});
