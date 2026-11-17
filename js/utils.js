export const WORKER = "https://cardcreator.geroyuni.workers.dev";
export const ADD_IMAGE = "assets/add.svg";
export const JXL_DATA = "data:image/jxl;base64,";
export const LATEST_VERSIONS = {
  games: "v1_games",
};

export const $ = id => document.getElementById(id);

export async function compressText(text) {
  const stream = new Blob([text]).stream()
    .pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer).toBase64();
}

export async function decompressText(b64) {
  const stream = new Blob([Uint8Array.fromBase64(b64)]).stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buffer);
}
