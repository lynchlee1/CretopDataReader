const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  assertPythonRuntime,
  buildPythonEnv,
  checkPythonRuntime,
  formatPythonRuntimeError,
} = require("./runtime-check");

const projectRoot = path.resolve(__dirname, "..");
const runtimeRoot = app.getPath("userData");
const pythonRoot = app.isPackaged ? process.resourcesPath : projectRoot;
const srcRoot = path.join(pythonRoot, "src");
const profileDir = path.join(runtimeRoot, "chrome-profile");
const defaultCaptureOutput = path.join(runtimeRoot, "output", "maxawon_condition_search.csv");
const networkLogDir = path.join(runtimeRoot, "network-logs");
const defaultPptOutput = path.join(os.homedir(), "Downloads", `Deal_Summary_${Date.now()}.pptx`);
const defaultWeeklyMezzOutput = path.join(os.homedir(), "Downloads", `weekly_mezz_${Date.now()}.xlsx`);
const pptForgerSettingsPath = path.join(runtimeRoot, "ppt-forger-settings.json");
const filePathsSettingsPath = path.join(runtimeRoot, "file-paths.json");
const defaultPptTemplateDir = path.join(app.isPackaged ? process.resourcesPath : projectRoot, "templates", "Deal_Summary_Template_1.0");
const remoteDebuggingPort = "9222";
const cretopUrl = "https://www.cretop.com/";
const updateFeed = "https://github.com/lynchlee1/Maxawon/releases";
const filePathKeys = new Set(["captureOutput", "weeklyMezzOutput", "pptTemplate", "pptExcel", "pptOutput"]);
const networkLoggingEnabled = process.env.MAXAWON_NETWORK_LOGS === "1";

let mainWindow;
let networkLoggerProcess = null;
let downloadedUpdate = false;
let cachedWorkerRuntimeStatus = null;

autoUpdater.autoDownload = false;

function getProjectVersion() {
  return app.getVersion();
}

function readFilePathSettings() {
  try {
    if (!fs.existsSync(filePathsSettingsPath)) return {};
    const saved = JSON.parse(fs.readFileSync(filePathsSettingsPath, "utf8"));
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};

    return Object.fromEntries(
      Object.entries(saved).filter(([key, value]) => filePathKeys.has(key) && typeof value === "string"),
    );
  } catch {
    return {};
  }
}

