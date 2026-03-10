
const TABLE_NAME = "places";
const COMMENT_TABLE = "place_comments";
const ACTIVITY_TABLE = "activity_log";
const AREA_TABLE = "place_areas";
const PURPOSE_TABLE = "place_purposes";
const USER_NAME_KEY = "japan_places_user_name_v1";

const el = {
  backendStatus: document.getElementById("backend-status"),
  currentUser: document.getElementById("current-user"),
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
  addName: document.getElementById("place-name"),
  addArea: document.getElementById("place-area"),
  addPurpose: document.getElementById("place-purpose"),
  addDetails: document.getElementById("place-details"),
  addAddress: document.getElementById("place-address"),
  addPhotos: document.getElementById("place-photos"),
  addPasteZone: document.getElementById("add-paste-zone"),
  addPhotoList: document.getElementById("add-photo-list"),
  formMessage: document.getElementById("form-message"),
  optionsMessage: document.getElementById("options-message"),
  tableBody: document.getElementById("places-table-body"),
  mapSelect: document.getElementById("map-place-select"),
  mapFrame: document.getElementById("map-frame"),
  mapEmpty: document.getElementById("map-empty"),
  mapLink: document.getElementById("open-map-link"),
  areaOptionsDataList: document.getElementById("area-options"),
  purposeOptionsDataList: document.getElementById("purpose-options"),
  areasList: document.getElementById("areas-list"),
  purposesList: document.getElementById("purposes-list"),
  addAreaForm: document.getElementById("add-area-form"),
  addPurposeForm: document.getElementById("add-purpose-form"),
  newAreaInput: document.getElementById("new-area-input"),
  newPurposeInput: document.getElementById("new-purpose-input"),
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
  openHelp: document.getElementById("open-help"),
  closeHelp: document.getElementById("close-help"),
  helpModal: document.getElementById("help-modal"),
  confirmDeleteModal: document.getElementById("confirm-delete-modal"),
  confirmDeleteText: document.getElementById("confirm-delete-text"),
  cancelDelete: document.getElementById("cancel-delete"),
  confirmDelete: document.getElementById("confirm-delete"),
  userModal: document.getElementById("user-modal"),
  userForm: document.getElementById("user-form"),
  userNameInput: document.getElementById("user-name-input"),
  activityLog: document.getElementById("activity-log"),
  undoBanner: document.getElementById("undo-banner"),
  undoText: document.getElementById("undo-text"),
  undoDelete: document.getElementById("undo-delete"),
  editLastUpdated: document.getElementById("edit-last-updated"),
  commentsList: document.getElementById("comments-list"),
  commentForm: document.getElementById("comment-form"),
  commentInput: document.getElementById("comment-input"),
  commentSubmit: document.getElementById("comment-submit"),
};

const config = window.APP_CONFIG || {};
const hasBackend = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
const supabaseClient = hasBackend ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const storageBucket = config.storageBucket || "place-photos";

let places = [];
let areaOptions = [];
let purposeOptions = [];
let currentFilteredRows = [];
let handlersBound = false;
let selectedMapPlaceId = "";
let editingPlaceId = "";
let pendingDeletePlace = null;
let editingDraftPhotos = [];
let addDraftPhotos = [];
let realtimeChannel = null;
let commentsByPlace = new Map();
let activityLog = [];
let lastDeleted = null;
let undoTimer = null;
let currentUserName = "";
let optionTablesReady = false;

function readStoredUserName() {
  try {
    return (localStorage.getItem(USER_NAME_KEY) || "").trim();
  } catch {
    return "";
  }
}

function saveUserName(name) {
  try {
    localStorage.setItem(USER_NAME_KEY, name);
  } catch {
    // no-op
  }
}

function setCurrentUser(name) {
  currentUserName = name;
  el.currentUser.textContent = `User: ${currentUserName || "Not set"}`;
}

function ensureCurrentUser() {
  if (currentUserName) {
    return true;
  }
  el.userModal.classList.remove("hidden");
  el.userNameInput.focus();
  return false;
}

function setBackendStatus(text, mode) {
  el.backendStatus.textContent = text;
  el.backendStatus.className = "backend-status";
  if (mode) {
    el.backendStatus.classList.add(mode);
  }
}

