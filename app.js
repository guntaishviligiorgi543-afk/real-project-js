/* Luma Supply storefront runtime. Uses only the Supabase publishable key. */
(function () {
  "use strict";

  var SUPABASE_URL = "https://zmkbthehjloapkbkucej.supabase.co";
  var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzIiwicmVmIjoienprYnl0aGVobG9hcGti dWNlaiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzkxMDEzOTA3LCJleHAiOjIxMDY1ODk5MDd9.lbT8HNmEUkcursn3licOHzhJzAj8OC4fznQHHhi4ayw".replace(/\s/g, "");
  var supabase = null;
  var localCartKey = "luma-cart";

  function loadClient() {
    if (window.supabase && window.supabase.createClient) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  }

  function setMessage(id, text, isError) {
    var node = document.getElementById(id);
    if (!node && id === "toast-message") {
      node = document.createElement("p");
      node.id = id;
      node.className = "toast-message";
      document.body.appendChild(node);
    }
    if (!node) return;
    node.textContent = text || "";
    node.classList.toggle("is-error", !!isError);
  }

  function localCart() {
    try {
      return JSON.parse(localStorage.getItem(localCartKey) || "[]");
    } catch (error) {
      console.error("Unable to read local cart.", error);
      return [];
    }
  }

  function saveLocalCart(cart) {
    localStorage.setItem(localCartKey, JSON.stringify(cart));
    updateCartCount(cart.reduce(function (total, item) { return total + Number(item.quantity || 0); }, 0));
  }

  function updateCartCount(count) {
    document.querySelectorAll("#cart-count").forEach(function (node) {
      node.textContent = String(count || 0);
      node.hidden = !count;
    });
  }

  async function getUser() {
    if (!supabase) return null;
    var result = await supabase.auth.getUser();
    if (result.error) throw result.error;
    return result.data.user;
  }

  async function refreshHeader() {
    var user = null;
    try { user = await getUser(); } catch (error) { console.error("Unable to read session.", error); }
    document.querySelectorAll(".auth-guest, .auth-guest-mobile").forEach(function (node) {
      node.classList.toggle("is-hidden", !!user);
    });
    document.querySelectorAll(".auth-user, .auth-user-mobile").forEach(function (node) {
      node.classList.toggle("is-hidden", !user);
    });
    if (user) {
      try {
        var response = await supabase.from("cart_items").select("quantity").eq("user_id", user.id);
        if (response.error) throw response.error;
        updateCartCount((response.data || []).reduce(function (total, item) { return total + Number(item.quantity || 0); }, 0));
      } catch (error) {
        console.error("Unable to load cart count.", error);
        updateCartCount(localCart().reduce(function (total, item) { return total + Number(item.quantity || 0); }, 0));
      }
    } else {
      updateCartCount(localCart().reduce(function (total, item) { return total + Number(item.quantity || 0); }, 0));
    }
  }

  function setupNavigation() {
    var menu = document.getElementById("mobile-menu");
    var overlay = document.getElementById("mobile-menu-overlay");
    var openButton = document.getElementById("burger-menu-btn");
    var closeButton = document.getElementById("mobile-menu-close");
    if (!menu || !overlay || !openButton) return;
    function close() {
      menu.classList.remove("is-open");
      overlay.classList.remove("is-active");
      openButton.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    }
    function open() {
      menu.classList.add("is-open");
      overlay.classList.add("is-active");
      openButton.setAttribute("aria-expanded", "true");
      document.body.classList.add("menu-open");
    }
    openButton.addEventListener("click", open);
    if (closeButton) closeButton.addEventListener("click", close);
    overlay.addEventListener("click", close);
    menu.querySelectorAll("a").forEach(function (link) { link.addEventListener("click", close); });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape") close(); });
    window.addEventListener("scroll", function () {
      var header = document.querySelector(".site-header");
      if (header) header.classList.toggle("is-scrolled", window.scrollY > 12);
    }, { passive: true });
  }

  async function addToCart(productId, quantity) {
    quantity = Math.max(1, Number(quantity) || 1);
    var user = await getUser();
    if (user && supabase) {
      var rpc = await supabase.rpc("add_to_cart", { p_product_id: Number(productId), p_quantity: quantity });
      if (rpc.error) throw rpc.error;
    } else {
      var cart = localCart();
      var item = cart.find(function (entry) { return String(entry.product_id) === String(productId); });
      if (item) item.quantity += quantity;
      else cart.push({ product_id: Number(productId), quantity: quantity });
      saveLocalCart(cart);
    }
    await refreshHeader();
    setMessage("toast-message", "Added to your cart.", false);
  }

  function setupProductActions() {
    document.querySelectorAll(".add-to-cart-btn, #add-to-cart-btn").forEach(function (button) {
      button.addEventListener("click", async function () {
        button.disabled = true;
        try {
          await addToCart(button.dataset.productId, document.getElementById("product-quantity")?.value || 1);
          button.classList.add("is-added");
          button.textContent = "Added";
          window.setTimeout(function () { button.textContent = "Add to cart"; button.classList.remove("is-added"); }, 1300);
        } catch (error) {
          console.error("Unable to add item to cart.", error);
          setMessage("toast-message", "We couldn't add that item. Please try again.", true);
        } finally {
          button.disabled = false;
        }
      });
    });
    var quantity = document.getElementById("product-quantity");
    if (quantity) {
      document.getElementById("decrease-quantity")?.addEventListener("click", function () { quantity.value = Math.max(1, Number(quantity.value) - 1); });
      document.getElementById("increase-quantity")?.addEventListener("click", function () { quantity.value = Number(quantity.value) + 1; });
    }
  }

  async function loadProduct() {
    var title = document.getElementById("product-title");
    if (!title || !supabase) return;
    var id = new URLSearchParams(window.location.search).get("id") || "101";
    var result = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    var product = result.data;
    if (!product) return;
    var value = function (names, fallback) {
      for (var i = 0; i < names.length; i += 1) if (product[names[i]] !== undefined && product[names[i]] !== null) return product[names[i]];
      return fallback;
    };
    title.textContent = value(["name", "title"], title.textContent);
    document.getElementById("product-category").textContent = value(["category_name", "category"], document.getElementById("product-category").textContent);
    document.getElementById("product-description").textContent = value(["description", "short_description"], document.getElementById("product-description").textContent);
    document.getElementById("product-price").textContent = "$" + Number(value(["price"], 0)).toFixed(2);
    var button = document.getElementById("add-to-cart-btn");
    if (button) button.dataset.productId = String(product.id);
  }

  function setupAuthForms() {
    var signIn = document.getElementById("sign-in-form");
    if (signIn) signIn.addEventListener("submit", async function (event) {
      event.preventDefault();
      var data = new FormData(signIn);
      try {
        var result = await supabase.auth.signInWithPassword({ email: data.get("email"), password: data.get("password") });
        if (result.error) throw result.error;
        window.location.href = "profile.html";
      } catch (error) {
        console.error("Sign-in failed.", error);
        setMessage("sign-in-message", error.message || "Unable to sign in.", true);
      }
    });
    var signUp = document.getElementById("sign-up-form");
    if (signUp) signUp.addEventListener("submit", async function (event) {
      event.preventDefault();
      var data = new FormData(signUp);
      if (data.get("password") !== data.get("confirmPassword")) { setMessage("sign-up-message", "Passwords must match.", true); return; }
      try {
        var result = await supabase.auth.signUp({ email: data.get("email"), password: data.get("password"), options: { data: { first_name: data.get("firstName"), last_name: data.get("lastName"), phone: data.get("phone") } } });
        if (result.error) throw result.error;
        setMessage("sign-up-message", "Account created. Check your email to confirm your address.", false);
      } catch (error) {
        console.error("Sign-up failed.", error);
        setMessage("sign-up-message", error.message || "Unable to create account.", true);
      }
    });
    document.querySelectorAll("#sign-out-btn, #mobile-sign-out-btn").forEach(function (button) {
      button.addEventListener("click", async function () {
        var result = await supabase.auth.signOut();
        if (result.error) { console.error("Sign-out failed.", result.error); return; }
        window.location.href = "index.html";
      });
    });
  }

  function setupNewsletter() {
    var form = document.getElementById("newsletter-form");
    if (!form) return;
    form.addEventListener("submit", function (event) { event.preventDefault(); form.reset(); setMessage("toast-message", "You're on the list.", false); });
  }

  function setupCart() {
    var items = document.getElementById("cart-items");
    if (!items) return;
    items.addEventListener("click", async function (event) {
      var button = event.target.closest(".quantity button, .remove-item");
      if (!button) return;
      var row = button.closest(".cart-item");
      var input = row && row.querySelector(".quantity input");
      if (button.classList.contains("remove-item")) {
        row.remove();
      } else if (input) {
        input.value = Math.max(1, Number(input.value) + (button.textContent.trim() === "+" ? 1 : -1));
      }
      updateCartSummary();
    });
    items.addEventListener("change", updateCartSummary);
    updateCartSummary();
  }

  function updateCartSummary() {
    var rows = document.querySelectorAll("#cart-items .cart-item");
    var subtotal = 0;
    var count = 0;
    rows.forEach(function (row) {
      var price = Number((row.querySelector(".cart-item-info > p:last-of-type")?.textContent || "").replace(/[^0-9.]/g, ""));
      var quantity = Math.max(1, Number(row.querySelector(".quantity input")?.value || 1));
      var total = price * quantity;
      var totalNode = row.querySelector(":scope > strong");
      if (totalNode) totalNode.textContent = "$" + total.toFixed(2);
      subtotal += total;
      count += quantity;
    });
    var subtotalNode = document.getElementById("cart-subtotal");
    var totalNode = document.getElementById("cart-total");
    if (subtotalNode) subtotalNode.textContent = "$" + subtotal.toFixed(2);
    if (totalNode) totalNode.textContent = "$" + subtotal.toFixed(2);
    var empty = document.getElementById("empty-cart");
    if (empty) empty.classList.toggle("is-hidden", rows.length > 0);
    updateCartCount(count);
  }

  function setupContact() {
    var form = document.getElementById("contact-form");
    if (!form) return;
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var data = new FormData(form);
      try {
        var result = await supabase.from("contact_messages").insert({ name: data.get("name"), email: data.get("email"), subject: data.get("subject"), message: data.get("message") });
        if (result.error) throw result.error;
        form.reset();
        setMessage("contact-form-message", "Thanks — your message has been sent.", false);
      } catch (error) {
        console.error("Contact submission failed.", error);
        setMessage("contact-form-message", "We couldn't send your message. Please try again.", true);
      }
    });
  }

  function setupProfile() {
    var form = document.getElementById("profile-form");
    if (!form || !supabase) return;
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      try {
        var user = await getUser();
        if (!user) { window.location.href = "sign-in.html"; return; }
        var data = new FormData(form);
        var result = await supabase.from("profiles").update({
          first_name: data.get("firstName"),
          last_name: data.get("lastName"),
          phone: data.get("phone")
        }).eq("id", user.id);
        if (result.error) throw result.error;
        setMessage("toast-message", "Your details were saved.", false);
      } catch (error) {
        console.error("Profile update failed.", error);
        setMessage("toast-message", "We couldn't save your details.", true);
      }
    });
    var passwordForm = document.querySelector("#security form");
    if (passwordForm) passwordForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      var data = new FormData(passwordForm);
      if (data.get("newPassword") !== data.get("confirmPassword")) {
        setMessage("toast-message", "Passwords must match.", true);
        return;
      }
      var result = await supabase.auth.updateUser({ password: data.get("newPassword") });
      if (result.error) { console.error("Password update failed.", result.error); setMessage("toast-message", result.error.message, true); return; }
      passwordForm.reset();
      setMessage("toast-message", "Password updated.", false);
    });
  }

  function boot() {
    loadClient();
    setupNavigation();
    setupProductActions();
    setupAuthForms();
    setupNewsletter();
    setupCart();
    setupContact();
    setupProfile();
    refreshHeader();
    if (document.getElementById("product-title")) loadProduct().catch(function (error) { console.error("Unable to load product.", error); });
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
