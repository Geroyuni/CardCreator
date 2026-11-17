import {
  WORKER,
  ADD_IMAGE,
  LATEST_VERSIONS,
  decompressText,
} from "./utils.js";

import { state, dom, guard } from "./state.js";

let selectCardHandler;

export function initCards(onCardSelect) {
  selectCardHandler = onCardSelect;

  dom.resetButton.addEventListener("click", resetCollection);
  dom.mobileResetButton.addEventListener("click", resetCollection);
  dom.updateButton.addEventListener("click", updateCollection);

  dom.cards.addEventListener("click", e => {
    if (state.held) {
      state.held = false;
      return;
    }

    const mention = e.target.closest(".hm");
    if (e.target.closest(".details") && !mention) return;
    if (e.target.closest(".details-wrap") && !mention) return;

    const card = e.target.closest(".card");
    if (!card) return;

    selectCard((mention || card).querySelector("img"));
  });


  dom.cards.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (!e.target.matches(".card > img, .hm img")) return;

    e.preventDefault();
    selectCard(e.target);
  });

  dom.cards.addEventListener("touchstart", e => {
    state.held = false;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;

    clearTimeout(state.pressTimer);
    state.pressTimer = setTimeout(() => {
      state.held = true;

      const mention = e.target.closest(".hm");
      if (mention) {
        const name = mention.querySelector("img").dataset.name;
        if (name) showTooltip(name, x, y);
        else dom.tooltip.hidden = true;
        return;
      }

      const card = e.target.closest(".card");
      if (!card) return;

      closeDetails();
      state.openDetails = card.querySelector(".details");
      state.openDetails.classList.add("open");
      dom.tooltip.hidden = true;
    }, 450);
  }, { passive: true });

  for (const type of ["touchend", "touchmove", "touchcancel"])
    dom.cards.addEventListener(type, () => clearTimeout(state.pressTimer));

  dom.cards.addEventListener("contextmenu", e => {
    if (state.held) e.preventDefault();
  });

  dom.cards.addEventListener("mousemove", e => {
    const name = e.target.closest(".hm")
      ?.querySelector("img")?.dataset.name;

    if (!name) {
      dom.tooltip.hidden = true;
      return;
    }

    dom.tooltip.textContent = name;
    dom.tooltip.hidden = false;

    const box = dom.tooltip.getBoundingClientRect();
    let x = e.clientX + 12;
    let y = e.clientY + 14;

    if (x + box.width > innerWidth - 8)
      x = Math.max(8, e.clientX - box.width - 12);

    if (y + box.height > innerHeight - 8)
      y = Math.max(8, e.clientY - box.height - 14);

    dom.tooltip.style.left = x + "px";
    dom.tooltip.style.top = y + "px";
  });

  dom.cards.addEventListener("mouseleave", () => {
    dom.tooltip.hidden = true;
  });

  window.addEventListener("click", e => {
    if (state.held) return;
    dom.tooltip.hidden = true;

    if (state.openDetails && !e.target.closest(".details"))
      closeDetails();
  }, true);

  dom.mobileMenu.addEventListener("click", e => {
    if (e.target.closest("select, button"))
      e.currentTarget.open = false;
  });

  const desktopSelect = dom.collectionSelect;
  const mobileSelect = dom.mobileCollectionSelect;

  function syncCollection(source, target) {
    if (!guard()) {
      source.value = target.value;
      return;
    }

    target.value = source.value;
    state.currentCollection = source.value;
    state.cardsId = null;
    save();
  }

  desktopSelect.addEventListener("change",
    () => syncCollection(desktopSelect, mobileSelect));

  mobileSelect.addEventListener("change",
    () => syncCollection(mobileSelect, desktopSelect));

  for (const id of ["name", "color"]) {
    const el = dom[id];

    el.addEventListener("mousedown", e => {
      if (e.button !== 0 || !state.shared) return;
      if (!guard()) e.preventDefault();
    });

    el.addEventListener("focus", () => {
      if (!state.shared) return;
      if (!guard()) el.blur();
    });

    el.addEventListener("input", save);
  }

  dom.color.addEventListener("input", e => setColor(e.target.value));

  document.addEventListener("toggle", e => {
    if (e.newState === "open")
      dom.tooltip.hidden = true;
  }, true);
}

