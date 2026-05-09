const days = [
  { full: "Lunedì", short: "LUN" },
  { full: "Martedì", short: "MAR" },
  { full: "Mercoledì", short: "MER" },
  { full: "Giovedì", short: "GIO" },
  { full: "Venerdì", short: "VEN" },
  { full: "Sabato", short: "SAB" },
  { full: "Domenica", short: "DOM" },
];

const mealTypes = [
  { key: "colazione", label: "Colazione", icon: "☀️" },
  { key: "pranzo", label: "Pranzo", icon: "🥗" },
  { key: "cena", label: "Cena", icon: "🍽️" },
];

const STORAGE_KEY_V3 = "planeats-products-v3";
const LEGACY_STORAGE_KEY = "planeats-products-v1";

const mealCards = document.getElementById("meal-cards");
const daySelector = document.getElementById("day-selector");
const viewsTrack = document.getElementById("views-track");
const viewsViewport = document.getElementById("views-viewport");
const navButtons = Array.from(document.querySelectorAll(".nav-pill"));
const spesaView = document.getElementById("spesa-view");
const ricetteView = document.getElementById("ricette-view");
const clearWeekButton = document.getElementById("clear-week-button");
const views = ["menu", "spesa", "ricette"];

let selectedDay = getCurrentDay();
let currentView = "menu";
let editingRecipeId = null;
const state = loadState();

render();
setupNavigation();
setupSwipe();
setupClearWeekButton();

function render() {
  renderDays();
  renderMealsForSelectedDay();
  renderSimpleView({
    target: spesaView,
    title: "Spesa",
    icon: "🛒",
    data: state.days[selectedDay].spesa,
    placeholder: "Aggiungi prodotto alla spesa",
  });
  renderRecipesView();
  renderCurrentView();
}

function renderDays() {
  daySelector.innerHTML = "";

  days.forEach((day) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-chip";
    if (day.full === selectedDay) {
      button.classList.add("active");
    }
    button.textContent = day.short;
    button.addEventListener("click", () => {
      selectedDay = day.full;
      render();
    });
    daySelector.appendChild(button);
  });
}

function renderMealsForSelectedDay() {
  mealCards.innerHTML = "";

  mealTypes.forEach((mealType) => {
    const card = document.createElement("article");
    card.className = "meal-card";

    const head = document.createElement("div");
    head.className = "meal-head";
    head.innerHTML = `
      <span class="meal-icon">${mealType.icon}</span>
      <h2 class="meal-title">${mealType.label}</h2>
    `;
    card.appendChild(head);

    const question = document.createElement("p");
    question.className = "meal-question";
    question.textContent = "Cosa mangi?";
    card.appendChild(question);

    const form = document.createElement("form");
    form.className = "meal-form";

    const input = document.createElement("input");
    input.className = "meal-input";
    input.type = "text";
    input.placeholder = "Scrivi ingredienti o piatto";
    input.required = true;

    const addButton = document.createElement("button");
    addButton.type = "submit";
    addButton.className = "add-btn";
    addButton.textContent = "Aggiungi";

    form.appendChild(input);
    form.appendChild(addButton);
    card.appendChild(form);

    const list = document.createElement("ul");
    list.className = "items-list";

    const items = state.days[selectedDay][mealType.key];
    if (items.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "empty";
      emptyItem.textContent = "Nessun elemento";
      list.appendChild(emptyItem);
    } else {
      items.forEach((item) => {
        list.appendChild(
          buildItemElement(items, item, {
            showCheckbox: false,
            onAfterChange: renderMealsForSelectedDay,
          })
        );
      });
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) {
        return;
      }

      const linkedRecipe = findRecipeByTitle(value);
      items.push({
        id: crypto.randomUUID(),
        name: value,
        done: false,
        recipeId: linkedRecipe?.id || null,
      });

      if (linkedRecipe) {
        syncRecipeIngredientsToSpesa(selectedDay, linkedRecipe);
      }

      input.value = "";
      saveState();
      render();
    });

    const clearMealBtn = document.createElement("button");
    clearMealBtn.type = "button";
    clearMealBtn.className = "btn-action btn-remove clear-meal-button";
    clearMealBtn.textContent = "Cancella";
    clearMealBtn.addEventListener("click", () => {
      if (items.length === 0) return;
      const ok = window.confirm(
        `Cancellare tutte le portate di ${mealType.label} per ${selectedDay}?`
      );
      if (!ok) return;

      const recipeIdsToRemove = Array.from(
        new Set(
          items
            .map((entry) =>
              typeof entry?.recipeId === "string" && entry.recipeId.length > 0
                ? entry.recipeId
                : null
            )
            .filter(Boolean)
        )
      );

      state.days[selectedDay][mealType.key] = [];
      recipeIdsToRemove.forEach((recipeId) => {
        removeRecipeIngredientsFromSpesaForDay(selectedDay, recipeId);
      });
      saveState();
      renderMealsForSelectedDay();
    });

    card.appendChild(clearMealBtn);

    card.appendChild(list);
    mealCards.appendChild(card);
  });
}

