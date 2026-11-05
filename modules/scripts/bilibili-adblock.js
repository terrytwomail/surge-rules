// 哔哩哔哩去廣告（Surge http-response 腳本）
//
// 改自 zirawell/R-Store 的 Res/Scripts/AntiAd/bilibiliJson.js（GPL-3.0，提交 007edba6a651，
// 原檔 SHA-256 e201c01e4d4d…），它又改自 fmz200/wool_scripts 的 Scripts/bilibili/json.js。
// 授權全文在同目錄的 LICENSE；留了什麼、拿掉了什麼寫在 NOTICE.md。
//
// 讀什麼：$request.url、$response.body。
// 送出什麼：什麼都不送。不連任何主機、不存資料、不發通知、不讀 Cookie 與帳號資料。
// 只改這幾種回應：開屏廣告、首頁推薦信息流、豎屏信息流、搜尋框填充、影視頁的橫幅與推廣、
// 直播間帶貨。原腳本把帳號改成年度大會員、改底部標籤、改「我的」頁面的部分沒有收進來。

const FAR_FUTURE_START = 3818332800; // 2090-12-31 00:00:00 UTC
const FAR_FUTURE_END = 3818419199; // 2090-12-31 23:59:59 UTC
const ONE_YEAR = 31536000;

function isAdCard(item) {
  if (!item || typeof item !== "object") return false;
  if (item.ad_info) return true;
  const goto = String(item.card_goto || item.goto || "");
  const type = String(item.card_type || "");
  return goto.startsWith("ad") || goto.startsWith("banner") || type.startsWith("cm");
}

function clean(url, obj) {
  const data = obj && obj.data;
  if (url.includes("/x/v2/splash/")) {
    // 開屏廣告：清掉素材與事件，把下次拉取的間隔推到一年後，剩下的素材時長歸零、排到 2090 年
    if (!data) return;
    for (const key of ["account", "event_list", "preload", "show"]) delete data[key];
    if (data.max_time) data.max_time = 0;
    if (data.min_interval) data.min_interval = ONE_YEAR;
    if (data.pull_interval) data.pull_interval = ONE_YEAR;
    if (Array.isArray(data.list)) {
      for (const item of data.list) {
        item.duration = 0;
        item.enable_pre_download = false;
        item.begin_time = FAR_FUTURE_START;
        item.end_time = FAR_FUTURE_END;
      }
    }
  } else if (url.includes("/x/v2/feed/index/story")) {
    // 豎屏信息流：只拿掉廣告卡
    if (data && Array.isArray(data.items)) {
      data.items = data.items.filter((item) => !isAdCard(item) && item.card_goto !== "vertical_ad_av");
    }
  } else if (url.includes("/x/v2/feed/index?")) {
    // 首頁推薦信息流：拿掉廣告卡與橫幅卡，其餘（影片、番劇、直播）照舊
    if (data && Array.isArray(data.items)) data.items = data.items.filter((item) => !isAdCard(item));
    if (data && data.config && data.config.toast && data.config.toast.has_toast) data.config.toast.has_toast = false;
  } else if (url.includes("/x/v2/search/square")) {
    // 搜尋頁：只留搜尋歷史，不顯示熱搜與推廣詞
    if (data) obj.data = { type: "history", title: "搜索历史", search_hotword_revision: 2 };
  } else if (url.includes("/pgc/page/")) {
    // 影視頁：橫幅只留能播的、功能區只留站內連結，推廣模組清空
    const modules = obj && obj.result && obj.result.modules;
    if (!Array.isArray(modules)) return;
    for (const mod of modules) {
      const style = String((mod && mod.style) || "");
      if (!Array.isArray(mod.items)) continue;
      if (style.startsWith("banner")) {
        mod.items = mod.items.filter((item) => item && typeof item.link === "string" && item.link.includes("play"));
      } else if (style.startsWith("function")) {
        mod.items = mod.items.filter((item) => item && typeof item.blink === "string" && item.blink.startsWith("bilibili"));
      } else if ([241, 1283, 1284, 1441].includes(mod.module_id) || style.startsWith("tip")) {
        mod.items = [];
      }
    }
  } else if (url.includes("/index/getInfoByRoom")) {
    // 直播間：拿掉活動橫幅、帶貨資訊與購物分頁
    if (!data) return;
    delete data.activity_banner_info;
    if (data.shopping_info) data.shopping_info = { is_show: 0 };
    const tabs = data.new_tab_info && data.new_tab_info.outer_list;
    if (Array.isArray(tabs)) data.new_tab_info.outer_list = tabs.filter((tab) => !tab || tab.biz_id !== 33);
  }
}

let body = $response.body;
if (typeof body === "string" && body) {
  try {
    const obj = JSON.parse(body);
    clean($request.url, obj);
    body = JSON.stringify(obj);
  } catch (e) {
    body = $response.body; // 不是 JSON 就原樣放行
  }
}
$done(body === $response.body ? {} : { body });
