// JSON-Daten der Wurzelknoten (vom Server bereitgestellt)
const roots = JSON.parse('[{"model": "memorytrainer.treenode", "pk": 1, "fields": {"text": "1. Naturwissenschaften", "parent": null}}, {"model": "memorytrainer.treenode", "pk": 2, "fields": {"text": "2. Geisteswissenschaften", "parent": null}}, {"model": "memorytrainer.treenode", "pk": 3, "fields": {"text": "3. Sozialwissenschaften", "parent": null}}, {"model": "memorytrainer.treenode", "pk": 4, "fields": {"text": "4. Technologie und Ingenieurwesen", "parent": null}}, {"model": "memorytrainer.treenode", "pk": 5, "fields": {"text": "5. Lebenswissenschaften", "parent": null}}, {"model": "memorytrainer.treenode", "pk": 6, "fields": {"text": "6. Bildung und Allgemeinwissen", "parent": null}}]');

const treeContainer = document.getElementById('tree-container');
let selectedElement = null;
const nodeCache = new Map();

// Funktion zum Markieren des ausgewählten Elements
function selectElement(li, isChildClick = false) {
    if (selectedElement) {
        selectedElement.classList.remove('selected');

        // Reset the expanded state of the previously selected element ONLY if it's a root node
        // and the new selection is not a child of the current root.
        if (!isChildClick) {
            selectedElement.classList.remove('expanded');
            const expandIcon = selectedElement.querySelector('.expand-icon');
            if (expandIcon) {
                expandIcon.textContent = '▶';
            }
        }
    }
    li.classList.add('selected');
    selectedElement = li;
}

// Funktion zum Entfernen des Detail-Panels
function removeDetailPanel() {
    const existingDetailPanel = document.querySelector('.detail-panel');
    if (existingDetailPanel) {
        existingDetailPanel.remove();
    }
}

// Hilfsfunktion zur Formatierung des Datums
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = {
        weekday: 'long', // Wochentag (z. B. "Mittwoch")
        day: 'numeric',  // Tag (z. B. "26")
        month: 'long',   // Monat (z. B. "Februar")
        year: 'numeric'  // Jahr (z. B. "2025")
    };
    return date.toLocaleDateString('de-DE', options);
}

