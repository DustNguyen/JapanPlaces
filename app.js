const TABLE_NAME = "places";

const el = {
  backendStatus: document.getElementById("backend-status"),
  totalCount: document.getElementById("total-count"),
  shownCount: document.getElementById("shown-count"),
  customCount: document.getElementById("custom-count"),
  searchInput: document.getElementById("search-input"),
  areaFilter: document.getElementById("area-filter"),
  purposeFilter: document.getElementById("purpose-filter"),
  sortField: document.getElementById("sort-field"),
  sortDirection: document.getElementById("sort-direction"),
  resetFilters: document.getElementById("reset-filters"),
  addForm: document.getElementById("add-place-form"),
  addPhotos: document.getElementById("place-photos"),
  addPasteZone: document.getElementById("add-paste-zone"),
  addPhotoList: document.getElementById("add-photo-list"),
  formMessage: document.getElementById("form-message"),
  tableBody: document.getElementById("places-table-body"),
  mapSelect: document.getElementById("map-place-select"),
  mapFrame: document.getElementById("map-frame"),
  mapEmpty: document.getElementById("map-empty"),
  mapLink: document.getElementById("open-map-link"),
  editModal: document.getElementById("edit-modal"),
  closeEditModal: document.getElementById("close-edit-modal"),
  editForm: document.getElementById("edit-place-form"),
  editName: document.getElementById("edit-place-name"),
  editArea: document.getElementById("edit-place-area"),
  editPurpose: document.getElementById("edit-place-purpose"),
  editDetails: document.getElementById("edit-place-details"),
  editAddress: document.getElementById("edit-place-address"),
  editPhotos: document.getElementById("edit-place-photos"),
  editPasteZone: document.getElementById("edit-paste-zone"),
  editPhotoList: document.getElementById("edit-photo-list"),
  editMessage: document.getElementById("edit-message"),
  lightbox: document.getElementById("photo-lightbox"),
  lightboxImage: document.getElementById("lightbox-image"),
  closeLightbox: document.getElementById("close-lightbox"),
};

const config = window.APP_CONFIG || {};
const hasBackend = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
const supabaseClient = hasBackend ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const storageBucket = config.storageBucket || "place-photos";

let places = [];
let currentFilteredRows = [];
let selectedMapPlaceId = "";
let editingPlaceId = "";
let editingDraftPhotos = [];
let addDraftPhotos = [];
let realtimeChannel = null;

function setBackendStatus(text, mode) {
  el.backendStatus.textContent = text;
  el.backendStatus.className = "backend-status";
  if (mode) {
    el.backendStatus.classList.add(mode);
  }
}

function byTextAsc(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function normalizePlace(raw, fallbackId) {
  return {
    id: raw.id || fallbackId,
    name: (raw.name || raw.Name || "").trim(),
    area: (raw.area || raw.Area || "").trim(),
    purpose: (raw.purpose || raw.Purpose || "").trim(),
    details: (raw.details || raw["Description/Details"] || "").trim(),
    address: (raw.address || raw.Address || "").trim(),
    photos: Array.isArray(raw.photos) ? raw.photos.filter(Boolean) : [],
    source: (raw.source || "sheet").trim(),
  };
}

function setSelectOptions(selectEl, values, label) {
  const previous = selectEl.value;
  selectEl.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = label;
  selectEl.appendChild(allOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });

  if (["all", ...values].includes(previous)) {
    selectEl.value = previous;
  }
}

function refreshFilterOptions() {
  const areas = Array.from(new Set(places.map((place) => place.area).filter(Boolean))).sort(byTextAsc);
  const purposes = Array.from(new Set(places.map((place) => place.purpose).filter(Boolean))).sort(byTextAsc);

  setSelectOptions(el.areaFilter, areas, "All Areas");
  setSelectOptions(el.purposeFilter, purposes, "All Purposes");
}

function applyFiltersAndSort() {
  const q = el.searchInput.value.trim().toLowerCase();
  const selectedArea = el.areaFilter.value;
  const selectedPurpose = el.purposeFilter.value;
  const sortField = el.sortField.value;
  const direction = el.sortDirection.value;

  let rows = [...places];

  rows = rows.filter((place) => {
    const searchTarget = `${place.name} ${place.area} ${place.purpose} ${place.details} ${place.address}`.toLowerCase();
    const matchesSearch = !q || searchTarget.includes(q);
    const matchesArea = selectedArea === "all" || place.area === selectedArea;
    const matchesPurpose = selectedPurpose === "all" || place.purpose === selectedPurpose;
    return matchesSearch && matchesArea && matchesPurpose;
  });

  rows.sort((a, b) => {
    const first = (a[sortField] || "").toString();
    const second = (b[sortField] || "").toString();
    const rank = byTextAsc(first, second);
    return direction === "desc" ? -rank : rank;
  });

  return rows;
}

