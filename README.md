# surge-rules

Surge 規則審核庫。設定檔用到的外部規則清單，一律指向**審核過的那一次提交**，不會因為上游改了什麼就跟著變。

## 運作方式

1. **上游**：Sukka 的成品倉庫 `SukkaLab/ruleset.skk.moe`（也就是 ruleset.skk.moe 背後的檔案），以及 `dler-io/Rules`。
2. **固定**：`lock.json` 記下每個上游採用的提交編號，以及每個使用中的檔案在那次提交的 SHA-256。
3. **引用**：設定檔用 jsDelivr 的固定提交網址，例如
   `https://fastly.jsdelivr.net/gh/SukkaLab/ruleset.skk.moe@<提交編號>/List/non_ip/ai.conf`。
   同一個網址的內容永遠不變，上游就算改檔、刪檔、強制推送，都影響不到你。
4. **換版本**：每週一自動比對上游，有變化就開一個 issue 附差異報告。看過、確認沒問題，才執行 `bump` 換到新提交，再重新產生設定檔。

## 為什麼用 jsDelivr 的 Fastly 鏡像

2026-11-05 從中國大陸家用寬頻直連實測，不經代理，取同一個 213 KB 檔案：

| 主機 | 結果 |
|---|---|
| fastly.jsdelivr.net | 三次都成功，0.36–1.0 秒 |
| cdn.jsdelivr.net、testingcf.jsdelivr.net | 都成功，1.2–3 秒 |
| raw.githubusercontent.com | 三次裡一次逾時、一次只收到一部分 |

jsDelivr 不用註冊。公開的 GitHub 倉庫自動可用，網址格式是 `/gh/擁有者/倉庫@提交編號/路徑`。單一檔案上限 20 MB，目前最大的 Sukka 去廣告清單約 3.3 MB。Fastly 若某天不穩，把 `lock.json` 的 `cdn` 換成 `https://testingcf.jsdelivr.net/gh`，重新產生設定檔即可。

## GitHub 上應有的設定

- 公開倉庫，推送用只對本倉庫有效的部署金鑰（Settings → Deploy keys，允許寫入）。
- Settings → Actions → General：只允許本帳號的 Action（工作流程沒用任何 Action，連 checkout 都用 git 自己做）；Workflow permissions 選 Read，不允許 Actions 建立或核准 PR。開 issue 的權限由工作流程檔自己宣告（`contents: read`、`issues: write`）。
- Settings → Rules：main 分支禁止刪除、禁止強制推送。
- 帳號開兩步驟驗證。這個倉庫放著會在裝置上執行的腳本，帳號被盜等於腳本被換。

## 換版本流程

```
python tools/audit.py report --out audits/<日期>-報告.md
# 逐項看完，結論寫進 audits/<日期>.md
python tools/audit.py bump SUKKA <新提交編號> --i-reviewed
python tools/render.py <私人範本> <輸出的設定檔>
# 把輸出的設定檔放回設定檔的託管位置
```

範本含私人規則，放在倉庫以外的私人資料夾，不進本倉庫。

## 面板腳本（不用 MitM）

本倉庫不收 MitM 模組。MitM 要在裝置上安裝並信任一張根憑證，憑證私鑰外流就能解密那台裝置的所有 HTTPS；擁有者 2026-11-07 決定設定檔不用 MitM，之前的網頁去廣告模組、替身腳本、App 去廣告腳本已整個移除（紀錄在 git 歷史）。

`modules/stream-check.js` 是解鎖檢測面板：對 Netflix、YouTube Premium、ChatGPT、Claude、TikTok 自己的網址各發請求，顯示能不能用、出口地區。不帶 Cookie、不存資料、不攔截或改寫任何請求。審核紀錄見 `audits/2026-11-07-解鎖檢測面板.md`。它列在 `lock.json` 的 `OWN`，設定檔用 `OWN/modules/stream-check.js` 引用，產生時換成本倉庫固定提交的網址。

凡是會執行的程式都照這個做法：放進本倉庫、固定提交，不從別人的位址載入；沒有授權允許轉載的不收。

## 自動檢查會標出什麼

- 去廣告類清單會擋到 `own/protect.txt` 裡的常用網域本身。
- 過寬的 IP 段（IPv4 /8 以下、IPv6 /16 以下）、三個字以下的關鍵字、整個頂級網域。
- 一般網域與 IP 以外的規則類型，例如 URL-REGEX、PROCESS-NAME、USER-AGENT。
- 條數變動超過 20%，或上游刪掉了使用中的檔案。

腳本不做逐條檢查，只核對雜湊；腳本的逐行審核寫在 `audits/`。每週報告只比對 Sukka 與 dler：上游有新提交、而且使用中的檔案真的變了才開 issue。本倉庫自己（`OWN`）不列入，因為改動在提交時就審過，而它固定的提交必然比最新提交舊一個（寫 `lock.json` 本身就是下一個提交）。

## 授權

- Sukka 的規則：AGPL-3.0，本倉庫只引用、不轉載。
- dler-io/Rules：沒有授權聲明，本倉庫只引用、不轉載。
- `tools/`、`own/`：倉庫擁有者自有。

## 改了本倉庫的腳本之後

1. 提交腳本並推送。
2. `python tools/audit.py bump OWN <那次提交> --i-reviewed`（會從 GitHub 抓回來重算雜湊，所以要先推送），再提交 `lock.json`、推送。
3. 重新產生設定檔，`OWN/` 開頭的網址就換到新的固定提交。