function setFormMessage(text, isSuccess) {
  el.formMessage.textContent = text;
  el.formMessage.classList.toggle("success", Boolean(isSuccess));
}

function setEditMessage(text, isSuccess) {
  el.editMessage.textContent = text;
  el.editMessage.classList.toggle("success", Boolean(isSuccess));
}

function setOptionsMessage(text, isSuccess) {
  el.optionsMessage.textContent = text;
  el.optionsMessage.classList.toggle("success", Boolean(isSuccess));
}

function byTextAsc(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return `${diffHr}h ago`;
  }
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function renderActivityLog() {
  if (!el.activityLog) {
    return;
  }
  el.activityLog.innerHTML = "";
  if (!activityLog.length) {
    el.activityLog.innerHTML = '<p class="muted">No activity yet.</p>';
    return;
  }

  activityLog.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "activity-item";
    const text = document.createElement("span");
    text.textContent = entry.message;
    const time = document.createElement("span");
    time.className = "activity-time";
    time.textContent = `\u00B7 ${formatRelativeTime(entry.created_at)}`;
    item.appendChild(text);
    item.appendChild(time);
    el.activityLog.appendChild(item);
  });
}

function renderComments(placeId) {
  if (!el.commentsList) {
    return;
  }
  const comments = commentsByPlace.get(placeId) || [];
  el.commentsList.innerHTML = "";

  if (!comments.length) {
    el.commentsList.innerHTML = '<p class="muted">No comments yet.</p>';
    return;
  }

  comments.forEach((comment) => {
    const item = document.createElement("div");
    item.className = "comment-item";
    const meta = document.createElement("div");
    meta.className = "comment-meta";
    meta.textContent = `${comment.author} · ${formatRelativeTime(comment.created_at)}`;
    const body = document.createElement("div");
    body.textContent = comment.body;
    item.appendChild(meta);
    item.appendChild(body);
    el.commentsList.appendChild(item);
  });
}

function showUndoBanner(message) {
  if (!el.undoBanner) {
    return;
  }
  el.undoText.textContent = message;
  el.undoBanner.classList.remove("hidden");
  if (undoTimer) {
    clearTimeout(undoTimer);
  }
  undoTimer = setTimeout(() => {
    el.undoBanner.classList.add("hidden");
    lastDeleted = null;
  }, 10000);
}

function hideUndoBanner() {
  if (!el.undoBanner) {
    return;
  }
  el.undoBanner.classList.add("hidden");
  if (undoTimer) {
    clearTimeout(undoTimer);
  }
  undoTimer = null;
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
    source: (raw.source || "Sheet").trim(),
  };
}

function toMapsQuery(place) {
  return encodeURIComponent(place.address || `${place.name}, ${place.area}, Japan`);
}

function openLightbox(src, altText) {
  const lightbox = document.getElementById("photo-lightbox");
  const image = document.getElementById("lightbox-image");
  if (!lightbox || !image) {
    return;
  }
  image.src = src;
  image.alt = altText || "Enlarged photo";
  lightbox.classList.remove("hidden");
  lightbox.style.display = "flex";
  lightbox.style.zIndex = "1000";
}

function closeLightbox() {
  const lightbox = document.getElementById("photo-lightbox");
  const image = document.getElementById("lightbox-image");
  if (!lightbox || !image) {
    return;
  }
  image.removeAttribute("src");
  lightbox.classList.add("hidden");
  lightbox.style.display = "none";
}
window.handlePhotoClick = (src, altText) => {
  openLightbox(src, altText);
};

window.handleRemoveClick = (placeId) => {
  if (!hasBackend) {
    setFormMessage("Connect Supabase first to edit shared data.", false);
    return;
  }
  const place = places.find((item) => item.id === placeId);
  if (place) {
    openDeleteConfirm(place);
  }
};

window.openHelpModal = () => {
  const modal = document.getElementById("help-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.style.zIndex = "1000";
  }
};