function renderRecipesView() {
  ricetteView.innerHTML = "";

  const head = document.createElement("div");
  head.className = "meal-head";
  head.innerHTML = `
    <span class="meal-icon">📖</span>
    <h2 class="meal-title">Ricettario</h2>
  `;
  ricetteView.appendChild(head);

  const recipeForm = document.createElement("form");
  recipeForm.className = "recipe-form";
  recipeForm.innerHTML = `
    <input class="meal-input" id="recipe-title" type="text" placeholder="Titolo ricetta" required />
    <textarea class="meal-input meal-textarea" id="recipe-ingredients" placeholder="Ingredienti (uno per riga)" required></textarea>
    <textarea class="meal-input meal-textarea" id="recipe-procedure" placeholder="Procedimento" required></textarea>
    <button class="add-btn" type="submit">Salva</button>
    <div class="recipe-url-row">
      <input class="meal-input" id="recipe-url" type="url" placeholder="URL ricetta da internet" />
      <button class="btn-action btn-edit" id="import-url-btn" type="button">Importa URL</button>
    </div>
    <p class="import-message" id="import-message"></p>
  `;
  ricetteView.appendChild(recipeForm);

  const titleInput = recipeForm.querySelector("#recipe-title");
  const ingredientsInput = recipeForm.querySelector("#recipe-ingredients");
  const procedureInput = recipeForm.querySelector("#recipe-procedure");
  const urlInput = recipeForm.querySelector("#recipe-url");
  const importBtn = recipeForm.querySelector("#import-url-btn");
  const importMessage = recipeForm.querySelector("#import-message");

  importBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) {
      importMessage.textContent = "Inserisci un URL valido.";
      return;
    }

    importMessage.textContent = "Sto cercando di importare la ricetta...";
    const recipe = await importRecipeFromUrl(url);

    if (!recipe) {
      importMessage.textContent =
        "Importazione non riuscita. Inserisci i dati manualmente.";
      return;
    }

    titleInput.value = recipe.title || "";
    ingredientsInput.value = recipe.ingredients.join("\n");
    procedureInput.value = recipe.procedure || "";
    importMessage.textContent = "Ricetta importata. Controlla e salva.";
  });

  recipeForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const title = titleInput.value.trim();
    const ingredients = parseLines(ingredientsInput.value);
    const procedure = procedureInput.value.trim();

    if (!title || ingredients.length === 0 || !procedure) {
      return;
    }

    if (editingRecipeId) {
      const existingById = state.recipes.find(
        (recipe) => recipe.id === editingRecipeId
      );
      if (existingById) {
        existingById.title = title;
        existingById.ingredients = ingredients;
        existingById.procedure = procedure;
      }
    } else {
      const existing = state.recipes.find(
        (recipe) => normalizeText(recipe.title) === normalizeText(title)
      );

      if (existing) {
        existing.ingredients = ingredients;
        existing.procedure = procedure;
      } else {
        state.recipes.push({
          id: crypto.randomUUID(),
          title,
          ingredients,
          procedure,
        });
      }
    }

    editingRecipeId = null;

    titleInput.value = "";
    ingredientsInput.value = "";
    procedureInput.value = "";
    urlInput.value = "";
    importMessage.textContent = "";
    saveState();
    renderRecipesView();
  });

  const recipesList = document.createElement("div");
  recipesList.className = "recipes-list";

  if (state.recipes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nessuna ricetta salvata.";
    recipesList.appendChild(empty);
  } else {
    state.recipes.forEach((recipe) => {
      const card = document.createElement("article");
      card.className = "recipe-card";

      const ingredientsMarkup = recipe.ingredients
        .map((ingredient) => `<li>${escapeHtml(ingredient)}</li>`)
        .join("");

      card.innerHTML = `
        <h3 class="recipe-title">${escapeHtml(recipe.title)}</h3>
        <h4>Ingredienti</h4>
        <ul>${ingredientsMarkup}</ul>
        <h4>Procedimento</h4>
        <p>${escapeHtml(recipe.procedure)}</p>
        <div class="recipe-bottom-actions">
          <button
            type="button"
            class="btn-action btn-edit recipe-edit-btn"
            data-recipe-id="${escapeHtml(recipe.id)}"
          >
            Modifica
          </button>
          <button
            type="button"
            class="btn-action btn-remove recipe-delete-btn"
            data-recipe-id="${escapeHtml(recipe.id)}"
          >
            Elimina
          </button>
        </div>
      `;

      recipesList.appendChild(card);
    });
  }

  ricetteView.appendChild(recipesList);

  recipesList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    // Modifica ricetta
    if (!target.classList.contains("recipe-edit-btn")) return;

    const recipeId = target.getAttribute("data-recipe-id");
    if (!recipeId) return;

    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (!recipe) return;

    editingRecipeId = recipe.id;
    titleInput.value = recipe.title;
    ingredientsInput.value = recipe.ingredients.join("\n");
    procedureInput.value = recipe.procedure;
    urlInput.value = "";
    importMessage.textContent = "Ricetta pronta per modifiche: premi Salva.";

    // Porta l’attenzione al form.
    recipeForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Gestisce i click su "Elimina" (event delegation)
  recipesList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("recipe-delete-btn")) return;

    const recipeId = target.getAttribute("data-recipe-id");
    if (!recipeId) return;

    const ok = window.confirm("Eliminare questa ricetta? Gli ingredienti auto-aggiunti in Spesa verranno rimossi.");
    if (!ok) return;

    const idx = state.recipes.findIndex((r) => r.id === recipeId);
    if (idx === -1) return;

    state.recipes.splice(idx, 1);
    removeRecipeIngredientsFromSpesa(recipeId);

    if (editingRecipeId === recipeId) {
      editingRecipeId = null;
    }

    saveState();
    renderRecipesView();
  });
}