function toMapsQuery(place) {
  return encodeURIComponent(place.address || `${place.name}, ${place.area}, Japan`);
}

function openLightbox(src, altText) {
  el.lightboxImage.src = src;
  el.lightboxImage.alt = altText || "Enlarged photo";
  el.lightbox.classList.remove("hidden");
}

function closeLightbox() {
  el.lightboxImage.removeAttribute("src");
  el.lightbox.classList.add("hidden");
}

function makePhotoThumbnail(src, index, withRemove, onRemove) {
  const wrap = document.createElement("div");
  wrap.className = "photo-item";

  const img = document.createElement("img");
  img.className = "photo-thumb";
  img.src = src;
  img.alt = `Photo ${index + 1}`;
  img.addEventListener("click", () => openLightbox(src, img.alt));
  wrap.appendChild(img);

  if (withRemove && typeof onRemove === "function") {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "photo-remove";
    remove.textContent = "x";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      onRemove(index);
    });
    wrap.appendChild(remove);
  }

  return wrap;
}

function resolveDraftSrc(item) {
  return item.kind === "url" ? item.value : item.dataUrl;
}

function renderDraftPhotoList(targetEl, drafts, onRemove) {
  targetEl.innerHTML = "";

  if (!drafts.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No photos attached.";
    targetEl.appendChild(empty);
    return;
  }

  drafts.forEach((item, index) => {
    targetEl.appendChild(makePhotoThumbnail(resolveDraftSrc(item), index, true, onRemove));
  });
}

function createPhotosNode(photos) {
  const list = document.createElement("div");
  list.className = "photo-list";

  photos.forEach((photo, index) => {
    list.appendChild(makePhotoThumbnail(photo, index, false));
  });

  return list;
}

function updateMap() {
  const rows = currentFilteredRows;

  el.mapSelect.innerHTML = "";
  if (!rows.length) {
    el.mapFrame.style.display = "none";
    el.mapEmpty.style.display = "block";
    el.mapEmpty.textContent = "No places match your filters, so there is nothing to map.";
    el.mapLink.removeAttribute("href");
    selectedMapPlaceId = "";
    return;
  }

  rows.forEach((place) => {
    const option = document.createElement("option");
    option.value = place.id;
    option.textContent = `${place.name} (${place.area})`;
    el.mapSelect.appendChild(option);
  });

  if (!rows.some((place) => place.id === selectedMapPlaceId)) {
    selectedMapPlaceId = rows[0].id;
  }

  el.mapSelect.value = selectedMapPlaceId;

  const selectedPlace = places.find((item) => item.id === selectedMapPlaceId);
  if (!selectedPlace) {
    return;
  }

  const query = toMapsQuery(selectedPlace);
  el.mapFrame.src = `https://www.google.com/maps?q=${query}&output=embed`;
  el.mapLink.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
  el.mapFrame.style.display = "block";
  el.mapEmpty.style.display = "none";
}

function setFormMessage(text, isSuccess) {
  el.formMessage.textContent = text;
  el.formMessage.classList.toggle("success", Boolean(isSuccess));
}

function setEditMessage(text, isSuccess) {
  el.editMessage.textContent = text;
  el.editMessage.classList.toggle("success", Boolean(isSuccess));
}

