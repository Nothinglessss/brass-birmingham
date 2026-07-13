# Google-Translatable City Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose board city names as ordinary HTML text that Google Translate can mutate, without changing their visual placement or SVG interactions.

**Architecture:** Keep the current SVG text as an invisible geometry anchor and render one visible HTML span per city in an overlay sibling of the SVG. `BoardRenderer.syncCityLabels()` reconciles spans by city id, maps SVG screen bounds to overlay coordinates, and deliberately preserves an existing span's text so later board redraws do not overwrite Google Translate's mutation.

**Tech Stack:** Vanilla JavaScript, inline SVG, CSS, Node.js `assert`/`vm` tests.

---

### Task 1: Add the translation regression contract

**Files:**
- Create: `tests/city_label_translation.test.js`

- [ ] **Step 1: Write the failing test**

Create a fake SVG/HTML DOM, render the cities through the real `BoardRenderer`, and assert that each SVG anchor creates one HTML `.city-label-html`, that the SVG anchor is hidden from translation/accessibility, and that a simulated translated HTML string survives `updateIndustrySlots()`.

```js
renderer.drawCities();
assert.equal(overlay.querySelectorAll('.city-label-html').length, Object.keys(context.CITIES).length);
assert.equal(svg.querySelector('.city-label').attrs.opacity, '0');
assert.equal(svg.querySelector('.city-label').attrs['aria-hidden'], 'true');
assert.equal(svg.querySelector('.city-label').attrs.translate, 'no');

const belper = overlay.querySelector('[data-city="belper"]');
belper.textContent = 'ベルパー';
renderer.updateIndustrySlots();
assert.equal(overlay.querySelector('[data-city="belper"]').textContent, 'ベルパー');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tests/city_label_translation.test.js`

Expected: FAIL because no HTML city-label overlay behavior exists.

### Task 2: Implement the HTML city-label overlay

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/boardRenderer.js`
- Modify: `js/uiManager.js`
- Test: `tests/city_label_translation.test.js`

- [ ] **Step 1: Add the overlay and unchanged visual contract**

Add `#city-label-overlay` beside `#game-board`. Style it as an absolute, non-interactive layer and style `.city-label-html` with the current Cinzel family, weight, color, letter spacing, centering, and single-line behavior.

- [ ] **Step 2: Add minimal reconciliation and positioning**

In `BoardRenderer`, cache the overlay, mark each SVG `.city-label` as an invisible anchor with `data-city`, `opacity="0"`, `aria-hidden="true"`, and `translate="no"`, then synchronize HTML spans after city draws.

```js
syncCityLabels() {
    if (!this.cityLabelOverlay) return;
    const anchors = [...this.svg.querySelectorAll('.city-label')];
    const activeIds = new Set();
    for (const anchor of anchors) {
        const cityId = anchor.getAttribute('data-city');
        activeIds.add(cityId);
        let label = this.cityLabelOverlay.querySelector(`[data-city="${cityId}"]`);
        if (!label) {
            label = document.createElement('span');
            label.className = 'city-label-html';
            label.dataset.city = cityId;
            label.textContent = anchor.textContent;
            this.cityLabelOverlay.appendChild(label);
        }
        this.positionCityLabel(label, anchor);
    }
    this.cityLabelOverlay.querySelectorAll('.city-label-html').forEach(label => {
        if (!activeIds.has(label.dataset.city)) label.remove();
    });
}
```

Use the anchor's `getBoundingClientRect()` and `getScreenCTM()` to set the HTML label center, font size, and letter spacing. Never overwrite `textContent` for an existing label.

- [ ] **Step 3: Synchronize on resize**

Observe the SVG element with `ResizeObserver` so normal and fullscreen board resizing calls `renderer.syncCityLabels()` without coupling label rendering to `UIManager`.

- [ ] **Step 4: Run focused and full verification**

Run: `node tests/city_label_translation.test.js`

Expected: PASS.

Run every `tests/*.test.js` file. Expected: all previously passing files remain passing; the pre-existing unrelated `board_routes.test.js` Warrington assertion remains the only baseline failure if it has not otherwise changed.

- [ ] **Step 5: Manual browser verification (delegated to the user)**

The user will activate Google Translate and visually verify a three-player game in normal and fullscreen layouts. Record this check as explicitly left out of automated completion evidence.