function selectCard(img) {
  img.blur();
  state.selectedImg = img;
  selectCardHandler?.(img);
}

export function cardImages() {
  return [...dom.cards.querySelectorAll(".card img")].map(img => ({
    src: img.dataset.src || img.getAttribute("src"),
    name: img.dataset.name || "",
  }));
}

export function save() {
  if (state.shared) return;

  localStorage.setItem("cardSave", JSON.stringify({
    collection: state.currentCollection,
    name: dom.name.value,
    color: dom.color.value,
    cardsId: state.cardsId,
    images: cardImages(),
  }));

  syncResetButtons();
}

export function syncResetButtons() {
  const disabled = !localStorage.getItem("cardSave");
  dom.resetButton.disabled = disabled;
  dom.mobileResetButton.disabled = disabled;
}

function resetCollection() {
  const message =
    "Reset to default? This clears your saved collection.";

  if (!confirm(message)) return;

  localStorage.removeItem("cardSave");
  location.assign(location.pathname);
}

export function setCardImage(img, src, name) {
  img.src = src;
  img.dataset.src = src;
  img.alt = name || "";
  img.dataset.name = name || "";

  const card = img.closest(".card");
  if (img.parentElement === card) {
    card.querySelector(".details-name").textContent = name || "???";
    return;
  }

  const count = [...card.querySelectorAll(".hm img")]
    .filter(m => !m.src.endsWith("add.svg")).length;

  const badge = card.querySelector(".mention-count");
  badge.textContent = `+${count}`;
  badge.hidden = !count;
}

function showTooltip(name, x, y) {
  dom.tooltip.textContent = name;
  dom.tooltip.hidden = false;

  const box = dom.tooltip.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(x - box.width / 2, innerWidth - box.width - 8)
  );

  let top = y - box.height - 14;
  if (top < 8) top = y + 14;

  dom.tooltip.style.left = left + "px";
  dom.tooltip.style.top = top + "px";
}

function closeDetails() {
  if (!state.openDetails) return;
  state.openDetails.classList.remove("open");
  state.openDetails = null;
}

function cardHtml(entry, anchor) {
  const mention =
    `<div class="hm"><img src="${ADD_IMAGE}" alt="" role="button" ` +
    `tabindex="0" aria-label="Choose mention for ${entry.name}">` +
    `</div>`;

  return `
    <div class="card" style="anchor-name: ${anchor}">
      <img src="${ADD_IMAGE}" alt="" role="button" tabindex="0"
        aria-label="Choose image for ${entry.name}">
      <p>${entry.name}</p>
      <div class="details-wrap" style="position-anchor: ${anchor}">
        <div class="details">
          <h3 class="details-name">???</h3>
          <p class="details-desc">${entry.description || ""}</p>
          <p class="hm-label">Honorable mentions (optional)</p>
          <div class="hm-row">${mention.repeat(3)}</div>
        </div>
      </div>
      <span class="mention-count" hidden></span>
    </div>`;

}

function renderBoard(board, savedState) {
  let anchor = 0;
  let html = "";

  for (const category in board) {
    html += `<h2>${category}</h2>`;
    for (const entry of board[category])
      html += cardHtml(entry, `--card${anchor++}`);
  }

  dom.cards.innerHTML = html;

  if (savedState.collection) {
    dom.collectionSelect.value = savedState.collection;
    dom.mobileCollectionSelect.value = savedState.collection;
  }

  if (savedState.name != null) dom.name.value = savedState.name;

  if (savedState.color != null) {
    dom.color.value = savedState.color;
    setColor(savedState.color);
  }

  if (savedState.images)
    dom.cards.querySelectorAll(".card img").forEach((img, i) => {
      const image = savedState.images[i];
      if (image) setCardImage(img, image.src, image.name);
    });
}

