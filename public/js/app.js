const state = {
  gifts: [],
  activeCategory: "Todos",
  selectedGift: null,
};

const MAX_RESERVATION_QUANTITY = 9999;

const elements = {
  eventTitle: document.querySelector("#event-title"),
  familyName: document.querySelector("#family-name"),
  welcomeMessage: document.querySelector("#welcome-message"),
  categoryFilter: document.querySelector("#category-filter"),
  giftGrid: document.querySelector("#gift-grid"),
  emptyState: document.querySelector("#empty-state"),
  dialog: document.querySelector("#reservation-dialog"),
  form: document.querySelector("#reservation-form"),
  giftId: document.querySelector("#gift-id"),
  giftName: document.querySelector("#selected-gift-name"),
  quantity: document.querySelector("#reservation-quantity"),
  quantityHelp: document.querySelector("#quantity-help"),
  error: document.querySelector("#reservation-error"),
  submit: document.querySelector("#reservation-submit"),
  toast: document.querySelector("#toast"),
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Não foi possível concluir a operação.");
    error.details = data.details;
    throw error;
  }
  return data;
}

function statusLabel(status) {
  if (status === "sold_out") return "Esgotado";
  if (status === "partial") return "Parcial";
  return "Disponível";
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderFilters() {
  const categories = ["Todos", ...new Set(state.gifts.map((gift) => gift.category).filter(Boolean))];
  if (!categories.includes(state.activeCategory)) state.activeCategory = "Todos";
  elements.categoryFilter.replaceChildren();

  for (const category of categories) {
    const button = createElement("button", "category-chip", category);
    button.type = "button";
    button.setAttribute("aria-pressed", String(state.activeCategory === category));
    button.addEventListener("click", () => {
      state.activeCategory = category;
      renderFilters();
      renderGifts();
    });
    elements.categoryFilter.append(button);
  }
}

function createGiftCard(gift, index) {
  const soldOut = gift.status === "sold_out";
  const card = createElement("article", `gift-card${soldOut ? " gift-card--sold-out" : ""}`);
  card.style.animationDelay = `${Math.min(index * 55, 280)}ms`;

  const imageWrap = createElement("div", "gift-card__image-wrap");
  const image = createElement("img", "gift-card__image");
  image.src = gift.imageUrl || "/images/presente.svg";
  image.alt = `Ilustração de ${gift.name}`;
  image.loading = "lazy";
  image.addEventListener("error", () => {
    image.src = "/images/presente.svg";
  }, { once: true });

  const statusClass = gift.status === "partial"
    ? " gift-card__status--partial"
    : soldOut ? " gift-card__status--sold" : "";
  const badge = createElement("span", `gift-card__status${statusClass}`, statusLabel(gift.status));
  imageWrap.append(image, badge);

  const body = createElement("div", "gift-card__body");
  if (gift.category) body.append(createElement("span", "gift-card__category", gift.category));
  body.append(createElement("h3", "", gift.name));
  if (gift.description) body.append(createElement("p", "gift-card__description", gift.description));
  else body.append(createElement("div", "gift-card__description"));
  if (gift.imageAttribution && gift.imageSourceUrl) {
    const attribution = createElement("a", "gift-card__attribution", `Imagem: ${gift.imageAttribution}`);
    attribution.href = gift.imageSourceUrl;
    attribution.target = "_blank";
    attribution.rel = "noopener noreferrer";
    body.append(attribution);
  }

  const progressText = createElement(
    "div",
    `gift-card__progress-text${gift.unlimited ? " gift-card__progress-text--unlimited" : ""}`
  );
  if (gift.unlimited) {
    progressText.append(
      createElement("span", "", `${gift.reservedQuantity} reservado${gift.reservedQuantity === 1 ? "" : "s"}`),
      createElement("span", "", "Sem limite")
    );
  } else {
    progressText.append(
      createElement("span", "", `${gift.reservedQuantity} de ${gift.desiredQuantity} reservado${gift.desiredQuantity === 1 ? "" : "s"}`),
      createElement("span", "", soldOut ? "Completo" : `${gift.availableQuantity} livre${gift.availableQuantity === 1 ? "" : "s"}`)
    );
  }

  const button = createElement(
    "button",
    soldOut ? "button button--full gift-card__sold-button" : "button button--primary button--full",
    soldOut ? "Presente já escolhido" : "Vou presentear"
  );
  button.type = "button";
  button.disabled = soldOut;
  if (!soldOut) button.addEventListener("click", () => openReservation(gift));

  body.append(progressText);
  if (!gift.unlimited) {
    const progress = createElement("div", "progress");
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", `Quantidade reservada de ${gift.name}`);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", String(gift.desiredQuantity));
    progress.setAttribute("aria-valuenow", String(gift.reservedQuantity));
    const bar = createElement("div", "progress__bar");
    bar.style.width = `${Math.min(100, (gift.reservedQuantity / gift.desiredQuantity) * 100)}%`;
    progress.append(bar);
    body.append(progress);
  }
  body.append(button);
  card.append(imageWrap, body);
  return card;
}

