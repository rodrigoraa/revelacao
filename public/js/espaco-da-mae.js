const state = {
  dashboard: null,
  search: "",
  imageSearchTimer: null,
  imageSearchSequence: 0,
};

const elements = {
  loginView: document.querySelector("#login-view"),
  motherSpaceView: document.querySelector("#mother-space-view"),
  loginForm: document.querySelector("#login-form"),
  loginError: document.querySelector("#login-error"),
  loginSubmit: document.querySelector("#login-submit"),
  settingsForm: document.querySelector("#settings-form"),
  giftList: document.querySelector("#mother-space-gift-list"),
  search: document.querySelector("#gift-search"),
  dialog: document.querySelector("#gift-dialog"),
  giftForm: document.querySelector("#gift-form"),
  giftError: document.querySelector("#gift-error"),
  giftSubmit: document.querySelector("#gift-submit"),
  giftName: document.querySelector("#gift-name"),
  giftQuantity: document.querySelector("#gift-quantity"),
  giftUnlimited: document.querySelector("#gift-unlimited"),
  giftImage: document.querySelector("#gift-image"),
  imageAttribution: document.querySelector("#gift-image-attribution"),
  imageSource: document.querySelector("#gift-image-source"),
  imageSearchButton: document.querySelector("#image-search-button"),
  imageSearchStatus: document.querySelector("#image-search-status"),
  imageSuggestionsGrid: document.querySelector("#image-suggestions-grid"),
  toast: document.querySelector("#mother-space-toast"),
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && url !== "/api/espaco-da-mae/login") showLogin();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function showToast(message, type = "success") {
  elements.toast.textContent = message;
  elements.toast.className = `toast toast--visible toast--${type}`;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("toast--visible");
  }, 3800);
}

function showLogin() {
  elements.loginView.classList.remove("hidden");
  elements.motherSpaceView.classList.add("hidden");
}

function showMotherSpace() {
  elements.loginView.classList.add("hidden");
  elements.motherSpaceView.classList.remove("hidden");
}

function formatDate(date) {
  if (!date) return "";
  const normalized = typeof date === "string" ? date.replace(" ", "T") : date;
  const hasTimezone = typeof normalized === "string"
    && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(
    typeof normalized === "string" && !hasTimezone ? `${normalized}Z` : normalized
  );
  if (Number.isNaN(parsed.getTime())) return "data indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function renderSummary() {
  const gifts = state.dashboard.gifts;
  const reserved = gifts.reduce((total, gift) => total + gift.reservedQuantity, 0);
  const available = gifts.reduce(
    (total, gift) => total + (Number.isInteger(gift.availableQuantity) ? gift.availableQuantity : 0),
    0
  );
  const hasUnlimited = gifts.some((gift) => gift.unlimited);
  const availableElement = document.querySelector("#summary-available");
  document.querySelector("#summary-gifts").textContent = gifts.length;
  document.querySelector("#summary-reserved").textContent = reserved;
  availableElement.textContent = hasUnlimited ? "∞" : available;
  availableElement.title = hasUnlimited
    ? `${available} unidades disponíveis nos presentes que possuem limite`
    : "";
}

function renderSettings() {
  const settings = state.dashboard.settings;
  document.querySelector("#settings-title-input").value = settings.eventTitle;
  document.querySelector("#settings-family").value = settings.familyName;
  document.querySelector("#settings-message").value = settings.welcomeMessage;
}

function reservationElement(reservation) {
  const row = createElement("div", `reservation${reservation.status === "cancelled" ? " reservation--cancelled" : ""}`);
  const person = createElement("div", "reservation__person");
  person.append(
    createElement("strong", "", reservation.guestName),
    createElement("span", "", reservation.phone || "Telefone não informado"),
    createElement("span", "reservation__date", `${reservation.status === "cancelled" ? "Cancelada" : "Reservada"} em ${formatDate(reservation.createdAt)}`)
  );

  const details = createElement("div", "reservation__details");
  details.append(createElement("span", "reservation__quantity", `${reservation.quantity} un.`));
  if (reservation.status === "active") {
    const cancel = createElement("button", "icon-button icon-button--danger", "Cancelar");
    cancel.type = "button";
    cancel.addEventListener("click", () => cancelReservation(reservation));
    details.append(cancel);
  }
  row.append(person, details);
  return row;
}