function collectionFamily(id) {
  return id.replace(/^v\d+_/, "");
}

function offerUpdate(collection) {
  const latest = LATEST_VERSIONS[collectionFamily(collection)];
  if (!latest || latest === collection) return;

  const version = id => {
    const match = id.match(/^v(\d+)_/);
    return match ? Number(match[1]) : 0;
  };

  if (version(collection) >= version(latest)) return;

  dom.updateBanner.hidden = false;
}

function boardKeys(board) {
  const keys = [];
  for (const category in board)
    for (const entry of board[category])
      keys.push(`${category} > ${entry.name}`);
  return keys;
}

async function updateCollection() {
  const latest = LATEST_VERSIONS[collectionFamily(state.currentCollection)];

  const oldBoard = await fetch(
    `collections/${state.currentCollection}.json`
  ).then(res => res.json());

  const newBoard = await fetch(
    `collections/${latest}.json`
  ).then(res => res.json());

  const oldKeys = boardKeys(oldBoard);
  const newKeys = boardKeys(newBoard);

  const added = newKeys.filter(key => !oldKeys.includes(key));
  const removed = oldKeys.filter(key => !newKeys.includes(key));

  let message =
    "Are you sure you want to update this to its newer version?";

  if (state.shared)
    message +=
      " You are viewing a shared collection, so this will delete " +
      "any existing cards saved to your device, and will replace it " +
      "with this updated collection.";

  if (added.length)
    message += "\nThese cards will be added:\n\n" + added.join("\n");

  if (removed.length)
    message += "\n\nThese cards will be removed:\n\n" + removed.join("\n");

  if (!confirm(message)) return;

  const oldImages = cardImages();
  const imagesPerCard = oldKeys.length
    ? oldImages.length / oldKeys.length
    : 0;

  const imagesByKey = new Map();
  oldKeys.forEach((key, i) =>
    imagesByKey.set(key, oldImages.slice(
      i * imagesPerCard,
      (i + 1) * imagesPerCard
    ))
  );

  const images = [];
  for (const key of newKeys)
    images.push(
      ...(imagesByKey.get(key) || Array(imagesPerCard).fill(undefined))
    );

  state.shared = false;
  state.cardsId = null;
  state.currentCollection = latest;

  history.replaceState(null, "", location.pathname);

  renderBoard(newBoard, {
    collection: latest,
    images,
  });

  dom.updateBanner.hidden = true;
  save();
}

export async function addCards() {
  let appState = state.saved;

  if (state.shared) {
    const cardsParam = state.params.get("cards");

    appState = {
      name: state.params.get("name"),
      color: state.params.get("color") ? "#" + state.params.get("color") : null,
    };

    const res = await fetch(`${WORKER}/share/${cardsParam}`);
    if (res.ok) {
      const json = await decompressText(await res.text());
      appState = { ...appState, ...JSON.parse(json) };
      state.cardsId = cardsParam;
    } else {
      state.shared = false;
    }
  }

  state.currentCollection = appState.collection || "v1_games";

  const board = await fetch(
    `collections/${state.currentCollection}.json`
  ).then(res => res.json());

  renderBoard(board, appState);
  offerUpdate(state.currentCollection);
}

export function commitImage(src, name) {
  if (!state.selectedImg) return;

  setCardImage(state.selectedImg, src, name);
  dom.search.hidePopover();

  state.cardsId = null;
  save();
}

export function applyImage(src, name) {
  if (!guard()) return;
  commitImage(src, name);
}

function setColor(color) {
  document.documentElement.style.setProperty("--color", color);
}
