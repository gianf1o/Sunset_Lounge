# Event Map

A static Leaflet event map with satellite imagery for the area from `48.52768, 9.33905` to `48.52132, 9.34823`.

## Use

Open `index.html` in a browser. Use the toolbar to select, place a map item, place a shop, place a DJ, place parking, place toilets, draw a line, draw an arrow, place text, refit the event area, or switch between satellite and normal map layers. Places can include logos from `assets/logos`, an image URL, or an uploaded image. Shop notes appear as the short shop description in the side menu, and shops include editable Essen/Drinks item rows that appear grouped in their map popups. Lines and arrows have editable colors, and text labels have editable color, width, and height.

Data is saved in the browser with `localStorage`. Shops, DJs, items, parking, toilets, lines, arrows, and text are included in export/import so you can move the same map data between browsers or into a hosted copy.

## Logos

Put logo image files in `assets/logos/` and enter their relative path in the editor's Logo Path / URL field, for example:

```text
assets/logos/Roessle.png
```

This keeps `event-map-data.json` small and works well on GitHub Pages. The Upload Logo button still works for quick tests, but it embeds the image into the exported JSON.

## Temporary Hosting

This is a static site, so it can be hosted by GitHub Pages, Netlify Drop, Cloudflare Pages, Surge, or any simple static file host. Upload these files together:

- `assets/`
- `index.html`
- `viewer.html`
- `styles.css`
- `app.js`
- `viewer.js`
- `event-map-data.json`

Use `index.html` privately to edit the map. Export your map data, rename the exported file to `event-map-data.json`, and upload it next to `viewer.html`. Share `viewer.html` with visitors.

The app loads Leaflet, Lucide icons, and Esri satellite tiles from public CDNs, so visitors need internet access.

## Starting Views

The public viewer supports special links for QR codes or alternate entry points:

```text
viewer.html?lat=48.52305&lng=9.34074&zoom=18
viewer.html?place=Tivanos%20Pizza
viewer.html?place=tivanos-pizza
viewer.html?id=7877fe52-25f3-4335-a10b-81c386abd9c6
```

`place` can be a shop/place name, a URL-friendly slug, or you can use `id` for the exact place id. If no starting view is given, the viewer opens the full map.



TODO:
- adjust map position
- on mobile the fold down of the menu doesn't work
- on mobile the +- that you removed is still there over the UI