function giftElement(gift) {
  const reservations = Array.isArray(gift.reservations) ? gift.reservations : [];
  const card = createElement("article", "mother-space-gift");
  const main = createElement("div", "mother-space-gift__main");
  const image = createElement("img", "mother-space-gift__image");
  image.src = gift.imageUrl || "/images/presente.svg";
  image.alt = "";
  image.addEventListener("error", () => { image.src = "/images/presente.svg"; }, { once: true });

  const content = createElement("div", "mother-space-gift__content");
  const reservationSummary = gift.unlimited
    ? `${gift.reservedQuantity} reservado${gift.reservedQuantity === 1 ? "" : "s"} · sem limite`
    : `${gift.reservedQuantity} de ${gift.desiredQuantity} reservados`;
  content.append(
    createElement("h3", "", gift.name),
    createElement("p", "mother-space-gift__meta", `${gift.category || "Sem categoria"} · ${reservationSummary}`)
  );
  const progressWrap = createElement("div", "mother-space-gift__progress");
  if (gift.unlimited) {
    progressWrap.append(createElement("span", "mother-space-gift__unlimited", "Disponibilidade ilimitada"));
  } else {
    const progress = createElement("div", "progress");
    const bar = createElement("div", "progress__bar");
    bar.style.width = `${Math.min(100, (gift.reservedQuantity / gift.desiredQuantity) * 100)}%`;
    progress.append(bar);
    progressWrap.append(progress, createElement("span", "", `${gift.availableQuantity} livres`));
  }
  content.append(progressWrap);

  const actions = createElement("div", "mother-space-gift__actions");
  const edit = createElement("button", "icon-button", "Editar");
  edit.type = "button";
  edit.addEventListener("click", () => openGiftDialog(gift));
  const remove = createElement("button", "icon-button icon-button--danger", "Remover");
  remove.type = "button";
  remove.addEventListener("click", () => removeGift(gift));
  actions.append(edit, remove);
  main.append(image, content, actions);

  const activeCount = reservations.filter((item) => item.status === "active").length;
  const toggle = createElement(
    "button",
    "reservation-toggle",
    activeCount
      ? `Ver ${activeCount} reserva${activeCount === 1 ? "" : "s"} ativa${activeCount === 1 ? "" : "s"}`
      : "Nenhuma reserva ativa"
  );
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  const reservationList = createElement("div", "reservation-list hidden");

  if (reservations.length) {
    reservationList.append(...reservations.map(reservationElement));
  } else {
    reservationList.append(createElement("p", "reservation-empty", "Este presente ainda não recebeu reservas."));
  }

  toggle.addEventListener("click", () => {
    const willOpen = reservationList.classList.contains("hidden");
    reservationList.classList.toggle("hidden", !willOpen);
    toggle.setAttribute("aria-expanded", String(willOpen));
  });

  card.append(main, toggle, reservationList);
  return card;
}

function renderGifts() {
  const query = state.search.trim().toLocaleLowerCase("pt-BR");
  const gifts = state.dashboard.gifts.filter((gift) => {
    const searchable = `${gift.name} ${gift.category || ""}`.toLocaleLowerCase("pt-BR");
    return searchable.includes(query);
  });

  elements.giftList.replaceChildren();
  if (!gifts.length) {
    elements.giftList.append(createElement("p", "reservation-empty", query ? "Nenhum presente encontrado." : "Adicione o primeiro presente da lista."));
    return;
  }
  elements.giftList.append(...gifts.map(giftElement));
}

async function loadDashboard() {
  elements.giftList.innerHTML = '<p class="mother-space-loading">Carregando presentes...</p>';
  try {
    const dashboard = await api("/api/espaco-da-mae/dashboard");
    state.dashboard = dashboard;
    renderSummary();
    renderSettings();
    renderGifts();
  } catch (error) {
    if (!elements.motherSpaceView.classList.contains("hidden")) {
      elements.giftList.replaceChildren(
        createElement("p", "reservation-empty", "Não foi possível carregar os presentes. Recarregue a página para tentar novamente.")
      );
    }
    throw error;
  }
}

