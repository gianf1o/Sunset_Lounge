(function () {
  const eventBounds = L.latLngBounds(
    [48.52132, 9.33905],
    [48.52768, 9.34823]
  );
  const storageKey = "event-map-places-v1";
  const defaultAnnotationColor = "#f3c84b";
  const defaultTextSize = { width: 160, height: 52 };

  const map = L.map("map", {
    maxBounds: eventBounds.pad(0.5),
    maxBoundsViscosity: 1,
    minZoom: 0,
    wheelPxPerZoomLevel: 48,
    zoomSnap: 0.01,
    zoomDelta: 1,
    zoomControl: false
  });
  map.setView(eventBounds.getCenter(), 16);
  removeNativeZoomControl();

  const els = {
    map: document.getElementById("map"),
    shell: document.querySelector(".viewer-shell"),
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
    fitMap: document.getElementById("fitMap"),
    toggleBaseLayer: document.getElementById("toggleBaseLayer"),
    togglePanel: document.getElementById("togglePanel"),
    mapNotice: document.getElementById("mapNotice"),
    placeList: document.getElementById("placeList"),
    placeSearch: document.getElementById("placeSearch")
  };

  const streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community"
  }).addTo(map);
  let baseLayerMode = "satellite";
  let appliedBottomPanelOffset = 0;

  let loadedAnyTile = false;
  streetLayer.on("tileload", markMapVisible);
  satelliteLayer.on("tileload", markMapVisible);
  satelliteLayer.on("tileerror", () => {
    if (!loadedAnyTile) {
      showNotice("Satellite imagery is not loading. Showing map fallback...");
    }
  });

  const state = {
    places: [],
    annotations: [],
    markers: new Map(),
    annotationLayers: new Map()
  };

  els.zoomIn.addEventListener("click", () => map.zoomIn());
  els.zoomOut.addEventListener("click", () => map.zoomOut());
  els.fitMap.addEventListener("click", fitMap);
  els.toggleBaseLayer.addEventListener("click", toggleBaseLayer);
  els.togglePanel.addEventListener("click", togglePanel);
  els.placeSearch.addEventListener("input", renderList);
  map.on("zoomend", renderAnnotationLayers);
  window.addEventListener("resize", scheduleFitMap);
  window.addEventListener("orientationchange", scheduleFitMap);
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(scheduleFitMap);
    resizeObserver.observe(els.map);
  }
  updatePanelToggleIcon();

  loadPublishedData().then((data) => {
    state.places = data.places;
    state.annotations = data.annotations;
    setTimeout(() => {
      map.invalidateSize();
      fitMap();
      renderAll();
      applyStartingView();
      showNotice("");
      if (!loadedAnyTile) {
        showNotice("Map tiles are blocked or still loading. Places are shown on the fallback map.");
        setTimeout(() => showNotice(""), 4500);
      }
    }, 180);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }

  function removeNativeZoomControl() {
    document.querySelectorAll(".viewer-shell .leaflet-control-zoom").forEach((control) => {
      control.remove();
    });
  }

  function fitMap() {
    refreshZoomLimit();
    map.fitBounds(eventBounds, { animate: false, padding: [0, 0] });
    map.panInsideBounds(getCurrentViewBounds(), { animate: false });
    syncBottomPanelMapOffset();
  }

  function applyStartingView() {
    const params = new URLSearchParams(window.location.search);
    const placeKey = params.get("place") || params.get("id");
    const requestedZoom = parseZoom(params.get("zoom") || params.get("z"));

    if (placeKey) {
      const place = findPlaceFromParam(placeKey);
      if (place) {
        focusPlace(place, requestedZoom ?? 18, false);
        return;
      }
    }

    const lat = Number.parseFloat(params.get("lat"));
    const lng = Number.parseFloat(params.get("lng") || params.get("lon"));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      focusLatLng([lat, lng], requestedZoom ?? 18, false);
    }
  }

  function focusPlace(place, zoom, animate) {
    focusLatLng([place.lat, place.lng], zoom, animate);
    const marker = state.markers.get(place.id);
    if (marker) {
      marker.openPopup();
    }
  }

  function focusLatLng(latLng, zoom, animate) {
    const target = clampToEventBounds(L.latLng(latLng));
    map.setView(target, clampZoom(zoom), { animate });
    map.panInsideBounds(getCurrentViewBounds(), { animate: false });
    syncBottomPanelMapOffset();
  }

  function findPlaceFromParam(value) {
    const lookup = normalizeLookup(value);
    return state.places.find((place) => {
      return normalizeLookup(place.id) === lookup
        || normalizeLookup(place.name) === lookup
        || slugify(place.name) === lookup;
    });
  }

  function parseZoom(value) {
    if (value === null) {
      return null;
    }
    const zoom = Number.parseFloat(value);
    return Number.isFinite(zoom) ? zoom : null;
  }

  function clampZoom(zoom) {
    const minZoom = Number.isFinite(map.getMinZoom()) ? map.getMinZoom() : 0;
    const maxZoom = Number.isFinite(map.getMaxZoom()) ? map.getMaxZoom() : 19;
    return Math.max(minZoom, Math.min(maxZoom, zoom));
  }

  function clampToEventBounds(latLng) {
    if (eventBounds.contains(latLng)) {
      return latLng;
    }
    return eventBounds.getCenter();
  }

  function normalizeLookup(value) {
    return String(value || "").normalize("NFC").trim().toLowerCase();
  }

  function slugify(value) {
    return normalizeLookup(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function refreshZoomLimit() {
    map.invalidateSize({ animate: false });
    map.setMaxBounds(eventBounds.pad(1));
    const lockedMinZoom = Math.max(0, map.getBoundsZoom(eventBounds, false, [0, 0]));
    map.setMinZoom(lockedMinZoom);
    map.setMaxBounds(getBoundsForViewport(lockedMinZoom));
    if (map.getZoom() < lockedMinZoom) {
      map.setZoom(lockedMinZoom, { animate: false });
    }
    map.panInsideBounds(getCurrentViewBounds(), { animate: false });
    syncBottomPanelMapOffset();
    renderAnnotationLayers();
  }

  function getBoundsForViewport(zoom) {
    const bounds = getConstraintBounds();
    const size = map.getSize();
    const centerLatLng = bounds.getCenter();
    const center = map.project(centerLatLng, zoom);
    const west = map.project([centerLatLng.lat, bounds.getWest()], zoom);
    const east = map.project([centerLatLng.lat, bounds.getEast()], zoom);
    const north = map.project([bounds.getNorth(), centerLatLng.lng], zoom);
    const south = map.project([bounds.getSouth(), centerLatLng.lng], zoom);
    const halfWidth = Math.max(
      Math.abs(east.x - center.x),
      Math.abs(west.x - center.x),
      size.x / 2
    );
    const halfHeight = Math.max(
      Math.abs(north.y - center.y),
      Math.abs(south.y - center.y),
      size.y / 2
    );
    const southWest = map.unproject([center.x - halfWidth, center.y + halfHeight], zoom);
    const northEast = map.unproject([center.x + halfWidth, center.y - halfHeight], zoom);
    return L.latLngBounds(southWest, northEast);
  }

  function getConstraintBounds() {
    if (!isBottomPanelLayout() || els.shell.classList.contains("panel-collapsed")) {
      return eventBounds;
    }
    const latPadding = (eventBounds.getNorth() - eventBounds.getSouth()) * 0.5;
    return L.latLngBounds(
      [eventBounds.getSouth() - latPadding, eventBounds.getWest()],
      [eventBounds.getNorth(), eventBounds.getEast()]
    );
  }

  function getCurrentViewBounds() {
    return getBoundsForViewport(map.getZoom());
  }

  function getBottomPanelMapOffset() {
    if (!isBottomPanelLayout() || els.shell.classList.contains("panel-collapsed")) {
      return 0;
    }
    const panel = els.togglePanel.closest(".viewer-panel");
    const collapsedPeek = getCollapsedPanelPeek();
    return panel ? Math.max(0, Math.round(panel.offsetHeight - collapsedPeek)) : 0;
  }

  function getCollapsedPanelPeek() {
    const cssValue = getComputedStyle(document.documentElement)
      .getPropertyValue("--viewer-panel-collapsed-peek");
    const parsedValue = Number.parseFloat(cssValue);
    return Number.isFinite(parsedValue) ? parsedValue : 64;
  }

  function scheduleFitMap() {
    window.clearTimeout(scheduleFitMap.timer);
    window.cancelAnimationFrame(scheduleFitMap.frame);
    window.cancelAnimationFrame(scheduleFitMap.secondFrame);
    updatePanelToggleIcon();
    scheduleFitMap.frame = window.requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
      scheduleFitMap.secondFrame = window.requestAnimationFrame(refreshZoomLimit);
    });
    scheduleFitMap.timer = window.setTimeout(refreshZoomLimit, 240);
  }

  function markMapVisible() {
    loadedAnyTile = true;
    showNotice("");
  }

  function showNotice(message) {
    if (!els.mapNotice) {
      return;
    }
    els.mapNotice.textContent = message;
    els.mapNotice.classList.toggle("hidden", !message);
  }

  function toggleBaseLayer() {
    if (baseLayerMode === "satellite") {
      map.removeLayer(satelliteLayer);
      streetLayer.addTo(map);
      baseLayerMode = "normal";
    } else {
      map.removeLayer(streetLayer);
      satelliteLayer.addTo(map);
      baseLayerMode = "satellite";
    }
    const normal = baseLayerMode === "normal";
    els.toggleBaseLayer.classList.toggle("active", normal);
    els.toggleBaseLayer.setAttribute("aria-pressed", String(normal));
    els.toggleBaseLayer.title = normal ? "Switch to satellite map" : "Switch to normal map";
  }

  function togglePanel() {
    const collapsed = els.shell.classList.toggle("panel-collapsed");
    els.togglePanel.setAttribute("aria-pressed", String(!collapsed));
    els.togglePanel.title = collapsed ? "Show places" : "Hide places";
    updatePanelToggleIcon();
    syncBottomPanelMapOffset({ animate: true });
  }

  function syncBottomPanelMapOffset(options = {}) {
    const targetOffset = getBottomPanelMapOffset();
    const delta = targetOffset - appliedBottomPanelOffset;
    map.setMaxBounds(getBoundsForViewport(map.getMinZoom()));
    if (Math.abs(delta) < 1) {
      return;
    }
    map.panBy([0, delta], {
      animate: Boolean(options.animate),
      duration: 0.18
    });
    appliedBottomPanelOffset = targetOffset;
  }

  function updatePanelToggleIcon() {
    const collapsed = els.shell.classList.contains("panel-collapsed");
    const iconName = isBottomPanelLayout()
      ? (collapsed ? "chevron-up" : "chevron-down")
      : (collapsed ? "panel-right-open" : "panel-right-close");
    const currentIcon = els.togglePanel.dataset.icon;
    if (currentIcon === iconName) {
      return;
    }
    els.togglePanel.dataset.icon = iconName;
    els.togglePanel.innerHTML = `<i data-lucide="${iconName}" aria-hidden="true"></i>`;
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function isBottomPanelLayout() {
    return window.matchMedia("(max-width: 820px)").matches;
  }

  async function loadPublishedData() {
    const source = new URLSearchParams(window.location.search).get("data") || "./event-map-data.json";
    try {
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Could not load ${source}`);
      }
      return normalizeData(await response.json());
    } catch (error) {
      console.warn("Falling back to local editor data", error);
      return normalizeData(loadLocalData());
    }
  }

  function loadLocalData() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch (error) {
      console.warn("Could not load local map data", error);
      return {};
    }
  }

  function normalizeData(data) {
    const places = Array.isArray(data) ? data : data.places;
    const annotations = Array.isArray(data) ? [] : data.annotations;
    return {
      places: Array.isArray(places) ? places.filter(isValidPlace).map(normalizePlace) : [],
      annotations: Array.isArray(annotations)
        ? annotations.filter(isValidAnnotation).map(normalizeAnnotation)
        : []
    };
  }

  function isValidPlace(place) {
    return place && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng));
  }

  function isValidAnnotation(annotation) {
    if (!annotation || !["line", "arrow", "text"].includes(annotation.type)) {
      return false;
    }

    if (annotation.type === "text") {
      return Number.isFinite(Number(annotation.lat)) && Number.isFinite(Number(annotation.lng));
    }

    return Array.isArray(annotation.points)
      && annotation.points.length === 2
      && annotation.points.every((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)));
  }

  function normalizePlace(place) {
    const type = ["shop", "dj", "parking", "toilet"].includes(place.type) ? place.type : "item";
    return {
      id: String(place.id || createId()),
      type,
      name: String(place.name || getPlaceFallbackName(type)),
      notes: String(place.notes || ""),
      logo: normalizeLogo(place.logo),
      lat: roundCoord(Number(place.lat)),
      lng: roundCoord(Number(place.lng)),
      stock: type === "shop" && Array.isArray(place.stock)
        ? place.stock.map((item) => ({
            category: normalizeStockCategory(item.category),
            name: String(item.name || ""),
            price: String(item.price || "")
          }))
        : []
    };
  }

  function normalizeAnnotation(annotation) {
    const type = annotation.type;
    const normalized = {
      id: String(annotation.id || createId()),
      type,
      name: String(annotation.name || defaultAnnotationName(type)),
      notes: String(annotation.notes || ""),
      color: normalizeColor(annotation.color)
    };

    if (type === "text") {
      normalized.text = String(annotation.text || annotation.name || "Text");
      normalized.anchor = normalizeTextAnchor(annotation.anchor);
      normalized.width = clampDimension(annotation.width, 60, 420, defaultTextSize.width);
      normalized.height = clampDimension(annotation.height, 32, 260, defaultTextSize.height);
      normalized.lat = roundCoord(Number(annotation.lat));
      normalized.lng = roundCoord(Number(annotation.lng));
    } else {
      normalized.points = annotation.points.map(toPoint);
    }

    return normalized;
  }

  function renderAll() {
    renderMarkers();
    renderAnnotationLayers();
    renderList();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function renderMarkers() {
    state.markers.forEach((marker) => marker.remove());
    state.markers.clear();

    state.places.forEach((place) => {
      const marker = L.marker([place.lat, place.lng], {
        icon: makeIcon(place.type),
        title: place.name
      }).addTo(map);

      marker.bindPopup(makePopup(place));
      state.markers.set(place.id, marker);
    });
  }

  function renderAnnotationLayers() {
    state.annotationLayers.forEach((layer) => layer.remove());
    state.annotationLayers.clear();

    state.annotations.forEach((annotation) => {
      const layer = annotation.type === "text"
        ? makeTextLayer(annotation)
        : makePathLayer(annotation);
      layer.addTo(map);
      state.annotationLayers.set(annotation.id, layer);
    });
  }

  function makePathLayer(annotation) {
    const start = L.latLng(annotation.points[0].lat, annotation.points[0].lng);
    const end = L.latLng(annotation.points[1].lat, annotation.points[1].lng);
    const color = normalizeColor(annotation.color);
    const group = L.layerGroup();

    L.polyline([start, end], {
      color,
      opacity: 0.96,
      weight: 5,
      className: "annotation-path"
    }).addTo(group);

    if (annotation.type === "arrow") {
      L.marker(end, {
        icon: makeArrowIcon(start, end, color),
        interactive: false
      }).addTo(group);
    }

    return group;
  }

  function makeTextLayer(annotation) {
    const width = clampDimension(annotation.width, 60, 420, defaultTextSize.width);
    const height = clampDimension(annotation.height, 32, 260, defaultTextSize.height);
    const color = normalizeColor(annotation.color);
    const scale = getTextScale();
    const origin = getTextTransformOrigin(annotation.anchor);
    return L.marker([annotation.lat, annotation.lng], {
      interactive: false,
      icon: L.divIcon({
        className: "",
        html: `<div class="map-text-label" style="--label-color: ${color}; --text-scale: ${scale}; --text-origin: ${origin}; width: ${width}px; height: ${height}px;">${escapeHtml(annotation.text)}</div>`,
        iconSize: [width, height],
        iconAnchor: getTextIconAnchor(annotation.anchor, width)
      })
    });
  }

  function makeArrowIcon(start, end, color) {
    const startPoint = map.latLngToLayerPoint(start);
    const endPoint = map.latLngToLayerPoint(end);
    const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x) * 180 / Math.PI;
    return L.divIcon({
      className: "",
      html: `<div class="arrow-head" style="--arrow-color: ${color}; transform: rotate(${angle}deg)"></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
  }

  function makeIcon(type) {
    const iconName = {
      item: "map-pin",
      shop: "store",
      dj: "music",
      parking: "parking",
      toilet: "toilet"
    }[type] || "map-pin";
    return L.divIcon({
      className: "",
      html: `<div class="event-marker ${type}">${iconSvg(iconName)}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -18]
    });
  }

  function iconSvg(name) {
    const icons = {
      store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 2-4h16l2 4"/><path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M8 21v-7h8v7"/><path d="M2 7h20"/><path d="M4 7v2a2 2 0 0 0 4 0V7"/><path d="M8 7v2a2 2 0 0 0 4 0V7"/><path d="M12 7v2a2 2 0 0 0 4 0V7"/><path d="M16 7v2a2 2 0 0 0 4 0V7"/></svg>',
      music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
      parking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>',
      toilet: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="8" cy="5" r="2.1"/><circle cx="16" cy="5" r="2.1"/><path d="M5.8 8.3h4.4l1.15 6.2H9.6V21H6.4v-6.5H4.65L5.8 8.3Z"/><path d="M14.2 8.3h3.6c1.25 0 2.2.95 2.2 2.2V14h-2v7h-4v-7h-2v-3.5c0-1.25.95-2.2 2.2-2.2Z"/></svg>',
      "map-pin": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>'
    };
    return icons[name];
  }

  function makePopup(place) {
    const stock = renderGroupedStock(place.stock);
    const logo = place.logo ? `<img class="popup-logo" src="${escapeHtml(place.logo)}" alt="">` : "";

    return `
      <div class="popup-content">
        ${logo}
        <h3>${escapeHtml(place.name)}</h3>
        ${place.notes ? `<p>${escapeHtml(place.notes)}</p>` : ""}
        ${place.type === "shop" && stock ? `<div class="popup-stock">${stock}</div>` : ""}
      </div>
    `;
  }

  function renderList() {
    const query = els.placeSearch.value.trim().toLowerCase();
    const rows = state.places
      .filter((place) => {
        const stock = Array.isArray(place.stock) ? place.stock.map((item) => item.name).join(" ") : "";
        return `${place.name} ${place.notes} ${stock}`.toLowerCase().includes(query);
      })
      .sort(compareMenuPlaces);

    els.placeList.innerHTML = "";
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = query ? "No matching places." : "No places published yet.";
      els.placeList.appendChild(empty);
      return;
    }

    rows.forEach((place) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `place-card ${place.type}`;
      const logo = place.logo ? `<img class="place-card-logo" src="${escapeHtml(place.logo)}" alt="">` : "";
      button.innerHTML = `${logo}<div><strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(getListDetail(place))}</span></div>`;
      button.addEventListener("click", () => {
        focusPlace(place, Math.max(map.getZoom(), 18), true);
      });
      els.placeList.appendChild(button);
    });
  }

  function getListDetail(place) {
    if (place.type === "shop") {
      return place.notes || "Shop";
    }
    if (place.type === "parking") {
      return "Parking";
    }
    if (place.type === "dj") {
      return "DJ";
    }
    if (place.type === "toilet") {
      return "Toilets";
    }
    return place.notes || "Map item";
  }

  function compareMenuPlaces(a, b) {
    const orderDelta = getMenuOrder(a.type) - getMenuOrder(b.type);
    if (orderDelta !== 0) {
      return orderDelta;
    }
    return a.name.localeCompare(b.name);
  }

  function getMenuOrder(type) {
    return {
      shop: 0,
      dj: 1,
      toilet: 2,
      item: 3,
      parking: 4
    }[type] ?? 50;
  }

  function defaultAnnotationName(type) {
    if (type === "arrow") {
      return "Arrow";
    }
    if (type === "line") {
      return "Line";
    }
    return "Text";
  }

  function getPlaceFallbackName(type) {
    if (type === "shop") {
      return "Shop";
    }
    if (type === "dj") {
      return "DJ";
    }
    if (type === "parking") {
      return "Parking";
    }
    if (type === "toilet") {
      return "Toilets";
    }
    return "Item";
  }

  function toPoint(point) {
    return {
      lat: roundCoord(Number(point.lat)),
      lng: roundCoord(Number(point.lng))
    };
  }

  function roundCoord(value) {
    return Math.round(Number(value) * 100000) / 100000;
  }

  function normalizeColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : defaultAnnotationColor;
  }

  function normalizeLogo(value) {
    const logo = String(value || "").trim();
    return /^javascript:/i.test(logo) ? "" : logo;
  }

  function normalizeStockCategory(value) {
    return value === "drink" ? "drink" : "food";
  }

  function normalizeTextAnchor(value) {
    return value === "top-left" ? "top-left" : "top-right";
  }

  function getTextIconAnchor(anchor, width) {
    return normalizeTextAnchor(anchor) === "top-left" ? [0, 0] : [width, 0];
  }

  function getTextTransformOrigin(anchor) {
    return normalizeTextAnchor(anchor) === "top-left" ? "top left" : "top right";
  }

  function getTextScale() {
    const zoom = map.getZoom();
    const minZoom = Number.isFinite(map.getMinZoom()) ? map.getMinZoom() : zoom;
    const fullSizeZoom = minZoom + 2;
    const progress = Math.max(0, Math.min(1, (zoom - minZoom) / (fullSizeZoom - minZoom)));
    return Math.round((0.65 + progress * 0.35) * 100) / 100;
  }

  function renderGroupedStock(stockItems) {
    const groups = [
      { key: "food", label: "Essen" },
      { key: "drink", label: "Drinks" }
    ];
    return groups
      .map((group) => {
        const rows = stockItems
          .filter((item) => normalizeStockCategory(item.category) === group.key && (item.name || item.price))
          .map((item) => `<div><strong>${escapeHtml(item.name || "Item")}</strong><span>${escapeHtml(item.price)}</span></div>`)
          .join("");
        return rows ? `<section><h4>${group.label}</h4>${rows}</section>` : "";
      })
      .join("");
  }

  function clampDimension(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function createId() {
    return `published-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
