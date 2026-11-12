const WORKER = "https://cardcreator.geroyuni.workers.dev";
const IGDB = "https://images.igdb.com/igdb/image/upload/t_cover_big/";
const IGDB_SMALL = "https://images.igdb.com/igdb/image/upload/t_cover_small/";
const ADD_IMAGE = "assets/add.svg";
const JXL_SRC = "https://unpkg.com/@jsquash/jxl@1.3.0/encode.js";
const JXL_DATA = "data:image/jxl;base64,";
const CROP_WIDTH = 264;
const CROP_HEIGHT = 352;
const LATEST_VERSIONS = {
    games: "v1_games",
};
const $ = id => document.getElementById(id);

const params = new URLSearchParams(location.search);
let shared = params.has("cards");
let saved;
try {
    saved = JSON.parse(localStorage.getItem("cardSave")) || {};
} catch {
    saved = {};
}

if (saved.userImages)
    for (const image of saved.images || [])
        if (image.src.startsWith("user:")) {
            const b64 = saved.userImages[image.src.slice(5)];
            image.src = b64 ? JXL_DATA + b64 : ADD_IMAGE;
        }

let cardsId = saved.cardsId || null;
let currentCollection;
let selectedImg;
let openDetails;
let held = false;
let openPopover;
let pressTimer;
let cropState = null;
let cropping = false;
const cropPointers = new Map();
let pinch = null;
let jxlModule;

const cardsEl = $("cards");
const searchModal = $("search");
const searchInput = $("searchInput");
const searchResults = $("searchResults");
const shareModal = $("share");
const shareStatus = $("shareStatus");
const tooltip = $("tooltip");
const cropModal = $("crop");
const cropViewport = $("cropViewport");
const cropImage = $("cropImage");
const cropNameInput = $("cropName");
const cropApply = $("cropApply");

function toBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}