function openGiftDialog(gift = null) {
  elements.giftForm.reset();
  elements.giftError.classList.add("hidden");
  document.querySelector("#edit-gift-id").value = gift?.id || "";
  document.querySelector("#gift-dialog-title").textContent = gift ? "Editar presente" : "Adicionar presente";
  elements.giftName.value = gift?.name || "";
  document.querySelector("#gift-category").value = gift?.category || "";
  elements.giftQuantity.value = gift?.desiredQuantity || 1;
  elements.giftUnlimited.checked = Boolean(gift?.unlimited);
  syncQuantityLimit();
  document.querySelector("#gift-description").value = gift?.description || "";
  elements.giftImage.value = gift?.imageUrl || "";
  elements.imageAttribution.value = gift?.imageAttribution || "";
  elements.imageSource.value = gift?.imageSourceUrl || "";
  elements.imageSearchStatus.textContent = "Digite o nome do presente para ver sugestões.";
  elements.imageSuggestionsGrid.replaceChildren();
  elements.imageSuggestionsGrid.classList.add("hidden");
  elements.dialog.showModal();
  window.setTimeout(() => elements.giftName.focus(), 50);
}

function syncQuantityLimit() {
  const unlimited = elements.giftUnlimited.checked;
  elements.giftQuantity.disabled = unlimited;
  elements.giftQuantity.required = !unlimited;
}

function selectSuggestedImage(image, button) {
  elements.giftImage.value = image.imageUrl;
  elements.imageAttribution.value = image.sourceUrl ? image.attribution : "";
  elements.imageSource.value = image.sourceUrl || "";
  elements.imageSuggestionsGrid.querySelectorAll(".image-option").forEach((item) => {
    item.classList.toggle("image-option--selected", item === button);
    item.setAttribute("aria-pressed", String(item === button));
  });
}

function renderImageSuggestions(images) {
  elements.imageSuggestionsGrid.replaceChildren();
  if (!images.length) {
    elements.imageSuggestionsGrid.classList.add("hidden");
    elements.imageSearchStatus.textContent = "Nenhuma imagem encontrada. Você ainda pode informar uma URL manual.";
    return;
  }

  for (const image of images) {
    const button = createElement("button", "image-option");
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.title = `${image.title} — ${image.attribution}`;
    const preview = createElement("img");
    preview.src = image.imageUrl;
    preview.alt = image.title;
    preview.loading = "lazy";
    button.append(preview, createElement("span", "", image.attribution));
    button.addEventListener("click", () => selectSuggestedImage(image, button));
    elements.imageSuggestionsGrid.append(button);
  }

  elements.imageSearchStatus.textContent = "Escolha uma imagem abaixo:";
  elements.imageSuggestionsGrid.classList.remove("hidden");
}

async function searchGiftImages() {
  const query = elements.giftName.value.trim();
  if (query.length < 3) {
    elements.imageSearchStatus.textContent = "Digite pelo menos 3 letras para buscar imagens.";
    elements.imageSuggestionsGrid.classList.add("hidden");
    return;
  }

  const sequence = ++state.imageSearchSequence;
  elements.imageSearchStatus.textContent = "Buscando imagens relacionadas...";
  elements.imageSuggestionsGrid.classList.add("hidden");

  try {
    const result = await api(`/api/espaco-da-mae/images/search?q=${encodeURIComponent(query)}`);
    if (sequence !== state.imageSearchSequence) return;
    renderImageSuggestions(result.images);
  } catch (error) {
    if (sequence !== state.imageSearchSequence) return;
    elements.imageSearchStatus.textContent = error.message;
    elements.imageSuggestionsGrid.classList.add("hidden");
  }
}

