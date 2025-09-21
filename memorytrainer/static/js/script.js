/* Knowledge-Tree (ported from memorytrainer_old, adapted to new /api endpoints)
 * Expects:
 *   - window.API_BASE (String) e.g. "/api" (fallbacks to "/api")
 * Uses endpoints:
 *   GET  ${API_BASE}/categories/                         -> [ {id, name, children_count, pkg_count}, ... ]  ODER {categories:[...]}
 *   GET  ${API_BASE}/get_subcategories/<category_id>/    -> [ {id, name, children_count, pkg_count}, ... ]  ODER {subcategories:[...]}
 *   GET  ${API_BASE}/get_details/<category_id>/<sub_id>/ -> { items: [ {id, title, desc, created, changed}, ... ] } ODER {packages:[...]} ODER [...]
 *   GET  ${API_BASE}/package/<package_id>/               -> {id, title, desc, node:{...}, created, changed}
 */
(function () {
  const API_BASE = (typeof window.API_BASE === "string" && window.API_BASE) ? window.API_BASE : "/api";

  const treeContainer = document.getElementById('tree-container');
  if (!treeContainer) return;

  // ------ NEU: Host-Container für Paketdetails unterhalb des Trees ------
  function getDetailsHost() {
    let host = document.getElementById('package-details');
    if (!host) {
      host = document.createElement('div');
      host.id = 'package-details';
      host.className = 'package-details';
      // direkt UNTERHALB der treeContainer-Section einfügen
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

  function adjustPanelWidth(panel) {
    const content = panel.querySelector('.detail-content');
    const contentWidth = content ? content.scrollWidth : 420;
    panel.style.width = `${contentWidth + 40}px`;
  }

  // ------ GEÄNDERT: Details unten statt rechts anzeigen ------
  async function createDetailPanel(packageData, level) {
    removeDetailPanel();

    const detailPanel = document.createElement('div');
    detailPanel.className = 'detail-panel';
    detailPanel.setAttribute('data-level', level);
    // Volle Breite unter dem Tree
    detailPanel.style.marginTop = '12px';
    detailPanel.style.width = '100%';
    detailPanel.style.boxSizing = 'border-box';

    const detailContent = document.createElement('div');
    detailContent.className = 'detail-content';
    const formattedCreateDate = formatDate(packageData.created);
    const formattedChangeDate = formatDate(packageData.changed);

    detailContent.innerHTML = `
      <h2>${packageData.title ?? 'Paket'}</h2>
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
    `;
    detailPanel.appendChild(detailContent);

    // NEU: unten unter dem gesamten Tree einfügen (kein Rechts-Panel, kein Resizer)
    const host = getDetailsHost();
    host.innerHTML = '';                 // jeweils ersetzen
    host.appendChild(detailPanel);
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      const txt = await res.text().catch(()=> ''); throw new Error(`HTTP ${res.status}: ${url}\n${txt}`);
    }
    return res.json();
  }

  async function loadPackageDetails(packageId) {
    const data = await fetchJSON(`${API_BASE}/package/${encodeURIComponent(packageId)}/`);
    return data;
  }

  async function fetchRoots() {
    const data = await fetchJSON(`${API_BASE}/categories/`);
    const arr = Array.isArray(data) ? data : (data.categories || []);
    return arr.map(n => ({ pk: n.id, fields: { text: n.name }, children_count: n.children_count, pkg_count: n.pkg_count }));
  }

  async function fetchSubcategories(categoryId) {
    const data = await fetchJSON(`${API_BASE}/get_subcategories/${encodeURIComponent(categoryId)}/`);
    const arr = Array.isArray(data) ? data : (data.subcategories || []);
    return arr.map(n => ({ pk: n.id, fields: { text: n.name }, children_count: n.children_count, pkg_count: n.pkg_count }));
  }

  async function fetchPackages(categoryId, subId) {
    const data = await fetchJSON(`${API_BASE}/get_details/${encodeURIComponent(categoryId)}/${encodeURIComponent(subId)}/`);
    const items =
      Array.isArray(data?.items)    ? data.items :
      Array.isArray(data?.packages) ? data.packages :
      Array.isArray(data)           ? data : [];
    return items.map(p => ({ pk: p.id, fields: { packageName: p.title, packageDescription: p.desc, createDate: p.created, changeDate: p.changed } }));
  }

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

      const hasChildren = (typeof item.children_count === 'number') ? item.children_count > 0 : false;
      if (hasChildren) {
        const expandIcon = document.createElement('span');
        expandIcon.textContent = '▶';
        expandIcon.className = 'expand-icon';
        li.appendChild(expandIcon);
      }

      li.addEventListener('click', async (event) => {
        event.stopPropagation();

        const currentLevel = parseInt(li.closest('.tree-panel').getAttribute('data-level'));
        selectElement(li, currentLevel > 0);

        // Bei Navigation im Baum Details schließen
        removeDetailPanel();

        // Siblings im gleichen Level zurücksetzen
        document.querySelectorAll(`.tree-panel[data-level="${currentLevel}"] li`).forEach(otherLi => {
          if (otherLi !== li) {
            const otherIcon = otherLi.querySelector('.expand-icon');
            if (otherIcon) otherIcon.textContent = '▶';
            otherLi.classList.remove('expanded');
          }
        });

        const expandIcon = li.querySelector('.expand-icon');

        // Alle tieferen Ebenen rechts entfernen
        document.querySelectorAll('.tree-panel').forEach(p => {
          const lvl = parseInt(p.getAttribute('data-level'));
          if (lvl > currentLevel) p.remove();
        });

        if (li.classList.contains('expanded')) {
          li.classList.remove('expanded');
          if (expandIcon) expandIcon.textContent = '▶';
          removeDetailPanel();
          return;
        }

        li.classList.add('expanded');
        if (expandIcon) expandIcon.textContent = '▼';

        // nächste Ebene laden (nur wenn geöffnet)
        const nextItems = await fetchSubcategories(item.pk);
        if (nextItems.length > 0) {
          await createPanel(nextItems, level + 1, false, item.pk, null);
        }

        // In Unterebenen: Pakete laden
        if (parentId != null && level >= 1) {
          try {
            const pkgs = await fetchPackages(parentId, item.pk);
            ul.querySelectorAll('li[data-type="exercise-package"]').forEach(n => n.remove());
            if (pkgs.length > 0) {
              pkgs.forEach(pkg => {
                const packageLi = document.createElement('li');
                packageLi.setAttribute('data-id', pkg.pk);
                packageLi.setAttribute('data-type', 'exercise-package');

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
                  const data = await loadPackageDetails(pkg.pk);
                  if (data) await createDetailPanel(data, level + 2); // jetzt unten statt rechts
                });

                ul.appendChild(packageLi);
              });
            } else {
              removeDetailPanel();
            }
          } catch (e) {
            console.error(e);
          }
        }
      });

      ul.appendChild(li);
      if (!firstLi) firstLi = li;
    } // end for items

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
