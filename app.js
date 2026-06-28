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
    adminProducts: [],
    orders: [],
    payments: [],
    publicOrders: [],
    publicPayments: [],
    cart: new Map(),
    currentOrder: readSessionJSON("groupbuy.currentOrder"),
    adminPassword: sessionStorage.getItem("groupbuy.adminPassword") || "",
    currentOrderId: sessionStorage.getItem("groupbuy.currentOrderId") || "",
    orderPanel: "my",
    orderSearchQuery: "",
    adminOrderFilter: "all",
    deletedCount: 0
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

  function getLocalProducts() {
    const stored = storage.get("groupbuy.products", null);
    if (Array.isArray(stored) && stored.length) {
      return stored;
    }
    const seeded = demoProducts.map((product) => ({ ...product, imageUrl: product.imageUrl || "", active: true }));
    storage.set("groupbuy.products", seeded);
    return seeded;
  }

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
        const message = String(data.error || "操作失敗");
        if (
          message.includes("Unknown action: createProduct") ||
          message.includes("Unknown action: updateProduct") ||
          message.includes("Unknown action: deleteProduct") ||
          message.includes("Unknown action: updateOrderStatus")
        ) {
          throw new Error("後台 API 還是舊版，請重新部署 Google Apps Script Web App。");
        }
        throw new Error(message);
      }
      return data.result;
    }
  };

  function localRequest(action, payload) {
    const products = getLocalProducts();
    const orders = storage.get("groupbuy.orders", []);
    const payments = storage.get("groupbuy.payments", []);

    if (action === "listProducts") {
      return Promise.resolve(products.filter((product) => product.active !== false));
    }
    if (action === "createOrder") {
      const order = {
        ...payload,
        id: createOrderId(orders.length + 1),
        status: "unpaid",
        createdAt: new Date().toISOString()
      };
      storage.set("groupbuy.orders", [order, ...orders]);
      return Promise.resolve(order);
    }
    if (action === "createPayment") {
      const payment = {
        ...payload,
        id: `PAY-${Date.now()}`,
        status: payload.status || (payload.method === "cash" ? "confirmed" : "pending"),
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
      return Promise.resolve({
        orders,
        payments,
        products,
        deletedCount: Number(storage.get("groupbuy.deletedOrderCount", 0) || 0)
      });
    }
    if (action === "createProduct") {
      const product = {
        id: `p${Date.now()}`,
        name: String(payload.name || "").trim(),
        description: String(payload.description || "").trim(),
        price: Number(payload.price || 0),
        deadline: String(payload.deadline || "").trim(),
        color: String(payload.color || "#1d6b73").trim() || "#1d6b73",
        imageUrl: String(payload.imageUrl || "").trim(),
        active: payload.active !== false
      };
      storage.set("groupbuy.products", [product, ...products]);
      return Promise.resolve(product);
    }
    if (action === "updateProduct") {
      const productExists = products.some((product) => product.id === payload.productId);
      if (!productExists) {
        return Promise.reject(new Error("找不到商品"));
      }
      const updatedProducts = products.map((product) =>
        product.id === payload.productId
          ? {
              ...product,
              name: String(payload.name || "").trim(),
              description: String(payload.description || "").trim(),
              price: Number(payload.price || 0),
              deadline: String(payload.deadline || "").trim(),
              color: String(payload.color || "#1d6b73").trim() || "#1d6b73",
              imageUrl: String(payload.imageUrl || "").trim(),
              active: payload.active !== false
            }
          : product
      );
      storage.set("groupbuy.products", updatedProducts);
      return Promise.resolve({ ok: true });
    }
    if (action === "deleteProduct") {
      const productExists = products.some((product) => product.id === payload.productId);
      if (!productExists) {
        return Promise.reject(new Error("找不到商品"));
      }
      storage.set("groupbuy.products", products.filter((product) => product.id !== payload.productId));
      return Promise.resolve({ ok: true });
    }
    if (action === "confirmPayment") {
      const updated = payments.map((payment) =>
        payment.id === payload.paymentId ? { ...payment, status: "confirmed" } : payment
      );
      storage.set("groupbuy.payments", updated);
      const payment = updated.find((item) => item.id === payload.paymentId);
      if (payment) {
        storage.set(
          "groupbuy.orders",
          orders.map((order) => order.id === payment.orderId ? { ...order, status: "confirmed" } : order)
        );
      }
      return Promise.resolve({ ok: true });
    }
    if (action === "updateOrderStatus") {
      const orderExists = orders.some((order) => order.id === payload.orderId);
      if (!orderExists) {
        return Promise.reject(new Error("找不到訂單"));
      }
      storage.set(
        "groupbuy.orders",
        orders.map((order) =>
          order.id === payload.orderId ? { ...order, status: String(payload.status || "unpaid") } : order
        )
      );
      return Promise.resolve({ ok: true });
    }
    if (action === "deleteOrder") {
      const orderExists = orders.some((order) => order.id === payload.orderId);
      if (!orderExists) {
        return Promise.reject(new Error("找不到訂單"));
      }
      storage.set(
        "groupbuy.deletedOrderCount",
        Number(storage.get("groupbuy.deletedOrderCount", 0) || 0) + 1
      );
      storage.set("groupbuy.orders", orders.filter((order) => order.id !== payload.orderId));
      storage.set("groupbuy.payments", payments.filter((payment) => payment.orderId !== payload.orderId));
      return Promise.resolve({ ok: true });
    }
    if (action === "deleteAllOrders") {
      storage.set(
        "groupbuy.deletedOrderCount",
        Number(storage.get("groupbuy.deletedOrderCount", 0) || 0) + orders.length
      );
      storage.set("groupbuy.orders", []);
      storage.set("groupbuy.payments", []);
      sessionStorage.removeItem("groupbuy.currentOrder");
      sessionStorage.removeItem("groupbuy.currentOrderId");
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

  function matchesAdminEntryHash() {
    return Boolean(config.adminEntryHash) && window.location.hash === config.adminEntryHash;
  }

  function consumeAdminEntryHash() {
    if (!matchesAdminEntryHash()) {
      return false;
    }
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", cleanUrl);
    return true;
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  let loadingToken = 0;
  const LOADING_MIN_MS = 220;
  const LOADING_JOKES = [
    "載入中，先講個笑話：什麼鴨子用兩隻腳走路？ A：所有鴨子。",
    "載入中，先講個笑話：什麼魚最晚下班？ A：摸魚。",
    "載入中，先講個笑話：什麼麵不能吃？ A：見一面。",
    "載入中，先講個笑話：什麼熊最忙？ A：工讀生。",
    "載入中，先講個笑話：什麼水果最會聊天？ A：芒果，因為很忙。"
  ];

  function randomLoadingJoke() {
    return LOADING_JOKES[Math.floor(Math.random() * LOADING_JOKES.length)];
  }

  function showLoading(message) {
    const overlay = $("#loadingOverlay");
    const overlayText = $("#loadingOverlayText");
    if (!overlay) {
      return { token: 0, startedAt: performance.now() };
    }
    loadingToken += 1;
    if (overlayText) {
      overlayText.textContent = message || "";
    }
    overlay.classList.toggle("has-message", Boolean(message));
    overlay.hidden = false;
    overlay.classList.add("is-visible");
    overlay.getBoundingClientRect();
    return { token: loadingToken, startedAt: performance.now() };
  }

  function hideLoading(token) {
    const overlay = $("#loadingOverlay");
    if (!overlay || token !== loadingToken) {
      return;
    }
    overlay.classList.remove("is-visible");
    overlay.classList.remove("has-message");
    overlay.hidden = true;
  }

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function readSessionJSON(key) {
    try {
      const value = sessionStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (_) {
      return null;
    }
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", async () => {
        await activateView(button.dataset.view);
      });
    });
  }

  function bindOrderTabs() {
    document.querySelectorAll(".order-subtab").forEach((button) => {
      button.addEventListener("click", () => {
        activateOrderPanel(button.dataset.orderPanel || "my");
      });
    });
  }

  function bindPaymentMethods() {
    document.querySelectorAll(".payment-method-card").forEach((button) => {
      button.addEventListener("click", () => {
        const form = $("#paymentForm");
        if (!form) {
          return;
        }
        form.elements.method.value = button.dataset.method === "bank" ? "bank" : "cash";
        updatePaymentMethodView();
      });
    });
  }

  function bindMobileStepper() {
    document.querySelectorAll(".mobile-stepper .step").forEach((step) => {
      step.addEventListener("click", async () => {
        const target = step.dataset.step || "shop";
        if (target === "search") {
          state.orderPanel = "search";
          await activateView("order");
          activateOrderPanel("search");
          return;
        }
        if (target === "order") {
          state.orderPanel = "my";
          await activateView("order");
          activateOrderPanel("my");
          return;
        }
        await activateView(target);
      });
    });
  }

  async function activateView(viewName) {
    const loading = showLoading();
    await wait(16);
    document.body.dataset.view = viewName;
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.view === viewName);
    });
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("is-active", view.id === `${viewName}View`);
    });
    scrollToTop();
    syncShopCatalog(viewName === "shop");
    syncShopViewChrome(viewName === "shop");
    try {
      if (viewName === "payment") {
        removeLegacyPaymentSummary();
        await loadPublicBoard();
        renderPaymentCheckout(resolveMyOrder());
        updatePaymentMethodView();
      }
      if (viewName === "order") {
        removeLegacyOrderItems();
        await loadPublicBoard();
        if (state.orderPanel !== "search") {
          activateOrderPanel("my");
        }
      }
      if (viewName === "admin") {
        await loadDashboard();
      }
      updateMobileChrome(viewName);
    } finally {
      const elapsed = performance.now() - loading.startedAt;
      if (elapsed < LOADING_MIN_MS) {
        await wait(LOADING_MIN_MS - elapsed);
      }
      hideLoading(loading.token);
    }
  }

  function syncShopCatalog(isVisible) {
    const productList = $("#productList");
    if (!productList) {
      return;
    }

    if (!isVisible) {
      productList.innerHTML = "";
      return;
    }

    if (state.products.length) {
      renderProducts();
      updateCartSummary();
    }
  }

  function syncShopViewChrome(isVisible) {
    const shopView = $("#shopView");
    if (!shopView) {
      return;
    }

    shopView.querySelectorAll(
      ".shop-hero, .section-head, .delivery-panel, .order-panel"
    ).forEach((element) => {
      element.hidden = !isVisible;
    });
  }

  function removeLegacyPaymentSummary() {
    const paymentView = $("#paymentView");
    if (!paymentView) {
      return;
    }

    paymentView.querySelectorAll(
      ".mobile-order-items, .confirmed-order-items, .payment-order-items, .payment-summary-head, .payment-selected-count"
    ).forEach((element) => {
      element.remove();
    });
  }

  function removeLegacyOrderItems() {
  }

  function activateOrderPanel(panelName) {
    state.orderPanel = panelName === "search" ? "search" : "my";

    document.querySelectorAll(".order-subtab").forEach((button) => {
      const isActive = button.dataset.orderPanel === state.orderPanel;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    document.querySelectorAll(".order-subview").forEach((panel) => {
      const isActive = panel.id === `${state.orderPanel}OrderPanel`;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });

    scrollToTop();
    renderActiveOrderPanel();
    if ($("#orderView")?.classList.contains("is-active")) {
      updateMobileChrome("order");
    }
  }

  function renderActiveOrderPanel() {
    if (!$("#orderView")?.classList.contains("is-active")) {
      return;
    }

    if (state.orderPanel === "search") {
      renderOrderSearchResults();
      return;
    }

    renderMyOrderPanel(resolveMyOrder());
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function updateMobileChrome(viewName = "shop") {
    const activeTarget = viewName === "order"
      ? (state.orderPanel === "search" ? "search" : "order")
      : viewName;
    const doneTargets = new Set();
    if (viewName === "payment") {
      doneTargets.add("shop");
    }
    if (viewName === "order") {
      doneTargets.add("shop");
      doneTargets.add("payment");
    }

    document.querySelectorAll(".mobile-stepper .step").forEach((step) => {
      const target = step.dataset.step || "shop";
      const isActive = target === activeTarget;
      const isDone = doneTargets.has(target);
      step.classList.toggle("is-active", isActive);
      step.classList.toggle("is-done", isDone);
    });

    const shopActionsBar = $("#shopActionsBar");
    if (shopActionsBar) {
      shopActionsBar.hidden = viewName !== "shop";
    }

    const paymentActionsBar = $("#paymentActionsBar");
    if (paymentActionsBar) {
      paymentActionsBar.hidden = viewName !== "payment";
    }
  }

  function resolveMyOrder() {
    if (!state.currentOrderId) {
      return null;
    }

    return state.publicOrders.find((order) => order.id === state.currentOrderId) || state.currentOrder || null;
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

  function calculateOrderTotals(items = []) {
    const subtotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const shipping = totalQty * 10;
    const total = subtotal + shipping;
    return { subtotal, shipping, total, totalQty };
  }

  function updateCartSummary() {
    const items = getCartItems();
    const { shipping, total, totalQty } = calculateOrderTotals(items);
    $("#itemCount").textContent = String(totalQty);
    $("#orderTotal").textContent = money.format(total);
    const shippingHint = $("#shippingHint");
    if (shippingHint) {
      shippingHint.textContent = `含運費 ${money.format(shipping)}`;
    }
    const shopSelectedCount = $("#shopSelectedCount");
    const shopStickyTotal = $("#shopStickyTotal");
    if (shopSelectedCount) {
      shopSelectedCount.textContent = `已選 ${totalQty} 件商品`;
    }
    if (shopStickyTotal) {
      shopStickyTotal.textContent = money.format(total);
    }
    const headerCartBadge = $("#headerCartBadge");
    if (headerCartBadge) {
      headerCartBadge.textContent = String(totalQty);
      headerCartBadge.hidden = totalQty <= 0;
    }
    const orderItemRows = $("#orderItemRows");
    if (orderItemRows) {
      orderItemRows.innerHTML = items.length
        ? items
            .map((item) => `
              <div class="mobile-order-row">
                <span>${escapeHtml(item.name)}</span>
                <span>${money.format(item.price)}</span>
                <span>x${item.qty}</span>
                <span>${money.format(item.subtotal)}</span>
              </div>
            `)
            .join("")
        : `<p class="helper-text">尚未選擇品項</p>`;
    }
    const deliveryPanelCopy = document.querySelector(".delivery-panel-copy p");
    if (deliveryPanelCopy) {
      deliveryPanelCopy.innerHTML = `每件商品加收 <strong>NT$10</strong> 運費，數量 1 = 運費 10 元，數量 5 = 運費 50 元，與商品一併結算。`;
    }
  }

  function bindForms() {
    bindPaymentMethods();

    $("#orderForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const items = getCartItems();
      if (!items.length) {
        showToast("請先選擇至少一個商品。");
        return;
      }

      const loading = showLoading(randomLoadingJoke());

      try {
        const form = new FormData(formElement);
        const { subtotal, shipping, total } = calculateOrderTotals(items);
        const payload = {
          buyerName: form.get("buyerName").trim(),
          items,
          subtotal,
          shipping,
          total
        };

        const order = await api.request("createOrder", payload);
        state.currentOrder = order;
        state.currentOrderId = order.id || "";
        sessionStorage.setItem("groupbuy.currentOrder", JSON.stringify(order));
        sessionStorage.setItem("groupbuy.currentOrderId", state.currentOrderId);
        state.cart.clear();
        formElement.reset();
        renderProducts();
        updateCartSummary();
        await loadPublicBoard();
        prefillPaymentForm(order);
        await activateView("payment");
        showToast(`訂單已建立：${order.id}`);
      } catch (error) {
        hideLoading(loading.token);
        showToast(error.message);
      }
    });

    $("#paymentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const method = formElement.elements.method?.value === "bank" ? "bank" : "cash";
      const referenceValue = String(formElement.elements.reference?.value || "").trim();
      if (method === "bank" && !/^\d{5}$/.test(referenceValue)) {
        showToast("請輸入 5 碼數字的匯款帳號末五碼。");
        formElement.elements.reference?.focus();
        return;
      }
      const loading = showLoading(randomLoadingJoke());
      try {
        const form = new FormData(formElement);
        const payload = {
          orderId: form.get("orderId").trim(),
          payerName: form.get("payerName").trim(),
          amount: Number(form.get("amount")),
          method: form.get("method"),
          reference: referenceValue
        };
        await api.request("createPayment", payload);
        await loadPublicBoard();
        const targetOrder = state.publicOrders.find((order) => order.id === payload.orderId);
        if (targetOrder && targetOrder.id === state.currentOrderId) {
          state.currentOrder = targetOrder;
          sessionStorage.setItem("groupbuy.currentOrder", JSON.stringify(targetOrder));
        }
        formElement.reset();
        updatePaymentMethodView();
        renderPaymentCheckout(null);
        renderMyOrderPanel(resolveMyOrder());
        await activateView("order");
        activateOrderPanel("my");
        showToast(payload.method === "cash" ? "現金付款資訊已送出。" : "付款回報已送出，狀態為待確認。");
      } catch (error) {
        hideLoading(loading.token);
        showToast(error.message);
      }
    });

    $("#orderSearchForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      state.orderSearchQuery = String(form.get("orderSearchQuery") || "").trim();
      renderOrderSearchResults();
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
      state.adminProducts = data.products || [];
      state.deletedCount = Number(data.deletedCount || 0);
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
      renderActiveOrderPanel();
    } catch (error) {
      state.publicOrders = [];
      state.publicPayments = [];
      renderPaymentOrders(error.message);
      renderActiveOrderPanel();
    }
  }

  function prefillPaymentForm(order) {
    const form = $("#paymentForm");
    if (!form || !order) {
      return;
    }

    form.elements.orderId.value = order.id || "";
    form.elements.payerName.value = order.buyerName || "";
    form.elements.amount.value = Number(order.total || 0) || "";
    form.elements.method.value = "cash";
    updatePaymentMethodView();
    renderPaymentCheckout(order);
  }

  function updatePaymentMethodView() {
    const form = $("#paymentForm");
    if (!form) {
      return;
    }

    const method = form.elements.method.value === "bank" ? "bank" : "cash";
    document.querySelectorAll(".payment-method-card").forEach((button) => {
      const isActive = button.dataset.method === method;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    const transferInfo = $("#transferInfo");
    const paymentNotePanel = $("#paymentNotePanel");
    if (transferInfo) {
      transferInfo.hidden = method !== "bank";
    }
    if (paymentNotePanel) {
      paymentNotePanel.hidden = method !== "bank";
    }

    const paymentIntro = $("#paymentIntro");
    if (paymentIntro) {
      paymentIntro.textContent = "下單完成，請依下方資訊進行付款，完成後再送出訂單。";
    }
    if (method !== "bank" && form.elements.reference) {
      form.elements.reference.value = "";
    }
  }

  function renderPaymentCheckout(order) {
    const stickyTotal = $("#paymentStickyTotal");
    const total = order ? money.format(Number(order.total || 0)) : money.format(0);
    if (stickyTotal) {
      stickyTotal.textContent = total;
    }
  }

  function renderMyOrderPanel(order) {
    const emptyState = $("#orderEmptyState");
    const card = $("#myOrderCard");
    const title = $("#myOrderTitle");
    const orderItems = $("#confirmedOrderItems");
    if (!emptyState || !card || !title) {
      return;
    }

    if (!order) {
      title.hidden = true;
      card.hidden = true;
      emptyState.hidden = false;
      if (orderItems) {
        orderItems.innerHTML = "";
      }
      renderOrderSearchResults();
      return;
    }

    title.hidden = false;
    card.hidden = false;
    emptyState.hidden = true;
    $("#confirmedOrderTotal").textContent = plainAmount(order.total);
    $("#confirmedBuyerName").value = order.buyerName || "-";
    $("#confirmedOrderId").value = order.id || "-";
    if (orderItems) {
      const items = Array.isArray(order.items) ? order.items : [];
      const shipping = resolveOrderShipping(order, items);
      orderItems.hidden = !items.length;
      orderItems.innerHTML = items.length
        ? `
          <div class="mobile-order-list">
            <div class="mobile-order-row order-item-head">
              <span>品項</span>
              <span>單價</span>
              <span>數量</span>
              <span>小計</span>
            </div>
            ${items
              .map(
                (item) => `
                  <div class="mobile-order-row">
                    <span>${escapeHtml(item.name || "-")}</span>
                    <span>${money.format(Number(item.price || 0))}</span>
                    <span>x${Number(item.qty || 0)}</span>
                    <span>${money.format(Number(item.subtotal || 0))}</span>
                  </div>
                `
              )
              .join("")}
            <div class="mobile-order-row order-shipping-row">
              <span>運費</span>
              <span>NT$10</span>
              <span>x${calculateTotalQty(items)}</span>
              <span>${money.format(shipping)}</span>
            </div>
          </div>
        `
        : "";
    }
    renderOrderSearchResults();
  }

  function renderOrderSearchResults() {
    const list = $("#orderSearchList");
    const resultsSection = $("#orderSearchResults");
    if (!list) {
      return;
    }

    const query = state.orderSearchQuery.trim().toLowerCase();
    if (!query) {
      list.innerHTML = "";
      if (resultsSection) {
        resultsSection.hidden = true;
      }
      return;
    }

    if (resultsSection) {
      resultsSection.hidden = false;
    }

    const matchedOrders = state.publicOrders.filter((order) =>
      String(order.buyerName || "").toLowerCase().includes(query)
    );

    list.innerHTML = matchedOrders.length
      ? matchedOrders
          .map((order) => {
            const status = getPublicOrderStatus(order);
            const items = Array.isArray(order.items) ? order.items : [];
            const shipping = resolveOrderShipping(order, items);
            return `
              <article class="order-result-card">
                <header>
                  <strong>${escapeHtml(order.buyerName || "-")}</strong>
                  <span>${escapeHtml(order.id || "-")}</span>
                  <mark class="order-status ${status.className}">${status.label}</mark>
                </header>
                <div class="order-result-items">
                  <div class="mobile-order-list">
                    <div class="mobile-order-row order-item-head">
                      <span>品項</span>
                      <span>單價</span>
                      <span>數量</span>
                      <span>小計</span>
                    </div>
                    ${items
                      .map(
                        (item) => `
                          <div class="mobile-order-row">
                            <span>${escapeHtml(item.name || "-")}</span>
                            <span>${money.format(Number(item.price || 0))}</span>
                            <span>x${Number(item.qty || 0)}</span>
                            <span>${money.format(Number(item.subtotal || 0))}</span>
                          </div>
                        `
                      )
                      .join("") || `<p class="helper-text">尚未提供品項明細</p>`}
                    ${items.length
                      ? `
                        <div class="mobile-order-row order-shipping-row">
                          <span>運費</span>
                          <span>NT$10</span>
                          <span>x${calculateTotalQty(items)}</span>
                          <span>${money.format(shipping)}</span>
                        </div>
                      `
                      : ""}
                  </div>
                </div>
                <div class="payment-total-row">
                  <span>總計</span>
                  <strong>${plainAmount(order.total)}</strong>
                </div>
              </article>
            `;
          })
          .join("")
      : `<p class="helper-text">查無訂單。</p>`;
  }

  function calculateTotalQty(items) {
    return items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  }

  function resolveOrderShipping(order, items = []) {
    const shipping = Number(order?.shipping || 0);
    if (shipping > 0) {
      return shipping;
    }
    return calculateTotalQty(items) * 10;
  }

  function getPublicOrderStatus(order) {
    if (order?.status === "canceled") {
      return { className: "canceled", label: "已取消" };
    }
    if (order?.status === "confirmed") {
      return { className: "confirmed", label: "已付款" };
    }
    if (order?.status === "unpaid") {
      return { className: "unpaid", label: "未付款" };
    }
    const orderTotal = Number(order.total || 0);
    const paidAmount = state.publicPayments
      .filter((payment) => payment.orderId === order.id && payment.status === "confirmed")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const pendingAmount = state.publicPayments
      .filter((payment) => payment.orderId === order.id && payment.status !== "confirmed")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    if (paidAmount >= orderTotal && orderTotal > 0) {
      return { className: "confirmed", label: "已付款" };
    }
    if (pendingAmount > 0) {
      return { className: "pending", label: "處理中" };
    }
    return { className: "unpaid", label: "未付款" };
  }

  function plainAmount(value) {
    return String(Number(value || 0));
  }

  function setAdminLocked(isLocked) {
    $("#adminLoginForm").style.display = isLocked ? "grid" : "none";
    $("#adminContent").classList.toggle("is-locked", isLocked);
  }

  function renderDashboard() {
    const totalCount = state.orders.length;
    const activeProductsCount = state.adminProducts.filter((product) => product.active !== false).length;
    const confirmedCount = state.orders.filter((order) => order.status === "confirmed").length;
    const canceledCount = state.orders.filter((order) => order.status === "canceled").length;
    const unpaidCount = state.orders.filter((order) => (order.status || "unpaid") === "unpaid").length;

    $("#metricOrders").textContent = String(totalCount);
    $("#metricActiveProducts").textContent = String(activeProductsCount);
    $("#metricConfirmed").textContent = String(confirmedCount);
    $("#metricUnpaid").textContent = String(unpaidCount);
    $("#metricCanceled").textContent = String(canceledCount);
    $("#metricDeleted").textContent = String(state.deletedCount || 0);

    renderProductSummary();
    renderAdminProducts();
    renderOrders();
    renderPayments();
  }

  function resetAdminProductForm(product = null) {
    const form = $("#adminProductForm");
    if (!form) {
      return;
    }
    form.reset();
    form.elements.productId.value = product?.id || "";
    form.elements.name.value = product?.name || "";
    form.elements.description.value = product?.description || "";
    form.elements.price.value = product?.price ?? "";
    form.elements.deadline.value = product?.deadline || "";
    form.elements.color.value = product?.color || "";
    form.elements.imageUrl.value = product?.imageUrl || "";
    form.elements.active.checked = product ? product.active !== false : true;
    const saveButton = $("#saveProductButton");
    if (saveButton) {
      saveButton.textContent = product ? "更新商品" : "儲存商品";
    }
  }

  function renderAdminProducts() {
    const list = $("#adminProductList");
    if (!list) {
      return;
    }

    list.innerHTML = state.adminProducts.length
      ? state.adminProducts
          .map((product) => `
            <tr>
              <td>
                <strong>${escapeHtml(product.name || "-")}</strong>
                <div class="admin-product-meta">${escapeHtml(product.deadline || "")}</div>
              </td>
              <td>${escapeHtml(product.description || "-")}</td>
              <td>${money.format(Number(product.price || 0))}</td>
              <td><span class="status ${product.active === false ? "unpaid" : "confirmed"}">${product.active === false ? "已下架" : "上架中"}</span></td>
              <td>
                <button class="small-button" type="button" data-edit-product-id="${escapeAttribute(product.id)}">修改價格/描述</button>
                <button class="small-button danger" type="button" data-delete-product-id="${escapeAttribute(product.id)}">刪除</button>
              </td>
            </tr>
          `)
          .join("")
      : `<tr><td colspan="5">目前沒有商品</td></tr>`;

    document.querySelectorAll("[data-edit-product-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const product = state.adminProducts.find((item) => item.id === button.dataset.editProductId);
        resetAdminProductForm(product || null);
      });
    });

    document.querySelectorAll("[data-delete-product-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const productId = button.dataset.deleteProductId;
        const product = state.adminProducts.find((item) => item.id === productId);
        if (!window.confirm(`確定要刪除商品 ${product?.name || productId}？`)) {
          return;
        }
        await api.request("deleteProduct", {
          productId,
          adminPassword: state.adminPassword
        });
        await loadDashboard();
        await loadProducts();
        showToast("商品已刪除。");
      });
    });
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
    const visibleOrders = state.adminOrderFilter === "all"
      ? state.orders
      : state.orders.filter((order) => {
          const status = ["confirmed", "canceled", "unpaid"].includes(order.status) ? order.status : "unpaid";
          return status === state.adminOrderFilter;
        });

    $("#orderList").innerHTML = visibleOrders
      .map((order) => {
        const status = ["confirmed", "canceled", "unpaid"].includes(order.status) ? order.status : "unpaid";
        const items = order.items || [];
        const subtotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
        const shipping = resolveOrderShipping(order, items);
        const amount = subtotal + shipping;
        return `
          <tr>
            <td>${escapeHtml(order.id)}</td>
            <td>${escapeHtml(order.buyerName)}</td>
            <td>
              ${items
                .map(
                  (item) =>
                    `${escapeHtml(item.name)}｜${money.format(Number(item.price || 0))} x ${Number(item.qty || 0)} = ${money.format(Number(item.subtotal || 0))}`
                )
                .join("<br>")}
              <br>
              運費｜NT$10 x ${calculateTotalQty(items)} = ${money.format(shipping)}
            </td>
            <td>${money.format(amount)}</td>
            <td><span class="status ${status}">${status === "confirmed" ? "已付款" : status === "canceled" ? "已取消" : "未付款"}</span></td>
            <td>
              <button class="small-button" type="button" data-order-status="unpaid" data-order-id="${escapeAttribute(order.id)}">未付款</button>
              <button class="small-button confirm" type="button" data-order-status="confirmed" data-order-id="${escapeAttribute(order.id)}">已付款</button>
              <button class="small-button" type="button" data-order-status="canceled" data-order-id="${escapeAttribute(order.id)}">已取消</button>
              <button class="small-button danger" type="button" data-delete-order-id="${escapeAttribute(order.id)}">刪除</button>
            </td>
          </tr>
        `;
      })
      .join("") || `<tr><td colspan="6">目前沒有訂單</td></tr>`;

    document.querySelectorAll("[data-order-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.orderFilter === state.adminOrderFilter);
      button.addEventListener("click", () => {
        state.adminOrderFilter = button.dataset.orderFilter || "all";
        renderOrders();
      });
    });

    document.querySelectorAll("[data-order-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        const nextStatus = button.dataset.orderStatus || "unpaid";
        const orderId = button.dataset.orderId;
        state.orders = state.orders.map((order) =>
          order.id === orderId ? { ...order, status: nextStatus } : order
        );
        state.publicOrders = state.publicOrders.map((order) =>
          order.id === orderId ? { ...order, status: nextStatus } : order
        );
        renderOrders();
        await api.request("updateOrderStatus", {
          orderId,
          status: nextStatus,
          adminPassword: state.adminPassword
        });
        await loadDashboard();
        await loadPublicBoard();
        showToast("訂單狀態已更新。");
      });
    });

    document.querySelectorAll("[data-delete-order-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const orderId = button.dataset.deleteOrderId;
        const targetOrder = state.orders.find((order) => order.id === orderId);
        const orderSummary = targetOrder ? `${targetOrder.buyerName} / ${orderId}` : orderId;
        if (!window.confirm(`確定要刪除訂單 ${orderSummary}？相關付款回報也會一起刪除。`)) {
          return;
        }

        await api.request("deleteOrder", {
          orderId,
          adminPassword: state.adminPassword
        });
        showToast(`訂單已刪除：${orderId}`);
        await loadDashboard();
        await loadPublicBoard();
      });
    });
  }

  function renderPayments() {
    const paymentList = $("#paymentList");
    if (!paymentList) {
      return;
    }
    const pendingPayments = state.payments.filter((payment) => payment.status !== "confirmed");

    paymentList.innerHTML = pendingPayments
      .map((payment) => `
        <article class="payment-row">
          <header>
            <strong>${escapeHtml(payment.payerName)} / ${money.format(Number(payment.amount || 0))}</strong>
            <span class="status ${payment.status === "confirmed" ? "confirmed" : "pending"}">
              ${payment.status === "confirmed" ? "已確認" : "待確認"}
            </span>
          </header>
          <p>${escapeHtml(payment.orderId)} · ${methodLabel(payment.method)} · ${escapeHtml(payment.reference || "無備註")}</p>
          <div class="payment-actions">
            <button class="small-button confirm" type="button" data-payment-id="${escapeAttribute(payment.id)}" ${payment.status === "confirmed" ? "disabled" : ""}>確認</button>
          </div>
        </article>
      `)
      .join("") || `<p>目前沒有待確認付款</p>`;

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
        form.elements.payerName.value = button.dataset.fillBuyerName || "";
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
    $("#deleteAllOrdersButton").addEventListener("click", async () => {
      if (!window.confirm("確定要刪除全部訂單？相關付款回報也會一起刪除。")) {
        return;
      }

      await api.request("deleteAllOrders", { adminPassword: state.adminPassword });
      showToast("全部訂單已刪除。");
      await loadDashboard();
      await loadPublicBoard();
    });
    $("#refreshAdmin").addEventListener("click", () => loadDashboard().then(() => {
      if (state.adminPassword) {
        showToast("統計已更新。");
      }
    }));
    $("#resetProductFormButton")?.addEventListener("click", () => resetAdminProductForm());
    $("#adminProductForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      const productId = String(form.get("productId") || "").trim();
      const payload = {
        productId,
        name: String(form.get("name") || "").trim(),
        description: String(form.get("description") || "").trim(),
        price: Number(form.get("price") || 0),
        deadline: String(form.get("deadline") || "").trim(),
        color: String(form.get("color") || "").trim(),
        imageUrl: String(form.get("imageUrl") || "").trim(),
        active: form.get("active") === "on",
        adminPassword: state.adminPassword
      };
      if (!payload.name) {
        showToast("請填寫商品名稱。");
        return;
      }
      if (productId) {
        await api.request("updateProduct", payload);
        showToast("商品已更新。");
      } else {
        await api.request("createProduct", payload);
        showToast("商品已新增。");
      }
      resetAdminProductForm();
      await loadDashboard();
      await loadProducts();
    });
  }

  async function init() {
    document.body.dataset.view = "shop";
    bindTabs();
    bindMobileStepper();
    bindOrderTabs();
    bindForms();
    bindActions();
    resetAdminProductForm();
    await loadProducts();
    await loadPublicBoard();
    updatePaymentMethodView();
    activateOrderPanel("my");
    updateMobileChrome("shop");
    if (consumeAdminEntryHash()) {
      await activateView("admin");
    }
  }

  window.addEventListener("hashchange", async () => {
    if (!consumeAdminEntryHash()) {
      return;
    }
    await activateView("admin");
  });

  init().catch((error) => showToast(error.message));
})();
