const SHEETS = {
  products: "Products",
  orders: "Orders",
  payments: "Payments"
};

const HEADERS = {
  Products: ["id", "name", "description", "price", "deadline", "color", "imageUrl", "active"],
  Orders: ["id", "buyerName", "itemsJson", "total", "createdAt"],
  Payments: ["id", "orderId", "payerName", "amount", "method", "reference", "status", "createdAt"]
};

function doPost(event) {
  try {
    const body = JSON.parse(event.postData.contents || "{}");
    const action = body.action;
    const payload = body.payload || {};
    const result = route(action, payload);
    return json({ ok: true, result });
  } catch (error) {
    return json({ ok: false, error: error.message });
  }
}

function doGet() {
  return json({
    ok: true,
    result: "Group Buy API is running. Use POST requests from the website."
  });
}

function route(action, payload) {
  ensureSheets();

  if (action === "listProducts") {
    return listProducts();
  }
  if (action === "createOrder") {
    return createOrder(payload);
  }
  if (action === "createPayment") {
    return createPayment(payload);
  }
  if (action === "publicBoard") {
    return {
      orders: listOrders(),
      payments: listPublicPayments()
    };
  }
  if (action === "dashboard") {
    requireAdmin(payload.adminPassword);
    return {
      orders: listOrders(),
      payments: listPayments()
    };
  }
  if (action === "confirmPayment") {
    requireAdmin(payload.adminPassword);
    return confirmPayment(payload.paymentId);
  }
  if (action === "deleteOrder") {
    requireAdmin(payload.adminPassword);
    return deleteOrder(payload.orderId);
  }

  throw new Error("Unknown action: " + action);
}

function requireAdmin(adminPassword) {
  const expected = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD");
  if (!expected) {
    throw new Error("ADMIN_PASSWORD is not configured");
  }
  if (String(adminPassword || "") !== expected) {
    throw new Error("Unauthorized");
  }
}

function ensureSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(HEADERS).forEach((sheetName) => {
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }

    if (sheetName === SHEETS.orders) {
      migrateOrdersSheet(sheet);
    }
    if (sheetName === SHEETS.payments) {
      migratePaymentsSheet(sheet);
    }

    const headers = HEADERS[sheetName];
    let current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (sheetName === SHEETS.products && current[6] === "active" && current[7] !== "active") {
      sheet.insertColumnBefore(7);
      current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    }
    const missingHeaders = headers.some((header, index) => current[index] !== header);
    if (missingHeaders) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });

  seedProductsIfEmpty();
}

function migrateOrdersSheet(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 8) {
    return;
  }

  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const oldHeaders = ["id", "buyerName", "department", "contact", "note", "itemsJson", "total", "createdAt"];
  const isOldOrderSheet = oldHeaders.every((header, index) => current[index] === header);
  if (isOldOrderSheet) {
    sheet.deleteColumns(3, 3);
  }
}

function migratePaymentsSheet(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 10) {
    return;
  }

  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const oldHeaders = ["id", "orderId", "payerName", "amount", "method", "paidAt", "reference", "proofUrl", "status", "createdAt"];
  const isOldPaymentSheet = oldHeaders.every((header, index) => current[index] === header);
  if (isOldPaymentSheet) {
    sheet.deleteColumn(8);
    sheet.deleteColumn(6);
  }
}

function seedProductsIfEmpty() {
  const sheet = getSheet(SHEETS.products);
  if (sheet.getLastRow() > 1) {
    return;
  }

  const rows = [
    ["p001", "手作蛋黃酥", "六入禮盒，到貨日可統一取貨。", 420, "6/12 中午截止", "#1d6b73", true],
    ["p002", "冷泡茶組", "一組 10 包，無糖，辦公室冰箱友善。", 260, "6/10 下班前截止", "#6d7f32", true],
    ["p003", "咖啡濾掛包", "綜合風味 20 入，可備註偏好。", 350, "6/14 晚上截止", "#81533a", true],
    ["p004", "水果優格杯", "週五下午配送，需冷藏。", 95, "每週三截止", "#b6452c", true]
  ];
  const normalizedRows = rows.map((row) => row.length === 7 ? row.slice(0, 6).concat([""], row.slice(6)) : row);
  sheet.getRange(2, 1, normalizedRows.length, HEADERS.Products.length).setValues(normalizedRows);
}

function listProducts() {
  return readObjects(SHEETS.products)
    .filter((product) => product.active === true || String(product.active).toLowerCase() === "true")
    .map((product) => ({
      id: String(product.id),
      name: String(product.name),
      description: String(product.description || ""),
      price: Number(product.price || 0),
      deadline: String(product.deadline || ""),
      color: String(product.color || "#1d6b73"),
      imageUrl: normalizeImageUrl(product.imageUrl)
    }));
}

function normalizeImageUrl(value) {
  const url = String(value || "").trim();
  if (!url) {
    return "";
  }

  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (fileMatch) {
    return "https://drive.google.com/thumbnail?id=" + fileMatch[1] + "&sz=w1000";
  }

  const idMatch = url.match(/[?&]id=([^&]+)/);
  if (url.indexOf("drive.google.com") !== -1 && idMatch) {
    return "https://drive.google.com/thumbnail?id=" + idMatch[1] + "&sz=w1000";
  }

  return url;
}