function renderTable() {
  currentFilteredRows = applyFiltersAndSort();
  el.tableBody.innerHTML = "";

  if (!currentFilteredRows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.className = "empty-row";
    cell.textContent = "No places match your current filters.";
    row.appendChild(cell);
    el.tableBody.appendChild(row);
  } else {
    currentFilteredRows.forEach((place) => {
      const row = document.createElement("tr");

      const nameCell = document.createElement("td");
      nameCell.textContent = place.name || "-";
      row.appendChild(nameCell);

      const areaCell = document.createElement("td");
      areaCell.textContent = place.area || "-";
      row.appendChild(areaCell);

      const purposeCell = document.createElement("td");
      purposeCell.textContent = place.purpose || "-";
      row.appendChild(purposeCell);

      const descCell = document.createElement("td");
      const descBlock = document.createElement("div");
      descBlock.className = "desc-block";
      const descText = document.createElement("p");
      descText.className = `desc-text ${place.details ? "" : "muted"}`;
      descText.textContent = place.details || "No description";
      descBlock.appendChild(descText);
      if (place.photos.length) {
        descBlock.appendChild(createPhotosNode(place.photos));
      }
      descCell.appendChild(descBlock);
      row.appendChild(descCell);

      const addressCell = document.createElement("td");
      addressCell.textContent = place.address || "-";
      row.appendChild(addressCell);

      const sourceCell = document.createElement("td");
      const source = document.createElement("span");
      source.className = `source-pill ${place.source === "sheet" ? "source-sheet" : "source-custom"}`;
      source.textContent = place.source === "sheet" ? "Sheet" : "User";
      sourceCell.appendChild(source);
      row.appendChild(sourceCell);

      const actionCell = document.createElement("td");
      const actionRow = document.createElement("div");
      actionRow.className = "action-row";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "small-btn";
      editButton.textContent = "Edit";
      editButton.disabled = !hasBackend;
      editButton.addEventListener("click", () => openEditModal(place.id));
      actionRow.appendChild(editButton);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "small-btn delete-btn";
      removeButton.textContent = "Remove";
      removeButton.disabled = !hasBackend;
      removeButton.addEventListener("click", async () => {
        if (!hasBackend) {
          setFormMessage("Connect Supabase first to edit shared data.", false);
          return;
        }

        const { error } = await supabaseClient.from(TABLE_NAME).delete().eq("id", place.id);
        if (error) {
          setFormMessage(`Delete failed: ${error.message}`, false);
          return;
        }

        await loadPlaces();
        setFormMessage("Place removed.", true);
      });
      actionRow.appendChild(removeButton);

      actionCell.appendChild(actionRow);
      row.appendChild(actionCell);

      el.tableBody.appendChild(row);
    });
  }

  const userCount = places.filter((place) => place.source !== "sheet").length;
  el.totalCount.textContent = places.length;
  el.shownCount.textContent = currentFilteredRows.length;
  el.customCount.textContent = userCount;

  updateMap();
}

function render() {
  renderTable();
}

function resetFilters() {
  el.searchInput.value = "";
  el.areaFilter.value = "all";
  el.purposeFilter.value = "all";
  el.sortField.value = "name";
  el.sortDirection.value = "asc";
  render();
}

async function compressDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDimension = 1600;
      const largestSide = Math.max(img.width, img.height);
      const ratio = largestSide > maxDimension ? maxDimension / largestSide : 1;
      const width = Math.max(1, Math.round(img.width * ratio));
      const height = Math.max(1, Math.round(img.height * ratio));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function fileToDataUrl(file) {
  const raw = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read photo."));
    reader.readAsDataURL(file);
  });

  const compressed = await compressDataUrl(raw);
  return { kind: "data", dataUrl: compressed };
}

async function filesToDraftPhotos(fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) {
    return [];
  }

  return Promise.all(files.map((file) => fileToDataUrl(file)));
}

async function pastedImagesToDraftPhotos(event) {
  const clipboardItems = event.clipboardData ? Array.from(event.clipboardData.items || []) : [];
  const imageFiles = clipboardItems
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);

  if (!imageFiles.length) {
    return [];
  }

  event.preventDefault();
  return Promise.all(imageFiles.map((file) => fileToDataUrl(file)));
}

function appendDraftPhotos(targetArray, newPhotos) {
  return [...targetArray, ...newPhotos];
}

function renderAddPhotoList() {
  renderDraftPhotoList(el.addPhotoList, addDraftPhotos, (index) => {
    addDraftPhotos = addDraftPhotos.filter((_, i) => i !== index);
    renderAddPhotoList();
  });
}

function renderEditPhotoList() {
  renderDraftPhotoList(el.editPhotoList, editingDraftPhotos, (index) => {
    editingDraftPhotos = editingDraftPhotos.filter((_, i) => i !== index);
    renderEditPhotoList();
  });
}

async function uploadPhotoDataUrl(dataUrl) {
  const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;
  const filePath = `photos/${fileName}`;
  const blob = await fetch(dataUrl).then((response) => response.blob());

  const { error } = await supabaseClient.storage
    .from(storageBucket)
    .upload(filePath, blob, { contentType: "image/jpeg", upsert: false });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabaseClient.storage.from(storageBucket).getPublicUrl(filePath);
  return data.publicUrl;
}

