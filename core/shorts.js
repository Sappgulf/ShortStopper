export function parseShortsPath(pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  if (parts[0] === "shorts") return { isShorts: true, id: parts[1] || null, kind: "shorts" };
  if (parts[0] === "feed" && parts[1] === "shorts") return { isShorts: true, id: null, kind: "feed_shorts" };
  return { isShorts: false, id: null, kind: "" };
}

export function isShortsPath(pathname) {
  return parseShortsPath(pathname).isShorts;
}

export function shortsIdFromPath(pathname) {
  return parseShortsPath(pathname).id;
}