function renderGifts() {
  const visible = state.activeCategory === "Todos"
    ? state.gifts
    : state.gifts.filter((gift) => gift.category === state.activeCategory);

  elements.giftGrid.replaceChildren(...visible.map(createGiftCard));
  elements.giftGrid.classList.toggle("hidden", visible.length === 0);
  elements.emptyState.classList.toggle("hidden", visible.length !== 0);
}

function openReservation(gift) {
  state.selectedGift = gift;
  elements.form.reset();
  elements.giftId.value = gift.id;
  elements.giftName.textContent = gift.name;
  elements.quantity.max = gift.unlimited ? MAX_RESERVATION_QUANTITY : gift.availableQuantity;
  elements.quantity.value = 1;
  elements.quantityHelp.textContent = gift.unlimited
    ? `Sem limite total para este presente. Escolha até ${MAX_RESERVATION_QUANTITY} unidades por vez.`
    : gift.availableQuantity === 1
      ? "1 unidade disponível."
      : `${gift.availableQuantity} unidades disponíveis.`;
  elements.error.classList.add("hidden");
  elements.dialog.showModal();
  window.setTimeout(() => document.querySelector("#guest-name").focus(), 50);
}

function adjustQuantity(change) {
  const max = state.selectedGift?.unlimited
    ? Number.MAX_SAFE_INTEGER
    : Number(elements.quantity.max) || 1;
  const current = Number(elements.quantity.value) || 1;
  elements.quantity.value = Math.min(max, Math.max(1, current + change));
}

function showToast(message, type = "success") {
  elements.toast.textContent = message;
  elements.toast.className = `toast toast--visible toast--${type}`;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("toast--visible");
  }, 4200);
}

async function loadPage() {
  try {
    const [settings, giftData] = await Promise.all([api("/api/settings"), api("/api/gifts")]);
    document.title = `${settings.eventTitle} | Lista de presentes`;
    elements.eventTitle.textContent = settings.eventTitle;
    elements.familyName.textContent = settings.familyName;
    elements.welcomeMessage.textContent = settings.welcomeMessage;
    state.gifts = giftData.gifts;
    renderFilters();
    renderGifts();
  } catch (error) {
    elements.giftGrid.replaceChildren();
    elements.emptyState.classList.remove("hidden");
    elements.emptyState.querySelector("h3").textContent = "Não foi possível carregar a lista";
    elements.emptyState.querySelector("p").textContent = "Verifique sua conexão e tente novamente em instantes.";
    showToast(error.message, "error");
  }
}

async function refreshGifts() {
  try {
    const giftData = await api("/api/gifts");
    state.gifts = giftData.gifts;
    renderFilters();
    renderGifts();
  } catch {
    // A atualização silenciosa não interrompe a leitura da página.
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.error.classList.add("hidden");
  elements.submit.disabled = true;
  elements.submit.textContent = "Confirmando...";

  const data = Object.fromEntries(new FormData(elements.form));
  data.giftId = Number(data.giftId);
  data.quantity = Number(data.quantity);

  try {
    const result = await api("/api/reservations", {
      method: "POST",
      body: JSON.stringify(data),
    });
    const index = state.gifts.findIndex((gift) => gift.id === result.gift.id);
    if (index !== -1) state.gifts[index] = result.gift;
    elements.dialog.close();
    renderFilters();
    renderGifts();
    showToast(result.message);
  } catch (error) {
    elements.error.textContent = error.message;
    elements.error.classList.remove("hidden");
    if (Number.isInteger(error.details?.available)) {
      elements.quantity.max = Math.max(1, error.details.available);
      elements.quantity.value = Math.min(Number(elements.quantity.value), Math.max(1, error.details.available));
      await refreshGifts();
    }
  } finally {
    elements.submit.disabled = false;
    elements.submit.textContent = "Confirmar reserva";
  }
});

document.querySelector("[data-close-modal]").addEventListener("click", () => elements.dialog.close());
document.querySelector("#quantity-minus").addEventListener("click", () => adjustQuantity(-1));
document.querySelector("#quantity-plus").addEventListener("click", () => adjustQuantity(1));
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshGifts();
});

loadPage();
window.setInterval(refreshGifts, 30000);
