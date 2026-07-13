# Google-Translatable City Labels Design

## Goal

Make every board city label visible to Google Translate's page-translation feature without changing the label's current appearance, placement, sizing, or interaction behavior.

## Current behavior

`BoardRenderer.drawCities()` creates city names as SVG `<text>` elements. The labels are real DOM text nodes, but Google Translate does not process them as normal HTML page text. Board refreshes also remove and recreate the complete city layer from the original English `city.name` values.

## Design

Keep each existing SVG city-title ribbon and its geometry as the visual positioning anchor. The SVG text remains in the SVG solely as a hidden measurement anchor so the existing font metrics and responsive geometry remain authoritative.

Add a normal HTML overlay layer as a sibling of `#game-board` inside `#board-container`. For each visible city, render one non-interactive HTML `<span>` containing the same `city.name`. These spans are the only visible city-name text and are therefore discoverable by Google Translate.

After the board renders, updates, changes fullscreen layout, or resizes, synchronize each HTML label with its corresponding hidden SVG anchor:

- center the HTML label over the anchor's rendered bounds;
- derive its rendered font size and letter spacing from the SVG scale;
- preserve the current Cinzel family, weight, color, and single-line behavior;
- set `pointer-events: none` so SVG city shapes and industry slots retain all interaction handling.

The overlay contains only labels for currently visible cities. Synchronization reconciles by city identifier so redraws update existing labels and remove stale labels without creating duplicates.

## Structure

```text
#board-container
|-- #game-board                  existing SVG map and interactions
|   `-- #cities-layer
|       `-- .city-group
|           |-- .city-label-bg  existing visible ribbon
|           `-- .city-label     hidden SVG measurement anchor
`-- #city-label-overlay         new HTML overlay
    `-- .city-label-html        visible, translatable city name
```

## Accessibility and translation

The visible HTML spans contain ordinary text and must not use `translate="no"` or `notranslate`. The hidden SVG measurement anchors use `aria-hidden="true"` and `translate="no"` so assistive technology and translation do not encounter duplicate city names.

## Error handling

If an overlay or anchor is unavailable during an intermediate render, synchronization skips that label rather than affecting the board. A later render or resize performs synchronization again. The board remains usable even if HTML label synchronization cannot run.

## Testing

Add focused regression coverage that verifies:

1. city names are exposed as ordinary HTML label elements;
2. the SVG text anchors are hidden and excluded from translation/accessibility;
3. repeated draws reconcile labels without duplicates;
4. labels remain non-interactive and retain the current typography contract;
5. city SVG groups and title ribbons continue to render unchanged;
6. the existing Node test suite passes;
7. browser measurements confirm every visible SVG city has one aligned HTML label in normal and fullscreen layouts.

## Non-goals

- Adding an application localization system.
- Translating city data inside JavaScript.
- Changing city names, ribbon sizes, board layout, or city interactions.
- Converting other SVG labels in this change.