function writeFilePathSettings(nextPaths) {
  const merged = {
    ...readFilePathSettings(),
    ...Object.fromEntries(
      Object.entries(nextPaths || {}).filter(([key, value]) => filePathKeys.has(key) && typeof value === "string"),
    ),
  };
  fs.mkdirSync(path.dirname(filePathsSettingsPath), { recursive: true });
  fs.writeFileSync(filePathsSettingsPath, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

function saveFilePath(key, filePath) {
  if (!filePathKeys.has(key)) throw new Error("저장할 수 없는 파일 경로 항목입니다.");
  if (typeof filePath !== "string" || filePath.trim() === "") throw new Error("저장할 파일 경로가 비어 있습니다.");
  return writeFilePathSettings({ [key]: filePath });
}

function sendUpdateStatus(payload) {
  if (!mainWindow) return;
  mainWindow.webContents.send("update:status", {
    ...payload,
    downloaded: downloadedUpdate,
  });
}

autoUpdater.on("checking-for-update", () => {
  sendUpdateStatus({ status: "checking", message: "업데이트를 확인하는 중입니다." });
});

autoUpdater.on("update-available", (info) => {
  sendUpdateStatus({
    status: "available",
    message: `새 버전 ${info.version}을 사용할 수 있습니다.`,
    version: info.version,
  });
});

autoUpdater.on("update-not-available", (info) => {
  sendUpdateStatus({
    status: "not-available",
    message: "현재 최신 버전을 사용 중입니다.",
    version: info.version,
  });
});

autoUpdater.on("download-progress", (progress) => {
  sendUpdateStatus({
    status: "downloading",
    message: `업데이트 다운로드 중입니다. ${Math.round(progress.percent)}%`,
    progress: progress.percent,
  });
});

autoUpdater.on("update-downloaded", (info) => {
  downloadedUpdate = true;
  sendUpdateStatus({
    status: "downloaded",
    message: "업데이트 다운로드가 완료되었습니다. 재시작하면 설치됩니다.",
    version: info.version,
  });
});

autoUpdater.on("error", (error) => {
  sendUpdateStatus({
    status: "error",
    message: error.message || "업데이트 확인 중 오류가 발생했습니다.",
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    title: "Maxawon",
    backgroundColor: "#eef2f7",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  if (networkLoggingEnabled) {
    purgeOldNetworkLogs();
    startNetworkLogger();
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopNetworkLogger();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function pythonCommand() {
  return process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
}

function workerCommand() {
  if (!app.isPackaged) return pythonCommand();
  return path.join(process.resourcesPath, "bin", process.platform === "win32" ? "maxawon-worker.exe" : "maxawon-worker");
}

function workerArgs(args = []) {
  return app.isPackaged ? args : ["-m", "maxawon.worker", ...args];
}

function pythonEnv() {
  return buildPythonEnv(process.env, srcRoot);
}

function getPythonRuntimeStatus() {
  if (app.isPackaged && cachedWorkerRuntimeStatus) return cachedWorkerRuntimeStatus;

  const status = checkPythonRuntime({
    command: workerCommand(),
    args: workerArgs(["check"]),
    cwd: pythonRoot,
    env: pythonEnv(),
  });
  if (app.isPackaged && !status.ok) {
    cachedWorkerRuntimeStatus = {
      ...status,
      installCommand: null,
      message: status.message.replace(workerCommand(), "내장 Python worker"),
    };
    return cachedWorkerRuntimeStatus;
  }
  if (app.isPackaged && status.ok) cachedWorkerRuntimeStatus = status;
  return status;
}

function runWorker(args = []) {
  return new Promise((resolve, reject) => {
    try {
      assertPythonRuntime(getPythonRuntimeStatus());
    } catch (error) {
      reject(error);
      return;
    }

    const child = spawn(workerCommand(), workerArgs(args), {
      cwd: pythonRoot,
      env: pythonEnv(),
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (codeNumber) => {
      if (codeNumber !== 0) {
        reject(new Error(stderr.trim() || `Python exited with code ${codeNumber}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Python worker returned invalid JSON: ${stdout.trim()}`));
      }
    });
  });
}

function purgeOldNetworkLogs() {
  if (!fs.existsSync(networkLogDir)) return;

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const removeOldFiles = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        removeOldFiles(entryPath);
        try {
          fs.rmdirSync(entryPath);
        } catch (_error) {
          // Keep non-empty directories.
        }
        continue;
      }

      if (entry.isFile() && fs.statSync(entryPath).mtimeMs < cutoff) {
        fs.unlinkSync(entryPath);
      }
    }
  };

  removeOldFiles(networkLogDir);
}

function startNetworkLogger() {
  if (!networkLoggingEnabled) return;
  if (networkLoggerProcess && !networkLoggerProcess.killed) return;

  const runtimeStatus = getPythonRuntimeStatus();
  if (!runtimeStatus.ok) {
    fs.mkdirSync(networkLogDir, { recursive: true });
    fs.appendFileSync(
      path.join(networkLogDir, "network-logger.stderr.log"),
      `${new Date().toISOString()} ${formatPythonRuntimeError(runtimeStatus)}\n`,
      "utf8",
    );
    return;
  }

  fs.mkdirSync(networkLogDir, { recursive: true });
  const stdout = fs.openSync(path.join(networkLogDir, "network-logger.stdout.log"), "a");
  const stderr = fs.openSync(path.join(networkLogDir, "network-logger.stderr.log"), "a");
  networkLoggerProcess = spawn(
    workerCommand(),
    workerArgs([
      "network-logger",
      "--log-dir",
      networkLogDir,
      "--cdp-url",
      `http://127.0.0.1:${remoteDebuggingPort}`,
    ]),
    {
      cwd: pythonRoot,
      env: pythonEnv(),
      stdio: ["ignore", stdout, stderr],
    },
  );
  networkLoggerProcess.on("error", () => {
    networkLoggerProcess = null;
  });
  networkLoggerProcess.on("exit", () => {
    networkLoggerProcess = null;
  });
}

function stopNetworkLogger() {
  if (!networkLoggerProcess || networkLoggerProcess.killed) return;
  networkLoggerProcess.kill();
  networkLoggerProcess = null;
}

function runSync(command, args) {
  return spawnSync(command, args, { encoding: "utf8" });
}

function collectMatchingPids(patterns) {
  const pids = new Set();
  for (const pattern of patterns) {
    const result = runSync("pgrep", ["-f", pattern]);
    if (result.status !== 0 && result.status !== 1) continue;
    for (const line of result.stdout.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
        pids.add(pid);
      }
    }
  }
  return [...pids];
}

function terminatePids(pids, signal) {
  let count = 0;
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
      count += 1;
    } catch (_error) {
      // Process may have exited between discovery and termination.
    }
  }
  return count;
}

function closeAppChromeProcesses() {
  stopNetworkLogger();

  const patterns = [profileDir, `--remote-debugging-port=${remoteDebuggingPort}`];
  if (process.platform === "win32") {
    const profile = profileDir.replace(/'/g, "''");
    const port = `--remote-debugging-port=${remoteDebuggingPort}`;
    const script = `
$matches = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'chrome.exe' -and $_.CommandLine -and (
    $_.CommandLine -like '*${profile}*' -or $_.CommandLine -like '*${port}*'
  )
}
$matches | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force
  $_.ProcessId
}
`;
    const result = runSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || "앱이 연 Chrome 프로세스 종료에 실패했습니다.");
    }
    return result.stdout.split(/\r?\n/).filter((line) => line.trim()).length;
  }

  const pids = collectMatchingPids(patterns);
  const count = terminatePids(pids, "SIGTERM");
  return count || terminatePids(pids, "SIGKILL");
}

function closeAllChromeProcesses() {
  stopNetworkLogger();

  if (process.platform === "darwin") {
    const result = runSync("pkill", ["-f", "Google Chrome"]);
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(result.stderr.trim() || "Chrome 전체 종료에 실패했습니다.");
    }
    return result.status === 0 ? 1 : 0;
  }

  if (process.platform === "win32") {
    const script = `
$matches = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' }
$matches | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force
  $_.ProcessId
}
`;
    const result = runSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || "Chrome 전체 종료에 실패했습니다.");
    }
    return result.stdout.split(/\r?\n/).filter((line) => line.trim()).length;
  }

  const result = runSync("pkill", ["-f", "chrome|chromium"]);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr.trim() || "Chrome/Chromium 전체 종료에 실패했습니다.");
  }
  return result.status === 0 ? 1 : 0;
}

