# HANDOFF — 生活手帳：網頁版 + Claude App 版

（使用者用繁體中文溝通，回覆也用繁體中文、台灣用語。）

## Goal

使用者的「生活手帳」（純前端：行事曆、待辦、記帳、習慣/RANK、番茄鐘、健康、飲食、健身）要有兩個版本並存、資料互通：

1. **網頁版**（GitHub Pages，`index.html` + `css/` + `js/`）：手機、電腦瀏覽器用，有 Google 日曆和雲端硬碟同步。
2. **Claude App 版**：同一套程式包成 Claude 工件（artifact），可以在 Windows 的 Claude 桌面版「安裝為應用程式」。功能要跟網頁版一樣甚至更好，重點是**系統通知**（使用者明確說 PWA 的通知不夠，不要再提 PWA）。手機用 Claude 手機 app 打開同一個工件（沒有通知）。

- 工件網址：https://claude.ai/artifact/HKbySR8HLnn8u8TzGSpUsc （目前 Version 3，只有使用者看得到）
- 要更新時：先 `node claude-app/build.mjs`，再用 Artifact 工具 publish `claude-app/dist/life-planner.html`（同一個 file_path，或傳 `url`）。capabilities 要整組重新寫（見下方），省略則沿用。

## Current Progress

### 全部還沒 commit／push（git status：js/ 多個檔改過、新增 `js/sync-merge.js`、`claude-app/`）
網頁版要 push 上 GitHub 才會生效。上一輪最後問了使用者要不要幫忙 commit + push，**還沒得到回答**。依專案習慣 commit 訊息用中文、在 main 上直接 commit。

### 共用程式（網頁版和 App 都用）做的改動
- `js/core.js`：新增 `function ask(msg)` → 回傳 Promise<boolean>（網頁版用 confirm）。所有 `confirm()`（約 20 處，分散在 backup/calendar/daily-rank/diet/google-calendar/habits/health/money/pomodoro/todo）改成 `await ask(...)`，對應的 handler 改成 async。
- `js/sync-merge.js`（新）：從 drive-sync.js 拆出 `SYNC_KEYS`、`baseSnap`、`itemHash`、`stamp`（設成 `window.beforeSave`）、`mergeInto`、`payload`。
- `js/diet.js`：新增 `function hasAI()`（App 會覆寫）；AI 按鈕文字分析完會恢復原本的文字。
- `js/drive-sync.js`：改成透過雲端硬碟可見資料夾同步（見下）；第一次會把舊的 appDataFolder `life-planner-data.json` 合併進來（`ls('driveMigrated')`）。
- `js/google-calendar.js`：SCOPES 加上完整 `https://www.googleapis.com/auth/drive`（保留 drive.appdata 做遷移）。舊 token 的 scopes 不同 → 使用者要重新連 Google。
- `index.html`：加入 `js/sync-merge.js`，所有 `?v=` 版本號改成 `202611281130`。

### 網頁版 ↔ App 同步機制（雲端硬碟「生活手帳同步」資料夾）
- 資料夾 id：`1zkLk1W1PCg9I8FiujnuWhRjOuB4xbTnK`（我用 Drive 連接器建立的，在「我的雲端硬碟」根目錄）。兩邊程式都寫死這個 id，找不到時依名稱找或重建。
- 網頁版：讀資料夾裡全部 `web.json` + `app-*.json`，逐筆合併，再更新 `web.json`（所有瀏覽器共用）。已讀過、沒變的 app 檔用 `driveSeen`（id→modifiedTime）跳過。
- App：Drive 連接器**不能覆寫檔案內容**，所以每次 `create_file` 一個新的 `app-YYYY-MM-DD-HHMMSS.json`，再 `trash_file` 已經讀過並合併的舊 app-*.json。存檔後 30 秒、每 10 分鐘、切回 App 時同步；資料 hash 沒變就不寫（已驗證會收斂）。

### Claude App 版（`claude-app/`）
- `build.mjs`：讀 index.html 的 body 和 `<script src>` 清單，把 `js/google-calendar.js` 換成 `claude-app/gcal-mcp.js`、`js/drive-sync.js` 換成 `claude-app/claude-sync.js`，在 core.js 後面插 `app-ui.js`，最後加 `claude-features.js`；把 header-buttons.html 插到 `#themeBtn` 前面，extra.html 加在 body 最後；CSS 和 JS 全部 inline。輸出 `claude-app/dist/life-planner.html`（dist 已加進 .gitignore）。
- `app-ui.js`：畫面內的確認框覆寫 `ask()`、`window.alert`；`cUse(name)`（claude.use 包裝，不在 Claude 裡回傳 null）、`sleep`。
- `claude-sync.js`：用 Claude 的 `db` 能力存資料，路徑 `data/users/<user.id()>/lp-meta`、`lp-0..n`（每段 6 萬字，避開 256KB 上限；切段不切開 emoji），`lp-meta` 用 onSnapshot 即時收到別台裝置的變更。
- `gcal-mcp.js`：透過「Google Calendar」連接器（list_calendars / list_events / create_event / update_event / delete_event），對外介面跟網頁版 google-calendar.js 一樣，`gApi(REST 路徑, method, body)` 在這裡翻成連接器工具，所以 calendar.js 不用改。不支援把行程搬到別的日曆（連接器沒有 move）。日曆沒顏色 → 依順序配色；假日日曆唯讀。
- `claude-features.js`：
  1. 飲食 AI 改用 `sample` 能力（`sample.json`），不用 API 金鑰。
  2. 匯出用 `downloads` 能力。
  2b. ☁️ 雲端硬碟備份／還原（`生活手帳備份-*.json`）。
  2c. 上面說的網頁版同步（bridgeSync）。
  3. 桌面 App（`desktop` 能力）：Dock/工作列圖示（canvas 畫）、系統通知、工作列選單（開始/暫停番茄鐘、迷你模式）、全域快捷鍵 Alt+Shift+P、迷你浮動計時器（setOptions frame:false + alwaysOnTop，會重新載入頁面，有防無限重載的保險）、權限提示列、「💻 安裝成 App」按鈕。
  4. 🔔 提醒：行程開始前、待辦截止前／到期、保健品（早午晚時間）、今日任務沒完成、喝水伸展間隔。提醒設定存在 localStorage `remSet`。
  5. 🤖 每週回顧（段位頁最上方），sample 依 7 天紀錄寫回顧。
