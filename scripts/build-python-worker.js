const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  });
}

function findPython() {
  for (const command of candidates) {
    const result = run(command, ["-c", "import sys; print(sys.executable)"]);
    if (result.status === 0) return command;
  }
  throw new Error("Python 실행 파일을 찾지 못했습니다. 빌드 머신에 Python 3를 설치하세요.");
}

const python = process.env.PYTHON || findPython();
const pyinstallerCheck = run(python, ["-m", "PyInstaller", "--version"]);
if (pyinstallerCheck.status !== 0) {
  throw new Error("PyInstaller가 필요합니다. `python -m pip install pyinstaller`를 실행하세요.");
}

const distDir = path.join(root, "dist-python");
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const result = run(
  python,
  [
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--name",
    "maxawon-worker",
    "--distpath",
    "dist-python",
    "--workpath",
    "build/pyinstaller",
    "--specpath",
    "build/pyinstaller",
    "src/maxawon/worker.py",
  ],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}