async function resolveDraftPhotoUrls(drafts) {
  const urls = [];

  for (const draft of drafts) {
    if (draft.kind === "url") {
      urls.push(draft.value);
      continue;
    }

    const uploadedUrl = await uploadPhotoDataUrl(draft.dataUrl);
    urls.push(uploadedUrl);
  }

  return urls;
}

async function bootstrapSeedPlacesIfEmpty() {
  if (!config.seedOnFirstRun) {
    return;
  }

  const seedData = Array.isArray(window.SEED_PLACES) ? window.SEED_PLACES : [];
  if (!seedData.length) {
    return;
  }

  const { count, error } = await supabaseClient.from(TABLE_NAME).select("id", { count: "exact", head: true });
  if (error || (count || 0) > 0) {
    return;
  }

  const rows = seedData
    .map((item, index) => normalizePlace(item, `seed-${index + 1}`))
    .filter((place) => place.name && place.area && place.purpose)
    .map((place) => ({
      name: place.name,
      area: place.area,
      purpose: place.purpose,
      details: place.details,
      address: place.address,
      photos: [],
      source: "sheet",
    }));

  if (!rows.length) {
    return;
  }

  await supabaseClient.from(TABLE_NAME).insert(rows);
}

async function loadPlaces() {
  if (!hasBackend) {
    const seedData = Array.isArray(window.SEED_PLACES) ? window.SEED_PLACES : [];
    places = seedData
      .map((item, index) => normalizePlace(item, `seed-${index + 1}`))
      .filter((place) => place.name && place.area && place.purpose);
    refreshFilterOptions();
    render();
    return;
  }

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select("id,name,area,purpose,details,address,photos,source,created_at")
    .order("created_at", { ascending: true });

  if (error) {
    setBackendStatus(`Database read failed: ${error.message}`, "error");
    return;
  }

  places = (data || []).map((item) => normalizePlace(item, item.id));
  refreshFilterOptions();
  render();
}

function openEditModal(placeId) {
  const place = places.find((item) => item.id === placeId);
  if (!place) {
    return;
  }

  editingPlaceId = placeId;
  editingDraftPhotos = place.photos.map((url) => ({ kind: "url", value: url }));

  el.editName.value = place.name;
  el.editArea.value = place.area;
  el.editPurpose.value = place.purpose;
  el.editDetails.value = place.details;
  el.editAddress.value = place.address;
  el.editPhotos.value = "";

  renderEditPhotoList();
  setEditMessage("", false);
  el.editModal.classList.remove("hidden");
}

function closeEditModal() {
  editingPlaceId = "";
  editingDraftPhotos = [];
  el.editModal.classList.add("hidden");
  setEditMessage("", false);
}

function setupRealtime() {
  if (!hasBackend || !config.enableRealtime) {
    return;
  }

  realtimeChannel = supabaseClient
    .channel("places-live")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE_NAME }, () => {
      loadPlaces();
    })
    .subscribe();
}

