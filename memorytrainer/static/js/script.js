
/* Knowledge-Tree (ported from memorytrainer_old, adapted to new /api endpoints) */
(function () {
  if (window.__KT_INIT__) {
    console.warn('Knowledge-Tree: script already initialized – skipping second init.');
    return;
  }
  window.__KT_INIT__ = true;

  const API_BASE = (typeof window.API_BASE === "string" && window.API_BASE) ? window.API_BASE : "/api";

  const treeContainer = document.getElementById('tree-container');
  if (!treeContainer) return;

  // ---- utils ----
  function clearPathMarks() {
    document.querySelectorAll('.tree-panel li.path-ancestor, .tree-panel li.is-ancestor')
      .forEach(n => n.classList.remove('path-ancestor', 'is-ancestor'));
  }

  function findLiById(id) {
    return document.querySelector(`.tree-panel li[data-id="${CSS.escape(String(id))}"]`);
  }

  /**
   * Ermittelt den Pfad (Array von <li>) von der Root bis zu li.
   * Nutzt data-parent-id (liegt bei Unterebenen bereits vor).
   */
  function getPathForLi(li) {
    if (!li) return [];
    const path = [li];
    // Steige über data-parent-id nach links durch die Panels
    let current = li;
    while (current && current.hasAttribute('data-parent-id')) {
      const parentId = current.getAttribute('data-parent-id');
      if (!parentId) break;
      const parentLi = findLiById(parentId);
      if (!parentLi) break;
      path.unshift(parentLi); // nach vorne (Root…->…li)
      current = parentLi;
    }
    return path;
  }

  /** Markiert den gesamten Pfad (alle Vorfahren) */
  function markActivePath(targetLi) {
    clearPathMarks();
    const path = getPathForLi(targetLi);
    path.forEach((n, idx) => {
      // sanfte Markierung aller Vorfahren + direkte Parent-Markierung
      if (idx < path.length - 1) n.classList.add('path-ancestor');
    });
    // Kompatibilität zu bestehender Logik (wird z. T. schon benutzt)
    const parentOfLeaf = path.length > 1 ? path[path.length - 2] : null;
    if (parentOfLeaf) parentOfLeaf.classList.add('is-ancestor');
    return path;
  }

  /** Breadcrumb oben rendern */
  function renderBreadcrumbFromPath(path, leafText = null) {
    const host = document.getElementById('kt-breadcrumb');
    if (!host) return;

    // leeren
    host.innerHTML = '';

    if (!Array.isArray(path) || path.length === 0) return;

    // Kategorienpfad rendern
    path.forEach((li, idx) => {
      const name =
        (li?.dataset?.name || li?.querySelector('span')?.textContent || '').trim();

      const crumb = document.createElement('span');
      // Wenn KEIN leafText übergeben wurde (Kategorie selektiert),
      // ist die letzte Kategorie der "leaf"
      crumb.className =
        'kt-crumb' + (idx === path.length - 1 && !leafText ? ' kt-crumb--leaf' : '');
      crumb.textContent = name || '—';
      host.appendChild(crumb);

      if (idx < path.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'kt-crumb-sep';
        sep.textContent = '›';
        host.appendChild(sep);
      }
    });

    // Paketname nur anhängen, wenn wirklich selektiert (leafText gesetzt)
    if (leafText && leafText.trim()) {
      const sep = document.createElement('span');
      sep.className = 'kt-crumb-sep';
      sep.textContent = '›';
      host.appendChild(sep);

      const leaf = document.createElement('span');
      leaf.className = 'kt-crumb kt-crumb--leaf';
      leaf.textContent = leafText.trim();
      host.appendChild(leaf);
    }
  }
  /** Convenience: Pfad markieren + Breadcrumb setzen */
  /** Pfad markieren + Breadcrumb setzen (optional mit Paket-Leaf) */
  function activatePathFor(li, leafTextOpt) {
    const path = markActivePath(li);

    // Wenn explizit ein Paketname übergeben wurde, den verwenden.
    // Sonst: falls li selbst ein Paket ist, dessen Label nehmen.
    let leafText = null;
    if (typeof leafTextOpt === 'string' && leafTextOpt.trim()) {
      leafText = leafTextOpt.trim();
    } else if (li?.getAttribute('data-type') === 'exercise-package') {
      leafText = (li.dataset.name || li.querySelector('span')?.textContent || '').trim();
    }
    renderBreadcrumbFromPath(path, leafText);
  }
  // Paket-Klick binden (wie im createPanel)
  function bindPackageClick(li, pkgId, categoryLi) {
    li.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      discardDraftIfOther(li);
      selectElement(li, true);
      const leafName = (li.dataset.name || li.querySelector('span')?.textContent || '').trim();
      activatePathFor(categoryLi || li, leafName);
      // Eltern-Unterkategorie als Ancestor markieren
      document.querySelectorAll('.tree-panel li.is-ancestor').forEach(n => n.classList.remove('is-ancestor'));
      if (categoryLi) categoryLi.classList.add('is-ancestor');

      const levelBase = parseInt(categoryLi?.closest('.tree-panel')?.getAttribute('data-level') || '0', 10);
      const data = await loadPackageDetails(pkgId);
      if (data) await createDetailPanel(data, levelBase + 2);
    });
  }

  // Pakete unter einer Unterkategorie neu rendern und optional ein Paket auswählen
  async function rerenderPackagesForCategory(categoryLi, selectPkgId = null) {
    if (!categoryLi) return;

    const subId     = parseInt(categoryLi.getAttribute('data-id') || '0', 10);
    const parentId  = categoryLi.getAttribute('data-parent-id'); // kann null sein, aber für Pakete ist es gesetzt
    const ul        = categoryLi.parentElement;

    // alte Paket-Zeilen für diese Unterkategorie entfernen
    ul.querySelectorAll(`li[data-type="exercise-package"][data-parent-id="${CSS.escape(String(subId))}"]`).forEach(n => n.remove());

    // Pakete neu laden
    const pkgs = await fetchPackages(parseInt(parentId || '0', 10), subId);
    if (!Array.isArray(pkgs) || pkgs.length === 0) return;

    const frag = document.createDocumentFragment();
    let liToSelect = null;

    const levelBase = parseInt(categoryLi.closest('.tree-panel')?.getAttribute('data-level') || '0', 10);

    pkgs.forEach(pkg => {
      const packageLi = document.createElement('li');
      packageLi.setAttribute('data-id', pkg.pk);
      packageLi.setAttribute('data-type', 'exercise-package');
      packageLi.setAttribute('data-parent-id', String(subId));
      if (typeof pkg.sort_order === 'number') packageLi.dataset.sortOrder = String(pkg.sort_order);
      packageLi.dataset.name = pkg.fields.packageName || '';

      const packageContainer = document.createElement('div');
      packageContainer.style.display   = "flex";
      packageContainer.style.alignItems= "center";
      packageContainer.style.width     = "100%";

      const packageIconImg = document.createElement('img');
      packageIconImg.src = "/static/images/package_icon.webp";
      packageIconImg.alt = "Package Icon";
      packageIconImg.className = "knowledge-icon";

      const packageTextSpan = document.createElement('span');
      packageTextSpan.textContent = pkg.fields.packageName;

      packageContainer.appendChild(packageIconImg);
      packageContainer.appendChild(packageTextSpan);
      packageLi.appendChild(packageContainer);

      bindPackageClick(packageLi, pkg.pk, categoryLi);

      if (selectPkgId && String(selectPkgId) === String(pkg.pk)) {
        liToSelect = packageLi;
      }

      frag.appendChild(packageLi);
    });

    // direkt unter die Kategorie hängen
    categoryLi.parentNode.insertBefore(frag, categoryLi.nextSibling);

    // ggf. das gewünschte Paket auswählen und Panel aufmachen
    if (liToSelect) {
      // Ancestor setzen
      document.querySelectorAll('.tree-panel li.is-ancestor').forEach(n => n.classList.remove('is-ancestor'));
      categoryLi.classList.add('is-ancestor');

      selectElement(liToSelect, true);
      const leafName = liToSelect.dataset.name || liToSelect.querySelector('span')?.textContent || '';
      activatePathFor(categoryLi, leafName); // Paket ist selektiert → mit Leaf      const data = await loadPackageDetails(selectPkgId);
      if (data) await createDetailPanel(data, levelBase + 2);
    }
  }

  function isPackageSelected() {
    return !!(selectedElement && selectedElement.getAttribute('data-type') === 'exercise-package');
  }

  // Prüft auf Duplikate im aktuell gerenderten Baum
  function nameExistsOnLevel(name, parentId, excludeId = null) {
    const needle = (name || '').trim().toLowerCase();
    if (!needle) return false;

    // Root-Ebene = kein data-parent-id
    const selector = parentId
      ? `.tree-panel li:not([data-type])[data-parent-id="${CSS.escape(String(parentId))}"]`
      : `.tree-panel[data-level="0"] li:not([data-type]):not([data-parent-id])`;

    const items = Array.from(document.querySelectorAll(selector));
    return items.some(li => {
      const thisId = li.getAttribute('data-id');
      if (excludeId && String(excludeId) === String(thisId)) return false;
      const label = (li.dataset.name || li.querySelector('span')?.textContent || '').trim().toLowerCase();
      return label === needle;
    });
  }


  function restoreLastStableSelection(fallbackId = null) {
    const id = lastStableSelectedId || fallbackId;
    if (!id) return;

    const li = document.querySelector(`.tree-panel li[data-id="${CSS.escape(String(id))}"]`);
    if (!li) return;

    const level = parseInt(li.closest('.tree-panel')?.getAttribute('data-level') || '0', 10);
    selectElement(li, level > 0);
    activatePathFor(li);
    // Paket ausgewählt? -> Paket-Detail unten anzeigen
    if (li.getAttribute('data-type') === 'exercise-package') {
      const pkgId = li.getAttribute('data-id');
      const pkgName = li.dataset.name || li.querySelector('span')?.textContent || '';
      const parentId = li.getAttribute('data-parent-id');
      const catLi = parentId ? findLiById(parentId) : null;
      activatePathFor(catLi || li, pkgName); // zeigt Paketname nur bei Paket-Auswahl
      loadPackageDetails(pkgId)
        .then(data => { if (data) createDetailPanel(data, level + 2); })
        .catch(console.error);
      return;
    }

    // Kategorie ausgewählt -> Kategorie-Panel aus den aktuellen dataset-Werten rendern
    const mergedForPanel = {
      pk: isNaN(+id) ? id : +id,
      fields: {
        text:    li.dataset.name    || li.querySelector('span')?.textContent || '',
        created: li.dataset.created || '',
        changed: li.dataset.changed || '',
      }
    };
    activatePathFor(li); // nur Kategorienpfad ohne Paketname
    createCategoryPanel(mergedForPanel, level + 1, { mode: 'edit'});
  }

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
  let lastStableSelectedId = null; // ID des zuletzt stabil ausgewählten Elements (kein Draft)

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

    // Nur „stabile“ Auswahl merken (also keine Entwürfe)
    if (!li.classList.contains('draft')) {
      lastStableSelectedId = li.getAttribute('data-id') || null;
    }
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
    // vorhandenes Panel entfernen
    removeDetailPanel();

    const host = getDetailsHost();

    // Ist das ein Draft? -> entweder hat der Host schon "draft" stehen ODER die ID ist eine temp-ID
    const draftByHost = (host.dataset.mode === 'draft');
    const draftById   = String(packageData.id || '').startsWith('pkg-new-');
    const isDraft     = draftByHost || draftById;

    // Panel neu aufbauen
    host.innerHTML = '';
    host.dataset.panelOwner = `package:${packageData.id ?? ''}`;

    // Kontext setzen (ID/Name/Daten)
    host.dataset.packageId      = String(packageData.id || '');
    host.dataset.packageName    = packageData.title   || '';
    host.dataset.packageCreated = packageData.created || '';
    host.dataset.packageChanged = packageData.changed || '';
    host.dataset.mode           = isDraft ? 'draft' : 'edit';

    // nodeId sicher mitschreiben (für Neu-Anlage / Speichern)
    // Reihenfolge der Quellen: Host (falls schon gesetzt) -> Daten vom Server -> markierte Unterkategorie
    const fallbackNodeId =
      document.querySelector('.tree-panel li.is-ancestor')?.getAttribute('data-id') || '';
    host.dataset.nodeId = String(
      host.dataset.nodeId ||
      (packageData.node && packageData.node.id) ||
      fallbackNodeId ||
      ''
    );

    // Einfüge-Metadaten zurücksetzen (werden bei Insert neu gesetzt)
    // WICHTIG: Im Draft NICHT löschen – wir brauchen die Einfüge-Metadaten fürs Anlegen
    if (!isDraft) {
      delete host.dataset.insertDirection;
      delete host.dataset.refPkgId;
    }
    const createdPretty = packageData.created ? formatDate(packageData.created) : '';
    const changedISO    = packageData.changed ? formatDateISO(packageData.changed)
                                              : formatDateISO(new Date());
    const actionLabel   = isDraft ? 'Neu anlegen' : 'Paket ändern';

    const panel = document.createElement('div');
    panel.className = 'detail-panel';
    panel.setAttribute('data-level', level);
    panel.style.marginTop = '12px';
    panel.style.width = '100%';
    panel.style.boxSizing = 'border-box';

    panel.innerHTML = `
        <div class="detail-content">
          <h2>Packagebeschreibung</h2>
    
          <div class="kt-form-grid">
            <label for="pkg-name">Name</label>
            <input id="pkg-name" type="text"
                   class="kt-input kt-input--editable"
                   value="${escapeHtml(packageData.title || '')}">
    
            <label>Erzeugt am</label>
            <div id="pkg-created" class="kt-output" aria-readonly="true" tabindex="-1">
              ${escapeHtml(createdPretty)}
            </div>
    
            <label for="pkg-changed">Geändert am</label>
            <input id="pkg-changed" type="date"
                   class="kt-input kt-input--editable"
                   value="${escapeHtml(changedISO)}">
    
            <!-- etwas Luft vor der Beschreibung, aber im Grid -->
            <div class="kt-spacer" aria-hidden="true"></div>
    
            <!-- Label in Spalte 1, Textarea in Spalte 2 -->
            <label for="pkg-desc">Inhaltsbeschreibung</label>
            <textarea id="pkg-desc"
                      class="kt-input kt-input--editable"
                      rows="6"></textarea>
          </div>
    
          <div class="kt-actions" role="group" aria-label="Paket-Aktionen">
            <button type="button" class="kt-btn"                 data-scope="package" data-action="insert-before">Neues Paket (davor)</button>
            <button type="button" class="kt-btn"                 data-scope="package" data-action="insert-after">Neues Paket (danach)</button>
            <button type="button" class="kt-btn kt-btn--primary" data-scope="package" data-action="update">${actionLabel}</button>
            <button type="button" class="kt-btn kt-btn--danger"  data-scope="package" data-action="delete">Paket löschen</button>
          </div>
        </div>
      `;

    // Beschreibungstext sicher einsetzen (nach dem Einfügen)
    const descEl = panel.querySelector('#pkg-desc');
    if (descEl) descEl.value = packageData.desc || '';

    // Wenn Draft: Insert-/Delete-Buttons ausblenden
    if (isDraft) {
      const actions = panel.querySelector('.kt-actions');
      actions.querySelectorAll(
        '[data-action="insert-before"], [data-action="insert-after"], [data-action="delete"]'
      ).forEach(b => b.style.display = 'none');
      const discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.className = 'kt-btn';
      discardBtn.dataset.scope = 'package';
      discardBtn.dataset.action = 'discard';
      discardBtn.textContent = 'Verwerfen';
      actions.insertBefore(discardBtn, actions.firstChild);
    }

    host.appendChild(panel);
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
      children_count: n.children_count,
      pkg_count: n.pkg_count,
      sort_order: n.sort_order,                  // <—
    }));
  }

  async function fetchSubcategories(categoryId) {
    const data = await fetchJSON(`${API_BASE}/get_subcategories/${encodeURIComponent(categoryId)}/`);
    const arr = Array.isArray(data) ? data : (data.subcategories || []);
    return arr.map(n => ({
      pk: n.id,
      fields: { text: n.name, created: n.created, changed: n.changed },
      children_count: n.children_count,
      pkg_count: n.pkg_count,
      sort_order: n.sort_order,                  // <—
    }));
  }

  // Pakete einer Unterkategorie laden – mit sort_order
  async function fetchPackages(categoryId, subId) {
    const url = `${API_BASE}/get_details/${encodeURIComponent(categoryId)}/${encodeURIComponent(subId)}/`;
    const data = await fetchJSON(url);

    // verschiedene mögliche Response-Formen tolerieren
    let raw = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.packages)
        ? data.packages
        : Array.isArray(data)
          ? data
          : [];

    // Normalisieren + sort_order ziehen/parsen
    let items = raw.map((p, idx) => {
      const soRaw =
        p.sort_order ??            // bevorzugt
        p.sortOrder ??             // fallback key
        null;

      const so = (typeof soRaw === 'number')
        ? soRaw
        : (typeof soRaw === 'string' && soRaw.trim() !== '' ? parseInt(soRaw, 10) : null);

      return {
        pk: p.id,
        sort_order: Number.isFinite(so) ? so : idx, // fallback: aktuelle Reihenfolge
        fields: {
          packageName: p.title ?? p.packageName ?? '',
          packageDescription: p.desc ?? p.packageDescription ?? '',
          createDate: p.created ?? p.createDate ?? '',
          changeDate: p.changed ?? p.changeDate ?? ''
        }
      };
    });

  // Frontend-seitig stabil sortieren (falls Backend es noch nicht tut)
  items.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    // sekundär nach id, um Stabilität zu garantieren
    return (a.pk ?? 0) - (b.pk ?? 0);
  });

  return items;
}

  // ---- category panel (unten) ----
   async function createCategoryPanel(categoryItem, level, opts = {}) {
    const isDraft = opts.mode === 'draft';
    const host = getDetailsHost();
    // erst prüfen, ob ein Paket gerade "Owner" ist
    if (!opts?.force) {
      const owner = host.dataset.panelOwner || '';
      if (owner.startsWith('package:') && isPackageSelected()) {
        return; // Paket hat Vorrang – NICHTS leeren!
      }
    }
    // jetzt ist Rendern erlaubt -> altes Panel leeren
    host.innerHTML = "";    // Ab jetzt gehört das Panel der Kategorie
    host.dataset.panelOwner = `category:${String(categoryItem.pk)}`;

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
    // Falls diese Kategorie noch KEINE Unterkategorien hat -> Button "Neue Unterkategorie" anzeigen
    if (!isDraft) {
      const catLi = document.querySelector(`.tree-panel li:not([data-type])[data-id="${CSS.escape(String(categoryItem.pk))}"]`);
      const childrenCount = parseInt(catLi?.dataset.childrenCount || '0', 10);
      if (childrenCount === 0) {
        const actions = panel.querySelector('.kt-actions');
        const addChildBtn = document.createElement('button');
        addChildBtn.type = 'button';
        addChildBtn.className = 'kt-btn';
        addChildBtn.dataset.scope = 'category';
        addChildBtn.dataset.action = 'insert-child';
        addChildBtn.textContent = 'Neue Unterkategorie';
        actions.insertBefore(addChildBtn, actions.firstChild);
      }
      const pkgCount = parseInt(catLi?.dataset.pkgCount || '0', 10);
      if (pkgCount === 0) {
        const actions = panel.querySelector('.kt-actions');
        const addPkgBtn = document.createElement('button');
        addPkgBtn.type = 'button';
        addPkgBtn.className = 'kt-btn';
        addPkgBtn.dataset.scope = 'package';
        addPkgBtn.dataset.action = 'insert-first';
        addPkgBtn.textContent = 'Neues Paket';
        actions.insertBefore(addPkgBtn, actions.firstChild);
      }
    }
    host.appendChild(panel);

    // Draft: Insert-Buttons verbergen
    // Draft: Insert-Buttons & Löschen ausblenden, "Verwerfen" hinzufügen
    if (isDraft) {
      const actions = panel.querySelector('.kt-actions');
      // Buttons ausblenden, die im Draft keinen Sinn machen
      actions.querySelectorAll(
        '[data-action="insert-before"], [data-action="insert-after"], [data-action="delete"]'
      ).forEach(b => b.style.display = 'none');
    
      // Verwerfen-Button einfügen
      const discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.className = 'kt-btn';
      discardBtn.dataset.scope = 'category';
      discardBtn.dataset.action = 'discard';
      discardBtn.textContent = 'Verwerfen';
      // hübsch links platzieren
      actions.insertBefore(discardBtn, actions.firstChild);
    }
  }

  // ---- tree panels ----
  async function createPanel(items, level, autoSelectFirst = false, parentId = null, currentRootId = null) {
    const panel = document.createElement('div');
    panel.className = 'tree-panel';
    panel.setAttribute('data-level', level);

    const ul = document.createElement('ul');
    if (items.length && typeof items[0].sort_order === 'number') {
      items.sort((a,b) => a.sort_order - b.sort_order);
    }
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

      // Rechtsseitiger Meta-Bereich: zuerst Badge, dann Pfeil
      const meta = document.createElement('div');
      meta.className = 'row-meta'; // <-- wird in CSS gestylt
      // (Badge wird später via updatePkgBadge() hier eingefügt)

      container.appendChild(iconImg);
      container.appendChild(textSpan);
      container.appendChild(meta);
      li.appendChild(container);

      // dataset → immer aktuelle Werte
      li.dataset.name    = item.fields?.text     || '';
      li.dataset.created = item.fields?.created  || '';
      li.dataset.changed = item.fields?.changed  || '';
      li.dataset.childrenCount = String(item.children_count ?? 0);
      li.dataset.pkgCount      = String(item.pkg_count ?? 0);
      updatePkgBadge(li);

      const hasChildren = (typeof item.children_count === 'number') ? item.children_count > 0 : false;
      if (hasChildren) {
        const expandIcon = document.createElement('span');
        expandIcon.textContent = '▶';
        expandIcon.className = 'expand-icon';
        meta.appendChild(expandIcon);
      }

      // --- click handler (bereinigt) ---
      li.addEventListener('click', async (event) => {
        event.stopPropagation();
        discardDraftIfOther(li);

        const currentLevel = parseInt(li.closest('.tree-panel').getAttribute('data-level'), 10);
        selectElement(li, currentLevel > 0);
        activatePathFor(li); // nur Kategorienpfad

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
          if (selectedElement !== li) return; // Auswahl hat sich geändert -> nichts rendern
            await createCategoryPanel(mergedForPanel, currentLevel + 1, { mode: 'edit' });          return;
        }

        li.classList.add('expanded');
        if (expandIcon) expandIcon.textContent = '▼';

        // Unterkategorien
        const nextItems = await fetchSubcategories(item.pk);
        if (nextItems.length > 0) {
          await createPanel(nextItems, level + 1, false, item.pk, null);
        }

        // Pakete (für jeden Knoten, inkl. Root)
        try {
          const pkgs = await fetchPackages(parentId ?? 0, item.pk); // category_id egal → 0 passt
          // alte Paket-Zeilen dieses Knotens entfernen
          ul.querySelectorAll(`li[data-type="exercise-package"][data-parent-id="${item.pk}"]`).forEach(n => n.remove());

          if (pkgs.length > 0) {
            const frag = document.createDocumentFragment();
            pkgs.forEach(pkg => {
              const packageLi = document.createElement('li');
              packageLi.setAttribute('data-id', pkg.pk);
              packageLi.setAttribute('data-type', 'exercise-package');
              packageLi.setAttribute('data-parent-id', String(item.pk));
              if (typeof pkg.sort_order === 'number') packageLi.dataset.sortOrder = String(pkg.sort_order);
              packageLi.dataset.name = pkg.fields.packageName || '';

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

              const meta = document.createElement('div');
              meta.className = 'row-meta';

              packageContainer.appendChild(packageIconImg);
              packageContainer.appendChild(packageTextSpan);
              packageContainer.appendChild(meta);
              packageLi.appendChild(packageContainer);

              // Klick auf Paket
              packageLi.addEventListener('click', async (ev) => {
                discardDraftIfOther(packageLi);
                ev.stopPropagation();
                selectElement(packageLi, true);
                const leafName = (packageLi.dataset.name || packageLi.querySelector('span')?.textContent || '').trim();
                activatePathFor(li, leafName); // li = zugehörige Kategorie                document.querySelectorAll('.tree-panel li.is-ancestor').forEach(n => n.classList.remove('is-ancestor'));
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
        // Panel unten einmalig anzeigen
        if (selectedElement !== li) return; // nicht mehr die aktive Kategorie
        if (!isPackageSelected()) {
          await createCategoryPanel(mergedForPanel, currentLevel + 1, { mode: 'edit' });
        }
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
    li.dataset.childrenCount = "0";
    li.dataset.pkgCount = "0";

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

    host.dataset.prevSelectedId = lastStableSelectedId || '';
    host.dataset.refId = refLi.getAttribute('data-id') || '';

    selectElement(li, level > 0);
    const itemForPanel = { pk: tmpId, fields: { text: "", created: todayISO, changed: todayISO } };
    createCategoryPanel(itemForPanel, level + 1, { mode: 'draft' });

    host.dataset.mode = 'draft';
    host.dataset.parentId = parentIdAttr ? String(parentIdAttr) : "";
    host.dataset.insertDirection = direction;                 // 'before' | 'after'
    host.dataset.refId = refLi.getAttribute('data-id') || ''; // referenzierter Nachbar
  }

  function prepareSubcategoryInsert() {
    const host = getDetailsHost();

    // Ausgangspunkt: aktuell selektierte Kategorie (oder die aus dem Host-Kontext)
    let parentLi = selectedElement && !selectedElement.getAttribute('data-type')
      ? selectedElement
      : document.querySelector(`.tree-panel li:not([data-type])[data-id="${CSS.escape(host.dataset.categoryId || '')}"]`);

    if (!parentLi) { alert('Keine Kategorie im Kontext.'); return; }

    // Evtl. vorhandenen anderen Draft verwerfen
    discardDraftIfOther(null);

    const parentId = parentLi.getAttribute('data-id');
    const parentLevel = parseInt(parentLi.closest('.tree-panel')?.getAttribute('data-level') || '0', 10) || 0;

    // Alle Panels rechts vom Parent schließen (wir bauen das Child-Panel neu auf)
    document.querySelectorAll('.tree-panel').forEach(p => {
      const lvl = parseInt(p.getAttribute('data-level'), 10);
      if (lvl > parentLevel) p.remove();
    });

    // Parent optisch expandieren + ggf. Expand-Icon nachrüsten
    parentLi.classList.add('expanded');
    let expandIcon = parentLi.querySelector('.expand-icon');
    if (!expandIcon) {
      expandIcon = document.createElement('span');
      expandIcon.className = 'expand-icon';
      parentLi.appendChild(expandIcon);
    }
    expandIcon.textContent = '▼';

    // Child-Panel (level+1) bereitstellen
    const panel = document.createElement('div');
    panel.className = 'tree-panel';
    panel.setAttribute('data-level', parentLevel + 1);

    const ul = document.createElement('ul');
    panel.appendChild(ul);

    // Resize-Handle wie gewohnt
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

    // Panel einhängen (rechts vom Parent-Panel)
    const treePanels = Array.from(document.querySelectorAll('.tree-panel'));
    const parentPanel = parentLi.closest('.tree-panel');
    if (parentPanel && parentPanel.nextSibling) {
      parentPanel.parentNode.insertBefore(panel, parentPanel.nextSibling);
    } else {
      document.getElementById('tree-container').appendChild(panel);
    }

    // Draft-Child-Knoten erzeugen
    const tmpId = `new-${Date.now()}`;
    const li = document.createElement('li');
    li.setAttribute('data-id', tmpId);
    li.classList.add('draft');
    li.setAttribute('data-parent-id', parentId);

    // Optik
    const container = document.createElement('div');
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.width = "100%";

    const iconImg = document.createElement('img');
    iconImg.src = "/static/images/knowledge_icon.webp";
    iconImg.alt = "Knowledge Icon";
    iconImg.className = "knowledge-icon";

    const textSpan = document.createElement('span');
    textSpan.textContent = "Neue Unterkategorie";

    container.appendChild(iconImg);
    container.appendChild(textSpan);
    li.appendChild(container);

    // Draft-Defaults
    const todayISO = formatDateISO(new Date());
    li.dataset.name = "";
    li.dataset.created = todayISO;
    li.dataset.changed = todayISO;
    li.dataset.childrenCount = "0";
    li.dataset.pkgCount = "0";

    // In Child-Panel einfügen (als erstes Element)
    ul.insertBefore(li, ul.firstChild);

    // Host-Kontext für CREATE konfigurieren
    host.dataset.mode = 'draft';
    host.dataset.categoryId = tmpId;           // Draft-ID
    host.dataset.parentId = String(parentId);  // WICHTIG: Parent = selektierte Kategorie
    delete host.dataset.insertDirection;
    delete host.dataset.refId;

    // Auswahl auf Draft setzen + Editor unten öffnen
    selectElement(li, true);
    const itemForPanel = { pk: tmpId, fields: { text: "", created: todayISO, changed: todayISO } };
    createCategoryPanel(itemForPanel, parentLevel + 2, { mode: 'draft' });

    // Parent: childrenCount im UI erhöhen (damit Pfeil sinnvoll bleibt)
    const count = parseInt(parentLi.dataset.childrenCount || '0', 10) || 0;
    parentLi.dataset.childrenCount = String(count + 1);
  }

  // ---- speichern: neue Kategorie ----
  // Ersetzt deine bestehende handleCategoryCreate
  async function handleCategoryCreate() {
    const host = getDetailsHost();
    const tempId   = host.dataset.categoryId;          // z. B. "new-1727..."
    const parentId = host.dataset.parentId || "";      // "" => Root
    const refIdStr = host.dataset.refId || "";         // Referenz-Knoten für before/after
    const direction = host.dataset.insertDirection || null; // 'before' | 'after' | null

    // Draft-LI finden
    const li = document.querySelector(`.tree-panel li[data-id="${CSS.escape(tempId)}"]:not([data-type])`);
    if (!li) { alert("Entwurf nicht gefunden."); return; }

    // Formular-Werte
    const nameEl    = host.querySelector('#cat-name');
    const changedEl = host.querySelector('#cat-changed');

    const name    = (nameEl?.value || "").trim();
    const created = host.dataset.categoryCreated || formatDateISO(new Date());
    const changed = (changedEl?.value || formatDateISO(new Date()));

    // Pflichtfeld: Name
    if (!name) {
      alert("Name muss angegeben werden");
      if (nameEl) nameEl.focus();
      return;
    }

    // Duplikatscheck im UI (gleiche Ebene: gleicher parent)
    if (typeof nameExistsOnLevel === 'function') {
      const dup = nameExistsOnLevel(name, parentId || null, null);
      if (dup) {
        alert("Name existiert auf dieser Ebene bereits.");
        if (nameEl) nameEl.focus();
        return;
      }
    }

    // Request-Payload
    const payload = {
      name,
      created,
      changed,
      parent_id: parentId ? parseInt(parentId, 10) : null
    };
    if (direction && refIdStr) {
      payload.direction = direction;                         // 'before' | 'after'
      payload.ref_id    = parseInt(refIdStr, 10);            // Referenz-Kategorie
    }

    try {
      const res = await fetch(`${API_BASE}/category/`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          [CSRF_HEADER_NAME]: getCookie('csrftoken') || ''
        },
        body: JSON.stringify(payload)
      });

      // Server meldet Duplikat hart mit 409?
      if (res.status === 409) {
        alert("Name existiert auf dieser Ebene bereits.");
        if (nameEl) nameEl.focus();
        return;
      }

      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new Error(`Anlegen fehlgeschlagen (${res.status}).\n${txt}`);
      }

      const data = await res.json(); // erwartet: {id, name, created, changed, children_count, pkg_count, sort_order}
      // Eltern-Unterkategorie finden und Badge erhöhen
      const nodeId = host.dataset.nodeId;
      const catLi = document.querySelector(`.tree-panel li:not([data-type])[data-id="${CSS.escape(String(nodeId))}"]`);
      if (catLi) {
        const cnt = (parseInt(catLi.dataset.pkgCount || '0', 10) || 0) + 1;
        catLi.dataset.pkgCount = String(cnt);
        updatePkgBadge(catLi, cnt);
      }

      // Draft-LI finalisieren
      li.setAttribute('data-id', String(data.id));
      li.classList.remove('draft');

      li.dataset.name    = data.name    || name;
      li.dataset.created = data.created || created;
      li.dataset.changed = data.changed || changed;
      li.dataset.childrenCount = String(data.children_count ?? li.dataset.childrenCount ?? 0);
      li.dataset.pkgCount      = String(data.pkg_count      ?? li.dataset.pkgCount      ?? 0);
      li.dataset.sortOrder     = String(data.sort_order     ?? li.dataset.sortOrder     ?? 0);

      const span = li.querySelector('span');
      if (span) span.textContent = li.dataset.name;

      // ... in handleCategoryCreate() NACH dem Finalisieren von li ...
      const parentIdAttr = host.dataset.parentId || "";
      if (parentIdAttr) {
        const parentLi = document.querySelector(`.tree-panel li:not([data-type])[data-id="${CSS.escape(parentIdAttr)}"]`);
        if (parentLi) {
          let exp = parentLi.querySelector('.expand-icon');
          if (!exp) {
            exp = document.createElement('span');
            exp.className = 'expand-icon';
            parentLi.appendChild(exp);
          }
          exp.textContent = '▼';
          parentLi.classList.add('expanded');
          // parentLi.dataset.childrenCount wird bereits im prepareSubcategoryInsert erhöht
        }
      }

      // Host-Kontext auf "edit" umstellen
      host.dataset.mode            = 'edit';
      host.dataset.categoryId      = String(data.id);
      host.dataset.categoryName    = li.dataset.name;
      host.dataset.categoryCreated = li.dataset.created;
      host.dataset.categoryChanged = li.dataset.changed;
      // Einfüge-Metas aufräumen (optional)
      delete host.dataset.insertDirection;
      delete host.dataset.refId;

      // Auswahl beibehalten & Panel neu rendern
      const level = parseInt(li.closest('.tree-panel')?.getAttribute('data-level') || '0', 10);
      selectElement(li, level > 0);

      const merged = {
        pk: data.id,
        fields: {
          text:    li.dataset.name,
          created: li.dataset.created,
          changed: li.dataset.changed
        }
      };
      await createCategoryPanel(merged, level + 1, { mode: 'edit' });

    } catch (err) {
      console.error(err);
      alert('Anlegen fehlgeschlagen. Details in der Konsole.');
    }
  }

  async function handleCategoryDelete() {
    const host = getDetailsHost();
    const mode = host.dataset.mode || 'edit';
    const idStr = host.dataset.categoryId;

    // Draft? → nur verwerfen
    if (mode === 'draft') {
      if (!confirm('Entwurf verwerfen?')) return;
      const li = document.querySelector(`.tree-panel li[data-id="${CSS.escape(idStr)}"]:not([data-type])`);
      if (li) li.remove();
      host.innerHTML = '';
      if (selectedElement && selectedElement.getAttribute('data-id') === idStr) {
        selectedElement = null;
      }
      return;
    }

    const id = parseInt(idStr || '', 10);
    if (!id) { alert('Keine Kategorie im Kontext.'); return; }

    const li = document.querySelector(`.tree-panel li[data-id="${id}"]:not([data-type])`);
    if (!li) { alert('Kategorie nicht gefunden.'); return; }

    // Warnhinweis mit Counts
    const ch = parseInt(li.dataset.childrenCount || '0', 10);
    const pk = parseInt(li.dataset.pkgCount || '0', 10);
    let msg = 'Kategorie wirklich löschen? Dies kann nicht rückgängig gemacht werden.';
    if (ch > 0 || pk > 0) {
      msg += `\n\nAchtung: Diese Kategorie enthält ${ch} Unterkategorie(n) und ${pk} Paket(e).`;
    }
    if (!confirm(msg)) return;

    try {
      const res = await fetch(`${API_BASE}/category/${id}/`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json',
          [CSRF_HEADER_NAME]: getCookie('csrftoken') || ''
        }
      });
      if (!res.ok && res.status !== 204) {
        const txt = await res.text().catch(()=>'');
        throw new Error(`Löschen fehlgeschlagen (${res.status}).\n${txt}`);
      }

      // DOM aufräumen
      const currentLevel = parseInt(li.closest('.tree-panel').getAttribute('data-level'), 10) || 0;

      // ggf. eingehängte Paket-Zeilen dieses Knotens entfernen
      document.querySelectorAll(`.tree-panel li[data-type="exercise-package"][data-parent-id="${id}"]`)
        .forEach(n => n.remove());

      // Panels rechts vom aktuellen Level schließen
      document.querySelectorAll('.tree-panel').forEach(p => {
        const lvl = parseInt(p.getAttribute('data-level'), 10);
        if (lvl > currentLevel) p.remove();
      });

      // Knoten entfernen
      li.remove();
      host.innerHTML = '';
      if (selectedElement && selectedElement.getAttribute('data-id') === String(id)) {
        selectedElement = null;
      }
    } catch (err) {
      console.error(err);
      alert('Löschen fehlgeschlagen. Details in der Konsole.');
    }
  }

  function preparePackageInsert(direction /* 'before' | 'after' */) {
    const host = getDetailsHost();

    // Referenz: aktuell selektiertes Paket oder – falls keins – die Subkategorie (is-ancestor)
    let refPkgLi = (selectedElement && selectedElement.getAttribute('data-type') === 'exercise-package')
      ? selectedElement
      : null;

    const ancestorCatLi = document.querySelector('.tree-panel li.is-ancestor')
                        || (selectedElement && !selectedElement.getAttribute('data-type') ? selectedElement : null);
    const nodeId = ancestorCatLi ? ancestorCatLi.getAttribute('data-id') : null;

    if (!nodeId) { alert('Keine Unterkategorie (node) im Kontext.'); return; }

    // Draft-ID
    const tmpId = `pkg-new-${Date.now()}`;
    const li = document.createElement('li');
    li.setAttribute('data-id', tmpId);
    li.setAttribute('data-type', 'exercise-package');
    li.setAttribute('data-parent-id', String(nodeId));
    li.classList.add('draft');

    // Optik & Label
    const container = document.createElement('div');
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.width = "100%";

    const iconImg = document.createElement('img');
    iconImg.src = "/static/images/package_icon.webp";
    iconImg.alt = "Package Icon";
    iconImg.className = "knowledge-icon";

    const textSpan = document.createElement('span');
    textSpan.textContent = "Neues Paket";

    container.appendChild(iconImg);
    container.appendChild(textSpan);
    li.appendChild(container);

    // Created/Changed heute
    const todayISO = formatDateISO(new Date());
    li.dataset.name = "";
    li.dataset.created = todayISO;
    li.dataset.changed = todayISO;

    // Einfügen: zwischen Pakete – oder falls noch keines, direkt hinter die Unterkategorie
    const ul = ancestorCatLi ? ancestorCatLi.parentElement : null;

    if (!refPkgLi) {
      // Falls kein Paket selektiert ist, setze ref auf erstes existierendes Paket unter dieser Unterkategorie
      refPkgLi = ul?.querySelector(`li[data-type="exercise-package"][data-parent-id="${CSS.escape(String(nodeId))}"]`) || null;
    }

    if (refPkgLi && direction === 'before') {
      refPkgLi.parentElement.insertBefore(li, refPkgLi);
    } else if (refPkgLi && direction === 'after') {
      refPkgLi.parentElement.insertBefore(li, refPkgLi.nextSibling);
    } else if (ancestorCatLi) {
      // kein refPkgLi vorhanden (erstes Paket) -> gleich hinter der Unterkategorie einhängen
      ancestorCatLi.parentElement.insertBefore(li, ancestorCatLi.nextSibling);
    } else {
      alert('Keine Position zum Einfügen gefunden.');
      return;
    }

    // Host-Kontext für CREATE
    host.dataset.mode = 'draft';
    host.dataset.packageId = tmpId;
    host.dataset.nodeId = String(nodeId);
    host.dataset.insertDirection = direction || '';
    host.dataset.refPkgId = refPkgLi ? (refPkgLi.getAttribute('data-id') || '') : '';

    // Draft auswählen & Editor anzeigen
    selectElement(li, true);
    createDetailPanel({
      id: tmpId,
      title: "",
      desc: "",
      created: todayISO,
      changed: todayISO,
      node: { id: Number(nodeId) }
    }, (parseInt(ancestorCatLi?.closest('.tree-panel')?.getAttribute('data-level') || '0', 10) + 2));
    // Eltern-Kategorie als Ancestor markieren (für konsistentes Verhalten)
    document.querySelectorAll('.tree-panel li.is-ancestor').forEach(n => n.classList.remove('is-ancestor'));
    if (ancestorCatLi) ancestorCatLi.classList.add('is-ancestor');

    // Button-Label auf „Neu anlegen“ ändern
    const createBtn = host.querySelector('.kt-actions [data-scope="package"][data-action="update"]');
    if (createBtn) createBtn.textContent = 'Neu anlegen';
  }

  async function handlePackageCreate() {
    const host   = getDetailsHost();
    const tempId = host.dataset.packageId;
    const liDraft = document.querySelector(`.tree-panel li[data-type="exercise-package"][data-id="${CSS.escape(tempId)}"]`)
                 || document.querySelector(`.tree-panel li.draft[data-id="${CSS.escape(tempId)}"]`);
    if (!liDraft) { alert('Entwurf nicht gefunden.'); return; }

    const nameEl    = host.querySelector('#pkg-name');
    const descEl    = host.querySelector('#pkg-desc');
    const changedEl = host.querySelector('#pkg-changed');

    const title   = (nameEl?.value || '').trim();
    if (!title) { alert('Name muss angegeben werden'); nameEl?.focus(); return; }

    const created = host.dataset.packageCreated || formatDateISO(new Date());
    const changed = (changedEl?.value || formatDateISO(new Date()));

    const payload = {
      title,
      desc: (descEl?.value || '').trim(),
      created,
      changed,
      node_id: parseInt(host.dataset.nodeId, 10) || null,
    };
    if (host.dataset.insertDirection && host.dataset.refPkgId) {
      payload.direction = host.dataset.insertDirection;
      payload.ref_id    = parseInt(host.dataset.refPkgId, 10);
    }

    const res = await fetch(`${API_BASE}/package/`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken') || ''
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const msg = await res.text().catch(()=> '');
      console.error(msg);
      alert('Anlegen fehlgeschlagen.');
      return;
    }

    const data = await res.json();
    const newId = data.id;

    // Host in "edit" umstellen
    host.dataset.mode           = 'edit';
    host.dataset.packageId      = String(newId);
    host.dataset.packageName    = data.title || title;
    host.dataset.packageChanged = data.changed || changed;

    // Eltern-Unterkategorie (als <li>) ermitteln
    const parentNodeId = liDraft.getAttribute('data-parent-id');
    const catLi = parentNodeId
        ? document.querySelector(`.tree-panel li:not([data-type])[data-id="${CSS.escape(parentNodeId)}"]`)
        : null;

    // Komplett neu rendern — sortiert nach serverseitigem sort_order
    // (entfernt automatisch den Draft-Knoten, weil alle Paket-LIs für diese Unterkategorie neu aufgebaut werden)
    if (catLi) {
      const cnt = (parseInt(catLi.dataset.pkgCount || '0', 10) || 0) + 1;
      updatePkgBadge(catLi, cnt);
      await rerenderPackagesForCategory(catLi, newId); // wählt newId direkt aus & zeigt Panel
    } else {
      // Fallback: Draft entfernen und nur Detailpanel anzeigen
      liDraft.remove();
      const full = await loadPackageDetails(newId);
      const parentLevel =  parseInt(document.querySelector('.tree-panel [data-id="'+parentNodeId+'"]')?.closest('.tree-panel')?.getAttribute('data-level') || '0', 10);
      if (full) await createDetailPanel(full, parentLevel + 2);
    }
  }


  async function handlePackageDelete() {
    const host = getDetailsHost();
    const id = parseInt(host.dataset.packageId || '', 10);
    if (!id) { alert('Kein Paket im Kontext.'); return; }

    const li = document.querySelector(`.tree-panel li[data-type="exercise-package"][data-id="${id}"]`);
    if (!li) { alert('Paket nicht im Baum gefunden.'); return; }

    const pkgName = host.dataset.packageName || li.dataset.name || li.querySelector('span')?.textContent || 'Paket';
    if (!confirm(`Paket „${pkgName}“ wirklich löschen? Dies kann nicht rückgängig gemacht werden.`)) return;

    try {
      const res = await fetch(`${API_BASE}/package/${id}/`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json',
          [CSRF_HEADER_NAME]: getCookie('csrftoken') || ''
        }
      });
      if (!res.ok && res.status !== 204) {
        const txt = await res.text().catch(()=>'');
        throw new Error(`Löschen fehlgeschlagen (${res.status}).\n${txt}`);
      }

      const parentId = li.getAttribute('data-parent-id');
      const parentLi = parentId
        ? document.querySelector(`.tree-panel li:not([data-type])[data-id="${CSS.escape(parentId)}"]`)
        : null;

      // Paket-Knoten aus dem Baum entfernen
      li.remove();

      // Detailbereich zurücksetzen
      host.innerHTML = '';
      host.dataset.panelOwner = '';
      delete host.dataset.packageId;
      delete host.dataset.packageName;
      delete host.dataset.packageCreated;
      delete host.dataset.packageChanged;

      // Eltern-Kategorie wieder auswählen & Panel zeigen
      if (parentLi) {
        // Zähler in der Eltern-Kategorie dekrementieren (falls genutzt)
        const cnt = Math.max(0, (parseInt(parentLi.dataset.pkgCount || '0', 10) || 0) - 1);
        parentLi.dataset.pkgCount = String(cnt);
        updatePkgBadge(parentLi, cnt);

        const parentLevel = parseInt(parentLi.closest('.tree-panel')?.getAttribute('data-level') || '0', 10);
        selectElement(parentLi, true);
        activatePathFor(parentLi);

        const merged = {
          pk: parentLi.getAttribute('data-id'),
          fields: {
            text:    parentLi.dataset.name    || parentLi.querySelector('span')?.textContent || '',
            created: parentLi.dataset.created || '',
            changed: parentLi.dataset.changed || ''
          }
        };
        await createCategoryPanel(merged, parentLevel + 1, { mode: 'edit', force: true });
      } else {
        removeDetailPanel();
        const bc = document.getElementById('kt-breadcrumb');
        if (bc) bc.innerHTML = '';      }
    } catch (err) {
      console.error(err);
      alert('Löschen fehlgeschlagen. Details in der Konsole.');
    }
  }


  // ---- speichern: bestehende Kategorie ----
  async function handleCategoryUpdate() {
    const host = getDetailsHost();
    const id = parseInt(host.dataset.categoryId || "", 10);
    if (!id) { alert("Keine Kategorie im Kontext."); return; }

    const li = document.querySelector(`.tree-panel li[data-id="${id}"]:not([data-type])`);
    if (!li) { alert("Kategorie nicht gefunden."); return; }
    const parentId = li.getAttribute('data-parent-id') || null;

    const nameEl    = host.querySelector('#cat-name');
    const changedEl = host.querySelector('#cat-changed');
    const newName     = (nameEl?.value || "").trim();
    const newChanged  = (changedEl?.value || "").trim();
    const oldName    = host.dataset.categoryName || "";
    const oldChanged = host.dataset.categoryChanged || "";

    if (!newName) {
      alert("Name muss angegeben werden");
      nameEl?.focus();
      return;
    }

    // ➜ NEU: Duplikatscheck (außer eigener Knoten)
    if (nameExistsOnLevel(newName, parentId, id)) {
      alert("Name existiert auf dieser Ebene bereits.");
      nameEl?.focus();
      return;
    }

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

      if (res.status === 409) {
        alert("Name existiert auf dieser Ebene bereits.");
        nameEl?.focus();
        return;
      }

      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new Error(`Update fehlgeschlagen (${res.status}).\n${txt}`);
      }
      const data = await res.json();

      const textSpan = li.querySelector('span');
      li.dataset.name    = (data.name    || newName)    || '';
      li.dataset.created = (data.created || li.dataset.created) || '';
      li.dataset.changed = (data.changed || newChanged) || '';
      li.dataset.childrenCount = String(data.children_count ?? li.dataset.childrenCount ?? 0);
      li.dataset.pkgCount      = String(data.pkg_count      ?? li.dataset.pkgCount      ?? 0);
      if (textSpan) textSpan.textContent = data.name || newName;

      host.dataset.categoryName    = data.name    || newName;
      host.dataset.categoryChanged = data.changed || newChanged;
      if (data.created) host.dataset.categoryCreated = data.created;

      if (data.changed || newChanged) {
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

  async function handlePackageUpdate() {
    const host = getDetailsHost();
    const id = parseInt(host.dataset.packageId || '', 10);
    if (!id) { alert('Kein Paket im Kontext.'); return; }

    const nameEl    = host.querySelector('#pkg-name');
    const changedEl = host.querySelector('#pkg-changed');
    const descEl    = host.querySelector('#pkg-desc');

    const newTitle   = (nameEl?.value || '').trim();
    const newChanged = (changedEl?.value || '').trim();
    const newDesc    = (descEl?.value || '').trim();

    if (!newTitle) {
      alert('Name muss angegeben werden');
      nameEl?.focus();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/package/${id}/`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken') || ''
        },
        body: JSON.stringify({
          title: newTitle,
          desc: newDesc,
          changed: newChanged || undefined
        })
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new Error(`Update fehlgeschlagen (${res.status}).\n${txt}`);
      }
      const data = await res.json();
      const changedEl = host.querySelector('#pkg-changed');
      if (changedEl && (data.changed || newChanged)) {
        changedEl.value = data.changed ? formatDateISO(data.changed) : newChanged;
      }
      // 1) Label im Baum aktualisieren
      const li = document.querySelector(`.tree-panel li[data-type="exercise-package"][data-id="${id}"]`);
      if (li) {
        li.dataset.name = data.title || newTitle;
        const span = li.querySelector('span');
        if (span) span.textContent = li.dataset.name;
      }

      // 2) Panel-Daten aktualisieren
      host.dataset.packageName    = data.title   || newTitle;
      host.dataset.packageChanged = data.changed || newChanged;

      if (changedEl && (data.changed || newChanged)) {
        changedEl.value = data.changed ? formatDateISO(data.changed) : newChanged;
      }
      // Name/Desc sind schon gesetzt (Inputs)

      console.log('Paket gespeichert:', data);
    } catch (err) {
      console.error(err);
      alert('Speichern fehlgeschlagen. Details in der Konsole.');
    }
  }

  function discardDraftPackage() {
    const host = getDetailsHost();

    // Draft-Paket finden (präferiert via Host-ID, sonst generisch)
    const draftId = host.dataset.mode === 'draft' ? host.dataset.packageId : null;
    const sel = draftId
      ? `.tree-panel li.draft[data-type="exercise-package"][data-id="${CSS.escape(draftId)}"]`
      : `.tree-panel li.draft[data-type="exercise-package"]`;
    const draftLi = document.querySelector(sel);
    if (!draftLi) return;

    const parentId = draftLi.getAttribute('data-parent-id') || '';
    // Draft entfernen
    draftLi.remove();

    // Detailbereich & Host-Kontext bereinigen
    host.innerHTML = '';
    host.dataset.mode = 'edit';
    host.dataset.panelOwner = '';
    delete host.dataset.packageId;
    delete host.dataset.packageName;
    delete host.dataset.packageCreated;
    delete host.dataset.packageChanged;
    delete host.dataset.nodeId;
    delete host.dataset.insertDirection;
    delete host.dataset.refPkgId;

    if (selectedElement === draftLi) selectedElement = null;

    // Zur Eltern-Kategorie zurückspringen und Panel zeigen
    if (parentId) {
      const catLi = document.querySelector(`.tree-panel li:not([data-type])[data-id="${CSS.escape(parentId)}"]`);
      if (catLi) {
        const level = parseInt(catLi.closest('.tree-panel')?.getAttribute('data-level') || '0', 10);
        selectElement(catLi, true);
        activatePathFor(catLi);
        catLi.classList.add('is-ancestor');

        const merged = {
          pk: catLi.getAttribute('data-id'),
          fields: {
            text:    catLi.dataset.name    || catLi.querySelector('span')?.textContent || '',
            created: catLi.dataset.created || '',
            changed: catLi.dataset.changed || ''
          }
        };
        createCategoryPanel(merged, level + 1, { mode: 'edit', force: true });
      } else {
        removeDetailPanel();
      }
    } else {
      removeDetailPanel();
    }
  }

  function updatePkgBadge(catLi, explicitCount) {
    if (!catLi) return;
    const container = catLi.firstElementChild; // dein <div> mit Icon + Text (+ meta)
    if (!container) return;

    // Count bestimmen
    const count = (typeof explicitCount === 'number')
      ? explicitCount
      : (parseInt(catLi.dataset.pkgCount || '0', 10) || 0);

    // NEU: Meta-Container finden/erzeugen
    let meta = container.querySelector('.row-meta');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'row-meta';
      container.appendChild(meta);
    }

    let badge = meta.querySelector('.pkg-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'pkg-badge';
        meta.insertBefore(badge, meta.querySelector('.expand-icon') || null); // Badge links, Pfeil rechts
      }
      badge.textContent = `📦 ${count}`;
    } else if (badge) {
      badge.remove();
    }
  }


  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.kt-btn[data-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation(); // kleine Extra-Sicherheit

    const { scope, action } = btn.dataset;

    if (scope === 'package') {
      if (action === 'insert-before') { preparePackageInsert('before'); return; }
      if (action === 'insert-after')  { preparePackageInsert('after');  return; }
      if (action === 'insert-first') {
        // erstes Paket – nutzt dieselbe Insert-Logik, refPkg ist automatisch leer
        preparePackageInsert('after');
        return;
      }
      if (action === 'update') {
        const host = getDetailsHost();
        if (host?.dataset.mode === 'draft') { handlePackageCreate(); }
        else { handlePackageUpdate(); }
        return;
      }
      if (action === 'discard') {
        discardDraftPackage();          // <— NEU: gezielt Paket-Draft verwerfen
        return;
      }
      if (action === 'delete') {
        handlePackageDelete();
        return;
      }
    }
    if (scope === 'category') {
      if (action === 'insert-before') { prepareCategoryInsert('before'); return; }
      if (action === 'insert-after')  { prepareCategoryInsert('after');  return; }
      if (action === 'insert-child') { prepareSubcategoryInsert(); return; }
      if (action === 'update') {
        const host = getDetailsHost();
        if (host?.dataset.mode === 'draft') { handleCategoryCreate(); }
        else { handleCategoryUpdate(); }
        return;
      }
      if (action === 'discard') {      // <— NEU
        discardDraftCategory();
        return;
      }
      if (action === 'delete') {       // (falls schon implementiert)
        handleCategoryDelete && handleCategoryDelete();
        return;
      }
    }
  });

  function discardDraftIfOther(clickedLi) {
    const draftLi = document.querySelector('.tree-panel li.draft');
    if (!draftLi) return;
    if (clickedLi && draftLi === clickedLi) return; // eigener Draft -> behalten

    // Host leeren, wenn Panel im Draft-Modus war
    const host = getDetailsHost();
    if (host.dataset.mode === 'draft') {
      host.innerHTML = '';
      host.dataset.mode = 'edit';
      delete host.dataset.categoryId;
      delete host.dataset.parentId;
      delete host.dataset.categoryName;
      delete host.dataset.categoryCreated;
      delete host.dataset.categoryChanged;
    }
    draftLi.remove();

    // ... host reset & selectedElement reset wie gehabt ...
    const fallbackId = host.dataset.prevSelectedId || host.dataset.refId || '';
    // Wenn wir gerade auf einen anderen Knoten klicken, übernimmt DER die Auswahl.
    // Nur wenn NICHT geklickt wurde (z. B. Verwerfen), selektieren wir die alte Auswahl.
    if (!clickedLi) {
      restoreLastStableSelection(fallbackId);
    }
  }

  function discardDraftCategory() {
    const host = getDetailsHost();
    const draftId = host.dataset.mode === 'draft' ? host.dataset.categoryId : null;
    const draftSel = draftId
      ? `.tree-panel li.draft[data-id="${CSS.escape(draftId)}"]`
      : '.tree-panel li.draft';
    const draftLi = document.querySelector(draftSel);
    if (!draftLi) return;

    // Draft entfernen
    draftLi.remove();

    // Detailbereich bereinigen
    host.innerHTML = '';
    host.dataset.mode = 'edit';
    const prevId = host.dataset.prevSelectedId || host.dataset.refId || '';

    // Context-Attribute aufräumen
    delete host.dataset.categoryId;
    delete host.dataset.parentId;
    delete host.dataset.prevSelectedId;
    delete host.dataset.refId;
    delete host.dataset.categoryName;
    delete host.dataset.categoryCreated;
    delete host.dataset.categoryChanged;

    if (selectedElement === draftLi) selectedElement = null;

    // Letzte stabile Auswahl & Panel wiederherstellen
    restoreLastStableSelection(prevId);
  }


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