async function cancelReservation(reservation) {
  if (!window.confirm(`Cancelar a reserva de ${reservation.guestName} e liberar ${reservation.quantity} unidade(s)?`)) return;
  try {
    const result = await api(`/api/espaco-da-mae/reservations/${reservation.id}`, { method: "DELETE" });
    await loadDashboard();
    showToast(result.message);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function removeGift(gift) {
  if (!window.confirm(`Remover "${gift.name}" da lista? Essa ação não pode ser desfeita.`)) return;
  try {
    const result = await api(`/api/espaco-da-mae/gifts/${gift.id}`, { method: "DELETE" });
    await loadDashboard();
    showToast(result.message);
  } catch (error) {
    showToast(error.message, "error");
  }
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginError.classList.add("hidden");
  elements.loginSubmit.disabled = true;
  elements.loginSubmit.textContent = "Entrando...";
  try {
    await api("/api/espaco-da-mae/login", {
      method: "POST",
      body: JSON.stringify({ password: document.querySelector("#mother-space-password").value }),
    });
    showMotherSpace();
    try {
      await loadDashboard();
    } catch (error) {
      showToast(error.message, "error");
    }
  } catch (error) {
    elements.loginError.textContent = error.message;
    elements.loginError.classList.remove("hidden");
  } finally {
    elements.loginSubmit.disabled = false;
    elements.loginSubmit.textContent = "Entrar";
  }
});

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#settings-submit");
  button.disabled = true;
  button.textContent = "Salvando...";
  try {
    const payload = Object.fromEntries(new FormData(elements.settingsForm));
    const result = await api("/api/espaco-da-mae/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    state.dashboard.settings = result.settings;
    showToast(result.message);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Salvar informações";
  }
});

elements.giftForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.giftError.classList.add("hidden");
  elements.giftSubmit.disabled = true;
  elements.giftSubmit.textContent = "Salvando...";

  const payload = Object.fromEntries(new FormData(elements.giftForm));
  payload.unlimited = elements.giftUnlimited.checked;
  if (payload.unlimited) delete payload.desiredQuantity;
  else payload.desiredQuantity = Number(payload.desiredQuantity);
  const giftId = document.querySelector("#edit-gift-id").value;

  try {
    const result = await api(giftId ? `/api/espaco-da-mae/gifts/${giftId}` : "/api/espaco-da-mae/gifts", {
      method: giftId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    elements.dialog.close();
    await loadDashboard();
    showToast(result.message);
  } catch (error) {
    elements.giftError.textContent = error.message;
    elements.giftError.classList.remove("hidden");
  } finally {
    elements.giftSubmit.disabled = false;
    elements.giftSubmit.textContent = "Salvar presente";
  }
});

document.querySelector("#add-gift-button").addEventListener("click", () => openGiftDialog());
document.querySelector("[data-close-gift-modal]").addEventListener("click", () => elements.dialog.close());
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
elements.search.addEventListener("input", () => {
  state.search = elements.search.value;
  renderGifts();
});
elements.giftName.addEventListener("input", () => {
  window.clearTimeout(state.imageSearchTimer);
  state.imageSearchTimer = window.setTimeout(searchGiftImages, 650);
});
elements.giftUnlimited.addEventListener("change", syncQuantityLimit);
elements.imageSearchButton.addEventListener("click", searchGiftImages);
elements.giftImage.addEventListener("input", () => {
  elements.imageAttribution.value = "";
  elements.imageSource.value = "";
  elements.imageSuggestionsGrid.querySelectorAll(".image-option").forEach((item) => {
    item.classList.remove("image-option--selected");
    item.setAttribute("aria-pressed", "false");
  });
});
document.querySelector("#logout-button").addEventListener("click", async () => {
  await api("/api/espaco-da-mae/logout", { method: "POST" });
  state.dashboard = null;
  elements.loginForm.reset();
  showLogin();
});

(async function initialize() {
  try {
    const session = await api("/api/espaco-da-mae/session");
    if (!session.authenticated) return showLogin();
    showMotherSpace();
  } catch (error) {
    showLogin();
    showToast(error.message, "error");
    return;
  }

  try {
    await loadDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
})();
