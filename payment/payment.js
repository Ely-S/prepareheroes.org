// Mirrors pricing logic from script.js (homepage), but drives Stripe checkout.

const basePrices = {
  will: "$400",
  trustInd: "$1,500",
  trustCouple: "$1,600",
  trustUpdate: "$500"
};

const responderPrices = {
  will: "$0",
  trustInd: "$500",
  trustCouple: "$600",
  trustUpdate: "$350"
};

const pricing = {
  responder: {
    will: responderPrices.will,
    willBase: basePrices.will,
    trustInd: responderPrices.trustInd,
    trustIndBase: basePrices.trustInd,
    trustCouple: responderPrices.trustCouple,
    trustCoupleBase: basePrices.trustCouple,
    trustUpdate: responderPrices.trustUpdate,
    trustUpdateBase: basePrices.trustUpdate
  },
  civilian: {
    will: basePrices.will,
    willBase: "",
    trustInd: basePrices.trustInd,
    trustIndBase: "",
    trustCouple: basePrices.trustCouple,
    trustCoupleBase: "",
    trustUpdate: basePrices.trustUpdate,
    trustUpdateBase: ""
  }
};

let currentCustomerType = "responder";

function showError(message) {
  const el = document.getElementById("paymentError");
  if (!el) return;
  el.textContent = message || "Something went wrong starting checkout. Please try again.";
  el.style.display = "block";
}

function clearError() {
  const el = document.getElementById("paymentError");
  if (!el) return;
  el.style.display = "none";
}

window.setCustomerType = function setCustomerType(type) {
  currentCustomerType = type;
  sessionStorage.setItem("customerType", type);

  const options = document.querySelectorAll(".toggle-option");

  // Price Elements
  const pWill = document.getElementById("price-will");
  const pTrustInd = document.getElementById("price-trust-ind");
  const pTrustCouple = document.getElementById("price-trust-couple");
  const pTrustUpdate = document.getElementById("price-trust-update");

  // Base Price Elements (Strikethrough)
  const bWill = document.getElementById("base-will");
  const bTrustInd = document.getElementById("base-trust-ind");
  const bTrustCouple = document.getElementById("base-trust-couple");
  const bTrustUpdate = document.getElementById("base-trust-update");

  // Update toggle visuals
  options.forEach((opt) => opt.classList.remove("active"));
  if (type === "responder") {
    options[0]?.classList.add("active");
  } else {
    options[1]?.classList.add("active");
  }

  // Update prices with fade animation
  const elements = [pWill, pTrustInd, pTrustCouple, pTrustUpdate, bWill, bTrustInd, bTrustCouple, bTrustUpdate].filter(Boolean);
  elements.forEach((el) => (el.style.opacity = 0));

  setTimeout(() => {
    // Set Main Prices
    pWill.innerText = pricing[type].will;
    pTrustInd.innerText = pricing[type].trustInd;
    pTrustCouple.innerText = pricing[type].trustCouple;
    pTrustUpdate.innerText = pricing[type].trustUpdate;

    // Set Base Prices (Strikethrough)
    bWill.innerText = pricing[type].willBase;
    bTrustInd.innerText = pricing[type].trustIndBase;
    bTrustCouple.innerText = pricing[type].trustCoupleBase;
    bTrustUpdate.innerText = pricing[type].trustUpdateBase;

    elements.forEach((el) => (el.style.opacity = 1));
  }, 200);
};

window.startCheckout = async function startCheckout(packageType) {
  clearError();

  // Free option (responder will) shouldn't go through Stripe.
  if (packageType === "will" && currentCustomerType === "responder") {
    // Send them back to the homepage questionnaire, preselecting the package.
    window.location.href = `/?package=${encodeURIComponent(packageType)}`;
    return;
  }

  sessionStorage.setItem("selectedPackage", packageType);

  try {
    const res = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageType,
        customerType: currentCustomerType
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      throw new Error(data?.error || `Checkout failed (${res.status})`);
    }

    window.location.href = data.url;
  } catch (err) {
    console.error(err);
    showError(err?.message || "Something went wrong starting checkout. Please try again.");
  }
};

function initFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  if (type === "responder" || type === "civilian") {
    currentCustomerType = type;
  } else {
    const stored = sessionStorage.getItem("customerType");
    if (stored === "responder" || stored === "civilian") currentCustomerType = stored;
  }

  window.setCustomerType(currentCustomerType);

  // Optional: auto-start for ?package=
  const pkg = params.get("package");
  if (pkg) {
    // Only auto-start for paid items; free will should still bounce to home
    window.startCheckout(pkg);
  }
}

window.addEventListener("load", initFromQuery);


