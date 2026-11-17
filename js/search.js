import { WORKER, ADD_IMAGE } from "./utils.js";
import { state, dom } from "./state.js";
import { applyImage } from "./cards.js";

const IGDB_IMAGE = {
    big: "https://images.igdb.com/igdb/image/upload/t_cover_big/",
    small: "https://images.igdb.com/igdb/image/upload/t_cover_small/"
};

let openCropHandler;
let debounce;

export function initSearch(openCrop) {
  openCropHandler = openCrop;

  dom.searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(runSearch, 400);
  });

  dom.searchInput.addEventListener("keydown", e => {
    if (e.key !== "ArrowDown") return;

    const first = dom.searchResults.firstElementChild;
    if (dom.searchResults.hidden || !first) return;

    e.preventDefault();
    focusResult(first);
  });

  dom.searchResults.addEventListener("keydown", e => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

    const items = [...dom.searchResults.children];
    const index = items.indexOf(e.target);
    if (index === -1) return;

    e.preventDefault();

    const next = e.key === "ArrowDown"
      ? items[index + 1] || dom.searchInput
      : items[index - 1] || dom.searchInput;

    focusResult(next);
  });

  dom.uploadButton.addEventListener("click", () =>
    dom.uploadInput.click()
  );

  dom.uploadInput.addEventListener("change", e => {
    if (e.target.files[0]) openCrop(e.target.files[0]);
    e.target.value = "";
  });

  dom.search.addEventListener("paste", e => {
    const item = [...e.clipboardData.items]
      .find(i => i.type.startsWith("image/"));

    if (!item) return;
    e.preventDefault();
    openCrop(item.getAsFile());
  });
}

export function openSearch(img) {
  state.selectedImg = img;
  dom.searchInput.value = "";
  showEmptyState();
  dom.search.showPopover();
  dom.searchInput.focus();
}

function showEmptyState() {
  dom.searchResults.innerHTML = "";

  if (state.selectedImg?.src.endsWith(ADD_IMAGE)) {
    dom.searchResults.hidden = true;
    return;
  }

  const button = document.createElement("button");
  button.textContent = "Remove image";
  button.addEventListener("click", () => applyImage(ADD_IMAGE, ""));

  dom.searchResults.append(button);
  dom.searchResults.hidden = false;
}

function showResultsURL(url) {
  dom.searchResults.innerHTML = "";

  const field = document.createElement("li");
  const form = document.createElement("form");
  const input = document.createElement("input");

  input.placeholder = "Name for this image (optional)";
  input.setAttribute("aria-label", "Name for this image");
  input.autocomplete = "off";

  form.addEventListener("submit", e => {
    e.preventDefault();
    applyImage(url, input.value.trim());
  });

  form.append(input);
  field.append(form);
  dom.searchResults.append(field);
  dom.searchResults.hidden = false;

  input.focus();
}

function showResultsIGDB(games) {
  dom.searchResults.innerHTML = "";

  for (const game of games || []) {
    if (!game.cover?.image_id) continue;

    const button = document.createElement("button");
    const img = document.createElement("img");

    img.src = IGDB_IMAGE.small + game.cover.image_id + ".jpg";
    img.alt = "";

    button.append(game.name, img);
    button.addEventListener("click", () => applyImage(
      IGDB_IMAGE.big + game.cover.image_id + ".jpg",
      game.name
    ));

    dom.searchResults.append(button);
  }

  dom.searchResults.hidden = !dom.searchResults.children.length;
}

async function runSearch() {
  const query = dom.searchInput.value;

  if (query.length <= 1) {
    showEmptyState();
    return;
  }

  if (query.startsWith("http")) {
    showResultsURL(query);
    return;
  }

  const safeQuery = query.replace(/[";]/g, " ").trim();

  const res = await fetch(`${WORKER}/games`, {
    method: "POST",
    body:
      `search "${safeQuery}"; ` +
      "fields id, name, cover.image_id; limit 15;",
  });

  if (!res.ok) {
    dom.searchResults.innerHTML = "";
    const item = document.createElement("li");
    item.textContent = `Search failed (${res.status})`;
    dom.searchResults.append(item);
    dom.searchResults.hidden = false;
    return;
  }

  showResultsIGDB(await res.json());
}

function focusResult(el) {
  (el.querySelector("input") || el).focus();
}
