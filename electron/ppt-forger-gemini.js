const fs = require("fs");
const path = require("path");

const DEFAULT_CUSTOM_PROMPT = "- 간결한 문장으로 작성하고, 예시와 같은 금융 분석 문체를 유지함.";

const DEFAULTS = {
  apiKeys: [],
  investmentModel: "gemini-1.5-pro",
  fallbackInvestmentModels: ["gemini-1.5-flash"],
  formattingModel: "gemini-2.5-flash",
  fallbackFormattingModels: ["gemini-2.0-flash-lite"],
  useSearchGrounding: true,
  prompts: {
    investmentSystem: `You are senior financial analyst. 주어진 기업의 핵심 투자 포인트를 정리하라.

### RULES
- 투자 포인트는 주가에 영향을 줄 수 있는 이벤트 중심으로 작성하라.
- 이미 시장에 널리 알려진 일반 경영 설명은 제외하라.
- 문장은 "-함, -임, -됨" 어미로 끝내라. "-니다"로 끝내지 마라.`,
    investmentCustom: DEFAULT_CUSTOM_PROMPT,
    priceSystem: `You are senior financial analyst. 주어진 기업의 최근 5년 주가 추이 특징을 정리하라.

### RULES
- 주가가 어떤 요인에 의해 움직이는지 설명하라.
- 급등락 구간이 있다면 원인을 설명하라.
- 문장은 "-함, -임, -됨" 어미로 끝내라. "-니다"로 끝내지 마라.`,
    priceCustom: DEFAULT_CUSTOM_PROMPT,
    riskSystem: `You are senior financial analyst. 주어진 기업의 상환가능성 분석 리스크를 정리하라.

### RULES
- 1번 포인트는 손익계산서 관점에서 상환 가능성과 향후 주가 업사이드를 분석하라.
- 2번 포인트는 재무상태표 관점에서 부채비율, 차입금의존도, 순차입금 등 상환 가능성 지표를 분석하라.
- 문장은 "-함, -임, -됨" 어미로 끝내라. "-니다"로 끝내지 마라.`,
    riskCustom: DEFAULT_CUSTOM_PROMPT,
  },
};

function readSettings(settingsPath) {
  try {
    if (!fs.existsSync(settingsPath)) return DEFAULTS;
    const saved = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return {
      ...DEFAULTS,
      ...saved,
      prompts: {
        ...DEFAULTS.prompts,
        ...(saved.prompts || {}),
      },
    };
  } catch {
    return DEFAULTS;
  }
}

function writeSettings(settingsPath, settings) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const merged = {
    ...readSettings(settingsPath),
    ...settings,
    prompts: {
      ...readSettings(settingsPath).prompts,
      ...(settings.prompts || {}),
    },
  };
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

function extractJson(text) {
  const fenced = String(text || "").match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonText = fenced ? fenced[1] : text;
  return JSON.parse(jsonText);
}

