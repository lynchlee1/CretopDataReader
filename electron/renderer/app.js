const state = {
  loginDone: false,
  inputRows: [],
  captureOutput: "",
  pendingCapture: null,
  captureRunning: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function setText(selector, value) {
  $(selector).textContent = value;
}

function addLog(message) {
  const logs = $("#logs");
  const item = document.createElement("li");
  const time = document.createElement("time");
  const body = document.createElement("span");
  time.textContent = new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  body.textContent = message;
  item.append(time, body);
  logs.append(item);
  logs.scrollTop = logs.scrollHeight;
}

function setProgress(message) {
  setText("#sessionProgress", message);
}

function setInputProgress(message) {
  setText("#inputProgress", message);
}

function setLogin(message, done = false) {
  state.loginDone = done;
  setText("#loginText", message);
  $("#loginPill").classList.toggle("connected", done);
  $("#loginPill").classList.toggle("disconnected", !done);
  updateStartEnabled();
}

function updateStartEnabled() {
  $("#startProcessing").disabled = !(state.loginDone && state.inputRows.length);
}

function showView(name) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === name));
  $$(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });
}

function renderTable(targetSelector, headers, rows) {
  const target = $(targetSelector);
  if (!headers.length && !rows.length) {
    target.className = "table-empty";
    target.textContent = "표시할 데이터가 없습니다.";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headerRow = document.createElement("tr");
  const width = Math.max(headers.length, ...rows.map((row) => row.length));
  const normalizedHeaders = Array.from({ length: width }, (_, index) => headers[index] || `Column ${index + 1}`);

  normalizedHeaders.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.append(th);
  });
  thead.append(headerRow);

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    normalizedHeaders.forEach((_header, index) => {
      const td = document.createElement("td");
      td.textContent = row[index] || "";
      tr.append(td);
    });
    tbody.append(tr);
  });

  table.append(thead, tbody);
  target.className = "table-wrap";
  target.replaceChildren(table);
}

function parseManualInput(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t|,/).map((cell) => cell.trim()));
}

function refreshManualInput() {
  const rows = parseManualInput($("#manualInput").value);
  state.inputRows = rows;

  if (!rows.length) {
    $("#manualPreview").className = "table-empty";
    $("#manualPreview").textContent = "검색 대상을 한 줄에 하나씩 입력하세요.";
    setText("#manualCount", "0행");
    setInputProgress("입력 대기");
    updateStartEnabled();
    return;
  }

  renderTable("#manualPreview", ["검색 대상"], rows);
  setText("#manualCount", `${rows.length}행`);
  setInputProgress("입력됨");
  updateStartEnabled();
}

async function runAction(action) {
  try {
    return await action();
  } catch (error) {
    addLog(error.message);
    window.alert(error.message);
    return null;
  }
}

function isExpiredError(error) {
  return /만료|8004|-8002|expired/i.test(error?.message || "");
}

async function runCapture(payload, resumed = false) {
  if (!state.loginDone) {
    window.alert("Cretop에 로그인한 뒤 '로그인 완료'를 누르세요.");
    return;
  }

  state.captureRunning = true;
  $("#captureTable").disabled = true;
  setText("#captureStatus", resumed ? "재개 중" : "복사 중");
  addLog(resumed ? "보류된 조건검색 결과 복사를 재개합니다." : "현재 Cretop 화면의 조건검색 결과 테이블 복사를 시작합니다.");

  try {
    const result = await window.cretop.captureTable(payload);
    state.pendingCapture = null;
    renderTable("#capturePreview", result.headers, result.rows);
    setText("#captureStatus", `${result.pages}페이지, ${result.rowCount}행 저장 완료`);
    setText("#captureCount", `${result.rowCount}행`);
    addLog(`조건검색 결과를 저장했습니다: ${result.outputPath}`);
  } catch (error) {
    if (isExpiredError(error)) {
      state.pendingCapture = payload;
      setLogin("재확인 필요", false);
      setProgress("페이지 만료: Chrome에서 새로고침 후 로그인 완료를 누르세요.");
      setText("#captureStatus", "페이지 만료로 일시 중단");
      addLog("Cretop 페이지가 만료되어 작업을 일시 중단했습니다. Chrome에서 새로고침한 뒤 앱의 '로그인 완료'를 누르면 다시 실행합니다.");
      window.alert("Cretop 페이지가 만료되었습니다. Chrome에서 새로고침한 뒤 앱으로 돌아와 '로그인 완료'를 누르세요.");
    } else {
      setText("#captureStatus", "복사 실패");
      addLog(error.message);
      window.alert(error.message);
    }
  } finally {
    state.captureRunning = false;
    $("#captureTable").disabled = false;
  }
}

