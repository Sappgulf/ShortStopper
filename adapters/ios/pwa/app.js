import { DEFAULT_SETTINGS } from "../../../core/config.js";
import { getLocalState, getSettings, resetTodayLocal, setSetting } from "../storage.js";

function $(id) { return document.getElementById(id); }
function flash(msg) { $("status").textContent = msg; setTimeout(() => ($("status").textContent = ""), 1400); }

function refresh() {
  const settings = getSettings();
  $("enabled").checked = !!settings.enabled;
  $("whitelistMode").checked = !!settings.whitelistMode;
  $("redirectShorts").checked = !!settings.redirectShorts;

  const state = getLocalState();
  $("todayTotal").textContent = state.blockedTotal || 0;
}

function bindToggle(id) {
  $(id).addEventListener("change", () => {
    setSetting(id, $(id).checked);
    flash("Saved");
    refresh();
  });
}

if (!localStorage.getItem("ns_settings")) {
  localStorage.setItem("ns_settings", JSON.stringify(DEFAULT_SETTINGS));
}

bindToggle("enabled");
bindToggle("whitelistMode");
bindToggle("redirectShorts");

$("resetToday").addEventListener("click", () => {
  resetTodayLocal();
  flash("Reset");
  refresh();
});

refresh();