function renderSimpleView({ target, title, icon, data, placeholder }) {
  target.innerHTML = "";

  const head = document.createElement("div");
  head.className = "meal-head";
  head.innerHTML = `
    <span class="meal-icon">${icon}</span>
    <h2 class="meal-title">${title}</h2>
  `;
  target.appendChild(head);

  const form = document.createElement("form");
  form.className = "meal-form";

  const input = document.createElement("input");
  input.className = "meal-input";
  input.type = "text";
  input.placeholder = placeholder;
  input.required = true;

  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.className = "add-btn";
  addButton.textContent = "Aggiungi";

  form.appendChild(input);
  form.appendChild(addButton);
  target.appendChild(form);

  const list = document.createElement("ul");
  list.className = "items-list";

  if (data.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty";
    emptyItem.textContent = "Nessun elemento";
    list.appendChild(emptyItem);
  } else {
    data.forEach((item) => {
      list.appendChild(
        buildItemElement(data, item, {
          showCheckbox: true,
          onAfterChange: render,
        })
      );
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      return;
    }

    data.push({
      id: crypto.randomUUID(),
      name: value,
      done: false,
    });
    input.value = "";
    saveState();
    render();
  });

  target.appendChild(list);
}

function renderCurrentView() {
  const index = views.indexOf(currentView);
  viewsTrack.style.transform = `translateX(-${index * 100}%)`;

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === currentView);
  });
}

