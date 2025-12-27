const STYLE_ID = "ns-block-style";
const OVERLAY_ID = "ns-block-overlay";
const TITLE_ID = "ns-block-title";
const BODY_ID = "ns-block-body";
const ACTIONS_ID = "ns-block-actions";
const BACK_ID = "ns-block-back";
const ALLOW_ID = "ns-block-allow";
const OPTIONS_ID = "ns-block-options";

function ensureBlockerStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID}{
      position:fixed;
      inset:0;
      z-index:2147483647;
      background:Canvas;
      color:CanvasText;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
      visibility:visible;
    }
    #${OVERLAY_ID} *{ box-sizing:border-box; }
    #ns-block-card{
      width:min(440px, 92vw);
      border:1px solid color-mix(in oklab, CanvasText 20%, Canvas);
      background:color-mix(in oklab, Canvas 92%, CanvasText);
      border-radius:16px;
      padding:18px;
      font:15px/1.45 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    }
    #${TITLE_ID}{ font-weight:700; font-size:17px; margin-bottom:6px; }
    #${BODY_ID}{ color:color-mix(in oklab, CanvasText 75%, Canvas); margin-bottom:14px; }
    #${ACTIONS_ID}{ display:flex; gap:8px; flex-wrap:wrap; }
    .ns-block-btn{
      border:1px solid color-mix(in oklab, CanvasText 24%, Canvas);
      background:color-mix(in oklab, Canvas 96%, CanvasText);
      color:CanvasText;
      padding:8px 12px;
      border-radius:999px;
      cursor:pointer;
      font:inherit;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function ensureOverlayElements() {
  ensureBlockerStyles();

  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    document.documentElement.appendChild(overlay);
  }

  let title = overlay.querySelector(`#${TITLE_ID}`);
  let body = overlay.querySelector(`#${BODY_ID}`);
  let back = overlay.querySelector(`#${BACK_ID}`);
  let allow = overlay.querySelector(`#${ALLOW_ID}`);
  let options = overlay.querySelector(`#${OPTIONS_ID}`);

  if (!title || !body || !back || !allow || !options) {
    overlay.textContent = "";

    const card = document.createElement("div");
    card.id = "ns-block-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-live", "polite");

    title = document.createElement("div");
    title.id = TITLE_ID;
    title.textContent = "Short-form blocked";

    body = document.createElement("div");
    body.id = BODY_ID;

    const actions = document.createElement("div");
    actions.id = ACTIONS_ID;

    back = document.createElement("button");
    back.id = BACK_ID;
    back.className = "ns-block-btn";
    back.type = "button";
    back.textContent = "Go back";

    allow = document.createElement("button");
    allow.id = ALLOW_ID;
    allow.className = "ns-block-btn";
    allow.type = "button";
    allow.textContent = "Allow once (10 min)";

    options = document.createElement("button");
    options.id = OPTIONS_ID;
    options.className = "ns-block-btn";
    options.type = "button";
    options.textContent = "Open settings";

    actions.appendChild(back);
    actions.appendChild(allow);
    actions.appendChild(options);

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(actions);
    overlay.appendChild(card);
  }

  return { overlay, title, body, back, allow, options };
}

export function clearBlockOverlay() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.remove();
}

/**
 * @param {{ label: string, onBack: () => void, onAllowOnce: () => void, onOptions: () => void }} opts
 */
export function showBlockOverlay({ label, onBack, onAllowOnce, onOptions }) {
  const { body, back, allow, options } = ensureOverlayElements();
  body.textContent = `${label} is blocked here. You can change this anytime in settings.`;

  back.onclick = onBack;
  allow.onclick = onAllowOnce;
  options.onclick = onOptions;
}
