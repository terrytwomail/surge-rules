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

## 發布到 GitHub（做一次）

1. 在 GitHub 建一個**公開**倉庫 `surge-rules`，不要勾任何初始檔案。
2. 把本機這個資料夾推上去，指令見本檔最後。
3. 倉庫的 Settings → Actions → General：Workflow permissions 選 Read，另外允許建立 issue。工作流程檔已經只要求 `contents: read`、`issues: write`。
4. 帳號開兩步驟驗證。這個倉庫之後會放 MitM 模組的腳本，帳號被盜等於腳本被換。

## 換版本流程

```
python tools/audit.py report --out audits/<日期>-報告.md
# 逐項看完，結論寫進 audits/<日期>.md
python tools/audit.py bump SUKKA <新提交編號> --i-reviewed
python tools/render.py <私人範本> <輸出的設定檔>
# 把輸出的設定檔放回設定檔的託管位置
```

範本含私人規則，放在倉庫以外的私人資料夾，不進本倉庫。

## MitM 模組

`modules/` 放審核過的模組，`modules/src/` 是範本，同樣用 `tools/render.py` 產生固定提交網址。目前只有 `adblock-mitm.sgmodule`：模組本身只有改寫與擋；它把網頁的廣告、分析腳本改寫成 `modules/mock/` 裡的替身腳本。替身腳本逐字複製自 Sukka（AGPL-3.0，授權全文與來源在 `modules/mock/LICENSE`、`NOTICE.md`），由本倉庫自己的提交固定（`lock.json` 的 `OWN`），瀏覽器只會從本倉庫載入。審核紀錄見 `audits/2026-11-05-MitM模組.md`。在 Surge 裡用本倉庫固定提交的 jsDelivr 網址安裝。

`bilibili-adblock.sgmodule`、`zhihu-adblock.sgmodule` 是 App 的去廣告模組，腳本在 `modules/scripts/`：以 zirawell/R-Store 的腳本（GPL-3.0）為底改寫，只留去廣告的部分、修掉會中途失敗的錯，改了什麼寫在 `modules/scripts/NOTICE.md`，審核紀錄見 `audits/2026-11-06-App去廣告腳本.md`。

凡是會執行的程式都照這個做法：複製進本倉庫、固定提交，不從別人的位址載入；沒有授權允許轉載的不收。

`modules/usage-panel.js` 是面板腳本，不用 MitM：只向設定檔指定的一個網址讀流量額度，顯示在面板上。審核紀錄見 `audits/2026-11-06-流量面板腳本.md`。網址與權杖只寫在私人設定檔。

## 自動檢查會標出什麼

- 去廣告類清單會擋到 `own/protect.txt` 裡的常用網域本身。
- 過寬的 IP 段（IPv4 /8 以下、IPv6 /16 以下）、三個字以下的關鍵字、整個頂級網域。
- 一般網域與 IP 以外的規則類型，例如 URL-REGEX、PROCESS-NAME、USER-AGENT。
- 條數變動超過 20%，或上游刪掉了使用中的檔案。

## 授權

- Sukka 的規則：AGPL-3.0，本倉庫只引用、不轉載。
- dler-io/Rules：沒有授權聲明，本倉庫只引用、不轉載。
- `tools/`、`own/`：倉庫擁有者自有。

## 第一次推送

```
git remote add origin https://github.com/terrytwomail/surge-rules.git
git push -u origin main
```
