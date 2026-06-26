const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist-python");
const distPythonDir = path.join(distDir, "python");
const archivePath = path.join(root, "build", "python-standalone.tar.gz");

// Determine URL based on platform and architecture (Python 3.13.0 standalone)
let downloadUrl = "";
if (process.platform === "darwin") {
  if (process.arch === "arm64") {
    downloadUrl = "https://github.com/astral-sh/python-build-standalone/releases/download/20241016/cpython-3.13.0+20241016-aarch64-apple-darwin-install_only.tar.gz";
  } else {
    downloadUrl = "https://github.com/astral-sh/python-build-standalone/releases/download/20241016/cpython-3.13.0+20241016-x86_64-apple-darwin-install_only.tar.gz";
  }
} else if (process.platform === "win32") {
  downloadUrl = "https://github.com/astral-sh/python-build-standalone/releases/download/20241016/cpython-3.13.0+20241016-x86_64-pc-windows-msvc-shared-install_only.tar.gz";
} else {
  // Fallback for Linux CI environments
  downloadUrl = "https://github.com/astral-sh/python-build-standalone/releases/download/20241016/cpython-3.13.0+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz";
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporaryPath = `${destination}.download`;
    const file = fs.createWriteStream(temporaryPath);

    https
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          file.close(() => {
            fs.rmSync(temporaryPath, { force: true });
            downloadFile(new URL(response.headers.location, url).toString(), destination).then(resolve, reject);
          });
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          file.close(() => {
            fs.rmSync(temporaryPath, { force: true });
            reject(new Error(`Python download failed: HTTP ${response.statusCode}`));
          });
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            fs.renameSync(temporaryPath, destination);
            resolve();
          });
        });
      })
      .on("error", (error) => {
        file.close(() => {
          fs.rmSync(temporaryPath, { force: true });
          reject(error);
        });
      });
  });
}

function extractArchive(archive, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const result = spawnSync("tar", ["-xzf", archive, "-C", dest], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Failed to extract Python archive: exit code ${result.status}`);
  }
}

async function main() {
  try {
    fs.mkdirSync(distDir, { recursive: true });

    if (fs.existsSync(distPythonDir)) {
      console.log("Standalone Python environment already exists. Skipping download.");
    } else {
      console.log(`Downloading portable Python from ${downloadUrl}...`);
      await downloadFile(downloadUrl, archivePath);
      console.log("Extracting Python standalone archive...");
      extractArchive(archivePath, distDir);
      fs.rmSync(archivePath, { force: true });
    }

    let pythonBin = "";
    if (process.platform === "win32") {
      pythonBin = path.join(distPythonDir, "python.exe");
    } else {
      pythonBin = path.join(distPythonDir, "bin", "python3");
    }

    console.log(`Using Python binary at: ${pythonBin}`);
    const versionResult = spawnSync(pythonBin, ["-c", "import sys; print(sys.version)"], {
      encoding: "utf8",
    });
    console.log(`Python Version: ${versionResult.stdout.trim()}`);

    console.log("Installing python dependencies using pip...");
    const pipResult = spawnSync(pythonBin, ["-m", "pip", "install", "."], {
      cwd: root,
      stdio: "inherit",
    });
    if (pipResult.status !== 0) {
      throw new Error(`Failed to install python dependencies: exit code ${pipResult.status}`);
    }
    console.log("Python worker dependencies successfully installed!");
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

main();
