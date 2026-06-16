const state = {
  loginDone: false,
  captureOutput: "",
  pendingCapture: null,
  captureRunning: false,
  pptTemplatePath: "",
  pptExcelPath: "",
  pptOutputPath: "",
  pptRunning: false,
  pptCompanyInfo: null,
  pptExcelData: null,
  pptData: null,
  updateAvailable: false,
  updateDownloaded: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const PAGE_INFO = {
  session: [
    {
      type: "steps",
      title: "사용 방법",
      items: [
        "Chrome을 엽니다.",
        "Cretop에 직접 로그인합니다.",
        "필요한 화면으로 이동합니다.",
        "앱에서 로그인 완료를 누릅니다.",
      ],
    },
    {
      type: "details",
      title: "기능 경계",
      items: [
        ["입력", "직접 로그인한 Chrome 세션"],
        ["작업", "세션 연결 상태를 표시합니다."],
        ["제외", "로그인 자동화와 접근 제한 우회"],
      ],
    },
    {
      type: "details",
      title: "Chrome 종료",
      items: [
        ["실행된 Chrome 종료", "이 앱에서 연 Chrome만 닫습니다."],
        ["전체 Chrome 종료", "따로 연 Chrome도 닫을 수 있습니다."],
      ],
    },
  ],
  capture: [
    {
      type: "details",
      title: "기능 경계",
      items: [
        ["입력", "현재 화면의 조건검색 테이블"],
        ["작업", "테이블을 CSV로 저장합니다."],
        ["제외", "조건검색 실행, 후보 선택, 로그인 자동화"],
      ],
    },
    {
      type: "steps",
      title: "사용 방법",
      items: ["조건검색 결과 화면을 엽니다.", "저장 파일과 페이지 수를 확인합니다.", "저장 버튼을 누릅니다."],
    },
  ],
  ppt: [
    {
      type: "details",
      title: "기능 경계",
      items: [
        ["입력", "종목코드, Model.xlsx, PPTX 템플릿, AI 문구"],
        ["작업", "FnGuide/KIND와 Model.xlsx에서 PPT 치환 데이터를 만들고 {{key}} 값을 바꿔 저장합니다."],
        ["제외", "Gemini 자동 생성과 기본 템플릿 번들"],
      ],
    },
    {
      type: "steps",
      title: "사용 방법",
      items: ["종목코드와 발행 조건을 입력합니다.", "Model.xlsx와 PPTX 템플릿을 선택합니다.", "데이터 만들기 후 PPT 생성을 누릅니다."],
    },
  ],
  updates: [
    {
      type: "details",
      title: "기능 경계",
      items: [
        ["입력", "현재 앱 버전과 GitHub 릴리스"],
        ["작업", "새 버전을 내려받아 재시작 설치합니다."],
        ["제외", "개발 실행 상태의 실제 설치"],
      ],
    },
    {
      type: "steps",
      title: "사용 방법",
      items: ["새 버전을 확인합니다.", "있으면 다운로드합니다.", "재시작 후 설치합니다."],
    },
  ],
};

function setText(selector, value) {
  $(selector).textContent = value;
}

function appendText(parent, text) {
  const parts = text.split(/(\{\{[^}]+\}\})/g).filter(Boolean);
  parts.forEach((part) => {
    const node = part.startsWith("{{") && part.endsWith("}}") ? document.createElement("code") : document.createTextNode(part);
    node.textContent = part;
    parent.append(node);
  });
}

function createInfoSection(section) {
  const element = document.createElement("section");
  const heading = document.createElement("h3");
  element.className = `page-section ${section.type === "steps" ? "guide-section" : "boundary-section"}`;
  heading.textContent = section.title;
  element.append(heading);

  if (section.type === "steps") {
    const list = document.createElement("ol");
    section.items.forEach((text) => {
      const item = document.createElement("li");
      appendText(item, text);
      list.append(item);
    });
    element.append(list);
    return element;
  }

  const list = document.createElement("dl");
  list.className = "boundary-list";
  section.items.forEach(([term, description]) => {
    const item = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    appendText(dd, description);
    item.append(dt, dd);
    list.append(item);
  });
  element.append(list);
  return element;
}