- 目前 publish 的 capabilities：
  `{"db":{},"user":{},"desktop":{},"sample":{},"downloads":true,"mcp":{"servers":[{"server":"Google Calendar","tools":["list_calendars","list_events","create_event","update_event","delete_event"]},{"server":"Google Drive","tools":["create_file","search_files","download_file_content","trash_file"]}]}}`
- HTML 裡的 `claude-artifacts-manifest`：permissions `notifications, menu-bar, shortcuts, overlay`。

### 測試方式
- `.claude/launch.json` 有 `life-planner-claude-test`（python http.server 8766）。
- `claude-app/dist/mock.js`（假的 window.claude：db、user、sample、desktop、mcp 含日曆和雲端硬碟）、`seed.js`（預先放一筆雲端待辦）；用 build 出來的 html 包上 doctype 外殼產生 `test*.html`（指令見下方）。
- 已用 mock 驗證：db 同步合併、刪除確認框、Claude 分析、週回顧、匯出、通知、工作列選單、迷你模式、手機寬度不溢出、Google 日曆讀/新增/拖曳改時間、雲端備份/還原、bridgeSync 合併 + 收斂。網頁版 index.html 開過每頁都沒有錯誤。
- **沒在真實環境測過**：真的安裝成 App、Windows 真的跳通知、手機實際同步、網頁版真的連 Google 用新資料夾同步。

```bash
cd claude-app/dist && { printf '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><script src="seed.js"></script><script src="mock.js"></script></head><body>'; cat life-planner.html; printf '</body></html>'; } > test.html
```

## What Worked
- 用「後面的 script 重新宣告同名函式」來覆寫共用程式（ask、notify、hasAI、aiAnalyze、syncUI、gApi…），共用 js 幾乎不用為 App 分叉。
- 注意：函式宣告會被提前（hoisting），**不能** `const old=notify; function notify(){old()}` → 會無限遞迴。要包裝就用 `window.afterSave` 這種變數，或直接重寫。
- 同步一律用 sync-merge.js 的逐筆合併（每筆 `u` 時間戳 + `db.deleted` 墓碑），任何來源（Claude db、雲端硬碟檔案）都能合併。
- Drive 連接器的 `download_file_content` 會原封不動回傳檔案（頁面裡是 `content` 中 `type:'resource'` 的 `resource.blob` base64）；`claude-features.js` 的 `fileText()` 會處理。
- 用使用者帳號實際呼叫唯讀工具（list_calendars、list_events）先確認回傳格式，再寫程式。

## What Didn't Work / 限制（不要再試）
- 工件裡不能直接連 Google（CSP 擋 accounts.google.com、googleapis.com）→ 必須走 Claude 連接器。
- 工件裡 `confirm()`、`alert()`、`prompt()` 不會顯示（confirm 直接回 false）；`<a download>` 也沒用。
- Drive 連接器看不到網頁版原本的隱藏資料夾 appDataFolder，也沒有覆寫檔案內容的工具（update_file 只能改中繼資料）→ 才改成可見資料夾 + App 每次新建檔。
- Drive 連接器的 `read_file_content` 會弄壞文字（加跳脫、emoji 壞掉、截斷）→ 只用 `download_file_content`。
- 「安裝為應用程式」只有 Windows/Mac 的 Claude 桌面版有，手機不行；App 的通知只在 App 開著（或縮在工作列）時才會跳。
- 使用者拒絕 PWA（通知不夠），也不要「一個功能一個 App」。
- 發佈時的警告「This page loads 1 script from other websites」是 diet.js 網頁版 aiAnalyze 裡的 `import('https://esm.sh/...')`，App 版已覆寫不會執行，可忽略。

## Next Steps
1. **問使用者是否要 commit + push**（上一輪的問題還沒回答）。push 後網頁版才會用新的雲端硬碟資料夾同步。
2. 請使用者在網頁版重新連接 Google（新增了完整雲端硬碟權限）。如果 Google 擋下來（未驗證應用程式／restricted scope），要到 Google Cloud Console 的 OAuth 同意畫面加入 `.../auth/drive` 權限，或把使用者加為測試使用者。OAuth Client ID 寫在 `js/google-calendar.js` 的 `GOOGLE_CLIENT_ID`。
3. 使用者實際安裝 App 後，依回報修問題：通知、工作列、迷你模式（setOptions 的實際行為沒驗證過）、Google 日曆、雲端硬碟同步、手機 Claude app 打開的畫面。
4. 可能的改進：App 版雲端硬碟同步的狀態顯示得更明顯；資料很大（>~1MB）時 create_file 的 textContent 可能超過連接器輸入上限，可改用 `{$file:{...}}` FileArgument（要先檢查 `listTools().fileArgs`）。
5. 改了 `js/` 或 `claude-app/` 之後：`node --check` 各檔 → `node claude-app/build.mjs` → 用 mock 測 → publish（同一個 file_path）→ 網頁版 index.html 的 `?v=` 版本號要更新避免快取。