function findChrome() {
  if (process.platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  const commands = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  for (const command of commands) {
    const lookup = spawnSync("which", [command]);
    if (lookup.status === 0) return command;
  }
  return null;
}

ipcMain.handle("app:get-defaults", () => ({
  defaultCaptureOutput,
  defaultPptOutput,
  defaultWeeklyMezzOutput,
  savedFilePaths: readFilePathSettings(),
  filePathsSettingsPath,
  cdpUrl: `http://127.0.0.1:${remoteDebuggingPort}`,
  networkLogDir,
  appVersion: getProjectVersion(),
  updateFeed,
  updatesSupported: app.isPackaged,
  pptForgerSettingsPath,
  defaultPptTemplateDir,
  pythonRuntime: getPythonRuntimeStatus(),
}));

ipcMain.handle("app:check-for-updates", async () => {
  if (!app.isPackaged) {
    return {
      status: "unsupported",
      message: "업데이트 확인은 패키징된 앱에서만 사용할 수 있습니다.",
    };
  }

  downloadedUpdate = false;
  const result = await autoUpdater.checkForUpdates();
  return {
    status: "checked",
    message: "업데이트 확인 요청을 보냈습니다.",
    version: result?.updateInfo?.version || null,
  };
});

ipcMain.handle("app:download-update", async () => {
  if (!app.isPackaged) {
    return {
      status: "unsupported",
      message: "업데이트 다운로드는 패키징된 앱에서만 사용할 수 있습니다.",
    };
  }

  await autoUpdater.downloadUpdate();
  return {
    status: "downloading",
    message: "업데이트 다운로드를 시작했습니다.",
  };
});

ipcMain.handle("app:install-update", () => {
  if (!downloadedUpdate) {
    return {
      status: "not-ready",
      message: "아직 설치할 업데이트가 없습니다.",
    };
  }

  autoUpdater.quitAndInstall(false, true);
  return {
    status: "installing",
    message: "앱을 재시작해 업데이트를 설치합니다.",
  };
});

ipcMain.handle("app:open-chrome", async () => {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error("이 PC에서 Chrome 실행 파일을 찾지 못했습니다.");
  }

  fs.mkdirSync(profileDir, { recursive: true });
  const child = spawn(
    chrome,
    [
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${remoteDebuggingPort}`,
      "--new-window",
      cretopUrl,
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();

  return {
    message: networkLoggingEnabled
      ? `Chrome을 열었습니다. Network 로그는 ${networkLogDir}에 1일치만 저장합니다.`
      : "Chrome을 열었습니다.",
  };
});

ipcMain.handle("app:close-app-chrome", () => {
  const count = closeAppChromeProcesses();
  return {
    message: count > 0 ? "앱이 연 Chrome 프로세스를 종료했습니다." : "종료할 앱 Chrome 프로세스를 찾지 못했습니다.",
  };
});

ipcMain.handle("app:close-all-chrome", () => {
  const count = closeAllChromeProcesses();
  return {
    message: count > 0 ? "모든 Chrome 프로세스 종료 명령을 실행했습니다." : "실행 중인 Chrome 프로세스를 찾지 못했습니다.",
  };
});

ipcMain.handle("app:pick-capture-output", async (_event, currentPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "조건검색 복사 결과 저장",
    defaultPath: currentPath || defaultCaptureOutput,
    filters: [
      { name: "CSV", extensions: ["csv"] },
      { name: "All files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !result.filePath) return null;
  saveFilePath("captureOutput", result.filePath);
  return result.filePath;
});

ipcMain.handle("app:pick-ppt-template", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "PPT 템플릿 선택",
    properties: ["openFile"],
    filters: [
      { name: "PowerPoint", extensions: ["pptx"] },
      { name: "All files", extensions: ["*"] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  saveFilePath("pptTemplate", result.filePaths[0]);
  return result.filePaths[0];
});

ipcMain.handle("app:pick-ppt-excel", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "PPT Forger Model.xlsx 선택",
    properties: ["openFile"],
    filters: [
      { name: "Excel", extensions: ["xlsx"] },
      { name: "All files", extensions: ["*"] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  saveFilePath("pptExcel", result.filePaths[0]);
  return result.filePaths[0];
});

ipcMain.handle("app:pick-ppt-output", async (_event, currentPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "PPT 저장",
    defaultPath: currentPath || defaultPptOutput,
    filters: [
      { name: "PowerPoint", extensions: ["pptx"] },
      { name: "All files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !result.filePath) return null;
  saveFilePath("pptOutput", result.filePath);
  return result.filePath;
});

ipcMain.handle("app:pick-weekly-mezz-output", async (_event, currentPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "주간 메자닌 엑셀 저장",
    defaultPath: currentPath || defaultWeeklyMezzOutput,
    filters: [
      { name: "Excel", extensions: ["xlsx"] },
      { name: "All files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !result.filePath) return null;
  saveFilePath("weeklyMezzOutput", result.filePath);
  return result.filePath;
});

function resolvePptTemplateFiles(templateDir) {
  if (!templateDir) return { templateDir: "", modelPath: "", templatePath: "" };
  const modelPath = path.join(templateDir, "Model.xlsx");
  const templatePath = path.join(templateDir, "deal-summary.pptx");
  return {
    templateDir,
    modelPath: fs.existsSync(modelPath) ? modelPath : "",
    templatePath: fs.existsSync(templatePath) ? templatePath : "",
  };
}

ipcMain.handle("app:ppt-select-template-dir", async () => {
  const { readSettings, writeSettings } = require("./ppt-forger-gemini");
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "PPT Forger 템플릿 폴더 선택",
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  const templateDir = result.filePaths[0];
  writeSettings(pptForgerSettingsPath, { templateDir });
  return {
    ...readSettings(pptForgerSettingsPath),
    ...resolvePptTemplateFiles(templateDir),
  };
});

ipcMain.handle("app:ppt-fetch-company", async (_event, stockCode) => {
  const { fetchCompanyInfo } = require("./ppt-forger-data");
  return fetchCompanyInfo(stockCode);
});

ipcMain.handle("app:ppt-read-excel", async (_event, excelPath) => {
  const { readExcelData } = require("./ppt-forger-data");
  if (!excelPath) throw new Error("Model.xlsx 파일을 선택하세요.");
  return readExcelData(excelPath);
});

ipcMain.handle("app:ppt-build-data", async (_event, payload) => {
  const { buildPptData } = require("./ppt-forger-data");
  return buildPptData(payload);
});

ipcMain.handle("app:ppt-get-gemini-settings", async () => {
  const { readSettings } = require("./ppt-forger-gemini");
  const settings = readSettings(pptForgerSettingsPath);
  return {
    ...settings,
    ...resolvePptTemplateFiles(settings.templateDir || defaultPptTemplateDir),
  };
});

ipcMain.handle("app:ppt-save-gemini-settings", async (_event, settings) => {
  const { writeSettings } = require("./ppt-forger-gemini");
  const saved = writeSettings(pptForgerSettingsPath, settings || {});
  return {
    ...saved,
    ...resolvePptTemplateFiles(saved.templateDir || defaultPptTemplateDir),
  };
});

ipcMain.handle("app:ppt-generate-gemini", async (_event, payload) => {
  const { generateGeminiText, readSettings } = require("./ppt-forger-gemini");
  const settings = {
    ...readSettings(pptForgerSettingsPath),
    ...(payload?.settings || {}),
  };
  return generateGeminiText({
    settings,
    companyInfo: payload?.companyInfo,
    financialData: payload?.financialData,
    options: payload?.options,
  });
});

ipcMain.handle("app:generate-ppt", async (_event, payload) => {
  const { generatePpt } = require("./ppt-forger");
  const templatePath = payload?.templatePath;
  const outputPath = payload?.outputPath;
  const data = payload?.data;

  if (!templatePath) throw new Error("PPT 템플릿을 선택하세요.");
  if (!outputPath) throw new Error("PPT 저장 파일을 선택하세요.");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("치환 데이터는 JSON 객체여야 합니다.");
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const resultPath = await generatePpt(templatePath, outputPath, data);
  return {
    outputPath: resultPath,
    replacedKeys: Object.keys(data),
  };
});

ipcMain.handle("app:capture-table", (_event, payload) =>
  runWorker([
    "capture-table",
    "--max-pages",
    payload.maxPages == null ? "" : String(payload.maxPages),
    "--output-path",
    payload.outputPath,
  ]),
);

ipcMain.handle("app:weekly-mezz-collect", (_event, payload) =>
  runWorker([
    "weekly-mezz-collect",
    "--from-date",
    payload.fromDate,
    "--to-date",
    payload.toDate,
    "--output-path",
    payload.outputPath,
    "--last-report-value",
    payload.lastReportValue || "Y",
  ]),
);
