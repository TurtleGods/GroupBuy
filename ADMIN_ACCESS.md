# 管理頁權限設定

管理頁會要求密碼。密碼不要放在 GitHub，請放在 Apps Script 的 Script Properties。

## 設定方式

1. 打開 Apps Script。
2. 左側選「Project Settings」。
3. 找到「Script Properties」。
4. 新增一筆：

```text
ADMIN_PASSWORD=你要使用的管理密碼
```

5. 儲存。
6. 用 `New version` 重新部署 Web App。

## 使用方式

網站上的「統計與確認」頁會要求管理密碼。密碼正確才會載入訂單、付款資料，也只有登入後才能確認付款。

## 注意

這是給小型團購使用的簡易保護。下單和付款回報仍然是公開的；只有管理資料與確認付款需要密碼。
