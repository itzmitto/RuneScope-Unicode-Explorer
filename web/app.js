const statusElement = document.getElementById("wasm-status");
const statusValue = statusElement.querySelector(".wasm-value");
const characterGrid = document.getElementById("character-grid");
const characterDialog = document.getElementById("character-dialog");
const dialogClose = document.getElementById("dialog-close");
const dialogSymbol = document.getElementById("dialog-symbol");
const dialogCodepoint = document.getElementById("dialog-codepoint");
const dialogCategory = document.getElementById("dialog-category");
const copyCharacterButton = document.getElementById("copy-character-button");
const detailCharacter = document.getElementById("detail-character");
const detailUnicode = document.getElementById("detail-unicode");
const detailDecimal = document.getElementById("detail-decimal");
const detailHtml = document.getElementById("detail-html");
const detailHtmlHex = document.getElementById("detail-html-hex");
const detailCss = document.getElementById("detail-css");
const detailJavaScript = document.getElementById("detail-javascript");
const detailOdin = document.getElementById("detail-odin");
const toast = document.getElementById("toast");

const categoryNames = [
  "Latin",
  "Runic",
  "Currency",
  "Letterlike",
  "Numbers",
  "Arrows",
  "Math",
  "Technical",
  "Enclosed",
  "Box Drawing",
  "Block Elements",
  "Shapes",
  "Symbols",
  "Dingbats",
  "Braille",
  "Music",
  "Styled Letters",
  "Emoji",
  "Transport",
];

const BATCH_SIZE = 240;
let characters = [];
let renderedCount = 0;
let selectedCharacter = null;
let toastTimeout = null;
let loadingBatch = false;
let observer = null;
let sentinel = null;

function formatCodepoint(codepoint) {
  const minimumLength = codepoint > 0xffff ? 5 : 4;
  return `U+${codepoint
    .toString(16)
    .toUpperCase()
    .padStart(minimumLength, "0")}`;
}

function createFormats(item) {
  const minimumLength = item.codepoint > 0xffff ? 5 : 4;
  const hex = item.codepoint
    .toString(16)
    .toUpperCase()
    .padStart(minimumLength, "0");
  const javascript =
    item.codepoint <= 0xffff ? `\\u${hex.padStart(4, "0")}` : `\\u{${hex}}`;
  const odin =
    item.codepoint <= 0xffff
      ? `'\\u${hex.padStart(4, "0")}'`
      : `'\\U${hex.padStart(8, "0")}'`;
  return {
    character: item.character,
    unicode: `U+${hex}`,
    decimal: item.codepoint.toString(),
    html: `&#${item.codepoint};`,
    htmlHex: `&#x${hex};`,
    css: `\\${hex}`,
    javascript,
    odin,
  };
}

function loadCharactersFromOdin(exports) {
  const count = exports.unicode_count();
  const loadedCharacters = [];
  for (let index = 0; index < count; index += 1) {
    const codepoint = exports.unicode_codepoint_at(index);
    const category = exports.unicode_category_at(index);
    if (codepoint < 0) {
      continue;
    }
    if (codepoint >= 0xd800 && codepoint <= 0xdfff) {
      continue;
    }
    loadedCharacters.push({
      codepoint,
      character: String.fromCodePoint(codepoint),
      category,
      categoryName: categoryNames[category] ?? "Unknown",
    });
  }
  return loadedCharacters;
}

function showToast(message) {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 1400);
}

function fallbackCopyText(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

async function copyText(value) {
  let copied = false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied) {
    copied = fallbackCopyText(value);
  }
  if (copied) {
    showToast(`Copied ${value}`);
  } else {
    showToast("Could not copy");
  }
  return copied;
}

function openCharacterDialog(item) {
  selectedCharacter = item;
  const formats = createFormats(item);
  dialogSymbol.textContent = item.character;
  dialogCodepoint.textContent = formats.unicode;
  dialogCategory.textContent = item.categoryName;
  detailCharacter.textContent = formats.character;
  detailUnicode.textContent = formats.unicode;
  detailDecimal.textContent = formats.decimal;
  detailHtml.textContent = formats.html;
  detailHtmlHex.textContent = formats.htmlHex;
  detailCss.textContent = formats.css;
  detailJavaScript.textContent = formats.javascript;
  detailOdin.textContent = formats.odin;
  characterDialog.showModal();
}

function createCharacterCard(item) {
  const button = document.createElement("button");
  button.className = "unicode-card";
  button.type = "button";
  button.setAttribute(
    "aria-label",
    `Copy ${item.character} ${formatCodepoint(item.codepoint)}`,
  );
  button.title = `${item.categoryName} · ${formatCodepoint(item.codepoint)}`;
  const character = document.createElement("span");
  character.className = "unicode-symbol";
  character.textContent = item.character;
  const codepoint = document.createElement("span");
  codepoint.className = "unicode-codepoint";
  codepoint.textContent = formatCodepoint(item.codepoint);
  button.append(character, codepoint);
  button.addEventListener("click", async () => {
    await copyText(item.character);
    openCharacterDialog(item);
  });
  return button;
}

function renderNextBatch() {
  if (loadingBatch) {
    return;
  }
  if (renderedCount >= characters.length) {
    if (observer && sentinel) {
      observer.unobserve(sentinel);
      sentinel.remove();
    }
    return;
  }

  loadingBatch = true;
  const end = Math.min(renderedCount + BATCH_SIZE, characters.length);
  const fragment = document.createDocumentFragment();
  for (let index = renderedCount; index < end; index += 1) {
    fragment.appendChild(createCharacterCard(characters[index]));
  }
  characterGrid.appendChild(fragment);
  renderedCount = end;
  loadingBatch = false;
}

function setupInfiniteRendering() {
  sentinel = document.createElement("div");
  sentinel.style.height = "1px";
  sentinel.style.width = "100%";
  characterGrid.after(sentinel);
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry && entry.isIntersecting) {
        renderNextBatch();
      }
    },
    {
      rootMargin: "900px 0px",
    },
  );
  observer.observe(sentinel);
}

async function startRuneScope() {
  try {
    const memory = new odin.WasmMemoryInterface();
    const imports = odin.setupDefaultImports(memory, null);
    const response = await fetch("./runescope.wasm");
    if (!response.ok) {
      throw new Error(`Failed to load WASM: ${response.status}`);
    }
    const wasmBytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
    memory.setExports(instance.exports);
    if (instance.exports.memory) {
      memory.setMemory(instance.exports.memory);
    }
    characters = loadCharactersFromOdin(instance.exports);
    renderNextBatch();
    setupInfiniteRendering();
    statusElement.classList.add("ready");
    if (statusValue) {
      statusValue.textContent = `${characters.length} runes loaded`;
    }

    console.log(`RuneScope loaded ${characters.length} Unicode codepoints`);
  } catch (error) {
    console.error(error);
    statusElement.classList.add("error");
    if (statusValue) {
      statusValue.textContent = "Runtime error";
    }
  }
}

dialogClose.addEventListener("click", () => {
  characterDialog.close();
});

characterDialog.addEventListener("click", (event) => {
  if (event.target === characterDialog) {
    characterDialog.close();
  }
});
characterDialog.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button || !selectedCharacter) {
    return;
  }
  const formats = createFormats(selectedCharacter);
  const key = button.dataset.copy;
  if (!formats[key]) {
    return;
  }
  copyText(formats[key]);
});

copyCharacterButton.addEventListener("click", () => {
  if (!selectedCharacter) {
    return;
  }

  copyText(selectedCharacter.character);
});

startRuneScope();
