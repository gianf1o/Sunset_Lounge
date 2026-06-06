(function () {
  const eventBounds = L.latLngBounds(
    [48.52132, 9.33905],
    [48.52768, 9.34823]
  );
  const storageKey = "event-map-places-v1";
  const defaultAnnotationColor = "#f3c84b";
  const defaultTextSize = { width: 160, height: 52 };

  const map = L.map("map", {
    maxBounds: eventBounds.pad(0.65),
    maxBoundsViscosity: 0.7,
    minZoom: 15,
    zoomControl: false
  });

  const streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });

  const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community"
  }).addTo(map);
  let baseLayerMode = "satellite";

  L.rectangle(eventBounds, {
    color: "#1f7a5a",
    fillColor: "#1f7a5a",
    fillOpacity: 0.08,
    weight: 2
  }).addTo(map);

  map.fitBounds(eventBounds, { padding: [42, 42] });

  const savedData = loadData();
  const state = {
    mode: "select",
    selectedId: null,
    selectedKind: null,
    places: savedData.places,
    annotations: savedData.annotations,
    markers: new Map(),
    annotationLayers: new Map(),
    pendingDrawing: null,
    previewLayer: null
  };

  const els = {
    selectMode: document.getElementById("selectMode"),
    addPlaceMode: document.getElementById("addPlaceMode"),
    addShopMode: document.getElementById("addShopMode"),
    addDjMode: document.getElementById("addDjMode"),
    addParkingMode: document.getElementById("addParkingMode"),
    addToiletMode: document.getElementById("addToiletMode"),
    addLineMode: document.getElementById("addLineMode"),
    addArrowMode: document.getElementById("addArrowMode"),
    addTextMode: document.getElementById("addTextMode"),
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
    fitMap: document.getElementById("fitMap"),
    toggleBaseLayer: document.getElementById("toggleBaseLayer"),
    mapStatus: document.getElementById("mapStatus"),
    placeList: document.getElementById("placeList"),
    placeSearch: document.getElementById("placeSearch"),
    editorPanel: document.getElementById("editorPanel"),
    placeForm: document.getElementById("placeForm"),
    typeBadge: document.getElementById("typeBadge"),
    deletePlace: document.getElementById("deletePlace"),
    placeName: document.getElementById("placeName"),
    placeNotes: document.getElementById("placeNotes"),
    logoSection: document.getElementById("logoSection"),
    placeLogo: document.getElementById("placeLogo"),
    logoUpload: document.getElementById("logoUpload"),
    clearLogo: document.getElementById("clearLogo"),
    logoPreview: document.getElementById("logoPreview"),
    placeLat: document.getElementById("placeLat"),
    placeLng: document.getElementById("placeLng"),
    coordinateGrid: document.querySelector(".coordinate-grid"),
    annotationSection: document.getElementById("annotationSection"),
    annotationColor: document.getElementById("annotationColor"),
    textOptions: document.getElementById("textOptions"),
    annotationText: document.getElementById("annotationText"),
    annotationAnchor: document.getElementById("annotationAnchor"),
    annotationWidth: document.getElementById("annotationWidth"),
    annotationHeight: document.getElementById("annotationHeight"),
    inventorySection: document.getElementById("inventorySection"),
    stockList: document.getElementById("stockList"),
    addStockItem: document.getElementById("addStockItem"),
    stockRowTemplate: document.getElementById("stockRowTemplate"),
    exportData: document.getElementById("exportData"),
    importData: document.getElementById("importData")
  };

  const modeButtons = {
    select: els.selectMode,
    item: els.addPlaceMode,
    shop: els.addShopMode,
    dj: els.addDjMode,
    parking: els.addParkingMode,
    toilet: els.addToiletMode,
    line: els.addLineMode,
    arrow: els.addArrowMode,
    text: els.addTextMode
  };

  els.selectMode.addEventListener("click", () => setMode("select"));
  els.addPlaceMode.addEventListener("click", () => setMode("item"));
  els.addShopMode.addEventListener("click", () => setMode("shop"));
  els.addDjMode.addEventListener("click", () => setMode("dj"));
  els.addParkingMode.addEventListener("click", () => setMode("parking"));
  els.addToiletMode.addEventListener("click", () => setMode("toilet"));
  els.addLineMode.addEventListener("click", () => setMode("line"));
  els.addArrowMode.addEventListener("click", () => setMode("arrow"));
  els.addTextMode.addEventListener("click", () => setMode("text"));
  els.zoomIn.addEventListener("click", () => map.zoomIn());
  els.zoomOut.addEventListener("click", () => map.zoomOut());
  els.fitMap.addEventListener("click", () => map.fitBounds(eventBounds, { padding: [42, 42] }));
  els.toggleBaseLayer.addEventListener("click", toggleBaseLayer);
  els.placeSearch.addEventListener("input", renderList);
  els.placeForm.addEventListener("submit", saveSelectedFromForm);
  els.deletePlace.addEventListener("click", deleteSelected);
  els.addStockItem.addEventListener("click", () => addStockRow({ category: "food", name: "", price: "" }));
  els.placeLogo.addEventListener("input", () => updateLogoPreview(els.placeLogo.value));
  els.logoUpload.addEventListener("change", handleLogoUpload);
  els.clearLogo.addEventListener("click", clearLogo);
  els.exportData.addEventListener("click", exportData);
  els.importData.addEventListener("change", importData);

  map.on("click", handleMapClick);
  map.on("zoomend", renderAnnotationLayers);

  renderAll();
  setMode("select");
  if (window.lucide) {
    window.lucide.createIcons();
  }

  function handleMapClick(event) {
    if (state.mode === "select") {
      return;
    }

    const point = clampToEventBounds(event.latlng);
    if (["item", "shop", "dj", "parking", "toilet"].includes(state.mode)) {
      addPlace(point, state.mode);
      return;
    }

    if (state.mode === "text") {
      addTextAnnotation(point);
      return;
    }

    if (state.mode === "line" || state.mode === "arrow") {
      handleLineClick(point, state.mode);
    }
  }

  function addPlace(point, type) {
    const place = {
      id: createId(),
      type,
      name: getDefaultPlaceName(type),
      notes: "",
      logo: "",
      lat: roundCoord(point.lat),
      lng: roundCoord(point.lng),
      stock: type === "shop" ? [{ category: "food", name: "", price: "" }] : []
    };

    state.places.push(place);
    persistData();
    renderAll();
    selectEntity("place", place.id, true);
    setMode("select");
  }

  function addTextAnnotation(point) {
    const annotation = {
      id: createId(),
      type: "text",
      name: "Text",
      notes: "",
      text: "Text",
      anchor: "top-right",
      color: defaultAnnotationColor,
      width: defaultTextSize.width,
      height: defaultTextSize.height,
      lat: roundCoord(point.lat),
      lng: roundCoord(point.lng)
    };

    state.annotations.push(annotation);
    persistData();
    renderAll();
    selectEntity("annotation", annotation.id, true);
    setMode("select");
  }

  function handleLineClick(point, type) {
    if (!state.pendingDrawing) {
      state.pendingDrawing = { type, start: toPoint(point) };
      state.previewLayer = L.circleMarker(point, {
        color: defaultAnnotationColor,
        fillColor: defaultAnnotationColor,
        fillOpacity: 0.95,
        radius: 5,
        weight: 2
      }).addTo(map);
      els.mapStatus.textContent = "Click end point";
      return;
    }

    const annotation = {
      id: createId(),
      type,
      name: defaultAnnotationName(type),
      notes: "",
      color: defaultAnnotationColor,
      points: [state.pendingDrawing.start, toPoint(point)]
    };

    clearPendingDrawing();
    state.annotations.push(annotation);
    persistData();
    renderAll();
    selectEntity("annotation", annotation.id, true);
    setMode("select");
  }

  function loadData() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      return { places: [], annotations: [] };
    }

    try {
      const parsed = JSON.parse(saved);
      const places = Array.isArray(parsed) ? parsed : parsed.places;
      const annotations = Array.isArray(parsed) ? [] : parsed.annotations;
      return {
        places: Array.isArray(places) ? places.filter(isValidPlace).map(normalizePlace) : [],
        annotations: Array.isArray(annotations)
          ? annotations.filter(isValidAnnotation).map(normalizeAnnotation)
          : []
      };
    } catch (error) {
      console.warn("Could not load saved map data", error);
      return { places: [], annotations: [] };
    }
  }

  function persistData() {
    localStorage.setItem(storageKey, JSON.stringify({
      places: state.places,
      annotations: state.annotations
    }, null, 2));
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

  function setMode(mode) {
    state.mode = mode;
    if ((mode !== "line" && mode !== "arrow") || (state.pendingDrawing && state.pendingDrawing.type !== mode)) {
      clearPendingDrawing();
    }

    Object.entries(modeButtons).forEach(([key, button]) => {
      const active = key === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const labels = {
      select: "Select",
      item: "Click map for item",
      shop: "Click map for shop",
      dj: "Click map for DJ",
      parking: "Click map for parking",
      toilet: "Click map for toilets",
      line: "Click start point",
      arrow: "Click arrow start",
      text: "Click map for text"
    };
    els.mapStatus.textContent = labels[mode];
    document.body.classList.toggle("placing", mode !== "select");
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

  function renderAll() {
    renderMarkers();
    renderAnnotationLayers();
    renderList();
    renderEditor();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function renderMarkers() {
    const knownIds = new Set(state.places.map((place) => place.id));
    state.markers.forEach((marker, id) => {
      if (!knownIds.has(id)) {
        marker.remove();
        state.markers.delete(id);
      }
    });

    state.places.forEach((place) => {
      const latLng = [place.lat, place.lng];
      const existing = state.markers.get(place.id);
      if (existing) {
        existing.setLatLng(latLng);
        existing.setIcon(makeIcon(place.type));
        existing.bindPopup(makePopup(place));
        return;
      }

      const marker = L.marker(latLng, {
        draggable: true,
        icon: makeIcon(place.type),
        title: place.name
      }).addTo(map);

      marker.on("click", () => selectEntity("place", place.id, false));
      marker.on("dragend", () => {
        const moved = marker.getLatLng();
        place.lat = roundCoord(moved.lat);
        place.lng = roundCoord(moved.lng);
        persistData();
        renderAll();
        selectEntity("place", place.id, false);
      });
      marker.bindPopup(makePopup(place));
      state.markers.set(place.id, marker);
    });
  }

  function renderAnnotationLayers() {
    state.annotationLayers.forEach((layer) => layer.remove());
    state.annotationLayers.clear();

    state.annotations.forEach((annotation) => {
      const selected = state.selectedKind === "annotation" && state.selectedId === annotation.id;
      const layer = annotation.type === "text"
        ? makeTextLayer(annotation, selected)
        : makePathLayer(annotation, selected);
      layer.addTo(map);
      state.annotationLayers.set(annotation.id, layer);
    });
  }

  function makePathLayer(annotation, selected) {
    const start = L.latLng(annotation.points[0].lat, annotation.points[0].lng);
    const end = L.latLng(annotation.points[1].lat, annotation.points[1].lng);
    const color = normalizeColor(annotation.color);
    const group = L.layerGroup();
    const line = L.polyline([start, end], {
      color,
      opacity: 0.96,
      weight: selected ? 8 : 5,
      className: `annotation-path ${selected ? "selected" : ""}`
    });

    line.on("click", () => selectEntity("annotation", annotation.id, false));
    line.addTo(group);

    if (annotation.type === "arrow") {
      const arrow = L.marker(end, {
        icon: makeArrowIcon(start, end, selected, color),
        interactive: true
      });
      arrow.on("click", () => selectEntity("annotation", annotation.id, false));
      arrow.addTo(group);
    }

    return group;
  }

  function makeTextLayer(annotation, selected) {
    const width = clampDimension(annotation.width, 60, 420, defaultTextSize.width);
    const height = clampDimension(annotation.height, 32, 260, defaultTextSize.height);
    const color = normalizeColor(annotation.color);
    const scale = getTextScale();
    const origin = getTextTransformOrigin(annotation.anchor);
    const marker = L.marker([annotation.lat, annotation.lng], {
      draggable: true,
      icon: L.divIcon({
        className: "",
        html: `<div class="map-text-label ${selected ? "selected" : ""}" style="--label-color: ${color}; --text-scale: ${scale}; --text-origin: ${origin}; width: ${width}px; height: ${height}px;">${escapeHtml(annotation.text)}</div>`,
        iconSize: [width, height],
        iconAnchor: getTextIconAnchor(annotation.anchor, width)
      })
    });

    marker.on("click", () => selectEntity("annotation", annotation.id, false));
    marker.on("dragend", () => {
      const moved = marker.getLatLng();
      annotation.lat = roundCoord(moved.lat);
      annotation.lng = roundCoord(moved.lng);
      persistData();
      renderAll();
      selectEntity("annotation", annotation.id, false);
    });

    return marker;
  }

  function makeArrowIcon(start, end, selected, color) {
    const startPoint = map.latLngToLayerPoint(start);
    const endPoint = map.latLngToLayerPoint(end);
    const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x) * 180 / Math.PI;
    return L.divIcon({
      className: "",
      html: `<div class="arrow-head ${selected ? "selected" : ""}" style="--arrow-color: ${color}; transform: rotate(${angle}deg)"></div>`,
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
    const rows = [
      ...state.places.map((place) => ({ kind: "place", item: place })),
      ...state.annotations.map((annotation) => ({ kind: "annotation", item: annotation }))
    ]
      .filter(({ item }) => {
        const stock = Array.isArray(item.stock) ? item.stock.map((stockItem) => stockItem.name).join(" ") : "";
        const text = item.text || "";
        const haystack = `${item.name} ${item.notes} ${stock} ${text}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort(compareMenuRows);

    els.placeList.innerHTML = "";
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = query ? "No matching map items." : "Use the map tools to add items.";
      els.placeList.appendChild(empty);
      return;
    }

    rows.forEach(({ kind, item }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `place-card ${item.type}${item.id === state.selectedId && kind === state.selectedKind ? " active" : ""}`;
      const logo = kind === "place" && item.logo ? `<img class="place-card-logo" src="${escapeHtml(item.logo)}" alt="">` : "";
      button.innerHTML = `${logo}<div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(getListDetail(kind, item))}</span></div>`;
      button.addEventListener("click", () => selectEntity(kind, item.id, true));
      els.placeList.appendChild(button);
    });
  }

  function getListDetail(kind, item) {
    if (kind === "place" && item.type === "shop") {
      return item.notes || "Shop";
    }
    if (kind === "place" && item.type === "parking") {
      return "Parking";
    }
    if (kind === "place" && item.type === "dj") {
      return "DJ";
    }
    if (kind === "place" && item.type === "toilet") {
      return "Toilets";
    }
    if (kind === "place") {
      return [item.lat.toFixed(5), item.lng.toFixed(5)].join(", ");
    }
    if (item.type === "text") {
      return item.text;
    }
    return item.type === "arrow" ? "Directional arrow" : "Line";
  }

  function compareMenuRows(a, b) {
    const orderDelta = getMenuOrder(a) - getMenuOrder(b);
    if (orderDelta !== 0) {
      return orderDelta;
    }
    return a.item.name.localeCompare(b.item.name);
  }

  function getMenuOrder(row) {
    if (row.kind !== "place") {
      return 99;
    }
    return {
      shop: 0,
      dj: 1,
      toilet: 2,
      item: 3,
      parking: 4
    }[row.item.type] ?? 50;
  }

  function selectEntity(kind, id, panToItem) {
    state.selectedKind = kind;
    state.selectedId = id;
    const selected = getSelectedEntity();
    renderList();
    renderEditor();
    renderAnnotationLayers();

    if (selected && panToItem) {
      const center = getEntityCenter(kind, selected);
      map.flyTo(center, Math.max(map.getZoom(), 18), { duration: 0.45 });
    }

    if (kind === "place") {
      const marker = state.markers.get(id);
      if (marker) {
        marker.openPopup();
      }
    }
  }

  function renderEditor() {
    const selected = getSelectedEntityWithKind();
    els.editorPanel.classList.toggle("visible", Boolean(selected));
    if (!selected) {
      return;
    }

    const { kind, item } = selected;
    els.typeBadge.textContent = getTypeLabel(item.type);
    els.placeName.value = item.name;
    els.placeNotes.value = item.notes || "";
    els.placeLogo.value = kind === "place" ? item.logo || "" : "";
    updateLogoPreview(els.placeLogo.value);
    els.stockList.innerHTML = "";

    const isPlace = kind === "place";
    const isAnnotation = kind === "annotation";
    const isText = kind === "annotation" && item.type === "text";
    els.coordinateGrid.classList.toggle("hidden", kind === "annotation" && item.type !== "text");
    els.logoSection.classList.toggle("visible", isPlace);
    els.inventorySection.classList.toggle("visible", isPlace && item.type === "shop");
    els.annotationSection.classList.toggle("visible", isAnnotation);
    els.textOptions.classList.toggle("visible", isText);

    if (isPlace || isText) {
      els.placeLat.value = item.lat.toFixed(5);
      els.placeLng.value = item.lng.toFixed(5);
    } else {
      els.placeLat.value = "";
      els.placeLng.value = "";
    }

    if (isText) {
      els.annotationColor.value = normalizeColor(item.color);
      els.annotationText.value = item.text;
      els.annotationAnchor.value = normalizeTextAnchor(item.anchor);
      els.annotationWidth.value = clampDimension(item.width, 60, 420, defaultTextSize.width);
      els.annotationHeight.value = clampDimension(item.height, 32, 260, defaultTextSize.height);
    } else if (isAnnotation) {
      els.annotationColor.value = normalizeColor(item.color);
      els.annotationText.value = "";
      els.annotationAnchor.value = "top-right";
      els.annotationWidth.value = "";
      els.annotationHeight.value = "";
    } else {
      els.annotationColor.value = defaultAnnotationColor;
      els.annotationText.value = "";
      els.annotationAnchor.value = "top-right";
      els.annotationWidth.value = "";
      els.annotationHeight.value = "";
    }

    if (isPlace && item.type === "shop") {
      const stock = item.stock.length ? item.stock : [{ category: "food", name: "", price: "" }];
      stock.forEach(addStockRow);
    }
  }

  function addStockRow(stockItem) {
    const row = els.stockRowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".stock-category").value = normalizeStockCategory(stockItem.category);
    row.querySelector(".stock-name").value = stockItem.name || "";
    row.querySelector(".stock-price").value = stockItem.price || "";
    row.querySelector(".remove-stock").addEventListener("click", () => row.remove());
    els.stockList.appendChild(row);
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function saveSelectedFromForm(event) {
    event.preventDefault();
    const selected = getSelectedEntityWithKind();
    if (!selected) {
      return;
    }

    if (selected.kind === "place") {
      if (!savePlace(selected.item)) {
        return;
      }
    } else if (!saveAnnotation(selected.item)) {
      return;
    }

    persistData();
    renderAll();
    selectEntity(selected.kind, selected.item.id, false);
  }

  function savePlace(place) {
    const lat = Number(els.placeLat.value);
    const lng = Number(els.placeLng.value);
    if (!eventBounds.pad(0.2).contains([lat, lng])) {
      alert("That location is outside the event map area.");
      return false;
    }

    place.name = els.placeName.value.trim() || getPlaceFallbackName(place.type);
    place.notes = els.placeNotes.value.trim();
    place.logo = normalizeLogo(els.placeLogo.value);
    place.lat = roundCoord(lat);
    place.lng = roundCoord(lng);
    if (place.type === "shop") {
      place.stock = Array.from(els.stockList.querySelectorAll(".stock-row"))
        .map((row) => ({
          category: normalizeStockCategory(row.querySelector(".stock-category").value),
          name: row.querySelector(".stock-name").value.trim(),
          price: row.querySelector(".stock-price").value.trim()
        }))
        .filter((item) => item.name || item.price);
    }
    return true;
  }

  function saveAnnotation(annotation) {
    let lat = annotation.lat;
    let lng = annotation.lng;
    let text = annotation.text;
    let anchor = annotation.anchor;
    let width = annotation.width;
    let height = annotation.height;

    if (annotation.type === "text") {
      lat = Number(els.placeLat.value);
      lng = Number(els.placeLng.value);
      if (!eventBounds.pad(0.2).contains([lat, lng])) {
        alert("That location is outside the event map area.");
        return false;
      }
      text = els.annotationText.value.trim() || "Text";
      anchor = normalizeTextAnchor(els.annotationAnchor.value);
      width = clampDimension(els.annotationWidth.value, 60, 420, defaultTextSize.width);
      height = clampDimension(els.annotationHeight.value, 32, 260, defaultTextSize.height);
    }

    annotation.name = els.placeName.value.trim() || defaultAnnotationName(annotation.type);
    annotation.notes = els.placeNotes.value.trim();
    annotation.color = normalizeColor(els.annotationColor.value);
    if (annotation.type !== "text") {
      return true;
    }
    annotation.lat = roundCoord(lat);
    annotation.lng = roundCoord(lng);
    annotation.text = text;
    annotation.anchor = anchor;
    annotation.width = width;
    annotation.height = height;
    return true;
  }

  function deleteSelected() {
    const selected = getSelectedEntityWithKind();
    if (!selected) {
      return;
    }

    if (selected.kind === "place") {
      state.places = state.places.filter((item) => item.id !== selected.item.id);
    } else {
      state.annotations = state.annotations.filter((item) => item.id !== selected.item.id);
    }

    state.selectedId = null;
    state.selectedKind = null;
    persistData();
    renderAll();
  }

  function exportData() {
    const payload = {
      bounds: {
        southWest: eventBounds.getSouthWest(),
        northEast: eventBounds.getNorthEast()
      },
      places: state.places,
      annotations: state.annotations
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "event-map-data.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importData(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const places = Array.isArray(parsed) ? parsed : parsed.places;
        const annotations = Array.isArray(parsed) ? [] : parsed.annotations;
        if (!Array.isArray(places)) {
          throw new Error("Missing places array");
        }
        state.places = places.filter(isValidPlace).map(normalizePlace);
        state.annotations = Array.isArray(annotations)
          ? annotations.filter(isValidAnnotation).map(normalizeAnnotation)
          : [];
        state.selectedId = null;
        state.selectedKind = null;
        persistData();
        renderAll();
      } catch (error) {
        alert("This JSON file does not look like event map data.");
        console.error(error);
      } finally {
        els.importData.value = "";
      }
    };
    reader.readAsText(file);
  }

  function getSelectedEntityWithKind() {
    if (state.selectedKind === "place") {
      const item = state.places.find((place) => place.id === state.selectedId);
      return item ? { kind: "place", item } : null;
    }

    if (state.selectedKind === "annotation") {
      const item = state.annotations.find((annotation) => annotation.id === state.selectedId);
      return item ? { kind: "annotation", item } : null;
    }

    return null;
  }

  function getSelectedEntity() {
    const selected = getSelectedEntityWithKind();
    return selected ? selected.item : null;
  }

  function getEntityCenter(kind, item) {
    if (kind === "place" || item.type === "text") {
      return [item.lat, item.lng];
    }

    const start = item.points[0];
    const end = item.points[1];
    return [
      (start.lat + end.lat) / 2,
      (start.lng + end.lng) / 2
    ];
  }

  function clampToEventBounds(latLng) {
    if (eventBounds.contains(latLng)) {
      return latLng;
    }
    return eventBounds.getCenter();
  }

  function clearPendingDrawing() {
    state.pendingDrawing = null;
    if (state.previewLayer) {
      state.previewLayer.remove();
      state.previewLayer = null;
    }
  }

  function toPoint(point) {
    return {
      lat: roundCoord(Number(point.lat)),
      lng: roundCoord(Number(point.lng))
    };
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

  function getTypeLabel(type) {
    return {
      item: "Item",
      shop: "Shop",
      dj: "DJ",
      parking: "Parking",
      toilet: "Toilets",
      line: "Line",
      arrow: "Arrow",
      text: "Text"
    }[type] || "Item";
  }

  function roundCoord(value) {
    return Math.round(Number(value) * 100000) / 100000;
  }

  function getDefaultPlaceName(type) {
    if (type === "shop") {
      return "New shop";
    }
    if (type === "dj") {
      return "New DJ";
    }
    if (type === "parking") {
      return "New parking";
    }
    if (type === "toilet") {
      return "New toilets";
    }
    return "New item";
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

  function normalizeColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : defaultAnnotationColor;
  }

  function normalizeLogo(value) {
    const logo = String(value || "").trim();
    return /^javascript:/i.test(logo) ? "" : logo;
  }

  function updateLogoPreview(value) {
    const logo = normalizeLogo(value);
    els.logoPreview.src = logo;
    els.logoPreview.classList.toggle("visible", Boolean(logo));
  }

  function clearLogo() {
    els.placeLogo.value = "";
    els.logoUpload.value = "";
    updateLogoPreview("");
  }

  function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      els.logoUpload.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      els.placeLogo.value = String(reader.result || "");
      updateLogoPreview(els.placeLogo.value);
    };
    reader.readAsDataURL(file);
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
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `map-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