async function fetchWithFallback({ apiKeys, models, body }) {
  const validKeys = apiKeys.map((key) => key.trim()).filter(Boolean);
  if (validKeys.length === 0) throw new Error("Gemini API 키를 입력하세요.");

  const validModels = models.map((model) => model.trim()).filter(Boolean);
  for (const model of validModels) {
    for (const apiKey of validKeys) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) return response;
      if (response.status === 429) continue;

      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Gemini 요청 실패: HTTP ${response.status}`);
    }
  }

  throw new Error("Gemini API 키 또는 모델이 모두 rate limit에 도달했습니다.");
}

function buildSchema(kind) {
  if (kind === "investment") {
    return {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          contents1: { type: "STRING" },
          contents2: { type: "STRING" },
        },
        required: ["title", "contents1", "contents2"],
      },
    };
  }

  if (kind === "risk") {
    return {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          contents1: { type: "STRING" },
        },
        required: ["title", "contents1"],
      },
    };
  }

  return {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
      },
      required: ["title"],
    },
  };
}

function buildPrompt({ kind, settings, companyInfo, financialData }) {
  if (kind === "investment") {
    return `${settings.prompts.investmentSystem}

[추가 시스템 지침]
${settings.prompts.investmentCustom}

[분석할 기업 정보]
${companyInfo}

[지시사항]
핵심 투자 포인트 3가지를 다음 JSON 배열 형식으로만 출력하라:
[
  { "title": "투자포인트1 제목", "contents1": "내용1", "contents2": "내용2" },
  { "title": "투자포인트2 제목", "contents1": "내용1", "contents2": "내용2" },
  { "title": "투자포인트3 제목", "contents1": "내용1", "contents2": "내용2" }
]`;
  }

  if (kind === "risk") {
    return `${settings.prompts.riskSystem}

[추가 시스템 지침]
${settings.prompts.riskCustom}

[분석할 기업 정보]
${companyInfo}

[재무 데이터]
${JSON.stringify(financialData || {}, null, 2)}

[지시사항]
리스크 포인트 2가지를 다음 JSON 배열 형식으로만 출력하라:
[
  { "title": "리스크1 제목", "contents1": "내용1" },
  { "title": "리스크2 제목", "contents1": "내용2" }
]`;
  }

  return `${settings.prompts.priceSystem}

[추가 시스템 지침]
${settings.prompts.priceCustom}

[분석할 기업 정보]
${companyInfo}

[지시사항]
주가 흐름 특징 2가지를 다음 JSON 배열 형식으로만 출력하라:
[
  { "title": "주가 흐름 특징 1" },
  { "title": "주가 흐름 특징 2" }
]`;
}

function validateItems(kind, parsed) {
  if (!Array.isArray(parsed)) throw new Error("Gemini 응답에서 JSON 배열을 찾지 못했습니다.");
  const requiredCount = kind === "investment" ? 3 : 2;
  if (parsed.length < requiredCount) throw new Error(`Gemini 응답 개수가 부족합니다. 필요: ${requiredCount}, 반환: ${parsed.length}`);

  return parsed.slice(0, requiredCount).map((item, index) => {
    const title = item.title?.trim();
    if (!title) throw new Error(`${index + 1}번째 항목에 title이 없습니다.`);
    if (kind === "price") return { title };

    const contents1 = item.contents1?.trim();
    if (!contents1) throw new Error(`${index + 1}번째 항목에 contents1이 없습니다.`);
    if (kind === "risk") return { title, contents1 };

    const contents2 = item.contents2?.trim();
    if (!contents2) throw new Error(`${index + 1}번째 항목에 contents2가 없습니다.`);
    return { title, contents1, contents2 };
  });
}

async function generateKind({ kind, settings, companyInfo, financialData }) {
  const prompt = buildPrompt({ kind, settings, companyInfo, financialData });
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: buildSchema(kind),
    },
  };

  if (settings.useSearchGrounding && kind !== "risk") {
    body.tools = [{ googleSearch: {} }];
  }

  const response = await fetchWithFallback({
    apiKeys: settings.apiKeys || [],
    models: [
      kind === "investment" ? settings.investmentModel : settings.formattingModel,
      ...(kind === "investment" ? settings.fallbackInvestmentModels : settings.fallbackFormattingModels || []),
    ],
    body,
  });
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return validateItems(kind, extractJson(text));
}

function toAiText({ investmentPoints, pricePoints, riskPoints }) {
  return {
    investment_text_title1: investmentPoints?.[0]?.title || "",
    investment_text_contents1_1: investmentPoints?.[0]?.contents1 || "",
    investment_text_contents1_2: investmentPoints?.[0]?.contents2 || "",
    investment_text_title2: investmentPoints?.[1]?.title || "",
    investment_text_contents2_1: investmentPoints?.[1]?.contents1 || "",
    investment_text_contents2_2: investmentPoints?.[1]?.contents2 || "",
    investment_text_title3: investmentPoints?.[2]?.title || "",
    investment_text_contents3_1: investmentPoints?.[2]?.contents1 || "",
    investment_text_contents3_2: investmentPoints?.[2]?.contents2 || "",
    price_text_title1: pricePoints?.[0]?.title || "",
    price_text_title2: pricePoints?.[1]?.title || "",
    risk_text_title1: riskPoints?.[0]?.title || "",
    risk_text_contents1_1: riskPoints?.[0]?.contents1 || "",
    risk_text_title2: riskPoints?.[1]?.title || "",
    risk_text_contents2_1: riskPoints?.[1]?.contents1 || "",
  };
}

async function generateGeminiText({ settings, companyInfo, financialData, options = {} }) {
  const selected = {
    investment: options.investment !== false,
    price: options.price !== false,
    risk: options.risk !== false,
  };

  const [investmentPoints, pricePoints, riskPoints] = await Promise.all([
    selected.investment ? generateKind({ kind: "investment", settings, companyInfo, financialData }) : Promise.resolve([]),
    selected.price ? generateKind({ kind: "price", settings, companyInfo, financialData }) : Promise.resolve([]),
    selected.risk ? generateKind({ kind: "risk", settings, companyInfo, financialData }) : Promise.resolve([]),
  ]);

  return {
    investmentPoints,
    pricePoints,
    riskPoints,
    aiText: toAiText({ investmentPoints, pricePoints, riskPoints }),
  };
}

module.exports = {
  DEFAULTS,
  generateGeminiText,
  readSettings,
  writeSettings,
};
