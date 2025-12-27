# ShortStopper Website

Static landing page for ShortStopper. No build step required.

## Local preview

```bash
cd site
python3 -m http.server 8080
# Open http://localhost:8080
```

## Deploy to GitHub Pages

1. Go to repo **Settings → Pages**
2. Set source to **Deploy from a branch**
3. Select `main` branch and `/site` folder
4. Save

Your site will be live at `https://sappgulf.github.io/ShortStopper/`

## Configuration

Edit `app.js` to update download links:

```js
const CONFIG = {
  WEBSTORE_URL: "",  // Chrome Web Store URL (when available)
  DOWNLOAD_ZIP_URL: "https://github.com/Sappgulf/ShortStopper/archive/refs/heads/main.zip",
  SOURCE_URL: "https://github.com/Sappgulf/ShortStopper"
};
```

Empty URLs show "Coming soon" with disabled buttons.