async function createDetailPanel(packageData, level) {
    // Entferne das bestehende Detail-Panel, falls vorhanden
    removeDetailPanel();

    const detailPanel = document.createElement('div');
    detailPanel.className = 'detail-panel';
    detailPanel.setAttribute('data-level', level);

    // Formatierte Datumsangaben
    const formattedCreateDate = formatDate(packageData.createDate);
    const formattedChangeDate = formatDate(packageData.changeDate);

    const detailContent = document.createElement('div');
    detailContent.className = 'detail-content';
    detailContent.innerHTML = `            
    <h3 class="package-title">${packageData.packageName}</h3>
    <p class="package-description">${packageData.packageDescription}</p>
    <hr class="date-separator">
    <div class="date-container">
        <div class="date-labels">
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

    // Nur den rechten Verschiebebalken hinzufügen (keinen linken Balken)
    const rightResizeHandle = document.createElement('div');
    rightResizeHandle.className = 'resize-handle right-resize-handle';
    rightResizeHandle.addEventListener('mousedown', initResize);
    detailPanel.appendChild(rightResizeHandle);

    treeContainer.appendChild(detailPanel);

    // Breite des Panels an den längsten Text anpassen
    adjustPanelWidth(detailPanel);
}

// Funktion zum Anpassen der Breite des Panels
function adjustPanelWidth(panel) {
    const content = panel.querySelector('.detail-content');
    const contentWidth = content.scrollWidth;
    panel.style.width = `${contentWidth + 40}px`; // 40px für Padding und Verschiebebalken
}

// Funktion zum Laden der Detailinformationen eines Übungspakets
async function loadPackageDetails(packageId) {
    try {
        const response = await fetch(`/package/${packageId}/`);
        if (!response.ok) throw new Error('Fehler beim Laden der Paketdetails');

        const packageData = await response.json();
        return packageData;
    } catch (error) {
        console.error('Fehler:', error);
        return null;
    }
}

// Hauptfunktion zum Erstellen eines Panels
async function createPanel(items, level, autoSelectFirst = false) {
    const panel = document.createElement('div');
    panel.className = 'tree-panel';
    panel.setAttribute('data-level', level);

    const ul = document.createElement('ul');

    items.sort((a, b) => a.pk - b.pk);

    let firstLi = null;

    for (const item of items) {
        // Erstelle das LI-Element für die Kategorie
        const li = document.createElement('li');
        li.setAttribute('data-id', item.pk);

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

        // Prüfe, ob die Kategorie Unterkategorien hat
        const hasChildren = await checkHasChildren(item);
        if (hasChildren) {
            const expandIcon = document.createElement('span');
            expandIcon.textContent = '▶';
            expandIcon.className = 'expand-icon';
            container.appendChild(expandIcon);
        }

        // Event-Listener für das Klicken auf eine Kategorie
        li.addEventListener('click', async (event) => {
            event.stopPropagation();

            // Entferne das Detail-Panel, falls vorhanden
            removeDetailPanel();

            // Schließe alle geöffneten Ebenen rechts daneben
            document.querySelectorAll(`.tree-panel`).forEach(panel => {
                if (parseInt(panel.getAttribute('data-level')) > level) {
                    panel.remove();
                } else {
                    if (!hasChildren && level === 0) {
                        const expandIcon = panel.querySelector('.expand-icon');
                        if (expandIcon) {
                            expandIcon.textContent = '▶';
                        }
                    }
                }
            });

            const isChildClick = level > 0; // Prüfe, ob es sich um einen Kind-Knoten handelt
            selectElement(li, isChildClick);

            li.classList.add('expanded');
            toggleExpand(li);
            if (hasChildren) {
                const lastExpandedIcon = li.querySelector('.expand-icon');
                lastExpandedIcon.textContent = '▼';
                await loadChildren(item, level + 1, false);
            }
        });

        ul.appendChild(li);
        if (!firstLi) firstLi = li;

        // Füge ExercisePackages hinzu, falls vorhanden
        if (item.exercise_packages && item.exercise_packages.length > 0) {
            item.exercise_packages.forEach(package => {
                const packageLi = document.createElement('li');
                packageLi.setAttribute('data-id', package.pk);
                packageLi.setAttribute('data-type', 'exercise-package');

                const packageContainer = document.createElement('div');
                packageContainer.className = "package-container"; // Neue Klasse für das Styling
                packageContainer.style.display = "flex";
                packageContainer.style.alignItems = "center";
                packageContainer.style.justifyContent = "center"; // Zentriert den gesamten Inhalt horizontal
                packageContainer.style.width = "100%";

                const packageIconImg = document.createElement('img');
                packageIconImg.src = "/static/images/package_icon.webp"; // Icon für ExercisePackages
                packageIconImg.alt = "Package Icon";
                packageIconImg.className = "knowledge-icon";

                const packageTextSpan = document.createElement('span');
                packageTextSpan.textContent = package.fields.packageName;

                packageContainer.appendChild(packageIconImg);
                packageContainer.appendChild(packageTextSpan);
                packageLi.appendChild(packageContainer);

                // Event-Listener für das Klicken auf ein Übungspaket
                packageLi.addEventListener('click', async (event) => {
                    event.stopPropagation();

                    // Entferne das Detail-Panel, falls vorhanden
                    removeDetailPanel();

                    // Schließe alle geöffneten Ebenen rechts daneben
                    document.querySelectorAll(`.tree-panel`).forEach(panel => {
                        if (parseInt(panel.getAttribute('data-level')) > level) {
                            panel.remove();
                        }
                    });

                    // Markiere das ausgewählte Paket
                    selectElement(packageLi);

                    // Lade die Detailinformationen des Pakets
                    const packageData = await loadPackageDetails(package.pk);
                    if (packageData) {
                        // Erstelle ein neues Panel für die Detailinformationen
                        await createDetailPanel(packageData, level + 1);
                    }
                });

                ul.appendChild(packageLi);
            });
        }
    }

    panel.appendChild(ul);

    // Resize-Handle hinzufügen
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.addEventListener('mousedown', initResize);
    panel.appendChild(resizeHandle);

    treeContainer.appendChild(panel);

    // Automatisch das erste Element auswählen, falls gewünscht
    if (autoSelectFirst && firstLi) {
        selectElement(firstLi);
        firstLi.classList.add("expanded");

        const firstItemId = firstLi.getAttribute("data-id");
        const expandIcon = firstLi.querySelector(".expand-icon");
        if (expandIcon) expandIcon.textContent = "▼";

        if (await checkHasChildren({ pk: firstItemId })) {
            await loadChildren({ pk: firstItemId }, level + 1, false);
        }
    }
}

// Funktion zum Laden der Unterkategorien
async function loadChildren(item, level, autoSelect = false) {
    try {
        const response = await fetch(`/get_subcategories/${item.pk}/`);
        if (!response.ok) throw new Error('Fehler beim Laden der Unterkategorien');

        const data = await response.json();
        const children = data.subcategories;

        // Sortiere Unterkategorien, um die Reihenfolge zu erhalten
        children.sort((a, b) => a.pk - b.pk);

        // Erstelle das Panel für die Unterkategorien
        await createPanel(children, level, autoSelect);
    } catch (error) {
        console.error('Fehler:', error);
        alert('Es gab ein Problem beim Laden der Daten.');
    }
}

// Prüft, ob ein Knoten Unterkategorien hat (Caching für weniger API-Anfragen)
async function checkHasChildren(item) {
    console.log(`🔍 Prüfe, ob ID ${item.pk} Unterkategorien hat...`);

    try {
        const response = await fetch(`/get_subcategories/${item.pk}/`);
        if (!response.ok) throw new Error('❌ Fehler beim Prüfen der Unterkategorien');

        const data = await response.json();
        console.log(`✅ API-Antwort für ${item.pk}:`, data); // Debugging

        // Prüfen, ob `subcategories` vorhanden ist
        if (!data || typeof data !== "object") {
            console.log(`❌ API-Antwort ist nicht wie erwartet:`, data);
            return false;
        }

        if (!Array.isArray(data.subcategories)) {
            console.log(`❌ "subcategories" ist kein Array:`, data.subcategories);
            return false;
        }

        console.log(`🔄 Anzahl der Unterkategorien für ${item.pk}: ${data.subcategories.length}`);

        return data.subcategories.length > 0;
    } catch (error) {
        console.error('Fehler:', error);
        return false;
    }
}

// Funktion zum Ein- und Ausklappen von Knoten
function toggleExpand(li) {
    const currentLevel = parseInt(li.closest('.tree-panel').getAttribute('data-level'));
    const nodeId = li.getAttribute("data-id"); // ID des aktuell selektierten Knotens

    // 1️⃣ Alle anderen Knoten auf der gleichen Ebene zurücksetzen
    document.querySelectorAll(`.tree-panel[data-level="${currentLevel}"] li`).forEach(otherLi => {
        const otherIcon = otherLi.querySelector('.expand-icon');
        const otherNodeId = otherLi.getAttribute("data-id");

        // Falls der andere Knoten expanded ist, aber seine Unterknoten nicht mehr sichtbar sind
        if (otherIcon && otherLi !== li) {
            otherIcon.textContent = '▶';
        }
    });

    const expandIcon = li.querySelector('.expand-icon');
    if (!expandIcon) return;

    // 2️⃣ Entferne ALLE tieferen Ebenen (die nicht zum aktuellen Knoten gehören)
    document.querySelectorAll(`.tree-panel[data-level="${currentLevel + 1}"]`).forEach(panel => {
        if (!panel.querySelector(`[data-parent-id="${nodeId}"]`)) {
            panel.remove();
        }
    });

    // 3️⃣ Toggle für den aktuell angeklickten Knoten
    if (li.classList.contains('expanded')) {
        li.classList.remove('expanded');
        expandIcon.textContent = '▶';
    } else {
        li.classList.add('expanded');
        expandIcon.textContent = '▼';
    }
}

// Funktion zur Größenänderung eines Panels
function initResize(e) {
    const panel = e.target.parentElement;
    const startX = e.clientX;
    const startWidth = parseInt(getComputedStyle(panel).width, 10);

    function doResize(e) {
        panel.style.width = `${startWidth + e.clientX - startX}px`;
    }

    function stopResize() {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
    }

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
}

// **Erstes Panel laden & erste Ebene direkt öffnen**
createPanel(roots, 0, true);