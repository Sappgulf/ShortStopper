export function hardHidePage() {
  try {
    document.documentElement.setAttribute("data-ns-preblock", "true");
    document.documentElement.style.setProperty("overflow", "hidden", "important");
  } catch {}
}

export function unhidePage() {
  try {
    document.documentElement.removeAttribute("data-ns-preblock");
    document.documentElement.style.removeProperty("overflow");
  } catch {}
}