function createOrder(payload) {
  if (!payload.buyerName) {
    throw new Error("buyerName is required");
  }
  if (!payload.items || !payload.items.length) {
    throw new Error("items are required");
  }

  const order = {
    id: createOrderId(),
    buyerName: String(payload.buyerName),
    items: payload.items,
    total: Number(payload.total || 0),
    createdAt: new Date().toISOString()
  };

  getSheet(SHEETS.orders).appendRow([
    order.id,
    order.buyerName,
    JSON.stringify(order.items),
    order.total,
    order.createdAt
  ]);

  notifyOwner("新團購訂單", `${order.buyerName} 建立訂單 ${order.id}，金額 NT$${order.total}`);
  return order;
}

function createPayment(payload) {
  if (!payload.orderId) {
    throw new Error("orderId is required");
  }
  if (!payload.payerName) {
    throw new Error("payerName is required");
  }

  const payment = {
    id: "PAY-" + Date.now(),
    orderId: String(payload.orderId),
    payerName: String(payload.payerName),
    amount: Number(payload.amount || 0),
    method: String(payload.method || ""),
    reference: String(payload.reference || ""),
    status: "pending",
    createdAt: new Date().toISOString()
  };

  getSheet(SHEETS.payments).appendRow([
    payment.id,
    payment.orderId,
    payment.payerName,
    payment.amount,
    payment.method,
    payment.reference,
    payment.status,
    payment.createdAt
  ]);

  notifyOwner("新付款回報", `${payment.payerName} 回報 ${payment.orderId}，金額 NT$${payment.amount}`);
  return payment;
}

function confirmPayment(paymentId) {
  if (!paymentId) {
    throw new Error("paymentId is required");
  }

  const sheet = getSheet(SHEETS.payments);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idIndex = headers.indexOf("id");
  const statusIndex = headers.indexOf("status");

  for (let row = 1; row < rows.length; row += 1) {
    if (String(rows[row][idIndex]) === String(paymentId)) {
      sheet.getRange(row + 1, statusIndex + 1).setValue("confirmed");
      return { ok: true };
    }
  }

  throw new Error("payment not found");
}

function deleteOrder(orderId) {
  if (!orderId) {
    throw new Error("orderId is required");
  }

  const orderDeleted = deleteRowsByValue(getSheet(SHEETS.orders), "id", orderId);
  if (!orderDeleted) {
    throw new Error("order not found");
  }

  deleteRowsByValue(getSheet(SHEETS.payments), "orderId", orderId);
  return { ok: true };
}

function listOrders() {
  return readObjects(SHEETS.orders).map((order) => ({
    id: String(order.id),
    buyerName: String(order.buyerName || ""),
    items: parseJson(order.itemsJson, []),
    total: Number(order.total || 0),
    createdAt: String(order.createdAt || "")
  })).reverse();
}

function listPayments() {
  return readObjects(SHEETS.payments).map((payment) => ({
    id: String(payment.id),
    orderId: String(payment.orderId || ""),
    payerName: String(payment.payerName || ""),
    amount: Number(payment.amount || 0),
    method: String(payment.method || ""),
    reference: String(payment.reference || ""),
    status: String(payment.status || "pending"),
    createdAt: String(payment.createdAt || "")
  })).reverse();
}

function listPublicPayments() {
  return readObjects(SHEETS.payments).map((payment) => ({
    orderId: String(payment.orderId || ""),
    amount: Number(payment.amount || 0),
    status: String(payment.status || "pending")
  })).reverse();
}

function readObjects(sheetName) {
  const sheet = getSheet(sheetName);
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length <= 1) {
    return [];
  }

  const headers = values[0];
  return values.slice(1).filter((row) => row.some((cell) => cell !== "")).map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = row[index];
    });
    return object;
  });
}

function deleteRowsByValue(sheet, headerName, value) {
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const targetIndex = headers.indexOf(headerName);
  if (targetIndex === -1) {
    throw new Error("Missing header: " + headerName);
  }

  const rowsToDelete = [];
  for (let row = 1; row < rows.length; row += 1) {
    if (String(rows[row][targetIndex]) === String(value)) {
      rowsToDelete.push(row + 1);
    }
  }

  rowsToDelete.reverse().forEach((rowNumber) => sheet.deleteRow(rowNumber));
  return rowsToDelete.length > 0;
}

function getSheet(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Missing sheet: " + sheetName);
  }
  return sheet;
}

function createOrderId() {
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const count = Math.max(0, getSheet(SHEETS.orders).getLastRow() - 1) + 1;
  return `GB-${date}-${String(count).padStart(3, "0")}`;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "[]");
  } catch (error) {
    return fallback;
  }
}

function notifyOwner(subject, message) {
  const email = PropertiesService.getScriptProperties().getProperty("OWNER_EMAIL");
  if (!email) {
    return;
  }
  MailApp.sendEmail(email, subject, message);
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
