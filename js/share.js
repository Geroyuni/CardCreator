import { WORKER, JXL_DATA, compressText } from "./utils.js";
import { state, dom } from "./state.js";
import { cardImages, save, setCardImage } from "./cards.js";

const imageLink = id => `${WORKER}/image/${id}`;

export function initShare() {
  dom.shareButton.addEventListener("click", openShare);
  dom.mobileShareButton.addEventListener("click", openShare);
  dom.copyShare.addEventListener("click", () =>
    copyField(dom.shareUrl, dom.copyShare)
  );
}

async function uploadDataImages() {
  for (const img of dom.cards.querySelectorAll(".card img")) {
    const src = img.dataset.src || "";
    if (!src.startsWith(JXL_DATA)) continue;

    const res = await fetch(`${WORKER}/image`, {
      method: "POST",
      headers: { "Content-Type": "image/jxl" },
      body: Uint8Array.fromBase64(src.slice(JXL_DATA.length)),
    });

    if (!res.ok)
      throw new Error(`upload failed (${res.status})`);

    const id = (await res.text()).trim();
    setCardImage(img, imageLink(id), img.dataset.name);
    save();
  }
}

async function openShare() {
  dom.share.showPopover();

  dom.shareUrl.value = "";
  dom.copyShare.classList.remove("copied");

  const pending = [...dom.cards.querySelectorAll(".card img")]
    .some(img => (img.dataset.src || "").startsWith(JXL_DATA));

  const busy = pending && !state.cardsId;

  dom.shareStatus.hidden = !busy;
  dom.shareStatus.textContent = "Uploading your images…";
  dom.copyShare.disabled = busy;

  try {
    if (busy) await uploadDataImages();

    if (!state.cardsId) {
      const body = await compressText(JSON.stringify({
        collection: state.currentCollection,
        images: cardImages(),
      }));

      const res = await fetch(`${WORKER}/share`, {
        method: "POST",
        body,
      });

      if (!res.ok)
        throw new Error(`share failed (${res.status})`);

      state.cardsId = (await res.text()).trim();
      save();
    }
  } catch (error) {
    console.error(error);
    dom.shareStatus.hidden = false;
    dom.shareStatus.textContent = "Sharing failed. Try again.";
    return;
  }

  dom.shareStatus.hidden = true;
  dom.copyShare.disabled = false;

  const query = new URLSearchParams({
    name: dom.name.value,
    color: dom.color.value.slice(1),
    cards: state.cardsId,
  });

  dom.shareUrl.value =
    `${location.origin + location.pathname}?${query}`;
}

async function copyField(input, button) {
  await navigator.clipboard.writeText(input.value);
  button.classList.add("copied");
  setTimeout(() => button.classList.remove("copied"), 1500);
}
