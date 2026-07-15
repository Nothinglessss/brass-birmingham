# Dual Cotton and Manufacturer Cards Design

## Scope

Issue #24 makes the three- and four-player Industry deck represent the physical dual-purpose Cotton Mill/Manufacturer cards. The correct two-player deck remains unchanged.

## Card Model

- Existing single-industry cards keep `industryType` for compatibility.
- Dual cards use `industryTypes: [cottonMill, manufacturer]`.
- A shared helper returns the permitted types for either representation, so Build validation and rendering do not duplicate compatibility logic.
- Three-player setup creates six dual Cotton/Manufacturer cards.
- Four-player setup creates eight dual Cotton/Manufacturer cards.
- The total deck size remains unchanged from the current implementation.

## Build and UI Behavior

The dual card is legal when the selected Build target is either a Cotton Mill or Manufacturer and all ordinary network, location, era, slot, and affordability rules pass. The hand renders both product icons and the combined name. Other Industry cards and both Wild cards behave exactly as before.

## Testing

A focused regression will inspect complete decks for two, three, and four players; verify dual-card counts and unchanged deck totals; prove one dual card is accepted for either industry; reject unrelated industries; and verify the combined hand-card presentation. Existing opening-build, resource-action, and rule-deviation suites will remain green.

## Explicitly Out of Scope

- Adding the dual cards to two-player games.
- Changing Location or Wild card rules.
- Rebalancing any other player-count deck composition.
- Changing Cotton Mill or Manufacturer tile data.