window.closeHelpModal = () => {
  const modal = document.getElementById("help-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }
};

window.closeHelpIfBackdrop = (event) => {
  const modal = document.getElementById("help-modal");
  if (modal && event.target === modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }
};

function resolveDraftSrc(item) {
  return item.kind === "url" ? item.value : item.dataUrl;
}

function makePhotoThumbnail(src, index, withRemove, onRemove) {
  const wrap = document.createElement("div");
  wrap.className = "photo-item";

  const img = document.createElement("img");
  img.className = "photo-thumb";
  img.src = src;
  img.alt = `Photo ${index + 1}`;
  img.dataset.src = src;
  img.setAttribute("onclick", "handlePhotoClick(this.dataset.src, this.alt)");
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

function renderDraftPhotoList(targetEl, drafts, onRemove) {
  targetEl.innerHTML = "";

  if (!drafts.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No photos attached.";
    targetEl.appendChild(empty);
    return;
  }

  drafts.forEach((draft, index) => {
    targetEl.appendChild(makePhotoThumbnail(resolveDraftSrc(draft), index, true, onRemove));
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

function renderOptionDataList(dataListEl, values) {
  dataListEl.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    dataListEl.appendChild(option);
  });
}

function renderChipList(container, values) {
  if (!values.length) {
    container.textContent = "-";
    return;
  }

  container.innerHTML = values.map((value) => `<span class="chip">${value}</span>`).join(" ");
}

function refreshFilterOptions() {
  const areas = Array.from(new Set(places.map((place) => place.area).filter(Boolean))).sort(byTextAsc);
  const purposes = Array.from(new Set(places.map((place) => place.purpose).filter(Boolean))).sort(byTextAsc);

  setSelectOptions(el.areaFilter, areas, "All Areas");
  setSelectOptions(el.purposeFilter, purposes, "All Purposes");
}

function refreshManagedOptions() {
  renderOptionDataList(el.areaOptionsDataList, areaOptions);
  renderOptionDataList(el.purposeOptionsDataList, purposeOptions);
  renderChipList(el.areasList, areaOptions);
  renderChipList(el.purposesList, purposeOptions);
}

function canonicalFromOptions(inputValue, options) {
  const raw = inputValue.trim();
  if (!raw) {
    return "";
  }

  const match = options.find((option) => option.toLowerCase() === raw.toLowerCase());
  return match || "";
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

function openDeleteConfirm(place) {
  pendingDeletePlace = place;
  const modal = document.getElementById("confirm-delete-modal");
  const text = document.getElementById("confirm-delete-text");
  if (text) {
    text.textContent = "Remove \"" + place.name + "\" from the list?";
  }
  if (modal) {
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.style.zIndex = "1000";
  }
}

function closeDeleteConfirm() {
  pendingDeletePlace = null;
  const modal = document.getElementById("confirm-delete-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }
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
      row.innerHTML = `
        <td>${place.name || "-"}</td>
        <td>${place.area || "-"}</td>
        <td>${place.purpose || "-"}</td>
      `;

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
      source.className = `source-pill ${place.source === "Sheet" ? "source-sheet" : "source-custom"}`;
      source.textContent = place.source || "-";
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
      removeButton.dataset.placeId = place.id;
      removeButton.setAttribute("onclick", "handleRemoveClick(this.dataset.placeId)");
      actionRow.appendChild(removeButton);

      actionCell.appendChild(actionRow);
      row.appendChild(actionCell);

      el.tableBody.appendChild(row);
    });
  }

  const userCount = places.filter((place) => place.source !== "Sheet").length;
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
  const items = event.clipboardData ? Array.from(event.clipboardData.items || []) : [];
  const files = items
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);

  if (!files.length) {
    return [];
  }

  event.preventDefault();
  return Promise.all(files.map((file) => fileToDataUrl(file)));
}

function appendDraftPhotos(targetArray, newPhotos) {
  return [...targetArray, ...newPhotos];
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
    } else {
      urls.push(await uploadPhotoDataUrl(draft.dataUrl));
    }
  }
  return urls;
}

async function logActivity(action, place) {
  if (!hasBackend || !currentUserName) {
    return;
  }
  const message = `${currentUserName} ${action} ${place.name}`;
  await supabaseClient.from(ACTIVITY_TABLE).insert({
    place_id: place.id,
    user_name: currentUserName,
    action,
    message,
  });
}

