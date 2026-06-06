(function () {
  const config = window.GROUP_BUY_CONFIG || {};
  const money = new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  });

  const demoProducts = [
    {
      id: "p001",
      name: "手作蛋黃酥",
      description: "六入禮盒，到貨日可統一取貨。",
      price: 420,
      deadline: "6/12 中午截止",
      color: "#1d6b73"
    },
    {
      id: "p002",
      name: "冷泡茶組",
      description: "一組 10 包，無糖，辦公室冰箱友善。",
      price: 260,
      deadline: "6/10 下班前截止",
      color: "#6d7f32"
    },
    {
      id: "p003",
      name: "咖啡濾掛包",
      description: "綜合風味 20 入，可備註偏好。",
      price: 350,
      deadline: "6/14 晚上截止",
      color: "#81533a"
    },
    {
      id: "p004",
      name: "水果優格杯",
      description: "週五下午配送，需冷藏。",
      price: 95,
      deadline: "每週三截止",
      color: "#b6452c"
    }
  ];

  const state = {
    products: [],
    orders: [],
    payments: [],
    publicOrders: [],
    publicPayments: [],
    cart: new Map(),
    adminPassword: sessionStorage.getItem("groupbuy.adminPassword") || ""
  };

  const storage = {
    get(key, fallback) {
      try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  const api = {
    async request(action, payload = {}) {
      if (!config.apiUrl) {
        return localRequest(action, payload);
      }

      const response = await fetch(config.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, payload })
      });

      if (!response.ok) {
        throw new Error("Google Sheet 連線失敗");
      }

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "操作失敗");
      }
      return data.result;
    }
  };

  function localRequest(action, payload) {
    const orders = storage.get("groupbuy.orders", []);
    const payments = storage.get("groupbuy.payments", []);

    if (action === "listProducts") {
      return Promise.resolve(demoProducts);
    }
    if (action === "createOrder") {
      const order = {
        ...payload,
        id: createOrderId(orders.length + 1),
        createdAt: new Date().toISOString()
      };
      storage.set("groupbuy.orders", [order, ...orders]);
      return Promise.resolve(order);
    }
    if (action === "createPayment") {
      const payment = {
        ...payload,
        id: `PAY-${Date.now()}`,
        status: "pending",
        createdAt: new Date().toISOString()
      };
      storage.set("groupbuy.payments", [payment, ...payments]);
      return Promise.resolve(payment);
    }
    if (action === "publicBoard") {
      return Promise.resolve({
        orders,
        payments: payments.map((payment) => ({
          orderId: payment.orderId,
          amount: Number(payment.amount || 0),
          status: payment.status || "pending"
        }))
      });
    }
    if (action === "dashboard") {
      return Promise.resolve({ orders, payments });
    }
    if (action === "confirmPayment") {
      const updated = payments.map((payment) =>
        payment.id === payload.paymentId ? { ...payment, status: "confirmed" } : payment
      );
      storage.set("groupbuy.payments", updated);
      return Promise.resolve({ ok: true });
    }

    return Promise.reject(new Error("未知操作"));
  }

  function createOrderId(sequence) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `GB-${yyyy}${mm}${dd}-${String(sequence).padStart(3, "0")}`;
  }

  function $(selector) {
    return document.querySelector(selector);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("is-active"));
        document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
        button.classList.add("is-active");
        $(`#${button.dataset.view}View`).classList.add("is-active");
        if (button.dataset.view === "payment") {
          loadPublicBoard();
        }
        if (button.dataset.view === "admin") {
          loadDashboard();
        }
      });
    });
  }

  async function loadProducts() {
    state.products = await api.request("listProducts");
    renderProducts();
    updateCartSummary();
  }

  function renderProducts() {
    $("#productList").innerHTML = state.products
      .map((product) => {
        const qty = state.cart.get(product.id) || 0;
        const initial = product.name.slice(0, 1);
        const productMedia = product.imageUrl
          ? `<img class="product-image" src="${escapeAttribute(product.imageUrl)}" alt="${escapeAttribute(product.name)}" loading="lazy">`
          : `<div class="product-art" style="background:${product.color || "#1d6b73"}">${escapeHtml(initial)}</div>`;
        return `
          <article class="product-card">
            ${productMedia}
            <div class="product-body">
              <h3>${escapeHtml(product.name)}</h3>
              <p>${escapeHtml(product.description || "")}</p>
              <div class="product-meta">
                <span class="price">${money.format(Number(product.price || 0))}</span>
                <span class="deadline">${escapeHtml(product.deadline || "")}</span>
              </div>
              <div class="qty-control" data-product-id="${product.id}">
                <button type="button" data-delta="-1" aria-label="減少 ${escapeHtml(product.name)} 數量">−</button>
                <input value="${qty}" inputmode="numeric" pattern="[0-9]*" aria-label="${escapeHtml(product.name)} 數量">
                <button type="button" data-delta="1" aria-label="增加 ${escapeHtml(product.name)} 數量">+</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    document.querySelectorAll(".qty-control").forEach((control) => {
      const productId = control.dataset.productId;
      const input = control.querySelector("input");
      control.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          const next = Math.max(0, Number(input.value || 0) + Number(button.dataset.delta));
          input.value = next;
          setCartQty(productId, next);
        });
      });
      input.addEventListener("input", () => setCartQty(productId, Math.max(0, Number(input.value || 0))));
    });
  }

  function setCartQty(productId, qty) {
    if (qty > 0) {
      state.cart.set(productId, qty);
    } else {
      state.cart.delete(productId);
    }
    updateCartSummary();
  }

  function getCartItems() {
    return Array.from(state.cart.entries()).map(([productId, qty]) => {
      const product = state.products.find((item) => item.id === productId);
      return {
        productId,
        name: product.name,
        price: Number(product.price),
        qty,
        subtotal: Number(product.price) * qty
      };
    });
  }

  function updateCartSummary() {
    const items = getCartItems();
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    $("#itemCount").textContent = String(totalQty);
    $("#orderTotal").textContent = money.format(total);
  }

  function bindForms() {
    $("#orderForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const items = getCartItems();
      if (!items.length) {
        showToast("請先選擇至少一個商品。");
        return;
      }

      const form = new FormData(formElement);
      const payload = {
        buyerName: form.get("buyerName").trim(),
        items,
        total: items.reduce((sum, item) => sum + item.subtotal, 0)
      };

      const order = await api.request("createOrder", payload);
      state.cart.clear();
      formElement.reset();
      renderProducts();
      updateCartSummary();
      await loadPublicBoard();
      showToast(`訂單已建立：${order.id}`);
    });

    $("#paymentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      const payload = {
        orderId: form.get("orderId").trim(),
        payerName: form.get("payerName").trim(),
        amount: Number(form.get("amount")),
        method: form.get("method"),
        paidAt: form.get("paidAt"),
        reference: form.get("reference").trim(),
        proofUrl: form.get("proofUrl").trim()
      };
      await api.request("createPayment", payload);
      formElement.reset();
      await loadPublicBoard();
      showToast("付款回報已送出，狀態為待確認。");
    });

    $("#adminLoginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      state.adminPassword = String(form.get("adminPassword") || "");
      sessionStorage.setItem("groupbuy.adminPassword", state.adminPassword);
      await loadDashboard();
    });
  }

  async function loadDashboard() {
    if (!state.adminPassword) {
      setAdminLocked(true);
      return;
    }

    try {
      const data = await api.request("dashboard", { adminPassword: state.adminPassword });
      state.orders = data.orders || [];
      state.payments = data.payments || [];
      setAdminLocked(false);
      renderDashboard();
    } catch (error) {
      state.adminPassword = "";
      sessionStorage.removeItem("groupbuy.adminPassword");
      setAdminLocked(true);
      showToast(error.message === "Unauthorized" ? "管理密碼不正確。" : error.message);
    }
  }

  async function loadPublicBoard() {
    try {
      const data = await api.request("publicBoard");
      state.publicOrders = data.orders || [];
      state.publicPayments = data.payments || [];
      renderPaymentOrders();
    } catch (error) {
      state.publicOrders = [];
      state.publicPayments = [];
      renderPaymentOrders(error.message);
    }
  }

  function setAdminLocked(isLocked) {
    $("#adminLoginForm").style.display = isLocked ? "grid" : "none";
    $("#adminContent").classList.toggle("is-locked", isLocked);
  }

  function renderDashboard() {
    const confirmed = state.payments.filter((payment) => payment.status === "confirmed");
    const pending = state.payments.filter((payment) => payment.status !== "confirmed");
    const due = state.orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const paid = confirmed.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    $("#metricOrders").textContent = String(state.orders.length);
    $("#metricDue").textContent = money.format(due);
    $("#metricPaid").textContent = money.format(paid);
    $("#metricPending").textContent = String(pending.length);

    renderProductSummary();
    renderOrders();
    renderPayments();
  }

  function renderProductSummary() {
    const summary = new Map();
    state.orders.forEach((order) => {
      (order.items || []).forEach((item) => {
        const current = summary.get(item.productId) || { name: item.name, qty: 0, subtotal: 0 };
        current.qty += Number(item.qty || 0);
        current.subtotal += Number(item.subtotal || 0);
        summary.set(item.productId, current);
      });
    });

    $("#productSummary").innerHTML = Array.from(summary.values())
      .map((item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.qty}</td>
          <td>${money.format(item.subtotal)}</td>
        </tr>
      `)
      .join("") || `<tr><td colspan="3">目前沒有訂單</td></tr>`;
  }

  function renderOrders() {
    $("#orderList").innerHTML = state.orders
      .map((order) => {
        const confirmedAmount = state.payments
          .filter((payment) => payment.orderId === order.id && payment.status === "confirmed")
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const status = confirmedAmount >= Number(order.total || 0) ? "confirmed" : "unpaid";
        return `
          <tr>
            <td>${escapeHtml(order.id)}</td>
            <td>${escapeHtml(order.buyerName)}</td>
            <td>${(order.items || []).map((item) => `${escapeHtml(item.name)} x ${item.qty}`).join("<br>")}</td>
            <td>${money.format(Number(order.total || 0))}</td>
            <td><span class="status ${status}">${status === "confirmed" ? "已付款" : "未結清"}</span></td>
          </tr>
        `;
      })
      .join("") || `<tr><td colspan="5">目前沒有訂單</td></tr>`;
  }

  function renderPayments() {
    $("#paymentList").innerHTML = state.payments
      .map((payment) => `
        <article class="payment-row">
          <header>
            <strong>${escapeHtml(payment.payerName)} / ${money.format(Number(payment.amount || 0))}</strong>
            <span class="status ${payment.status === "confirmed" ? "confirmed" : "pending"}">
              ${payment.status === "confirmed" ? "已確認" : "待確認"}
            </span>
          </header>
          <p>${escapeHtml(payment.orderId)} · ${methodLabel(payment.method)} · ${escapeHtml(payment.reference || "無備註")}</p>
          ${payment.proofUrl ? `<p><a href="${escapeAttribute(payment.proofUrl)}" target="_blank" rel="noreferrer">查看截圖</a></p>` : ""}
          <div class="payment-actions">
            <button class="small-button confirm" type="button" data-payment-id="${escapeAttribute(payment.id)}" ${payment.status === "confirmed" ? "disabled" : ""}>確認</button>
          </div>
        </article>
      `)
      .join("") || `<p>目前沒有付款回報</p>`;

    document.querySelectorAll("[data-payment-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        await api.request("confirmPayment", {
          paymentId: button.dataset.paymentId,
          adminPassword: state.adminPassword
        });
        showToast("付款已確認。");
        loadDashboard();
      });
    });
  }

  function renderPaymentOrders(errorMessage = "") {
    const paymentOrderList = $("#paymentOrderList");
    if (!paymentOrderList) {
      return;
    }

    if (errorMessage) {
      paymentOrderList.innerHTML = `<p class="helper-text">${escapeHtml(errorMessage)}</p>`;
      return;
    }

    paymentOrderList.innerHTML = state.publicOrders
      .map((order) => {
        const paidAmount = state.publicPayments
          .filter((payment) => payment.orderId === order.id && payment.status === "confirmed")
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const pendingAmount = state.publicPayments
          .filter((payment) => payment.orderId === order.id && payment.status !== "confirmed")
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const orderTotal = Number(order.total || 0);
        const status = paidAmount >= orderTotal ? "confirmed" : pendingAmount > 0 ? "pending" : "unpaid";
        const statusLabel = status === "confirmed" ? "已付款" : status === "pending" ? "待確認" : "未回報";
        return `
          <article class="public-order-card">
            <header>
              <div>
                <strong>${escapeHtml(order.buyerName)}</strong>
                <p>${escapeHtml(order.id)}</p>
              </div>
              <span class="status ${status}">${statusLabel}</span>
            </header>
            <p class="public-order-items">${formatOrderItems(order.items)}</p>
            <footer>
              <strong>${money.format(orderTotal)}</strong>
              <button
                class="small-button"
                type="button"
                data-fill-order-id="${escapeAttribute(order.id)}"
                data-fill-order-total="${escapeAttribute(orderTotal)}"
                data-fill-buyer-name="${escapeAttribute(order.buyerName)}"
              >
                帶入付款表單
              </button>
            </footer>
          </article>
        `;
      })
      .join("") || `<p class="helper-text">目前還沒有訂單。</p>`;

    document.querySelectorAll("[data-fill-order-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const form = $("#paymentForm");
        form.elements.orderId.value = button.dataset.fillOrderId || "";
        form.elements.amount.value = button.dataset.fillOrderTotal || "";
        if (!form.elements.payerName.value) {
          form.elements.payerName.value = button.dataset.fillBuyerName || "";
        }
        form.elements.orderId.focus();
        showToast(`已帶入 ${button.dataset.fillOrderId}`);
      });
    });
  }

  function formatOrderItems(items) {
    return (items || [])
      .map((item) => `${escapeHtml(item.name)} x ${item.qty}`)
      .join(" · ");
  }

  function methodLabel(method) {
    return {
      bank: "匯款",
      line_pay: "Line Pay",
      jkopay: "街口支付",
      taiwan_pay: "台灣 Pay",
      cash: "現金"
    }[method] || method;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function bindActions() {
    $("#refreshProducts").addEventListener("click", () => loadProducts().then(() => showToast("商品已更新。")));
    $("#refreshAdmin").addEventListener("click", () => loadDashboard().then(() => {
      if (state.adminPassword) {
        showToast("統計已更新。");
      }
    }));
  }

  async function init() {
    bindTabs();
    bindForms();
    bindActions();
    await loadProducts();
    await loadPublicBoard();
  }

  init().catch((error) => showToast(error.message));
})();
