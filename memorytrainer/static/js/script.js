/* Knowledge-Tree (ported from memorytrainer_old, adapted to new /api endpoints) */
(function () {
  const API_BASE = (typeof window.API_BASE === "string" && window.API_BASE) ? window.API_BASE : "/api";

  const treeContainer = document.getElementById('tree-container');
  if (!treeContainer) return;

  // ---- utils ----
  function getCookie(name) {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? decodeURIComponent(m.pop()) : null;
  }
  const CSRF_HEADER_NAME = 'X-CSRFToken';

  function getDetailsHost() {
    let host = document.getElementById('package-details');
    if (!host) {
      host = document.createElement('div');
      host.id = 'package-details';
      host.className = 'package-details';
      treeContainer.parentNode.insertBefore(host, treeContainer.nextSibling);
    }
    return host;
  }

  let selectedElement = null;

  function selectElement(li, isChildClick = false) {
    if (selectedElement) {
      selectedElement.classList.remove('selected');
      if (!isChildClick) {
        selectedElement.classList.remove('expanded');
        const expandIcon = selectedElement.querySelector('.expand-icon');
        if (expandIcon) expandIcon.textContent = '▶';
      }
    }
    li.classList.add('selected');
    selectedElement = li;
  }

  function removeDetailPanel() {
    const existingDetailPanel = document.querySelector('.detail-panel');
    if (existingDetailPanel) existingDetailPanel.remove();
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    return isNaN(date.getTime()) ? '' : date.toLocaleDateString('de-DE', options);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDateISO(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return "";
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${dt.getFullYear()}-${m}-${day}`;
  }

  async function fetchJSON(url) {
    const busted = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
    const res = await fetch(busted, {
      headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const txt = await res.text().catch(()=> ''); throw new Error(`HTTP ${res.status}: ${url}\n${txt}`);
    }
    return res.json();
  }

  // ---- package details (unten) ----
  async function createDetailPanel(packageData, level) {
    removeDetailPanel();

    const detailPanel = document.createElement('div');
    detailPanel.className = 'detail-panel';
    detailPanel.setAttribute('data-level', level);
    detailPanel.style.marginTop = '12px';
    detailPanel.style.width = '100%';
    detailPanel.style.boxSizing = 'border-box';

    const detailContent = document.createElement('div');
    detailContent.className = 'detail-content';
    const formattedCreateDate = formatDate(packageData.created);
    const formattedChangeDate = formatDate(packageData.changed);

    detailContent.innerHTML = `
      <h2>Packagebeschreibung</h2>
      <h3 class="package-title">${packageData.title ?? 'Paket'}</h3>
      <p class="description">${packageData.desc ?? ''}</p>
      <div class="divider"></div>
      <div class="info-grid">
        <div class="labels">
          <p class="date-label">Erstellt</p>
          <p class="date-label">Geändert</p>
        </div>
        <div class="date-values">
          <p class="date-value">${formattedCreateDate}</p>
          <p class="date-value">${formattedChangeDate}</p>
        </div>
      </div>

      <div class="kt-actions" role="group" aria-label="Paket-Aktionen">
        <button type="button" class="kt-btn"                 data-scope="package" data-action="insert-before">Neues Paket (davor)</button>
        <button type="button" class="kt-btn"                 data-scope="package" data-action="insert-after">Neues Paket (danach)</button>
        <button type="button" class="kt-btn kt-btn--primary" data-scope="package" data-action="update">Paket ändern</button>
        <button type="button" class="kt-btn kt-btn--danger"  data-scope="package" data-action="delete">Paket löschen</button>
      </div>
    `;
    detailPanel.appendChild(detailContent);

    const host = getDetailsHost();
    host.innerHTML = '';
    host.appendChild(detailPanel);
  }

  // ---- data fetchers ----
  async function loadPackageDetails(packageId) {
    return fetchJSON(`${API_BASE}/package/${encodeURIComponent(packageId)}/`);
  }
  async function fetchRoots() {
    const data = await fetchJSON(`${API_BASE}/categories/`);
    const arr = Array.isArray(data) ? data : (data.categories || []);
    return arr.map(n => ({
      pk: n.id,
      fields: { text: n.name, created: n.created, changed: n.changed },
      children_count: n.children_count, pkg_count: n.pkg_count
    }));
  }
  async function fetchSubcategories(categoryId) {
    const data = await fetchJSON(`${API_BASE}/get_subcategories/${encodeURIComponent(categoryId)}/`);
    const arr = Array.isArray(data) ? data : (data.subcategories || []);
    return arr.map(n => ({
      pk: n.id,
      fields: { text: n.name, created: n.created, changed: n.changed },
      children_count: n.children_count, pkg_count: n.pkg_count
    }));
  }
  async function fetchPackages(categoryId, subId) {
    const data = await fetchJSON(`${API_BASE}/get_details/${encodeURIComponent(categoryId)}/${encodeURIComponent(subId)}/`);
    const items =
      Array.isArray(data?.items)    ? data.items :
      Array.isArray(data?.packages) ? data.packages :
      Array.isArray(data)           ? data : [];
    return items.map(p => ({
      pk: p.id,
      fields: {
        packageName: p.title,
        packageDescription: p.desc,
        createDate: p.created,
        changeDate: p.changed
      }
    }));
  }

  // ---- category panel (unten) ----
  async function createCategoryPanel(categoryItem, level, opts = {}) {
    const isDraft = opts.mode === 'draft';
    const host = getDetailsHost();
    host.innerHTML = "";

    // Host-Kontext
    host.dataset.categoryId = String(categoryItem.pk);
    host.dataset.mode       = isDraft ? 'draft' : 'edit';

    // Werte
    let createdISO  = categoryItem.fields?.created || "";
    let changedISO  = categoryItem.fields?.changed || "";
    let nameValue   = categoryItem.fields?.text || "";

    if (isDraft) {
      nameValue  = "";
      const today = new Date();
      createdISO = formatDateISO(today);
      changedISO = formatDateISO(today);
    }

    host.dataset.categoryName     = nameValue || "";
    host.dataset.categoryCreated  = createdISO || "";
    host.dataset.categoryChanged  = changedISO || "";

    const panel = document.createElement('div');
    panel.className = 'detail-panel';
    panel.setAttribute('data-level', level);
    panel.style.marginTop = '12px';
    panel.style.width = '100%';
    panel.style.boxSizing = 'border-box';

    const prettyCreated = createdISO ? formatDate(createdISO) : "";
    const isoChanged    = changedISO || "";

    panel.innerHTML = `
      <div class="detail-content">
        <h2>Kategorie bearbeiten</h2>

        <div class="kt-form-grid">
          <label for="cat-name">Name</label>
          <input id="cat-name" type="text" class="kt-input kt-input--editable" value="${escapeHtml(nameValue)}">

          <label>Erzeugt am</label>
          <div id="cat-created" class="kt-output" aria-readonly="true" tabindex="-1">
            ${escapeHtml(prettyCreated)}
          </div>

          <label for="cat-changed">Geändert am</label>
          <input id="cat-changed" type="date" class="kt-input kt-input--editable" value="${isoChanged}">
        </div>

        <div class="kt-actions" role="group" aria-label="Kategorie-Aktionen">
          <button type="button" class="kt-btn"                 data-scope="category" data-action="insert-before">Neue Kategorie (davor)</button>
          <button type="button" class="kt-btn"                 data-scope="category" data-action="insert-after">Neue Kategorie (danach)</button>
          <button type="button" class="kt-btn kt-btn--primary" data-scope="category" data-action="update">${isDraft ? 'Neu anlegen' : 'Kategorie ändern'}</button>
          <button type="button" class="kt-btn kt-btn--danger"  data-scope="category" data-action="delete">Kategorie löschen</button>
        </div>
      </div>
    `;
    host.appendChild(panel);

    // Draft: Insert-Buttons verbergen
    if (isDraft) {
      panel.querySelectorAll(
        '[data-scope="category"][data-action="insert-before"],[data-action="insert-after"]'
      ).forEach(b => { b.style.display = 'none'; });
    }
  }

  // ---- tree panels ----
  async function createPanel(items, level, autoSelectFirst = false, parentId = null, currentRootId = null) {
    const panel = document.createElement('div');
    panel.className = 'tree-panel';
    panel.setAttribute('data-level', level);

    const ul = document.createElement('ul');
    items.sort((a, b) => a.pk - b.pk);

    let firstLi = null;

    for (const item of items) {
      const li = document.createElement('li');
      li.setAttribute('data-id', item.pk);
      if (parentId != null) li.setAttribute('data-parent-id', parentId);

      const container = document.createElement('div');
      container.style.display = "flex";
      container.style.alignItems = "center";
      container.style.width = "100%";

      const iconImg = document.createElement('img');
      iconImg.src = "/static/images/knowledge_icon.webp";
      iconImg.alt = "Knowledge Icon";
      iconImg.className = "knowledge-icon";

      const textSpan = document.createElement('span');
      textSpan.textContent = item.fields.text;

      container.appendChild(iconImg);
      container.appendChild(textSpan);
      li.appendChild(container);

      // dataset → immer aktuelle Werte
      li.dataset.name    = item.fields?.text     || '';
      li.dataset.created = item.fields?.created  || '';
      li.dataset.changed = item.fields?.changed  || '';

      const hasChildren = (typeof item.children_count === 'number') ? item.children_count > 0 : false;
      if (hasChildren) {
        const expandIcon = document.createElement('span');
        expandIcon.textContent = '▶';
        expandIcon.className = 'expand-icon';
        li.appendChild(expandIcon);
      }

      // --- click handler (bereinigt) ---
      li.addEventListener('click', async (event) => {
        event.stopPropagation();

        const currentLevel = parseInt(li.closest('.tree-panel').getAttribute('data-level'), 10);
        selectElement(li, currentLevel > 0);

        // Siblings reset
        document.querySelectorAll(`.tree-panel[data-level="${currentLevel}"] li`).forEach(otherLi => {
          if (otherLi !== li) {
            const otherIcon = otherLi.querySelector('.expand-icon');
            if (otherIcon) otherIcon.textContent = '▶';
            otherLi.classList.remove('expanded');
          }
        });

        // tiefere Ebenen entfernen
        document.querySelectorAll('.tree-panel').forEach(p => {
          const lvl = parseInt(p.getAttribute('data-level'), 10);
          if (lvl > currentLevel) p.remove();
        });

        const expandIcon = li.querySelector('.expand-icon');

        // Daten fürs Panel NUR aus dataset
        const mergedForPanel = {
          pk: item.pk,
          fields: {
            text:    li.dataset.name    || item.fields?.text || '',
            created: li.dataset.created || item.fields?.created || '',
            changed: li.dataset.changed || item.fields?.changed || '',
          }
        };

        const wasExpanded = li.classList.contains('expanded');
        if (wasExpanded) {
          li.classList.remove('expanded');
          if (expandIcon) expandIcon.textContent = '▶';
          ul.querySelectorAll(`li[data-type="exercise-package"][data-parent-id="${item.pk}"]`).forEach(n => n.remove());
          await createCategoryPanel(mergedForPanel, currentLevel + 1);
          return;
        }

        li.classList.add('expanded');
        if (expandIcon) expandIcon.textContent = '▼';

        // Unterkategorien
        const nextItems = await fetchSubcategories(item.pk);
        if (nextItems.length > 0) {
          await createPanel(nextItems, level + 1, false, item.pk, null);
        }

        // Pakete (nur in Unterebenen)
        if (parentId != null && level >= 1) {
          try {
            const pkgs = await fetchPackages(parentId, item.pk);
            ul.querySelectorAll(`li[data-type="exercise-package"][data-parent-id="${item.pk}"]`).forEach(n => n.remove());

            if (pkgs.length > 0) {
              const frag = document.createDocumentFragment();
              pkgs.forEach(pkg => {
                const packageLi = document.createElement('li');
                packageLi.setAttribute('data-id', pkg.pk);
                packageLi.setAttribute('data-type', 'exercise-package');
                packageLi.setAttribute('data-parent-id', String(item.pk));

                const packageContainer = document.createElement('div');
                packageContainer.style.display = "flex";
                packageContainer.style.alignItems = "center";
                packageContainer.style.width = "100%";

                const packageIconImg = document.createElement('img');
                packageIconImg.src = "/static/images/package_icon.webp";
                packageIconImg.alt = "Package Icon";
                packageIconImg.className = "knowledge-icon";

                const packageTextSpan = document.createElement('span');
                packageTextSpan.textContent = pkg.fields.packageName;

                packageContainer.appendChild(packageIconImg);
                packageContainer.appendChild(packageTextSpan);
                packageLi.appendChild(packageContainer);

                packageLi.addEventListener('click', async (ev) => {
                  ev.stopPropagation();
                  selectElement(packageLi, true);
                  document.querySelectorAll('.tree-panel li.is-ancestor').forEach(n => n.classList.remove('is-ancestor'));
                  li.classList.add('is-ancestor');
                  const data = await loadPackageDetails(pkg.pk);
                  if (data) await createDetailPanel(data, level + 2);
                });

                frag.appendChild(packageLi);
              });
              li.parentNode.insertBefore(frag, li.nextSibling);
            } else {
              removeDetailPanel();
            }
          } catch (e) {
            console.error(e);
          }
        }

        // Panel unten einmalig anzeigen
        await createCategoryPanel(mergedForPanel, currentLevel + 1);
      });

      ul.appendChild(li);
      if (!firstLi) firstLi = li;
    } // end for

    panel.appendChild(ul);

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    function initResize(e) {
      const startX = e.clientX;
      const startWidth = panel.offsetWidth;
      function doResize(ev) { panel.style.width = `${startWidth + ev.clientX - startX}px`; }
      function stopResize() {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
      }
      document.addEventListener('mousemove', doResize);
      document.addEventListener('mouseup', stopResize);
    }
    resizeHandle.addEventListener('mousedown', initResize);
    panel.appendChild(resizeHandle);

    treeContainer.appendChild(panel);

    if (autoSelectFirst && firstLi) {
      firstLi.click();
    }
  }

  // ---- neue Kategorie einfügen (draft) ----
  function prepareCategoryInsert(direction /* 'before' | 'after' */) {
    const host = getDetailsHost();
    const refId = host.dataset.categoryId;
    let refLi = document.querySelector(`.tree-panel li[data-id="${CSS.escape(refId)}"]:not([data-type])`);
    if (!refLi) refLi = selectedElement;
    if (!refLi) { alert("Keine Referenz-Kategorie gefunden."); return; }

    const ul = refLi.parentElement;
    const level = parseInt(refLi.closest('.tree-panel').getAttribute('data-level'), 10) || 0;

    const tmpId = `new-${Date.now()}`;
    const li = document.createElement('li');
    li.setAttribute('data-id', tmpId);
    li.classList.add('draft');

    const parentIdAttr = refLi.getAttribute('data-parent-id');
    if (parentIdAttr != null) li.setAttribute('data-parent-id', parentIdAttr);

    const container = document.createElement('div');
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.width = "100%";

    const iconImg = document.createElement('img');
    iconImg.src = "/static/images/knowledge_icon.webp";
    iconImg.alt = "Knowledge Icon";
    iconImg.className = "knowledge-icon";

    const textSpan = document.createElement('span');
    textSpan.textContent = "Neue Kategorie";

    container.appendChild(iconImg);
    container.appendChild(textSpan);
    li.appendChild(container);

    const todayISO = formatDateISO(new Date());
    li.dataset.name = "";
    li.dataset.created = todayISO;
    li.dataset.changed = todayISO;

    if (direction === 'before') ul.insertBefore(li, refLi);
    else ul.insertBefore(li, refLi.nextSibling);

    selectElement(li, level > 0);
    const itemForPanel = { pk: tmpId, fields: { text: "", created: todayISO, changed: todayISO } };
    createCategoryPanel(itemForPanel, level + 1, { mode: 'draft' });

    host.dataset.mode = 'draft';
    host.dataset.parentId = parentIdAttr ? String(parentIdAttr) : "";
  }

  // ---- speichern: neue Kategorie ----
  async function handleCategoryCreate() {
    const host = getDetailsHost();
    const tempId = host.dataset.categoryId;
    const parentId = host.dataset.parentId || "";
    const li = document.querySelector(`.tree-panel li[data-id="${CSS.escape(tempId)}"]:not([data-type])`);
    if (!li) { alert("Entwurf nicht gefunden."); return; }

    const nameEl = host.querySelector('#cat-name');
    const changedEl = host.querySelector('#cat-changed');

    const name    = (nameEl?.value || "").trim();
    const created = host.dataset.categoryCreated || formatDateISO(new Date());
    const changed = (changedEl?.value || formatDateISO(new Date()));

    try {
      const res = await fetch(`${API_BASE}/category/`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          [CSRF_HEADER_NAME]: getCookie('csrftoken') || ''
        },
        body: JSON.stringify({
          name: name || "Neue Kategorie",
          created,
          changed,
          parent_id: parentId ? parseInt(parentId, 10) : null
        })
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new Error(`Anlegen fehlgeschlagen (${res.status}).\n${txt}`);
      }
      const data = await res.json();

      // LI finalisieren
      li.setAttribute('data-id', String(data.id));
      li.classList.remove('draft');
      li.dataset.name    = data.name || name || "Neue Kategorie";
      li.dataset.created = data.created || created;
      li.dataset.changed = data.changed || changed;

      const span = li.querySelector('span');
      if (span) span.textContent = li.dataset.name;

      // Panel in edit-Modus
      const currentLevel = parseInt(li.closest('.tree-panel').getAttribute('data-level'), 10) || 0;
      const merged = {
        pk: data.id,
        fields: {
          text: li.dataset.name,
          created: li.dataset.created,
          changed: li.dataset.changed
        }
      };
      await createCategoryPanel(merged, currentLevel + 1, { mode: 'edit' });
    } catch (err) {
      console.error(err);
      alert('Anlegen fehlgeschlagen. Details in der Konsole.');
    }
  }

  // ---- speichern: bestehende Kategorie ----
  async function handleCategoryUpdate() {
    const host = getDetailsHost();
    const id = parseInt(host.dataset.categoryId || "", 10);
    if (!id) { alert("Keine Kategorie im Kontext."); return; }

    const nameEl    = host.querySelector('#cat-name');
    const changedEl = host.querySelector('#cat-changed');
    const newName     = (nameEl?.value || "").trim();
    const newChanged  = (changedEl?.value || "").trim();

    const oldName    = host.dataset.categoryName || "";
    const oldChanged = host.dataset.categoryChanged || "";

    if (newName === oldName && newChanged === oldChanged) {
      console.log("Keine Änderungen – nichts zu speichern.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/category/${id}/`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          [CSRF_HEADER_NAME]: getCookie('csrftoken') || ''
        },
        body: JSON.stringify({ name: newName, changed: newChanged })
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new Error(`Update fehlgeschlagen (${res.status}).\n${txt}`);
      }
      const data = await res.json();

      // Label + dataset im Baum
      const li = document.querySelector(`.tree-panel li[data-id="${id}"]:not([data-type])`);
      if (li) {
        const textSpan = li.querySelector('span');
        li.dataset.name    = (data.name    || newName)    || '';
        li.dataset.created = (data.created || li.dataset.created) || '';
        li.dataset.changed = (data.changed || newChanged) || '';
        if (textSpan) textSpan.textContent = data.name || newName;
      }

      // Panel-Kontext/Felder
      host.dataset.categoryName    = data.name    || newName;
      host.dataset.categoryChanged = data.changed || newChanged;
      if (data.created) host.dataset.categoryCreated = data.created;

      if (changedEl && (data.changed || newChanged)) {
        changedEl.value = data.changed ? formatDateISO(data.changed) : newChanged;
      }
      const createdOut = host.querySelector('#cat-created');
      if (createdOut && data.created) {
        createdOut.textContent = formatDate(data.created);
        host.dataset.categoryCreated = data.created;
      }
    } catch (err) {
      console.error(err);
      alert("Speichern fehlgeschlagen. Details in der Konsole.");
    }
  }

  // ---- delegation (einmal global) ----
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.kt-btn[data-action]');
    if (!btn) return;
    e.preventDefault();

    const { scope, action } = btn.dataset;
    if (scope === 'category') {
      if (action === 'insert-before') { prepareCategoryInsert('before'); return; }
      if (action === 'insert-after')  { prepareCategoryInsert('after');  return; }
      if (action === 'update') {
        const host = getDetailsHost();
        if (host?.dataset.mode === 'draft') { handleCategoryCreate(); }  // Neu anlegen
        else { handleCategoryUpdate(); }                                  // Bestehendes ändern
        return;
      }
    }
  });

  // ---- boot ----
  async function init() {
    try {
      const roots = await fetchRoots();
      await createPanel(roots, 0, true, null, null);
    } catch (e) {
      console.error(e);
      const err = document.createElement('div');
      err.className = 'kt-empty';
      err.textContent = 'Fehler beim Laden des Knowledge-Trees.';
      treeContainer.appendChild(err);
    }
  }
  init();
})();