async function loadActivityLog() {
  if (!hasBackend) {
    activityLog = [];
    renderActivityLog();
    return;
  }
  const { data } = await supabaseClient
    .from(ACTIVITY_TABLE)
    .select("id,message,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  activityLog = data || [];
  renderActivityLog();
}

async function loadComments(placeId) {
  if (!hasBackend || !placeId) {
    commentsByPlace.set(placeId, []);
    renderComments(placeId);
    return;
  }
  const { data } = await supabaseClient
    .from(COMMENT_TABLE)
    .select("id,place_id,author,body,created_at")
    .eq("place_id", placeId)
    .order("created_at", { ascending: true });
  commentsByPlace.set(placeId, data || []);
  renderComments(placeId);
}

function updateDebugOverlay() {
  const overlay = document.getElementById("debug-overlay");
  if (!overlay) {
    return;
  }
  const help = document.getElementById("help-modal");
  const lightbox = document.getElementById("photo-lightbox");
  const status = `help:${help ? "ok" : "miss"} lightbox:${lightbox ? "ok" : "miss"}`;
  overlay.textContent = status;
  overlay.classList.remove("ok", "error");
  if (help && lightbox) {
    overlay.classList.add("ok");
  } else {
    overlay.classList.add("error");
  }
}

function updateLastEditedMeta(place) {
  if (!el.editLastUpdated) {
    return;
  }
  if (!place || !place.updated_at) {
    el.editLastUpdated.textContent = "-";
    return;
  }
  const name = place.last_edited_by ? place.last_edited_by : "Unknown";
  el.editLastUpdated.textContent = `${name} · ${formatRelativeTime(place.updated_at)}`;
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
    .select("id,name,area,purpose,details,address,photos,source,created_at,updated_at,last_edited_by")
    .order("created_at", { ascending: true });

  if (error) {
    setBackendStatus(`Database read failed: ${error.message}`, "error");
    return;
  }

  places = (data || []).map((item) => normalizePlace(item, item.id));
  refreshFilterOptions();
  render();
}

async function bootstrapSeedPlacesIfEmpty() {
  if (!config.seedOnFirstRun || !hasBackend) {
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
      source: "Sheet",
    }));

  if (rows.length) {
    await supabaseClient.from(TABLE_NAME).insert(rows);
  }
}

async function loadManagedOptions() {
  const derivedAreas = Array.from(new Set(places.map((place) => place.area).filter(Boolean))).sort(byTextAsc);
  const derivedPurposes = Array.from(new Set(places.map((place) => place.purpose).filter(Boolean))).sort(byTextAsc);

  if (!hasBackend) {
    areaOptions = derivedAreas;
    purposeOptions = derivedPurposes;
    optionTablesReady = false;
    refreshManagedOptions();
    return;
  }

  const [areaResponse, purposeResponse] = await Promise.all([
    supabaseClient.from(AREA_TABLE).select("name").order("name", { ascending: true }),
    supabaseClient.from(PURPOSE_TABLE).select("name").order("name", { ascending: true }),
  ]);

  const areaMissing = areaResponse.error && areaResponse.error.code === "42P01";
  const purposeMissing = purposeResponse.error && purposeResponse.error.code === "42P01";

  if (areaMissing || purposeMissing) {
    optionTablesReady = false;
    areaOptions = derivedAreas;
    purposeOptions = derivedPurposes;
    setOptionsMessage("Run latest SQL migration to enable shared Area/Purpose management.", false);
    refreshManagedOptions();
    return;
  }

  if (areaResponse.error || purposeResponse.error) {
    optionTablesReady = false;
    areaOptions = derivedAreas;
    purposeOptions = derivedPurposes;
    setOptionsMessage("Could not load options tables, using derived values from places.", false);
    refreshManagedOptions();
    return;
  }

  optionTablesReady = true;
  areaOptions = Array.from(new Set([...(areaResponse.data || []).map((row) => row.name), ...derivedAreas])).sort(byTextAsc);
  purposeOptions = Array.from(new Set([...(purposeResponse.data || []).map((row) => row.name), ...derivedPurposes])).sort(byTextAsc);

  refreshManagedOptions();
}