function setupNavigation() {
  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.view;
      if (!views.includes(nextView)) {
        return;
      }
      currentView = nextView;
      renderCurrentView();
    });
  });
}

function setupSwipe() {
  let startX = 0;
  let deltaX = 0;

  viewsViewport.addEventListener("touchstart", (event) => {
    startX = event.touches[0].clientX;
    deltaX = 0;
  });

  viewsViewport.addEventListener("touchmove", (event) => {
    deltaX = event.touches[0].clientX - startX;
  });

  viewsViewport.addEventListener("touchend", () => {
    const threshold = 55;
    const currentIndex = views.indexOf(currentView);

    if (deltaX < -threshold && currentIndex < views.length - 1) {
      currentView = views[currentIndex + 1];
    } else if (deltaX > threshold && currentIndex > 0) {
      currentView = views[currentIndex - 1];
    }

    renderCurrentView();
  });
}

function setupClearWeekButton() {
  if (!clearWeekButton) return;

  clearWeekButton.addEventListener("click", () => {
    const ok = window.confirm(
      "Vuoi cancellare tutte le portate della settimana (tutti i giorni e tutti i pasti)?"
    );
    if (!ok) return;

    days.forEach((day) => {
      const recipeIdsToRemove = new Set();
      mealTypes.forEach((meal) => {
        const items = state.days[day.full][meal.key];
        if (Array.isArray(items)) {
          items.forEach((entry) => {
            if (typeof entry?.recipeId === "string" && entry.recipeId.length > 0) {
              recipeIdsToRemove.add(entry.recipeId);
            }
          });
        }
        state.days[day.full][meal.key] = [];
      });

      recipeIdsToRemove.forEach((recipeId) => {
        removeRecipeIngredientsFromSpesaForDay(day.full, recipeId);
      });
    });

    saveState();
    renderMealsForSelectedDay();
  });
}