function renderPageInfo() {
  $$("[data-info]").forEach((slot) => {
    const fragment = document.createDocumentFragment();
    PAGE_INFO[slot.dataset.info].forEach((section) => {
      fragment.append(createInfoSection(section));
    });
    slot.replaceWith(fragment);
  });
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

function setLogin(message, done = false) {
  state.loginDone = done;
  setText("#loginText", message);
  $("#loginPill").classList.toggle("connected", done);
  $("#loginPill").classList.toggle("disconnected", !done);
}

function showView(name) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === name));
  $$(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });
}

function setUpdateStatus(payload) {
  const message = payload?.message || "대기 중";
  setText("#updateStatus", message);

  state.updateAvailable = payload?.status === "available" || state.updateAvailable;
  state.updateDownloaded = payload?.status === "downloaded" || payload?.downloaded || false;

  if (payload?.status === "not-available" || payload?.status === "error") {
    state.updateAvailable = false;
    state.updateDownloaded = false;
  }

  $("#downloadUpdate").disabled = !state.updateAvailable || state.updateDownloaded;
  $("#installUpdate").disabled = !state.updateDownloaded;
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

function inputValue(selector) {
  return $(selector).value.trim();
}

function buildPptInputs() {
  return {
    stock_code: inputValue("#pptStockCode"),
    mezz_type_full: inputValue("#pptMezzType"),
    investment_amt: inputValue("#pptInvestmentAmt"),
    issue_amt: inputValue("#pptIssueAmt"),
  };
}

function buildPptOwnership() {
  return {
    callPercent: inputValue("#pptCallPercent"),
    refixingPercent: inputValue("#pptRefixingPercent"),
    priorMezzanineShares: inputValue("#pptPriorMezzanineShares"),
    maxShareholders: inputValue("#pptMaxShareholders"),
    isTreasuryEb: $("#pptTreasuryEb").checked,
  };
}

function buildPptAiText() {
  return {
    investment_text_title1: inputValue("#investmentTextTitle1"),
    investment_text_contents1_1: inputValue("#investmentTextContents11"),
    investment_text_contents1_2: inputValue("#investmentTextContents12"),
    investment_text_title2: inputValue("#investmentTextTitle2"),
    investment_text_contents2_1: inputValue("#investmentTextContents21"),
    investment_text_contents2_2: inputValue("#investmentTextContents22"),
    investment_text_title3: inputValue("#investmentTextTitle3"),
    investment_text_contents3_1: inputValue("#investmentTextContents31"),
    investment_text_contents3_2: inputValue("#investmentTextContents32"),
    price_text_title1: inputValue("#priceTextTitle1"),
    price_text_title2: inputValue("#priceTextTitle2"),
    risk_text_title1: inputValue("#riskTextTitle1"),
    risk_text_contents1_1: inputValue("#riskTextContents11"),
    risk_text_title2: inputValue("#riskTextTitle2"),
    risk_text_contents2_1: inputValue("#riskTextContents21"),
  };
}

async function buildPptData() {
  const inputs = buildPptInputs();
  if (!/^\d{6}$/.test(inputs.stock_code)) {
    window.alert("종목코드는 6자리 숫자로 입력하세요.");
    return null;
  }
  if (!state.pptExcelPath) {
    window.alert("Model.xlsx 파일을 선택하세요.");
    return null;
  }

  $("#buildPptData").disabled = true;
  addLog("PPT Forger 회사 정보와 엑셀 데이터를 읽습니다.");
  try {
    const [companyInfo, excelData] = await Promise.all([
      state.pptCompanyInfo?.stock_code === inputs.stock_code
        ? Promise.resolve(state.pptCompanyInfo)
        : window.maxawon.pptFetchCompany(inputs.stock_code),
      state.pptExcelData?.path === state.pptExcelPath
        ? Promise.resolve(state.pptExcelData)
        : window.maxawon.pptReadExcel(state.pptExcelPath),
    ]);
    state.pptCompanyInfo = { ...companyInfo, stock_code: inputs.stock_code };
    state.pptExcelData = { ...excelData, path: state.pptExcelPath };

    const result = await window.maxawon.pptBuildData({
      inputs,
      companyInfo,
      excelData,
      aiText: buildPptAiText(),
      ownership: buildPptOwnership(),
    });
    state.pptData = result.data;
    $("#pptData").value = JSON.stringify(result.data, null, 2);
    addLog(`PPT 치환 데이터를 만들었습니다: ${result.data.corp_name || inputs.stock_code}`);
    if (excelData.missingFinancials?.length) {
      addLog(`Model.xlsx에서 찾지 못한 재무 항목: ${excelData.missingFinancials.join(", ")}`);
    }
    return result.data;
  } catch (error) {
    addLog(error.message);
    window.alert(error.message);
    return null;
  } finally {
    $("#buildPptData").disabled = false;
  }
}

async function runCapture(payload, resumed = false) {
  if (!state.loginDone) {
    window.alert("Maxawon에 로그인한 뒤 '로그인 완료'를 누르세요.");
    return;
  }

  state.captureRunning = true;
  $("#captureTable").disabled = true;
  addLog(resumed ? "보류된 조건검색 테이블 CSV 저장을 재개합니다." : "현재 조건검색 테이블 CSV 저장을 시작합니다.");

  try {
    const result = await window.maxawon.captureTable(payload);
    state.pendingCapture = null;
    addLog(`조건검색 결과 ${result.rowCount}행을 저장했습니다: ${result.outputPath}`);
  } catch (error) {
    if (isExpiredError(error)) {
      state.pendingCapture = payload;
      setLogin("재확인 필요", false);
      addLog("Maxawon 페이지가 만료되어 작업을 일시 중단했습니다. Chrome에서 새로고침한 뒤 앱의 '로그인 완료'를 누르면 다시 실행합니다.");
      window.alert("Maxawon 페이지가 만료되었습니다. Chrome에서 새로고침한 뒤 앱으로 돌아와 '로그인 완료'를 누르세요.");
    } else {
      addLog(error.message);
      window.alert(error.message);
    }
  } finally {
    state.captureRunning = false;
    $("#captureTable").disabled = false;
  }
}

async function init() {
  renderPageInfo();

  const defaults = await window.maxawon.getDefaults();
  state.captureOutput = defaults.defaultCaptureOutput;
  state.pptOutputPath = defaults.defaultPptOutput;
  $("#captureOutput").value = defaults.defaultCaptureOutput;
  $("#pptOutput").value = defaults.defaultPptOutput;
  if (defaults.appVersion) {
    setText("#appVersion", `v${defaults.appVersion}`);
    setText("#currentVersion", `v${defaults.appVersion}`);
  }
  setText("#updateFeed", defaults.updateFeed);
  if (!defaults.updatesSupported) {
    setUpdateStatus({ status: "unsupported", message: "앱 업데이트 확인은 패키징된 앱에서만 사용할 수 있습니다." });
  }

  window.maxawon.onUpdateStatus((payload) => {
    setUpdateStatus(payload);
    addLog(payload.message);
  });

  $$(".nav-button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  $("#openChrome").addEventListener("click", async () => {
    const result = await runAction(() => window.maxawon.openChrome());
    if (!result) return;
    addLog(result.message);
  });

  $("#loginDone").addEventListener("click", () => {
    setLogin("연결", true);
    addLog("사용자가 로그인 완료를 확인했습니다.");
    if (state.pendingCapture && !state.captureRunning) {
      runCapture(state.pendingCapture, true);
    }
  });

  $("#closeAppChrome").addEventListener("click", async () => {
    const result = await runAction(() => window.maxawon.closeAppChrome());
    if (!result) return;
    setLogin("미연결", false);
    addLog(result.message);
  });

  $("#closeAllChrome").addEventListener("click", async () => {
    const confirmed = window.confirm("사용자가 직접 연 Chrome까지 모두 종료합니다. 계속할까요?");
    if (!confirmed) return;

    const result = await runAction(() => window.maxawon.closeAllChrome());
    if (!result) return;
    setLogin("미연결", false);
    addLog(result.message);
  });

  $("#pickOutput").addEventListener("click", async () => {
    const selected = await runAction(() => window.maxawon.pickCaptureOutput(state.captureOutput));
    if (!selected) return;
    state.captureOutput = selected;
    $("#captureOutput").value = selected;
    addLog(`조건검색 저장 파일을 변경했습니다: ${selected}`);
  });

  $("#captureTable").addEventListener("click", async () => {
    if (!state.loginDone) {
      window.alert("Maxawon에 로그인한 뒤 '로그인 완료'를 누르세요.");
      return;
    }

    const maxPagesValue = $("#maxPages").value.trim();
    const maxPages = maxPagesValue === "" ? null : Number(maxPagesValue);
    if (maxPages !== null && (!Number.isInteger(maxPages) || maxPages < 1)) {
      window.alert("최대 페이지는 1 이상의 숫자로 입력하세요.");
      return;
    }

    await runCapture({
      maxPages,
      outputPath: state.captureOutput,
    });
  });

  $("#pickPptTemplate").addEventListener("click", async () => {
    const selected = await runAction(() => window.maxawon.pickPptTemplate());
    if (!selected) return;
    state.pptTemplatePath = selected;
    $("#pptTemplate").value = selected;
    addLog(`PPT 템플릿을 선택했습니다: ${selected}`);
  });

  $("#pickPptExcel").addEventListener("click", async () => {
    const selected = await runAction(() => window.maxawon.pickPptExcel());
    if (!selected) return;
    state.pptExcelPath = selected;
    state.pptExcelData = null;
    $("#pptExcel").value = selected;
    addLog(`PPT Forger 엑셀 파일을 선택했습니다: ${selected}`);
  });

  $("#pickPptOutput").addEventListener("click", async () => {
    const selected = await runAction(() => window.maxawon.pickPptOutput(state.pptOutputPath));
    if (!selected) return;
    state.pptOutputPath = selected;
    $("#pptOutput").value = selected;
    addLog(`PPT 저장 파일을 변경했습니다: ${selected}`);
  });

  $("#buildPptData").addEventListener("click", async () => {
    await buildPptData();
  });

  $("#generatePpt").addEventListener("click", async () => {
    if (state.pptRunning) return;
    if (!state.pptTemplatePath) {
      window.alert("PPT 템플릿을 선택하세요.");
      return;
    }
    if (!state.pptOutputPath) {
      window.alert("PPT 저장 파일을 선택하세요.");
      return;
    }

    let data;
    try {
      data = JSON.parse($("#pptData").value);
    } catch (_error) {
      data = await buildPptData();
      if (!data) return;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      window.alert("치환 데이터는 JSON 객체여야 합니다.");
      return;
    }

    state.pptRunning = true;
    $("#generatePpt").disabled = true;
    addLog("PPT 생성을 시작합니다.");
    try {
      const result = await window.maxawon.generatePpt({
        templatePath: state.pptTemplatePath,
        outputPath: state.pptOutputPath,
        data,
      });
      addLog(`PPT를 저장했습니다: ${result.outputPath}`);
    } catch (error) {
      addLog(error.message);
      window.alert(error.message);
    } finally {
      state.pptRunning = false;
      $("#generatePpt").disabled = false;
    }
  });

  $("#checkUpdates").addEventListener("click", async () => {
    state.updateAvailable = false;
    state.updateDownloaded = false;
    $("#downloadUpdate").disabled = true;
    $("#installUpdate").disabled = true;

    const result = await runAction(() => window.maxawon.checkForUpdates());
    if (!result) return;
    setUpdateStatus(result);
    addLog(result.message);
  });

  $("#downloadUpdate").addEventListener("click", async () => {
    const result = await runAction(() => window.maxawon.downloadUpdate());
    if (!result) return;
    setUpdateStatus(result);
    addLog(result.message);
  });

  $("#installUpdate").addEventListener("click", async () => {
    const confirmed = window.confirm("앱을 재시작하고 다운로드된 업데이트를 설치할까요?");
    if (!confirmed) return;

    const result = await runAction(() => window.maxawon.installUpdate());
    if (!result) return;
    setUpdateStatus(result);
    addLog(result.message);
  });

  $("#clearLog").addEventListener("click", () => {
    $("#logs").replaceChildren();
  });

  addLog("Chrome을 열고 직접 로그인한 뒤 '로그인 완료'를 누르세요.");
}

init();
