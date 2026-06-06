# 團購管家第二版

這是一個靜態團購網站原型，前端可直接開啟使用，也可以接 Google Apps Script 把資料寫進 Google Sheet。

## 功能

- 同事下單：選商品、填姓名、部門、聯絡方式與備註
- 付款回報：支援匯款、Line Pay、街口支付、台灣 Pay、現金
- 管理統計：訂單數、應收金額、已確認金額、待確認付款、商品彙總
- 本機示範模式：未設定 Google Sheet 時，資料會暫存在瀏覽器 `localStorage`

## 直接試用

用瀏覽器開啟 `index.html` 即可。

## 接 Google Sheet

1. 建立一份新的 Google Sheet。
2. 到 `擴充功能` -> `Apps Script`。
3. 將 `google-apps-script.js` 的內容貼到 Apps Script 編輯器。
4. 儲存後執行一次 `ensureSheets`，授權 Apps Script 建立工作表。
5. 選擇 `部署` -> `新增部署作業`。
6. 類型選 `網頁應用程式`。
7. 執行身分選 `我`。
8. 存取權可先選 `知道連結的任何人`，若公司 Workspace 有內部限制，可改成組織內部。
9. 複製部署後的 `/exec` URL。
10. 打開 `config.js`，把 URL 填到 `apiUrl`。

```js
window.GROUP_BUY_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/你的部署ID/exec"
};
```

## Email 通知

如果希望有人下單或付款回報時寄信給你：

1. 在 Apps Script 左側開啟 `專案設定`。
2. 新增 Script Property：

```text
OWNER_EMAIL=your-name@example.com
```

沒有設定 `OWNER_EMAIL` 也可以正常使用，只是不會寄信。

## Google Sheet 資料表

Apps Script 會自動建立三張表：

- `Products`：商品資料，可直接在 Sheet 裡修改商品名稱、價格、截止日與是否開放
- `Orders`：訂單資料，品項會以 JSON 存在 `itemsJson`
- `Payments`：付款回報，狀態預設 `pending`，在網站統計頁確認後會改成 `confirmed`

## 下一步可加

- Google 登入與公司網域限制
- 管理員密碼或權限
- 付款截圖上傳到 Google Drive
- LINE Messaging API 或 Google Chat Webhook 通知
- 匯出對帳報表
