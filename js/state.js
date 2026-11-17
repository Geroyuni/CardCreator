import { $ } from "./utils.js";

export const state = {
  params: null,
  shared: false,
  saved: {},
  cardsId: null,
  currentCollection: null,

  selectedImg: null,
  openDetails: null,
  held: false,
  pressTimer: undefined,

  cropState: null,
  cropping: false,
  cropPointers: new Map(),
  pinch: null,
};

export const dom = {};

export function initDom() {
  Object.assign(dom, {
    page: $("page"),
    cards: $("cards"),

    search: $("search"),
    searchInput: $("searchInput"),
    searchResults: $("searchResults"),
    uploadButton: $("uploadButton"),
    uploadInput: $("uploadInput"),

    share: $("share"),
    shareStatus: $("shareStatus"),
    shareButton: $("shareButton"),
    mobileShareButton: $("mobileShareButton"),
    shareUrl: $("shareUrl"),
    copyShare: $("copyShare"),

    tooltip: $("tooltip"),

    crop: $("crop"),
    cropViewport: $("cropViewport"),
    cropImage: $("cropImage"),
    cropName: $("cropName"),
    cropApply: $("cropApply"),

    name: $("name"),
    color: $("color"),

    resetButton: $("resetButton"),
    mobileResetButton: $("mobileResetButton"),

    collectionSelect: $("collectionSelect"),
    mobileCollectionSelect: $("mobileCollectionSelect"),

    updateBanner: $("updateBanner"),
    updateButton: $("updateButton"),

    mobileMenu: $("mobileMenu"),
  });
}

export function initBackground() {
  document.addEventListener("toggle", e => {
    dom.page.inert =
      document.querySelector("[popover]:popover-open") !== null;

    if (e.newState === "open")
      dom.tooltip.hidden = true;
  }, true);
}

export function loadSaved() {
  state.params = new URLSearchParams(location.search);
  state.shared = state.params.has("cards");

  try {
    state.saved = JSON.parse(localStorage.getItem("cardSave")) || {};
  } catch {
    state.saved = {};
  }

  state.cardsId = state.saved.cardsId || null;
}

export function guard() {
  if (!state.shared) return true;

  const ok = confirm(
    "You are viewing a shared collection. Editing will delete " +
    "any existing cards saved to your device, and will replace it " +
    "with this card collection. Continue?"
  );

  if (ok) {
    state.shared = false;
    history.replaceState(null, "", location.pathname);
  }

  return ok;
}