function setupEventHandlers() {
  [el.searchInput, el.areaFilter, el.purposeFilter, el.sortField, el.sortDirection].forEach((input) => {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  });

  el.mapSelect.addEventListener("change", () => {
    selectedMapPlaceId = el.mapSelect.value;
    updateMap();
  });

  el.resetFilters.addEventListener("click", resetFilters);

  el.addPhotos.addEventListener("change", async () => {
    try {
      const newPhotos = await filesToDraftPhotos(el.addPhotos.files);
      addDraftPhotos = appendDraftPhotos(addDraftPhotos, newPhotos);
      el.addPhotos.value = "";
      renderAddPhotoList();
      setFormMessage("Photos ready to save.", true);
    } catch {
      setFormMessage("Could not read selected photos.", false);
    }
  });

  el.addPasteZone.addEventListener("paste", async (event) => {
    try {
      const newPhotos = await pastedImagesToDraftPhotos(event);
      if (!newPhotos.length) {
        setFormMessage("Clipboard did not contain image data.", false);
        return;
      }
      addDraftPhotos = appendDraftPhotos(addDraftPhotos, newPhotos);
      renderAddPhotoList();
      setFormMessage("Pasted image(s) added.", true);
    } catch {
      setFormMessage("Could not read pasted images.", false);
    }
  });

  el.addForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!hasBackend) {
      setFormMessage("Configure Supabase in config.js before adding shared places.", false);
      return;
    }

    const draft = {
      name: document.getElementById("place-name").value.trim(),
      area: document.getElementById("place-area").value.trim(),
      purpose: document.getElementById("place-purpose").value.trim(),
      details: document.getElementById("place-details").value.trim(),
      address: document.getElementById("place-address").value.trim(),
    };

    if (!draft.name || !draft.area || !draft.purpose || !draft.address) {
      setFormMessage("Please fill in name, area, purpose, and address.", false);
      return;
    }

    try {
      const photoUrls = await resolveDraftPhotoUrls(addDraftPhotos);
      const { error } = await supabaseClient.from(TABLE_NAME).insert({
        name: draft.name,
        area: draft.area,
        purpose: draft.purpose,
        details: draft.details,
        address: draft.address,
        photos: photoUrls,
        source: "user",
      });

      if (error) {
        setFormMessage(`Save failed: ${error.message}`, false);
        return;
      }

      el.addForm.reset();
      addDraftPhotos = [];
      renderAddPhotoList();
      setFormMessage("Place added to shared list.", true);
      await loadPlaces();
    } catch (error) {
      setFormMessage(`Photo upload failed: ${error.message}`, false);
    }
  });

  el.closeEditModal.addEventListener("click", closeEditModal);
  el.editModal.addEventListener("click", (event) => {
    if (event.target === el.editModal) {
      closeEditModal();
    }
  });

  el.editPhotos.addEventListener("change", async () => {
    try {
      const newPhotos = await filesToDraftPhotos(el.editPhotos.files);
      editingDraftPhotos = appendDraftPhotos(editingDraftPhotos, newPhotos);
      el.editPhotos.value = "";
      renderEditPhotoList();
      setEditMessage("Photos ready to save.", true);
    } catch {
      setEditMessage("Could not read selected photos.", false);
    }
  });

  el.editPasteZone.addEventListener("paste", async (event) => {
    try {
      const newPhotos = await pastedImagesToDraftPhotos(event);
      if (!newPhotos.length) {
        setEditMessage("Clipboard did not contain image data.", false);
        return;
      }
      editingDraftPhotos = appendDraftPhotos(editingDraftPhotos, newPhotos);
      renderEditPhotoList();
      setEditMessage("Pasted image(s) added.", true);
    } catch {
      setEditMessage("Could not read pasted images.", false);
    }
  });

  el.editForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!hasBackend) {
      setEditMessage("Configure Supabase in config.js before saving edits.", false);
      return;
    }

    const payload = {
      name: el.editName.value.trim(),
      area: el.editArea.value.trim(),
      purpose: el.editPurpose.value.trim(),
      details: el.editDetails.value.trim(),
      address: el.editAddress.value.trim(),
    };

    if (!payload.name || !payload.area || !payload.purpose || !payload.address) {
      setEditMessage("Name, area, purpose, and address are required.", false);
      return;
    }

    try {
      const photoUrls = await resolveDraftPhotoUrls(editingDraftPhotos);
      const { error } = await supabaseClient
    .from(TABLE_NAME)
        .update({ ...payload, photos: photoUrls, updated_at: new Date().toISOString() })
        .eq("id", editingPlaceId);

      if (error) {
        setEditMessage(`Save failed: ${error.message}`, false);
        return;
      }

      closeEditModal();
      setFormMessage("Place updated.", true);
      await loadPlaces();
    } catch (error) {
      setEditMessage(`Photo upload failed: ${error.message}`, false);
    }
  });

  el.closeLightbox.addEventListener("click", closeLightbox);
  el.lightbox.addEventListener("click", (event) => {
    if (event.target === el.lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.editModal.classList.contains("hidden")) {
      closeEditModal();
      return;
    }

    if (event.key === "Escape" && !el.lightbox.classList.contains("hidden")) {
      closeLightbox();
    }
  });
}

async function init() {
  if (!hasBackend) {
    setBackendStatus("Supabase not configured. App is in read-only seed mode.", "warn");
    await loadPlaces();
    setupEventHandlers();
    renderAddPhotoList();
    return;
  }

  setBackendStatus("Connected to shared database.", "ok");
  await bootstrapSeedPlacesIfEmpty();
  await loadPlaces();
  setupEventHandlers();
  renderAddPhotoList();
  setupRealtime();
}

init();




