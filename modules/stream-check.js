// 解鎖檢測面板：Surge 面板腳本（type=generic）
//
// 看什麼：Netflix、YouTube Premium、ChatGPT、Claude、TikTok 用現在的設定能不能用、出口在哪個地區。
// 怎麼看：對每個服務自己的網址發 GET。請求照設定檔的規則分流，所以結果就是平常用的那條路
// （Netflix 走影音那組、ChatGPT 走 AI 那組……）。
//   Netflix：先請求 /title/70143836（授權片），從轉址網址讀地區；200 = 片庫完整，
//            404 再看 /title/81280792（自製劇），200 = 只有自製劇；403 = 這個 IP 被擋。
//   YouTube Premium：/premium 頁面的 "GL" 是地區；頁面寫 Premium is not available in your country 就是不能訂。
//   ChatGPT：api.openai.com/compliance/cookie_requirements 回 unsupported_country 就是不支援；
//            地區看 chatgpt.com/cdn-cgi/trace 的 loc。
//   Claude：地區看 claude.ai/cdn-cgi/trace 的 loc，落在 Anthropic 不提供服務的地區就標不支援。
//   TikTok：首頁被轉到 /about 就是這個地區不能用；否則頁面的 "region" 是地區。
//   Disney+ 沒放：它的地區要先向 Disney 註冊裝置才查得到，網頁本身看不出來。
// 送出什麼：只有上面這些請求，都連到被檢測的服務自己；不帶也不存 Cookie（auto-cookie 關掉）、
// 不用 $persistentStore、不發通知。每次約 1–2 MB（Netflix 與 YouTube 的頁面）。
//
//   [Panel]
//   解鎖檢測 = script-name=解鎖檢測, title=解鎖檢測, content=打開策略頁時自動更新, update-interval=3600
//   [Script]
//   解鎖檢測 = type=generic, timeout=30, script-path=<本檔固定提交網址>

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const NAMES = {
  TW: "台灣", HK: "香港", MO: "澳門", CN: "中國大陸", JP: "日本", KR: "韓國", SG: "新加坡", US: "美國",
  CA: "加拿大", GB: "英國", DE: "德國", FR: "法國", NL: "荷蘭", AU: "澳洲", MY: "馬來西亞", TH: "泰國",
  VN: "越南", PH: "菲律賓", ID: "印尼", IN: "印度", TR: "土耳其", AR: "阿根廷", BR: "巴西", RU: "俄羅斯",
};
// Anthropic 不提供服務、常見於代理出口的地區（只列確定的）
const CLAUDE_BLOCKED = ["CN", "HK", "MO", "RU", "BY", "IR", "KP", "SY", "CU"];

function where(cc) {
  return cc ? NAMES[cc] || cc : "";
}

function get(url, extra) {
  const options = Object.assign(
    { url, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, timeout: 10, "auto-cookie": false },
    extra || {}
  );
  return new Promise((resolve) => {
    $httpClient.get(options, (error, response, data) => {
      if (error || !response) resolve({ error: String(error || "沒有回應") });
      else resolve({ status: response.status, headers: response.headers || {}, data: typeof data === "string" ? data : "" });
    });
  });
}

function header(headers, name) {
  for (const key in headers) if (key.toLowerCase() === name) return String(headers[key]);
  return "";
}

function trace(r) {
  const m = r && !r.error && r.status === 200 ? r.data.match(/^loc=([A-Z]{2})\r?$/m) : null;
  return m ? m[1] : "";
}

