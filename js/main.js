import { initDom, initBackground, loadSaved } from "./state.js";
import { initCards, addCards, syncResetButtons } from "./cards.js";
import { initSearch, openSearch } from "./search.js";
import { initCrop, openCrop } from "./crop.js";
import { initShare } from "./share.js";

loadSaved();
initDom();
initBackground();

initCrop();
initSearch(openCrop);
initCards(openSearch);
initShare();

addCards();
syncResetButtons();