function openEditModal(placeId) {
  const place = places.find((item) => item.id === placeId);
  if (!place) {
    return;
  }

  editingPlaceId = placeId;
  editingDraftPhotos = place.photos.map((url) => ({ kind: "url", value: url }));

  updateLastEditedMeta(place);
  loadComments(placeId);

  el.editName.value = place.name;
  el.editArea.value = place.area;
  el.editPurpose.value = place.purpose;
  el.editDetails.value = place.details;
  el.editAddress.value = place.address;
  el.editPhotos.value = "";

  renderEditPhotoList();
  setEditMessage("", false);
  el.editModal.classList.remove("hidden");
  updateDebugOverlay();
}

function closeEditModal() {
  editingPlaceId = "";
  editingDraftPhotos = [];
  el.editModal.classList.add("hidden");
  updateDebugOverlay();
  setEditMessage("", false);
}
function setupRealtime() {
  if (!hasBackend || !config.enableRealtime) {
    return;
  }

  realtimeChannel = supabaseClient
    .channel("places-live")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE_NAME }, () => {
      loadPlaces().then(loadManagedOptions);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: AREA_TABLE }, () => {
      loadManagedOptions();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: PURPOSE_TABLE }, () => {
      loadManagedOptions();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: COMMENT_TABLE }, () => {
      if (editingPlaceId) {
        loadComments(editingPlaceId);
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: ACTIVITY_TABLE }, () => {
      loadActivityLog();
    })
    .subscribe();
}