// 每個檢測回傳 { ok: true | false | null, text, cc }；null = 連不上，不算判斷結果
async function netflix() {
  const first = await get("https://www.netflix.com/title/70143836", { "auto-redirect": false });
  if (first.error) return { ok: null, text: "連不上" };
  if (first.status === 403) return { ok: false, text: "這個 IP 被擋" };
  let cc = "US";
  let r = first;
  let base = "https://www.netflix.com/title/";
  if (first.status >= 300 && first.status < 400) {
    const loc = header(first.headers, "location");
    const m = loc.match(/^https:\/\/www\.netflix\.com\/([a-z]{2})(?:-[a-z]+)?\/title\//i);
    if (!m) return { ok: false, text: "被轉到別的頁面" };
    cc = m[1].toUpperCase();
    base = loc.slice(0, loc.indexOf("/title/") + 7);
    r = await get(loc, { "auto-redirect": false });
    if (r.error) return { ok: null, text: "連不上" };
  }
  if (r.status === 200) return { ok: true, text: "片庫完整", cc };
  if (r.status === 403) return { ok: false, text: "這個 IP 被擋", cc };
  if (r.status === 404) {
    const own = await get(base + "81280792", { "auto-redirect": false });
    if (!own.error && own.status === 200) return { ok: true, text: "只有自製劇", cc };
    return { ok: false, text: "這個地區沒有服務", cc };
  }
  return { ok: false, text: "回應 " + r.status, cc };
}

async function youtube() {
  const r = await get("https://www.youtube.com/premium");
  if (r.error) return { ok: null, text: "連不上" };
  const m = r.data.match(/"GL":"([A-Z]{2})"/) || r.data.match(/"countryCode":"([A-Z]{2})"/);
  const cc = m ? m[1] : "";
  if (/Premium is not available in your country/i.test(r.data)) return { ok: false, text: "這個地區不能訂", cc };
  if (r.status !== 200) return { ok: false, text: "回應 " + r.status, cc };
  return { ok: true, text: "可以訂", cc };
}

async function chatgpt() {
  const [c, t] = await Promise.all([
    get("https://api.openai.com/compliance/cookie_requirements"),
    get("https://chatgpt.com/cdn-cgi/trace"),
  ]);
  const cc = trace(t);
  if (c.error) return { ok: null, text: "地區檢查連不上", cc };
  let body;
  try { body = JSON.parse(c.data); } catch (_) { return { ok: null, text: "無法判讀回應", cc }; }
  if (body && body.error && body.error.code === "unsupported_country") return { ok: false, text: "不支援這個地區", cc };
  if (c.status !== 200) return { ok: null, text: "回應 " + c.status, cc };
  if (!body || typeof body !== "object" || Array.isArray(body) || body.error || typeof body.cookie_consent_required !== "boolean") {
    return { ok: null, text: "無法判讀回應", cc };
  }
  return { ok: true, text: "地區檢查通過", cc };
}

async function claude() {
  const t = await get("https://claude.ai/cdn-cgi/trace");
  if (t.error) return { ok: null, text: "連不上" };
  const cc = trace(t);
  if (t.status !== 200) return { ok: null, text: "回應 " + t.status };
  if (!cc) return { ok: null, text: "無法判讀出口地區" };
  if (CLAUDE_BLOCKED.indexOf(cc) >= 0) return { ok: false, text: "不支援這個地區", cc };
  return { ok: true, text: "出口地區未列為封鎖", cc };
}

async function tiktok() {
  const r = await get("https://www.tiktok.com/", { "auto-redirect": false });
  if (r.error) return { ok: null, text: "連不上" };
  if (r.status >= 300 && r.status < 400) {
    if (/\/about/.test(header(r.headers, "location"))) return { ok: false, text: "這個地區不能用" };
    return { ok: null, text: "轉址結果無法判定" };
  }
  const m = r.data.match(/"region":"([A-Z]{2})"/);
  if (r.status !== 200 || !m) return { ok: null, text: r.status !== 200 ? "回應 " + r.status : "無法判讀地區" };
  return { ok: true, text: "首頁地區檢查通過", cc: m[1] };
}

const CHECKS = [
  ["Netflix", netflix],
  ["YouTube Premium", youtube],
  ["ChatGPT", chatgpt],
  ["Claude", claude],
  ["TikTok", tiktok],
];

function mark(ok) {
  return ok === true ? "✅" : ok === false ? "❌" : "⚠️";
}

(async () => {
  const results = await Promise.all(
    CHECKS.map(([name, fn]) => fn().catch((e) => ({ ok: null, text: "檢測出錯" })).then((r) => [name, r]))
  );
  const lines = results.map(([name, r]) => {
    const place = where(r.cc);
    return mark(r.ok) + " " + name + "　" + r.text + (place ? "・" + place : "");
  });
  const now = new Date();
  lines.push("更新 " + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0"));
  const oks = results.map(([, r]) => r.ok);
  const style = oks.every((x) => x === null) ? "error" : oks.every((x) => x === true) ? "good" : "alert";
  $done({ title: "解鎖檢測", content: lines.join("\n"), style });
})();
