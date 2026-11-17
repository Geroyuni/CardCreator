import { JXL_DATA } from "./utils.js";
import { state, dom, guard } from "./state.js";
import { commitImage } from "./cards.js";

const CROP_WIDTH = 264;
const CROP_HEIGHT = 352;

let jxlModule;

export function importJxl() {
  if (!jxlModule)
    jxlModule = import("https://unpkg.com/@jsquash/jxl@1.3.0/encode.js");
  return jxlModule;
}

export function initCrop() {
  dom.cropViewport.addEventListener("pointerdown", e => {
    dom.cropViewport.setPointerCapture(e.pointerId);
    state.cropPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (state.cropPointers.size === 2) {
      const [a, b] = [...state.cropPointers.values()];
      state.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    }
  });

  dom.cropViewport.addEventListener("pointermove", e => {
    if (!state.cropPointers.has(e.pointerId)) return;

    const prev = state.cropPointers.get(e.pointerId);
    const cur = { x: e.clientX, y: e.clientY };
    state.cropPointers.set(e.pointerId, cur);

    if (state.cropPointers.size === 1) {
      panCrop(cur.x - prev.x, cur.y - prev.y);
    } else if (state.pinch) {
      const [a, b] = [...state.cropPointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rect = dom.cropViewport.getBoundingClientRect();

      if (state.pinch.dist > 0)
        zoomCrop(
          mid.x - rect.left,
          mid.y - rect.top,
          dist / state.pinch.dist
        );

      panCrop(mid.x - state.pinch.mid.x, mid.y - state.pinch.mid.y);
      state.pinch = { dist, mid };
    }
  });

  for (const type of ["pointerup", "pointercancel"])
    dom.cropViewport.addEventListener(type, e => {
      state.cropPointers.delete(e.pointerId);
      if (state.cropPointers.size < 2) state.pinch = null;
    });

  dom.cropViewport.addEventListener("wheel", e => {
    e.preventDefault();

    const rect = dom.cropViewport.getBoundingClientRect();
    zoomCrop(
      e.clientX - rect.left,
      e.clientY - rect.top,
      Math.exp(-e.deltaY * 0.002)
    );
  }, { passive: false });

  dom.cropApply.addEventListener("click", async () => {
    if (state.cropping || !state.cropState) return;

    state.cropping = true;
    dom.cropApply.disabled = true;

    try {
      if (!guard()) return;

      const blob = await exportCrop();
      const bytes = new Uint8Array(await blob.arrayBuffer());

      dom.crop.hidePopover();

    commitImage(JXL_DATA + bytes.toBase64(), dom.cropName.value.trim());

    } catch (error) {
      console.error(error);
    } finally {
      state.cropping = false;
      dom.cropApply.disabled = false;
    }
  });

  dom.cropName.addEventListener("keydown", e => {
    if (e.key === "Enter") dom.cropApply.click();
  });

  dom.crop.addEventListener("toggle", e => {
    if (e.newState !== "closed") return;

    if (dom.cropImage.src.startsWith("blob:"))
        URL.revokeObjectURL(dom.cropImage.src);

    dom.cropImage.removeAttribute("src");
    state.cropState = null;
    state.cropPointers.clear();
    state.pinch = null;
  });
}

export async function openCrop(file) {
  const url = URL.createObjectURL(file);
  dom.cropImage.src = url;

  try {
    await dom.cropImage.decode();
  } catch {
    URL.revokeObjectURL(url);
    dom.cropImage.removeAttribute("src");
    return;
  }

  const iw = dom.cropImage.naturalWidth;
  const ih = dom.cropImage.naturalHeight;
  const s0 = Math.max(CROP_WIDTH / iw, CROP_HEIGHT / ih);

  state.cropState = {
    iw,
    ih,
    s0,
    s: s0,
    tx: (CROP_WIDTH - iw * s0) / 2,
    ty: (CROP_HEIGHT - ih * s0) / 2,
  };

  updateCropTransform();
  dom.cropName.value = "";
  await dom.crop.showPopover();
  dom.cropName.focus();
}

function updateCropTransform() {
  const { s, tx, ty } = state.cropState;
  dom.cropImage.style.transform =
    `translate(${tx}px, ${ty}px) scale(${s})`;
}

function clampCrop() {
  const { s, iw, ih } = state.cropState;

  state.cropState.tx = Math.min(
    0,
    Math.max(CROP_WIDTH - iw * s, state.cropState.tx)
  );

  state.cropState.ty = Math.min(
    0,
    Math.max(CROP_HEIGHT - ih * s, state.cropState.ty)
  );
}

function panCrop(dx, dy) {
  if (!state.cropState) return;

  state.cropState.tx += dx;
  state.cropState.ty += dy;

  clampCrop();
  updateCropTransform();
}

function zoomCrop(px, py, factor) {
  if (!state.cropState) return;

  const s = Math.min(
    state.cropState.s0 * 10,
    Math.max(state.cropState.s0, state.cropState.s * factor)
  );

  const k = s / state.cropState.s;

  state.cropState.tx = px - (px - state.cropState.tx) * k;
  state.cropState.ty = py - (py - state.cropState.ty) * k;
  state.cropState.s = s;

  clampCrop();
  updateCropTransform();
}

async function exportCrop() {
  const { s, tx, ty } = state.cropState;

  const sw = CROP_WIDTH / s;
  const sh = CROP_HEIGHT / s;

  const outW = sw >= CROP_WIDTH ? CROP_WIDTH : Math.round(sw);
  const outH = sh >= CROP_HEIGHT ? CROP_HEIGHT : Math.round(sh);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    dom.cropImage,
    -tx / s,
    -ty / s,
    sw,
    sh,
    0,
    0,
    outW,
    outH
  );

  const { default: encodeJxl } = await importJxl();
  const buffer = await encodeJxl(
    ctx.getImageData(0, 0, outW, outH)
  );

  return new Blob([buffer], { type: "image/jxl" });
}