function setupEventHandlers() {
  if (handlersBound) {
    return;
  }
  handlersBound = true;
  [el.searchInput, el.areaFilter, el.purposeFilter, el.sortField, el.sortDirection].forEach((input) => {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  });

  el.mapSelect.addEventListener("change", () => {
    selectedMapPlaceId = el.mapSelect.value;
    updateMap();
  });

  el.resetFilters.addEventListener("click", resetFilters);

  document.addEventListener("click", (event) => {
    const target = event.target && event.target.closest ? event.target : event.target?.parentElement;
    if (!target || !target.closest) {
      return;
    }

    const helpOpen = target.closest("#open-help");
    if (helpOpen) {
      el.helpModal.classList.remove("hidden");
      return;
    }

    const helpClose = target.closest("#close-help");
    if (helpClose) {
      el.helpModal.classList.add("hidden");
      return;
    }

    if (target === el.helpModal) {
      el.helpModal.classList.add("hidden");
      return;
    }

    const photo = target.closest(".photo-thumb");
    if (photo) {
      openLightbox(photo.src, photo.alt);
      return;
    }

    const removeButton = target.closest("button.delete-btn");
    if (removeButton) {
      if (!hasBackend) {
        setFormMessage("Connect Supabase first to edit shared data.", false);
        return;
      }
      const placeId = removeButton.dataset.placeId;
      const place = places.find((item) => item.id === placeId);
      if (place) {
        openDeleteConfirm(place);
      }
    }
  }, true);

  

  el.userForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = el.userNameInput.value.trim();
    if (!name) {
      return;
    }
    saveUserName(name);
    setCurrentUser(name);
    el.userModal.classList.add("hidden");
  });

  el.addAreaForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!ensureCurrentUser()) {
      setOptionsMessage("Set your name first.", false);
      return;
    }

    const value = el.newAreaInput.value.trim();
    if (!value) {
      return;
    }

    if (canonicalFromOptions(value, areaOptions)) {
      setOptionsMessage("Area already exists.", false);
      return;
    }

    if (!hasBackend || !optionTablesReady) {
      setOptionsMessage("Shared option tables are not ready. Run latest SQL migration first.", false);
      return;
    }

    const { error } = await supabaseClient.from(AREA_TABLE).insert({ name: value, created_by: currentUserName });
    if (error) {
      setOptionsMessage(`Could not add area: ${error.message}`, false);
      return;
    }

    el.newAreaInput.value = "";
    setOptionsMessage("Area added.", true);
    await loadManagedOptions();
  });

  el.addPurposeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!ensureCurrentUser()) {
      setOptionsMessage("Set your name first.", false);
      return;
    }

    const value = el.newPurposeInput.value.trim();
    if (!value) {
      return;
    }

    if (canonicalFromOptions(value, purposeOptions)) {
      setOptionsMessage("Purpose already exists.", false);
      return;
    }

    if (!hasBackend || !optionTablesReady) {
      setOptionsMessage("Shared option tables are not ready. Run latest SQL migration first.", false);
      return;
    }

    const { error } = await supabaseClient.from(PURPOSE_TABLE).insert({ name: value, created_by: currentUserName });
    if (error) {
      setOptionsMessage(`Could not add purpose: ${error.message}`, false);
      return;
    }

    el.newPurposeInput.value = "";
    setOptionsMessage("Purpose added.", true);
    await loadManagedOptions();
  });

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

    if (!ensureCurrentUser()) {
      setFormMessage("Set your name first.", false);
      return;
    }

    const area = canonicalFromOptions(el.addArea.value, areaOptions);
    const purpose = canonicalFromOptions(el.addPurpose.value, purposeOptions);
    const draft = {
      name: el.addName.value.trim(),
      area,
      purpose,
      details: el.addDetails.value.trim(),
      address: el.addAddress.value.trim(),
    };

    if (!draft.name || !draft.address || !draft.area || !draft.purpose) {
      setFormMessage("Name/address required and Area/Purpose must be selected from existing options.", false);
      return;
    }

    try {
      const photoUrls = await resolveDraftPhotoUrls(addDraftPhotos);
      const { data: inserted, error } = await supabaseClient.from(TABLE_NAME).insert({
        ...draft,
        photos: photoUrls,
        source: currentUserName,
        last_edited_by: currentUserName,
      });

      if (error) {
        setFormMessage(`Save failed: ${error.message}`, false);
        return;
      }

      if (inserted) { await logActivity("added", inserted); }

      el.addForm.reset();
      addDraftPhotos = [];
      renderAddPhotoList();
      setFormMessage("Place added to shared list.", true);
      await loadPlaces();
      await loadManagedOptions();
    } catch (error) {
      setFormMessage(`Photo upload failed: ${error.message}`, false);
    }
  });

  el.closeEditModal.addEventListener("click", closeEditModal);
  el.editModal.addEventListener("click", (event) => {
    if (event.target === el.editModal) {      closeEditModal();
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

    if (!ensureCurrentUser()) {
      setEditMessage("Set your name first.", false);
      return;
    }

    const area = canonicalFromOptions(el.editArea.value, areaOptions);
    const purpose = canonicalFromOptions(el.editPurpose.value, purposeOptions);

    const payload = {
      name: el.editName.value.trim(),
      area,
      purpose,
      details: el.editDetails.value.trim(),
      address: el.editAddress.value.trim(),
      source: currentUserName,
        last_edited_by: currentUserName,
    };

    if (!payload.name || !payload.address || !payload.area || !payload.purpose) {
      setEditMessage("Name/address required and Area/Purpose must be selected from existing options.", false);
      return;
    }

    try {
      const photoUrls = await resolveDraftPhotoUrls(editingDraftPhotos);
      const { error } = await supabaseClient
        .from(TABLE_NAME)
        .update({ ...payload, photos: photoUrls, updated_at: new Date().toISOString(), last_edited_by: currentUserName })
        .eq("id", editingPlaceId);

      if (error) {
        setEditMessage(`Save failed: ${error.message}`, false);
        return;
      }      closeEditModal();
      setFormMessage("Place updated.", true);
      await loadPlaces();
      await loadManagedOptions();
    } catch (error) {
      setEditMessage(`Photo upload failed: ${error.message}`, false);
    }
  });

  el.commentSubmit.addEventListener("click", async (event) => {
    event.preventDefault();
    if (!editingPlaceId || !hasBackend) {
      return;
    }
    if (!ensureCurrentUser()) {
      setEditMessage("Set your name first.", false);
      return;
    }
    const body = (el.commentInput.value || "").trim();
    if (!body) {
      return;
    }

    const { error } = await supabaseClient.from(COMMENT_TABLE).insert({
      place_id: editingPlaceId,
      author: currentUserName,
      body,
    });

    if (error) {
      setEditMessage('Comment failed: ' + error.message, false);
      return;
    }

    el.commentInput.value = "";
    await loadComments(editingPlaceId);
  });
  el.cancelDelete.addEventListener("click", closeDeleteConfirm);
  el.confirmDeleteModal.addEventListener("click", (event) => {
    if (event.target === el.confirmDeleteModal) {
      closeDeleteConfirm();
    }
  });

  el.confirmDelete.addEventListener("click", async () => {
    if (!pendingDeletePlace) {
      return;
    }

    if (!ensureCurrentUser()) {
      closeDeleteConfirm();
      setFormMessage("Set your name first.", false);
      return;
    }

    const target = pendingDeletePlace;
    closeDeleteConfirm();

    const { data: deleted, error } = await supabaseClient.from(TABLE_NAME).delete().eq("id", target.id).select("id,name,area,purpose,details,address,photos,source,last_edited_by").single();
    if (error) {
      setFormMessage(`Delete failed: ${error.message}`, false);
      return;
    }

    if (deleted) {
      lastDeleted = deleted;
      showUndoBanner(`Removed ${deleted.name}. You can undo for 10s.`);
      await logActivity("removed", deleted);
    }
    setFormMessage("Place removed.", true);
    await loadPlaces();
    await loadManagedOptions();
  });

  el.undoDelete.addEventListener("click", async () => {
    if (!lastDeleted || !hasBackend) {
      return;
    }
    const restore = lastDeleted;
    lastDeleted = null;
    hideUndoBanner();

    const { error } = await supabaseClient.from(TABLE_NAME).insert({
      name: restore.name,
      area: restore.area,
      purpose: restore.purpose,
      details: restore.details,
      address: restore.address,
      photos: restore.photos || [],
      source: restore.source || currentUserName,
      last_edited_by: currentUserName,
    });

    if (error) {
      setFormMessage('Undo failed: ' + error.message, false);
      return;
    }

    await logActivity("restored", restore);
    setFormMessage("Place restored.", true);
    await loadPlaces();
    await loadManagedOptions();
  });
  el.openHelp.addEventListener("click", () => {
    el.helpModal.classList.remove("hidden");
  });

  el.closeHelp.addEventListener("click", () => {
    el.helpModal.classList.add("hidden");
  });

  el.helpModal.addEventListener("click", (event) => {
    if (event.target === el.helpModal) {
      el.helpModal.classList.add("hidden");
    }
  });
  el.closeLightbox.addEventListener("click", closeLightbox);
  el.lightbox.addEventListener("click", (event) => {
    if (event.target === el.lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.editModal.classList.contains("hidden")) {      closeEditModal();
      return;
    }

    if (event.key === "Escape" && !el.confirmDeleteModal.classList.contains("hidden")) {
      closeDeleteConfirm();
      return;
    }

    if (event.key === "Escape" && !el.helpModal.classList.contains("hidden")) {
      el.helpModal.classList.add("hidden");
      return;
    }

    if (event.key === "Escape" && !el.lightbox.classList.contains("hidden")) {
      closeLightbox();
    }
  });
}

async function init() {
  const jsIndicator = document.getElementById("js-indicator");
  if (jsIndicator) {
    jsIndicator.textContent = "JS: active";
    jsIndicator.classList.add("ok");
  }
  const storedName = readStoredUserName();
  setCurrentUser(storedName);

  if (!storedName) {
    el.userModal.classList.remove("hidden");
    el.userNameInput.focus();
  }

  if (!hasBackend) {
    setBackendStatus("Supabase not configured. App is in read-only seed mode.", "warn");
    await loadPlaces();
    await loadManagedOptions();
    setupEventHandlers();
    renderAddPhotoList();
    return;
  }

  setBackendStatus("Connected to shared database.", "ok");
  await bootstrapSeedPlacesIfEmpty();
  await loadPlaces();
  await loadManagedOptions();
  await loadActivityLog();
  setupEventHandlers();
  renderAddPhotoList();
  setupRealtime();
}

setupEventHandlers();
  updateDebugOverlay();

window.addEventListener("error", () => {
  const jsIndicator = document.getElementById("js-indicator");
  if (jsIndicator) {
    jsIndicator.textContent = "JS: error";
    jsIndicator.classList.add("error");
  }
});

init();







































