function buildItemElement(items, item, { showCheckbox, onAfterChange }) {
  const row = document.createElement("li");
  row.className = "product-item";

  const label = document.createElement("div");
  label.className = "product-label";

  if (showCheckbox) {
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = Boolean(item.done);
    check.addEventListener("change", () => {
      item.done = check.checked;
      saveState();
      if (typeof onAfterChange === "function") onAfterChange();
    });

    label.appendChild(check);
  }

  const text = document.createElement("span");
  text.textContent = item.name;
  if (showCheckbox && item.done) {
    text.classList.add("done");
  }

  label.appendChild(text);

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "btn-action btn-edit";
  edit.textContent = "Modifica";
  edit.addEventListener("click", () => {
    const newName = window.prompt("Modifica elemento:", item.name)?.trim();
    if (!newName) {
      return;
    }
    item.name = newName;
    saveState();
    if (typeof onAfterChange === "function") onAfterChange();
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn-action btn-remove";
  remove.textContent = "Elimina";
  remove.addEventListener("click", () => {
    const index = items.findIndex((entry) => entry.id === item.id);
    if (index === -1) {
      return;
    }

    // Se stiamo cancellando un piatto dal Menu (no checkbox),
    // rimuoviamo anche gli ingredienti auto-aggiunti in Spesa collegati alla ricetta.
    if (
      showCheckbox === false &&
      typeof item.recipeId === "string" &&
      item.recipeId.length > 0
    ) {
      removeRecipeIngredientsFromSpesaForDay(selectedDay, item.recipeId);
    }

    items.splice(index, 1);
    saveState();
    if (typeof onAfterChange === "function") onAfterChange();
  });

  actions.appendChild(edit);
  actions.appendChild(remove);

  row.appendChild(label);
  row.appendChild(actions);
  return row;
}

function createEmptyDayMeals() {
  return {
    ...Object.fromEntries(mealTypes.map((meal) => [meal.key, []])),
    spesa: [],
  };
}

function createEmptyState() {
  return {
    days: Object.fromEntries(days.map((day) => [day.full, createEmptyDayMeals()])),
    recipes: [],
  };
}

function loadState() {
  const empty = createEmptyState();
  const raw = localStorage.getItem(STORAGE_KEY_V3);

  if (!raw) {
    return migrateLegacyState(empty);
  }

  try {
    const parsed = JSON.parse(raw);

    if (parsed.days && parsed.recipes) {
      days.forEach((day) => {
        const sourceDay = parsed.days[day.full] || {};
        mealTypes.forEach((meal) => {
          empty.days[day.full][meal.key] = sanitizeItems(sourceDay[meal.key]);
        });
        empty.days[day.full].spesa = sanitizeItems(sourceDay.spesa);
        dedupeSpesaForDay(day.full, empty);
      });
      empty.recipes = sanitizeRecipes(parsed.recipes);
      return empty;
    }

    // Compatibilita con v2
    days.forEach((day) => {
      const sourceDay = parsed[day.full] || {};
      mealTypes.forEach((meal) => {
        empty.days[day.full][meal.key] = sanitizeItems(sourceDay[meal.key]);
      });
      empty.days[day.full].spesa = sanitizeItems(sourceDay.spesa);
      dedupeSpesaForDay(day.full, empty);
    });
    return empty;
  } catch {
    return migrateLegacyState(empty);
  }
}

function migrateLegacyState(emptyState) {
  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) {
    return emptyState;
  }

  try {
    const parsed = JSON.parse(legacyRaw);
    days.forEach((day) => {
      const source = parsed?.menu?.[day.full] || [];
      emptyState.days[day.full].pranzo = sanitizeItems(source);
      emptyState.days[day.full].spesa = sanitizeItems(parsed?.spesa?.[day.full]);
      dedupeSpesaForDay(day.full, emptyState);
    });
  } catch {
    return emptyState;
  }

  return emptyState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(state));
}

function sanitizeItems(items) {
  const safeItems = Array.isArray(items) ? items : [];
  return safeItems
    .filter((item) => item && typeof item.name === "string")
    .map((item) => ({
      id:
        typeof item.id === "string" && item.id.length > 0
          ? item.id
          : crypto.randomUUID(),
      name: item.name.trim(),
      done: Boolean(item.done),
      // Conserviamo eventuali metadati usati per sincronizzare ricette -> spesa.
      recipeId:
        typeof item.recipeId === "string" && item.recipeId.length > 0
          ? item.recipeId
          : undefined,
      recipeIds: Array.isArray(item.recipeIds)
        ? item.recipeIds.filter(
            (rid) => typeof rid === "string" && rid.length > 0
          )
        : undefined,
      autoAdded: item.autoAdded === true ? true : undefined,
    }))
    .filter((item) => item.name.length > 0);
}

function sanitizeRecipes(recipes) {
  const safeRecipes = Array.isArray(recipes) ? recipes : [];
  return safeRecipes
    .filter((recipe) => recipe && typeof recipe.title === "string")
    .map((recipe) => ({
      id:
        typeof recipe.id === "string" && recipe.id.length > 0
          ? recipe.id
          : crypto.randomUUID(),
      title: recipe.title.trim(),
      ingredients: parseLines((recipe.ingredients || []).join("\n")),
      procedure:
        typeof recipe.procedure === "string" ? recipe.procedure.trim() : "",
    }))
    .filter(
      (recipe) =>
        recipe.title.length > 0 &&
        recipe.ingredients.length > 0 &&
        recipe.procedure.length > 0
    );
}

function parseLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeText(text) {
  return String(text).trim().toLowerCase();
}

function findRecipeByTitle(title) {
  return state.recipes.find(
    (recipe) => normalizeText(recipe.title) === normalizeText(title)
  );
}

function syncRecipeIngredientsToSpesa(day, recipe) {
  const shoppingList = state.days[day].spesa;
  const indexByNormalizedName = new Map();
  shoppingList.forEach((item) => {
    const key = normalizeText(item.name);
    if (!key) return;
    if (!indexByNormalizedName.has(key)) {
      indexByNormalizedName.set(key, item);
    }
  });

  recipe.ingredients.forEach((ingredient) => {
    const normalized = normalizeText(ingredient);
    if (!normalized) return;

    const existing = indexByNormalizedName.get(normalized);

    if (existing) {
      const ids = getRecipeIdsFromSpesaItem(existing);
      if (!ids.includes(recipe.id)) {
        ids.push(recipe.id);
      }
      setRecipeIdsOnSpesaItem(existing, ids);

      // Non trasformiamo un elemento manuale in "autoAdded":
      // se l'utente l'ha aggiunto lui, deve rimanere anche se elimini la ricetta.
      existing.autoAdded = existing.autoAdded === true ? true : undefined;
      return;
    }

    const newItem = {
      id: crypto.randomUUID(),
      name: ingredient,
      done: false,
      autoAdded: true,
      recipeIds: [recipe.id],
    };
    shoppingList.push(newItem);
    indexByNormalizedName.set(normalized, newItem);
  });

  dedupeSpesaForDay(day);
}

function removeRecipeIngredientsFromSpesa(recipeId) {
  days.forEach((day) => {
    const spesaItems = state.days[day.full].spesa;

    const next = [];
    spesaItems.forEach((item) => {
      if (!item || typeof item !== "object") return;

      // Se l'elemento non è auto-aggiunto, non lo tocchiamo.
      if (item.autoAdded !== true) {
        // Rimuoviamo comunque i riferimenti alla ricetta (per coerenza).
        const ids = getRecipeIdsFromSpesaItem(item).filter(
          (rid) => rid !== recipeId
        );
        setRecipeIdsOnSpesaItem(item, ids);
        next.push(item);
        return;
      }

      const ids = getRecipeIdsFromSpesaItem(item).filter(
        (rid) => rid !== recipeId
      );

      if (ids.length === 0) {
        return; // rimuovi dalla spesa
      }

      setRecipeIdsOnSpesaItem(item, ids);
      next.push(item);
    });

    state.days[day.full].spesa = next;
  });
}

function removeRecipeIngredientsFromSpesaForDay(dayFull, recipeId) {
  const spesaItems = state.days[dayFull].spesa;
  if (!Array.isArray(spesaItems)) return;

  const next = [];
  spesaItems.forEach((item) => {
    if (!item || typeof item !== "object") return;

    if (item.autoAdded !== true) {
      const ids = getRecipeIdsFromSpesaItem(item).filter((rid) => rid !== recipeId);
      setRecipeIdsOnSpesaItem(item, ids);
      next.push(item);
      return;
    }

    const ids = getRecipeIdsFromSpesaItem(item).filter((rid) => rid !== recipeId);
    if (ids.length === 0) {
      return;
    }

    setRecipeIdsOnSpesaItem(item, ids);
    next.push(item);
  });

  state.days[dayFull].spesa = next;
  dedupeSpesaForDay(dayFull);
}

