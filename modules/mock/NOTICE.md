# 替身腳本的來源

這個資料夾的 13 支 JavaScript 不是本倉庫寫的，逐字複製自 Sukka 的成品倉庫
`SukkaLab/ruleset.skk.moe`，提交 `1e2d60f94a463d8f17bda1955a36d6a1170a0abb`（審核日 2026-11-05）的 `Mock/` 目錄。
那個倉庫以 AGPL-3.0 發布，授權全文在同目錄的 `LICENSE`；本倉庫原樣轉載、沒有修改。
它們的更上游是 uBlock Origin 的 redirect resources（GPL-3.0）與 AdGuard Scriptlets（MIT），
Sukka 把兩者編譯成單檔。

每支的用途一樣：定義網頁廣告、分析腳本會用到的同名函式與物件，讓網頁以為腳本已載入、
不報錯，實際上什麼都不做。審核紀錄見 `audits/2026-11-05-MitM模組.md`：
沒有任何網路請求、不碰 Cookie 與本機儲存、沒有 eval。

為什麼要複製而不是引用：Surge 的 302 改寫會讓瀏覽器真的去載入這些檔案並在網頁裡執行，
所以它們只能來自本倉庫自己固定的提交，不能來自任何別人能改的位址。
`lock.json` 仍然記著上游這些檔案的雜湊，上游一改，每週的檢查就會標出來，再決定要不要重新審核、重新複製。

| 檔案 | 複製時的 SHA-256（前 16 位） |
|---|---|
| `www-google-analytics-com_analytics.js` | `2420c48f85c52918…` |
| `www-google-analytics-com_ga.js` | `1255b492eb7f1692…` |
| `www-google-analytics-com_cx_api.js` | `8ddb6e6348171b1e…` |
| `www-googlesyndication-com_adsbygoogle.js` | `2b009a2e432009a2…` |
| `www-googletagservices-com_gpt.js` | `af03bdce9374b739…` |
| `www-google-analytics-com_inpage_linkid.js` | `dc092398eb30b2d7…` |
| `doubleclick-net_instream_ad_status.js` | `eed0dc1fdb5d97ed…` |
| `ampproject-org_v0.js` | `a9121b9c725cc12e…` |
| `addthis-com_addthis_widget.js` | `0c324e50f4b978a9…` |
| `amazon-adsystem-com_amazon-apstag.js` | `6d4bcf2a27391143…` |
| `static-chartbeat-com_chartbeat_mab.js` | `3d4c81216d334706…` |
| `widgets-outbrain-com_outbrain.js` | `fd99981a941b3dbf…` |
| `securepubads-g-doubleclick-net_tag_js_gpt.js` | `52688d48cdc2e8e7…` |