function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function compressText(text) {
    const stream = new Blob([text]).stream()
        .pipeThrough(new CompressionStream("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    return toBase64(new Uint8Array(buffer));
}

async function decompressText(b64) {
    const stream = new Blob([fromBase64(b64)]).stream()
        .pipeThrough(new DecompressionStream("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(buffer);
}

const setColor = c =>
    document.documentElement.style.setProperty("--color", c);

function importJxl() {
    jxlModule ??= import(JXL_SRC);
    return jxlModule;
}

function guard() {
    if (!shared) return true;
    const ok = confirm(
        "You are viewing a shared collection. Editing will replace " +
        "any existing cards saved to your device, and will replace it " +
        "with this card collection. Continue?"
    );
    if (ok) {
        shared = false;
        history.replaceState(null, "", location.pathname);
    }
    return ok;
}

function cardImages() {
    return [...document.querySelectorAll("#cards .card img")].map(img => ({
        src: img.dataset.src || img.getAttribute("src"),
        name: img.dataset.name || "",
    }));
}

function save() {
    if (shared) return;
    localStorage.setItem("cardSave", JSON.stringify({
        collection: currentCollection,
        name: $("name").value,
        color: $("color").value,
        cardsId,
        images: cardImages(),
    }));
    syncResetButtons();
}

function syncResetButtons() {
    const disabled = !localStorage.getItem("cardSave");
    $("resetButton").disabled = disabled;
    $("mobileResetButton").disabled = disabled;
}

function resetCollection() {
    const message =
        "Reset to default? This clears your saved collection.";
    if (!confirm(message)) return;
    localStorage.removeItem("cardSave");
    location.assign(location.pathname);
}

$("resetButton").addEventListener("click", resetCollection);
$("mobileResetButton").addEventListener("click", resetCollection);

function setCardImage(img, src, name) {
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
    tooltip.textContent = name;
    tooltip.hidden = false;
    const box = tooltip.getBoundingClientRect();
    const left = Math.max(
        8, Math.min(x - box.width / 2, innerWidth - box.width - 8)
    );
    let top = y - box.height - 14;
    if (top < 8) top = y + 14;
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
}

function closeDetails() {
    if (!openDetails) return;
    openDetails.classList.remove("open");
    openDetails = null;
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
            <div class="details" style="position-anchor: ${anchor}">
                <h3 class="details-name">???</h3>
                <p class="details-desc">${entry.description || ""}</p>
                <p class="hm-label">Honorable mentions (optional)</p>
                <div class="hm-row">${mention.repeat(3)}</div>
            </div>
            <span class="mention-count" hidden></span>
        </div>`;
}

function renderBoard(board, state) {
    let anchor = 0;
    let html = "";
    for (const category in board) {
        html += `<h2>${category}</h2>`;
        for (const entry of board[category])
            html += cardHtml(entry, `--card${anchor++}`);
    }
    cardsEl.innerHTML = html;
    if (state.collection) {
        $("collectionSelect").value = state.collection;
        $("mobileCollectionSelect").value = state.collection;
    }
    if (state.name != null) $("name").value = state.name;
    if (state.color != null) {
        $("color").value = state.color;
        setColor(state.color);
    }
    if (state.images)
        cardsEl.querySelectorAll(".card img").forEach((img, i) => {
            const image = state.images[i];
            if (image) setCardImage(img, image.src, image.name);
        });
}

async function addCards() {
    let state = saved;
    if (shared) {
        const cardsParam = params.get("cards");
        state = {
            name: params.get("name"),
            color: params.get("color") ? "#" + params.get("color") : null,
        };
        const res = await fetch(`${WORKER}/share/${cardsParam}`);
        if (res.ok) {
            const json = await decompressText(await res.text());
            state = { ...state, ...JSON.parse(json) };
            cardsId = cardsParam;
        } else {
            shared = false;
        }
    }
    currentCollection = state.collection || "v1_games";
    const board = await fetch(
        `collections/${currentCollection}.json`
    ).then(res => res.json());
    renderBoard(board, state);
    save();
    offerUpdate(currentCollection);
}

const collectionFamily = id => id.replace(/^v\d+_/, "");

function offerUpdate(collection) {
    const latest = LATEST_VERSIONS[collectionFamily(collection)];
    if (!latest || latest === collection) return;
    const version = id => Number(id.match(/^v(\d+)_/)[1]);
    if (version(collection) >= version(latest)) return;
    $("updateBanner").hidden = false;
}

function boardKeys(board) {
    const keys = [];
    for (const category in board)
        for (const entry of board[category])
            keys.push(`${category} > ${entry.name}`);
    return keys;
}

async function updateCollection() {
    const latest = LATEST_VERSIONS[collectionFamily(currentCollection)];
    const oldBoard = await fetch(
        `collections/${currentCollection}.json`
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
    if (shared)
        message +=
            " You are viewing a shared collection, so this will replace " +
            "any existing cards saved to your device, and replace it " +
            "with this updated collection.";
    if (added.length)
        message += "\nThese cards will be added:\n\n" + added.join("\n");
    if (removed.length)
        message += "\n\nThese cards will be removed:\n\n" + removed.join("\n");
    if (!confirm(message)) return;
    const oldImages = cardImages();
    const imagesPerCard = oldImages.length / oldKeys.length;
    const imagesByKey = new Map();
    oldKeys.forEach((key, i) =>
        imagesByKey.set(key, oldImages.slice(
            i * imagesPerCard, (i + 1) * imagesPerCard
        )));
    const images = [];
    for (const key of newKeys)
        images.push(...(imagesByKey.get(key) ||
            Array(imagesPerCard).fill(undefined)));
    shared = false;
    cardsId = null;
    currentCollection = latest;
    history.replaceState(null, "", location.pathname);
    renderBoard(newBoard, { collection: latest, images });
    $("updateBanner").hidden = true;
    save();
}

$("updateButton").addEventListener("click", updateCollection);

function selectCard(img) {
    img.blur();
    selectedImg = img;
    searchInput.value = "";
    showEmptyState();
    searchModal.showPopover();
    searchInput.focus();
    syncBackground();
}

function commitImage(src, name) {
    setCardImage(selectedImg, src, name);
    searchModal.hidePopover();
    syncBackground();
    cardsId = null;
    save();
}

function applyImage(src, name) {
    if (!guard()) return;
    commitImage(src, name);
}

function showEmptyState() {
    searchResults.innerHTML = "";
    if (selectedImg.src.endsWith("add.svg")) {
        searchResults.hidden = true;
        return;
    }
    const button = document.createElement("button");
    button.textContent = "Remove image";
    button.addEventListener("click", () => applyImage(ADD_IMAGE, ""));
    searchResults.append(button);
    searchResults.hidden = false;
}

function showResultsURL(url) {
    searchResults.innerHTML = "";
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
    searchResults.append(field);
    searchResults.hidden = false;
    input.focus();
}

function showResultsIGDB(games) {
    searchResults.innerHTML = "";
    for (const game of games || []) {
        if (!game.cover?.image_id) continue;
        const button = document.createElement("button");
        const img = document.createElement("img");
        img.src = IGDB_SMALL + game.cover.image_id + ".jpg";
        img.alt = "";
        button.append(game.name, img);
        button.addEventListener("click", () => applyImage(
            IGDB + game.cover.image_id + ".jpg", game.name));
        searchResults.append(button);
    }
    searchResults.hidden = !searchResults.children.length;
}

async function runSearch() {
    const query = searchInput.value;
    if (query.length <= 1) {
        showEmptyState();
        return;
    }
    if (query.startsWith("http")) {
        showResultsURL(query);
        return;
    }
    const safeQuery = query.replace(/[";]/g, " ").trim();
    const res = await fetch(WORKER + "/games", {
        method: "POST",
        body:
            `search "${safeQuery}"; ` +
            "fields id, name, cover.image_id; limit 15;",
    });
    if (!res.ok) {
        searchResults.innerHTML = "";
        const item = document.createElement("li");
        item.textContent = `Search failed (${res.status})`;
        searchResults.append(item);
        searchResults.hidden = false;
        return;
    }
    showResultsIGDB(await res.json());
}

let debounce;
searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(runSearch, 400);
});

function focusResult(el) {
    (el.querySelector("input") || el).focus();
}

searchInput.addEventListener("keydown", e => {
    if (e.key !== "ArrowDown") return;
    const first = searchResults.firstElementChild;
    if (searchResults.hidden || !first) return;
    e.preventDefault();
    focusResult(first);
});

searchResults.addEventListener("keydown", e => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...searchResults.children];
    const index = items.indexOf(e.target);
    if (index === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowDown"
        ? items[index + 1] || searchInput
        : items[index - 1] || searchInput;
    focusResult(next);
});

$("uploadButton").addEventListener("click", () =>
    $("uploadInput").click());

$("uploadInput").addEventListener("change", e => {
    if (e.target.files[0]) openCrop(e.target.files[0]);
    e.target.value = "";
});

searchModal.addEventListener("paste", e => {
    const item = [...e.clipboardData.items]
        .find(i => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    openCrop(item.getAsFile());
});

async function openCrop(file) {
    const url = URL.createObjectURL(file);
    cropImage.src = url;
    try {
        await cropImage.decode();
    } catch {
        URL.revokeObjectURL(url);
        cropImage.removeAttribute("src");
        return;
    }
    const iw = cropImage.naturalWidth;
    const ih = cropImage.naturalHeight;
    const s0 = Math.max(CROP_WIDTH / iw, CROP_HEIGHT / ih);
    cropState = {
        iw,
        ih,
        s0,
        s: s0,
        tx: (CROP_WIDTH - iw * s0) / 2,
        ty: (CROP_HEIGHT - ih * s0) / 2,
    };
    updateCropTransform();
    if (openPopover === searchModal) searchModal.hidePopover();
    cropModal.showPopover();
    syncBackground();
}

function updateCropTransform() {
    const { s, tx, ty } = cropState;
    cropImage.style.transform =
        `translate(${tx}px, ${ty}px) scale(${s})`;
}

function clampCrop() {
    const { s, iw, ih } = cropState;
    cropState.tx = Math.min(0, Math.max(CROP_WIDTH - iw * s, cropState.tx));
    cropState.ty = Math.min(0, Math.max(CROP_HEIGHT - ih * s, cropState.ty));
}

function panCrop(dx, dy) {
    if (!cropState) return;
    cropState.tx += dx;
    cropState.ty += dy;
    clampCrop();
    updateCropTransform();
}

function zoomCrop(px, py, factor) {
    if (!cropState) return;
    const s = Math.min(cropState.s0 * 10,
        Math.max(cropState.s0, cropState.s * factor));
    const k = s / cropState.s;
    cropState.tx = px - (px - cropState.tx) * k;
    cropState.ty = py - (py - cropState.ty) * k;
    cropState.s = s;
    clampCrop();
    updateCropTransform();
}

cropViewport.addEventListener("pointerdown", e => {
    cropViewport.setPointerCapture(e.pointerId);
    cropPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (cropPointers.size === 2) {
        const [a, b] = [...cropPointers.values()];
        pinch = {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
    }
});

cropViewport.addEventListener("pointermove", e => {
    if (!cropPointers.has(e.pointerId)) return;
    const prev = cropPointers.get(e.pointerId);
    const cur = { x: e.clientX, y: e.clientY };
    cropPointers.set(e.pointerId, cur);
    if (cropPointers.size === 1) {
        panCrop(cur.x - prev.x, cur.y - prev.y);
    } else if (pinch) {
        const [a, b] = [...cropPointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const rect = cropViewport.getBoundingClientRect();
        if (pinch.dist > 0)
            zoomCrop(mid.x - rect.left, mid.y - rect.top,
                dist / pinch.dist);
        panCrop(mid.x - pinch.mid.x, mid.y - pinch.mid.y);
        pinch = { dist, mid };
    }
});

for (const type of ["pointerup", "pointercancel"])
    cropViewport.addEventListener(type, e => {
        cropPointers.delete(e.pointerId);
        if (cropPointers.size < 2) pinch = null;
    });

cropViewport.addEventListener("wheel", e => {
    e.preventDefault();
    const rect = cropViewport.getBoundingClientRect();
    zoomCrop(
        e.clientX - rect.left,
        e.clientY - rect.top,
        Math.exp(-e.deltaY * 0.002),
    );
}, { passive: false });

async function exportCrop() {
    const { s, tx, ty } = cropState;
    const sw = CROP_WIDTH / s;
    const sh = CROP_HEIGHT / s;
    const outW = sw >= CROP_WIDTH ? CROP_WIDTH : Math.round(sw);
    const outH = sh >= CROP_HEIGHT ? CROP_HEIGHT : Math.round(sh);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(cropImage, -tx / s, -ty / s, sw, sh, 0, 0, outW, outH);
    const { default: encodeJxl } = await importJxl();
    const buffer = await encodeJxl(ctx.getImageData(0, 0, outW, outH));
    return new Blob([buffer], { type: "image/jxl" });
}

cropApply.addEventListener("click", async () => {
    if (cropping || !cropState) return;
    cropping = true;
    cropApply.disabled = true;
    try {
        if (!guard()) return;
        const blob = await exportCrop();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        cropModal.hidePopover();
        syncBackground();
        commitImage(JXL_DATA + toBase64(bytes), cropNameInput.value.trim());

    } catch (error) {
        console.error(error);
    } finally {
        cropping = false;
        cropApply.disabled = false;
    }
});

cropNameInput.addEventListener("keydown", e => {
    if (e.key === "Enter") cropApply.click();
});

function closeCrop() {
    cropModal.hidePopover();
    syncBackground();
}

$("cropCancel").addEventListener("click", closeCrop);

cropModal.addEventListener("toggle", e => {
    const shown = e.newState === "open";
    if (shown) openPopover = cropModal;
    else if (openPopover === cropModal) openPopover = null;
    syncBackground();
    if (shown) {
        cropNameInput.focus();
        return;
    }
    if (cropImage.src.startsWith("blob:"))
        URL.revokeObjectURL(cropImage.src);
    cropImage.removeAttribute("src");
    cropState = null;
    cropPointers.clear();
    pinch = null;
});


cardsEl.addEventListener("click", e => {
    if (held) {
        held = false;
        return;
    }
    const mention = e.target.closest(".hm");
    if (e.target.closest(".details") && !mention) return;
    const card = e.target.closest(".card");
    if (!card) return;
    selectCard((mention || card).querySelector("img"));
});

cardsEl.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (!e.target.matches(".card > img, .hm img")) return;
    e.preventDefault();
    selectCard(e.target);
});

cardsEl.addEventListener("touchstart", e => {
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
        held = true;
        const mention = e.target.closest(".hm");
        if (mention) {
            const name = mention.querySelector("img").dataset.name;
            if (name) showTooltip(name, x, y);
            else tooltip.hidden = true;
            return;
        }
        const card = e.target.closest(".card");
        if (!card) return;
        closeDetails();
        openDetails = card.querySelector(".details");
        openDetails.classList.add("open");
        tooltip.hidden = true;
    }, 450);
}, { passive: true });

for (const type of ["touchend", "touchmove", "touchcancel"])
    cardsEl.addEventListener(type, () => clearTimeout(pressTimer));

cardsEl.addEventListener("contextmenu", e => {
    if (held) e.preventDefault();
});

cardsEl.addEventListener("mousemove", e => {
    const name = e.target.closest(".hm")
        ?.querySelector("img")?.dataset.name;
    if (!name) {
        tooltip.hidden = true;
        return;
    }
    tooltip.textContent = name;
    tooltip.hidden = false;
    const box = tooltip.getBoundingClientRect();
    let x = e.clientX + 12;
    let y = e.clientY + 14;
    if (x + box.width > innerWidth - 8)
        x = Math.max(8, e.clientX - box.width - 12);
    if (y + box.height > innerHeight - 8)
        y = Math.max(8, e.clientY - box.height - 14);
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
});

cardsEl.addEventListener("mouseleave", () => {
    tooltip.hidden = true;
});

window.addEventListener("click", e => {
    if (held) return;
    tooltip.hidden = true;
    if (openDetails && !e.target.closest(".details"))
        closeDetails();
}, true);

$("mobileMenu").addEventListener("click", e => {
    if (e.target.closest("select, button"))
        e.currentTarget.open = false;
});

function syncBackground() {
    for (const child of document.body.children)
        child.inert = openPopover != null && child !== openPopover;
}


for (const modal of [searchModal, shareModal])
    modal.addEventListener("toggle", () => {
        tooltip.hidden = true;
        openPopover = openPopover === modal ? null : modal;
        syncBackground();
    });


document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (cropModal.matches(":popover")) closeCrop();
});


searchModal.addEventListener("click", e => {
    if (e.target !== searchModal) return;
    searchModal.hidePopover();
    syncBackground();
});

const imageLink = id => `${WORKER}/image/${id}`;

async function uploadDataImages() {
    for (const img of cardsEl.querySelectorAll(".card img")) {
        const src = img.dataset.src || "";
        if (!src.startsWith(JXL_DATA)) continue;
        const res = await fetch(WORKER + "/image", {
            method: "POST",
            headers: { "Content-Type": "image/jxl" },
            body: fromBase64(src.slice(JXL_DATA.length)),
        });
        if (!res.ok) throw new Error(`upload failed (${res.status})`);
        const id = (await res.text()).trim();
        setCardImage(img, imageLink(id), img.dataset.name);
        save();
    }
}

async function openShare() {
    shareModal.showPopover();
    syncBackground();
    $("shareUrl").value = "";
    $("copyShare").classList.remove("copied");
    const pending = [...cardsEl.querySelectorAll(".card img")]
        .some(img => (img.dataset.src || "").startsWith(JXL_DATA));
    const busy = pending && !cardsId;
    shareStatus.hidden = !busy;
    shareStatus.textContent = "Uploading your images…";
    $("copyShare").disabled = busy;
    try {
        if (busy) await uploadDataImages();
        if (!cardsId) {
            const body = await compressText(JSON.stringify({
                collection: currentCollection,
                images: cardImages(),
            }));
            const res = await fetch(`${WORKER}/share`, {
                method: "POST",
                body,
            });
            if (!res.ok) throw new Error(`share failed (${res.status})`);
            cardsId = (await res.text()).trim();
            save();
        }
    } catch (error) {
        console.error(error);
        shareStatus.hidden = false;
        shareStatus.textContent = "Sharing failed. Try again.";
        return;
    }
    shareStatus.hidden = true;
    $("copyShare").disabled = false;
    const query = new URLSearchParams({
        name: $("name").value,
        color: $("color").value.slice(1),
        cards: cardsId,
    });
    $("shareUrl").value =
        `${location.origin + location.pathname}?${query}`;
}

$("shareButton").addEventListener("click", openShare);
$("mobileShareButton").addEventListener("click", openShare);
$("closeShare").addEventListener("click", () => {
    shareModal.hidePopover();
    syncBackground();
});

async function copyField(input, button) {
    await navigator.clipboard.writeText(input.value);
    button.classList.add("copied");
    setTimeout(() => button.classList.remove("copied"), 1500);
}

$("copyShare").addEventListener("click", e =>
    copyField($("shareUrl"), e.currentTarget));

const desktopSelect = $("collectionSelect");
const mobileSelect = $("mobileCollectionSelect");

function syncCollection(source, target) {
    if (!guard()) {
        source.value = target.value;
        return;
    }
    target.value = source.value;
    currentCollection = source.value;
    cardsId = null;
    save();
}

desktopSelect.addEventListener("change",
    () => syncCollection(desktopSelect, mobileSelect));
mobileSelect.addEventListener("change",
    () => syncCollection(mobileSelect, desktopSelect));

for (const id of ["name", "color"]) {
    $(id).addEventListener("focus", () => {
        if (!guard()) $(id).blur();
    });
    $(id).addEventListener("input", save);
}
$("color").addEventListener("input", e => setColor(e.target.value));

addCards();
syncResetButtons();