function dedupeSpesaForDay(dayFull, stateRef = state) {
  const spesaItems = stateRef.days[dayFull].spesa;
  if (!Array.isArray(spesaItems)) return;

  const byName = new Map();

  spesaItems.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const key = normalizeText(item.name);
    if (!key) return;

    if (!byName.has(key)) {
      byName.set(key, item);
      return;
    }

    const kept = byName.get(key);
    kept.done = Boolean(kept.done) || Boolean(item.done);

    // Se esiste almeno un elemento manuale (autoAdded !== true),
    // teniamo autoAdded disattivato per evitare rimozioni accidentali.
    const keptIsAuto = kept.autoAdded === true;
    const itemIsAuto = item.autoAdded === true;
    if (keptIsAuto && !itemIsAuto) {
      kept.autoAdded = undefined;
    }

    const keptIds = getRecipeIdsFromSpesaItem(kept);
    const itemIds = getRecipeIdsFromSpesaItem(item);
    const union = new Set([...keptIds, ...itemIds]);
    setRecipeIdsOnSpesaItem(kept, Array.from(union));
  });

  stateRef.days[dayFull].spesa = Array.from(byName.values());
}

function getRecipeIdsFromSpesaItem(item) {
  const ids = new Set();
  if (Array.isArray(item.recipeIds)) {
    item.recipeIds.forEach((rid) => {
      if (typeof rid === "string" && rid.length > 0) ids.add(rid);
    });
  }
  if (typeof item.recipeId === "string" && item.recipeId.length > 0) {
    ids.add(item.recipeId);
  }
  return Array.from(ids);
}

function setRecipeIdsOnSpesaItem(item, ids) {
  const cleaned = Array.isArray(ids)
    ? ids.filter((rid) => typeof rid === "string" && rid.length > 0)
    : [];

  if (cleaned.length === 0) {
    delete item.recipeId;
    delete item.recipeIds;
    return;
  }

  item.recipeIds = cleaned;
  item.recipeId = cleaned[0];
}

async function importRecipeFromUrl(url) {
  const parsers = [
    () => fetchRecipeFromPage(url),
    () =>
      fetchRecipeFromPage(
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
      ),
  ];

  for (const parse of parsers) {
    try {
      const recipe = await parse();
      if (recipe) {
        return recipe;
      }
    } catch {
      // try fallback
    }
  }

  return null;
}

async function fetchRecipeFromPage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const scripts = Array.from(
    doc.querySelectorAll('script[type="application/ld+json"]')
  );

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || "{}");
      const recipe = extractRecipeFromJsonLd(data);
      if (recipe) {
        return recipe;
      }
    } catch {
      // continue
    }
  }

  return null;
}

function extractRecipeFromJsonLd(data) {
  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = extractRecipeFromJsonLd(entry);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  if (data["@graph"] && Array.isArray(data["@graph"])) {
    return extractRecipeFromJsonLd(data["@graph"]);
  }

  const type = Array.isArray(data["@type"]) ? data["@type"] : [data["@type"]];
  if (type.includes("Recipe")) {
    const title = typeof data.name === "string" ? data.name.trim() : "";
    const ingredients = Array.isArray(data.recipeIngredient)
      ? data.recipeIngredient.map((item) => String(item).trim()).filter(Boolean)
      : [];

    const instructions = normalizeInstructions(data.recipeInstructions);
    if (!title || ingredients.length === 0 || !instructions) {
      return null;
    }

    return {
      title,
      ingredients,
      procedure: instructions,
    };
  }

  return null;
}

function normalizeInstructions(recipeInstructions) {
  if (typeof recipeInstructions === "string") {
    return recipeInstructions.trim();
  }

  if (Array.isArray(recipeInstructions)) {
    return recipeInstructions
      .map((step) => {
        if (typeof step === "string") {
          return step.trim();
        }
        if (step && typeof step.text === "string") {
          return step.text.trim();
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCurrentDay() {
  const today = new Date().getDay();
  const map = {
    1: "Lunedì",
    2: "Martedì",
    3: "Mercoledì",
    4: "Giovedì",
    5: "Venerdì",
    6: "Sabato",
    0: "Domenica",
  };
  return map[today] || "Lunedì";
}