async function init() {
  const defaults = await window.cretop.getDefaults();
  state.captureOutput = defaults.defaultCaptureOutput;
  $("#captureOutput").value = defaults.defaultCaptureOutput;
  if (defaults.appVersion) {
    setText("#appVersion", `v${defaults.appVersion}`);
  }

  $$(".nav-button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  $("#openChrome").addEventListener("click", async () => {
    const result = await runAction(() => window.cretop.openChrome());
    if (!result) return;
    setProgress("Chrome 실행됨");
    addLog(result.message);
  });

  $("#loginDone").addEventListener("click", () => {
    setLogin("연결", true);
    setProgress("로그인 완료");
    addLog("사용자가 로그인 완료를 확인했습니다.");
    if (state.pendingCapture && !state.captureRunning) {
      runCapture(state.pendingCapture, true);
    }
  });

  $("#closeAppChrome").addEventListener("click", async () => {
    const result = await runAction(() => window.cretop.closeAppChrome());
    if (!result) return;
    setLogin("미연결", false);
    setProgress("실행된 Chrome 종료됨");
    addLog(result.message);
  });

  $("#closeAllChrome").addEventListener("click", async () => {
    const confirmed = window.confirm("사용자가 직접 연 Chrome까지 모두 종료합니다. 계속할까요?");
    if (!confirmed) return;

    const result = await runAction(() => window.cretop.closeAllChrome());
    if (!result) return;
    setLogin("미연결", false);
    setProgress("전체 Chrome 종료됨");
    addLog(result.message);
  });

  $("#pickOutput").addEventListener("click", async () => {
    const selected = await runAction(() => window.cretop.pickCaptureOutput(state.captureOutput));
    if (!selected) return;
    state.captureOutput = selected;
    $("#captureOutput").value = selected;
    addLog(`조건검색 저장 파일을 변경했습니다: ${selected}`);
  });

  $("#captureTable").addEventListener("click", async () => {
    if (!state.loginDone) {
      window.alert("Cretop에 로그인한 뒤 '로그인 완료'를 누르세요.");
      return;
    }

    const maxPages = Number($("#maxPages").value);
    if (!Number.isInteger(maxPages) || maxPages < 1) {
      window.alert("최대 페이지는 1 이상의 숫자로 입력하세요.");
      return;
    }

    await runCapture({
      maxPages,
      outputPath: state.captureOutput,
    });
  });

  $("#manualInput").addEventListener("input", refreshManualInput);

  $("#startProcessing").addEventListener("click", () => {
    setInputProgress("구현 대기");
    addLog("Scrapling 기반 검색 처리는 아직 구현되지 않았습니다. 중복 후보 처리 규칙을 먼저 확정해야 합니다.");
    window.alert("입력 형식, 출력 항목, 중복 후보 선택 기준을 확정한 뒤 구현하세요.");
  });

  $("#clearLog").addEventListener("click", () => {
    $("#logs").replaceChildren();
  });

  addLog("Chrome을 열고 직접 로그인한 뒤 '로그인 완료'를 누르세요.");
  refreshManualInput();
}

init();
