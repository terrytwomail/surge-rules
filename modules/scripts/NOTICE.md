# 腳本的來源與改動

這個資料夾的腳本不是逐字轉載，是改寫：以上游的腳本為底，只留去廣告的部分，修掉會讓腳本中途失敗的錯。上游以 GPL-3.0 發布（全文在同目錄的 `LICENSE`），本倉庫的改寫同樣以 GPL-3.0 發布。審核紀錄見 `audits/2026-11-06-App去廣告腳本.md`。

| 檔案 | 改自 | 上游提交 | 原檔 SHA-256 |
|---|---|---|---|
| `bilibili-adblock.js` | zirawell/R-Store `Res/Scripts/AntiAd/bilibiliJson.js`（上游再改自 fmz200/wool_scripts `Scripts/bilibili/json.js`） | `007edba6a65193fffcaf835bbb859af42e13ff93`（2026-11-05） | `e201c01e4d4dbc415ef8dd25b75a4382f8de323c4bd4266dbe8559687c569c3d` |
| `zhihu-adblock.js` | zirawell/R-Store `Res/Scripts/AntiAd/zhihu.js`（上游轉自 RuCu6/QuanX `Scripts/zhihu.js`） | 同上 | `ac5ba31a6f4f6c6cc3c5896f846ddb692268b3aa4c580c1b9996e9a786b44c23` |

兩支都只讀 `$request.url` 與 `$response.body`，不發任何請求、不存資料、不發通知、不讀 Cookie 與帳號資料。回應不是 JSON 時原樣放行。

## bilibili-adblock.js

保留：開屏廣告（`/x/v2/splash/`）、首頁推薦信息流（`/x/v2/feed/index`）、豎屏信息流（`/feed/index/story`）、搜尋頁（`/x/v2/search/square`）、影視頁（`/pgc/page/`）、直播間（`/index/getInfoByRoom`）。

改動：
- 首頁信息流原本是白名單，只留 `card_goto === "av"` 的一般影片卡，番劇、直播卡也會被拿掉。改成只拿掉廣告卡：有 `ad_info`、`card_goto`／`goto` 以 `ad` 開頭、`card_type` 以 `cm` 開頭、或 `card_goto` 以 `banner` 開頭的。新的廣告格式可能漏掉，上游更新時比對。
- 豎屏信息流原本連 `vertical_live`、`vertical_pgc`（直播、大會員內容）一起拿掉，改成只拿掉廣告卡與 `vertical_ad_av`；不再刪 `creative_entrance`、`story_cart_icon`。
- 不收：底部標籤與頂部標籤的白名單重排（`/x/resource/show/tab/`）、「我的」頁面項目刪減、把帳號改成年度大會員並解鎖會員畫質（`/account/mine`、`/account/mine/ipad`、`/account/myinfo`）。
- 結構改成函式，JSON 解析失敗時原樣放行；原本 `if (!$response.body) $done({})` 後沒有 `return`，會接著對空內容做 `JSON.parse`。

## zhihu-adblock.js

保留：回答與文章的推薦閱讀（`/api/v*/answers|articles/*/recommendation`）、首頁懸浮推廣圖示（`app_float_layer`）、關注頁的「為您推薦」（`/moments_v3`）、內容頁下一篇裡的廣告（`/next-bff`、`/next-data`、`/next-render`）、問題頁附帶的廣告（`/questions/`）、熱榜的合作推廣與品牌甄選（`hot-lists/everyone-seeing`、`hot-lists/total`）、推薦信息流的廣告卡、營銷卡、偽裝成內容的廣告（`/topstory/recommend`）、關掉 App 自帶的 HTTPDNS 與備用 IP（`appcloud2.zhihu.com/v*/config` 的 `zhcnh_thread_sync`，不關的話網域規則攔不到它）。

改動：
- 類型比對原本用 `includes("ad")`，`read`、`thread`、`header` 都會中；改成只認獨立出現的 `ad`（`ad`、`ad_card`、`feed_ad`）。
- 修錯：`app_float_layer` 原本寫 `delete obj`（對 `let` 變數無效，等於沒作用），改成 `delete obj.feed_egg`；推薦信息流的 `market_card` 分支用到沒定義的變數 `item`，一碰到就整支中斷，連同改影片 id 的三段一起拿掉；`if (!$response.body) $done({})` 後沒有 `return`。
- 不收：隱藏付費回答與鹽選內容（不是廣告）、`next-render` 裡刪掉 `biz_type_list` 含 article／content 的項目（太寬）、`next_guide` 的「下一個推薦」、`query_info`、直播卡與熱榜橫排卡、首頁標籤與二級標籤的刪減、灰色主題與頂部活動圖、`zombie_conf`、`zvideo_max_number`、`is_show_followguide_alert`、`ZHHTTPSessionManager_setupZHHTTPHeaderField`（用途不明）、會員頁的推銷橫幅（上游模組沒有把那個網址送進腳本）。
- `offset` 重新編號只對本來就有 `offset` 的項目做。
