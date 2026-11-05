// 知乎去廣告（Surge http-response 腳本）
//
// 改自 zirawell/R-Store 的 Res/Scripts/AntiAd/zhihu.js（GPL-3.0，提交 007edba6a651，
// 原檔 SHA-256 ac5ba31a6f4f…），它又轉自 RuCu6/QuanX 的 Scripts/zhihu.js。
// 授權全文在同目錄的 LICENSE；留了什麼、拿掉了什麼、修了哪些錯寫在 NOTICE.md。
//
// 讀什麼：$request.url、$response.body。
// 送出什麼：什麼都不送。不連任何主機、不存資料、不發通知、不讀 Cookie 與帳號資料。
// 只拿掉標成廣告、合作推廣、品牌甄選、營銷的項目，以及首頁的懸浮推廣圖示；
// 原腳本改介面（標籤、灰色主題、影片數）、隱藏付費內容、改影片 id 的部分沒有收進來。

// 類型字串裡獨立出現的 ad（ad、ad_card、feed_ad）才算廣告；read、thread、header 不算
function isAdType(value) {
  return typeof value === "string" && /(^|_)ad(_|$)/.test(value);
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function clean(url, obj) {
  if (!obj || typeof obj !== "object") return;
  const data = obj.data;

  if (/\/api\/v\d+\/answers\/\d+\/recommendation/.test(url)) {
    // 回答頁的推薦閱讀：清空
    delete obj.data;
    delete obj.paging;
  } else if (/\/api\/v\d+\/articles\/\d+\/recommendation/.test(url)) {
    // 文章頁的廣告與推薦閱讀
    delete obj.ad_info;
    delete obj.paging;
    delete obj.recommend_info;
  } else if (/^https?:\/\/appcloud2\.zhihu\.com\/v\d+\/config/.test(url)) {
    // 讓 App 不用自己的 HTTPDNS 與備用 IP、改走系統 DNS，否則上面的網域規則攔不到它
    const sync = obj.config && obj.config.zhcnh_thread_sync;
    if (sync && typeof sync === "object") {
      sync.LocalDNSSetHostWhiteList = [];
      sync.isOpenLocalDNS = "0";
      sync.ZHBackUpIP_Switch_Open = "0";
      sync.dns_ip_detector_operation_lock = "1";
    }
  } else if (url.includes("/commercial_api/app_float_layer")) {
    // 首頁懸浮推廣圖示
    delete obj.feed_egg;
  } else if (url.includes("/moments_v3")) {
    // 關注頁夾帶的「為您推薦」
    if (Array.isArray(data)) obj.data = data.filter((item) => !text(item && item.title).includes("为您推荐"));
  } else if (url.includes("/next-bff")) {
    if (Array.isArray(data)) {
      obj.data = data.filter((item) => {
        const origin = (item && item.origin_data) || {};
        return !(isAdType(origin.type) || isAdType(origin.resource_type));
      });
    }
  } else if (url.includes("/next-data")) {
    if (data && Array.isArray(data.data)) data.data = data.data.filter((item) => !isAdType(item && item.type));
  } else if (url.includes("/next-render")) {
    if (Array.isArray(data)) obj.data = data.filter((item) => !(item && (item.adjson || isAdType(item.type))));
  } else if (url.includes("/questions/")) {
    // 問題頁回答列表附帶的廣告
    if (data && typeof data === "object") delete data.ad_info;
    delete obj.ad_info;
  } else if (url.includes("/topstory/hot-lists/everyone-seeing")) {
    // 熱榜信息流裡的合作推廣
    if (data && Array.isArray(data.data)) {
      data.data = data.data.filter((item) => {
        const area = item && item.target && item.target.metrics_area;
        return !text(area && area.text).includes("合作推广");
      });
    }
  } else if (url.includes("/topstory/hot-lists/total")) {
    // 熱榜排行榜裡的品牌甄選
    if (Array.isArray(data)) obj.data = data.filter((item) => !(item && Object.prototype.hasOwnProperty.call(item, "ad")));
  } else if (url.includes("/topstory/recommend")) {
    // 推薦信息流：廣告卡、營銷卡、偽裝成內容的廣告
    if (!Array.isArray(data)) return;
    obj.data = data.filter((item) => {
      if (!item || typeof item !== "object") return true;
      if (item.type === "feed_advert") return false;
      if (item.promotion_extra) return false;
      if (item.type === "common_card") {
        const card = item.common_card || {};
        const footline = card.footline && card.footline.elements && card.footline.elements[0];
        if (text(footline && footline.text && footline.text.panel_text).includes("广告")) return false;
      }
      return true;
    });
    obj.data.forEach((item, index) => {
      if (item && typeof item === "object" && "offset" in item) item.offset = index + 1;
    });
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
