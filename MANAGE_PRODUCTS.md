# 商品管理方式

網站部署好之後，不需要再碰 GitHub 或程式碼。商品都在 Google Sheet 的 `Products` 工作表管理。

## Products 欄位

每一列是一個商品：

| 欄位 | 用途 |
| --- | --- |
| `id` | 商品代號，不要重複，例如 `p001` |
| `name` | 商品名稱 |
| `description` | 商品說明 |
| `price` | 價格，只填數字 |
| `deadline` | 截止日期文字 |
| `color` | 沒有圖片時的背景色，例如 `#1d6b73` |
| `imageUrl` | 商品圖片網址 |
| `active` | 是否顯示，填 `TRUE` 或 `FALSE` |

## 圖片怎麼放

最簡單方式是把圖片上傳到 Google Drive：

1. 上傳圖片到 Google Drive。
2. 對圖片按右鍵，選「共用」。
3. 權限改成「知道連結的任何人都可以檢視」。
4. 複製分享連結，直接貼到 `imageUrl` 欄。

可以直接貼這種 Google Drive 分享連結：

```text
https://drive.google.com/file/d/圖片檔案ID/view?usp=sharing
```

網站會自動轉成可顯示的圖片網址。

## 上架/下架

- 上架：`active` 填 `TRUE`
- 下架：`active` 填 `FALSE`

修改 Google Sheet 後，網站按重新整理就會看到最新內容。
