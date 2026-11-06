// 流量額度面板：Surge 面板腳本（type=generic）
//
// 讀什麼：只對 $argument 裡的 url 發一個 GET，請求頭帶
// Authorization: Bearer <token>。介面回傳 JSON：
//   { "generated_at": <秒>, "nodes": [ { "name", "status", "used_bytes",
//     "limit_bytes", "reset_at", "measured_from", "approximate" }, ... ] }
// 送出什麼：除了這一個請求，什麼都不送。不連其他主機，不存資料（不用
// $persistentStore），不發通知（不用 $notification），讀到的數字只顯示在
// 這個面板上。標題用 [Panel] 裡設定的 title。
//
//   [Panel]
//   流量 = script-name=流量, title=流量, content=打開策略頁時自動更新, update-interval=1800
//   [Script]
//   流量 = type=generic, timeout=10, script-path=<本檔固定提交網址>, argument=url=<介面網址>&token=<權杖>&title=<標題，網址編碼>
//
// 權杖與介面網址只放在私人設定檔，不放進本倉庫。

const args = {};
for (const part of (typeof $argument === "string" ? $argument : "").split("&")) {
  const i = part.indexOf("=");
  if (i > 0) args[part.slice(0, i)] = part.slice(i + 1);
}
// 標題：Surge 要腳本自己回傳 title，[Panel] 裡的 title 只在第一次執行前顯示。可用 title=（網址編碼）改。
let title = "流量";
try {
  if (args.title) title = decodeURIComponent(args.title);
} catch (e) {}

function show(content, style) {
  $done(style ? { title, content, style } : { title, content });
}

// 單位：額度是整數個十進位 GB、又不是整數個 GiB 時用 GB、TB，否則用 GiB、TiB；
// 已用量不換到比額度更大的單位。
function size(n, decimal, limit, maxUnit) {
  const base = decimal ? 1000 : 1024;
  const units = decimal ? ["B", "KB", "MB", "GB", "TB", "PB"] : ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let i = 0;
  while (n >= base && i < maxUnit && !(limit && i >= 3 && Number.isInteger(n) && !Number.isInteger(n / base))) {
    n /= base;
    i++;
  }
  const text = Number.isInteger(n) ? String(n) : n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1);
  return { text: text + " " + units[i], unit: i };
}

function day(seconds) {
  const d = new Date(seconds * 1000);
  return String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0");
}

function line(row) {
  const used = row.used_bytes, limit = row.limit_bytes;
  if (row.status === "unknown" || typeof used !== "number") return row.name + "：未知";
  const decimal = typeof limit === "number" && limit > 0 && limit % 1e9 === 0 && limit % 2 ** 30 !== 0;
  const cap = typeof limit === "number" ? size(limit, decimal, true, 5) : null;
  let text = row.name + "：" + (row.approximate ? "≈ " : "") + size(used, decimal, false, cap ? cap.unit : 5).text;
  text += cap ? " / " + cap.text : " 已用";
  if (row.measured_from) text += " · 自 " + day(row.measured_from) + " 起計量";
  else if (row.reset_at) text += " · " + day(row.reset_at) + " 重設";
  if (row.status === "stale") text += " · 資料過期";
  return text;
}

if (!args.url || !args.token) {
  show("設定缺少 url 或 token", "error");
} else {
  $httpClient.get({ url: args.url, headers: { Authorization: "Bearer " + args.token }, timeout: 8 }, (error, response, data) => {
    if (error || !response) return show("連不上介面。介面在 Tailscale 上的話，先在這台裝置的 Surge 登入 Tailscale。", "error");
    const refused = { 401: "權杖無效", 404: "介面沒有設定權杖", 429: "嘗試太多次，請稍後再試" };
    if (response.status !== 200) return show(refused[response.status] || "介面回應 " + response.status, "error");
    let reply = null;
    try {
      reply = JSON.parse(data);
    } catch (e) {}
    if (!reply || !Array.isArray(reply.nodes)) return show("回應格式不正確", "error");
    show(reply.nodes.map(line).join("\n") || "沒有節點");
  });
}
