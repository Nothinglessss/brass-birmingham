# Build Execution Revalidation Design

## Scope

Issue #25 makes Build execution enforce the same target contract used by the UI immediately before any mutation.

## Validation Boundary

`executeBuild()` will locate an exact current target matching `cityId`, `slotIndex`, and `industryType` in `getValidBuildTargets(playerId)`. If no match exists, it returns an invalid-target result before validating or consuming the card, planning or consuming resources, spending money, removing a tile, or placing an industry.

This reuses the canonical target enumeration instead of creating a second copy of era, location, slot, network, overbuild, player-count, and Canal Era city-limit rules.

## Atomicity

Rejected execution leaves the player's money, hand, industry-tile stack, board industries, brewery farms, resource cubes, and markets unchanged. Valid targets continue through the existing card and resource-plan validation path.

## Testing

A focused game-logic regression will cover a target that becomes stale after selection, a direct illegal slot/industry request, an illegal Canal Era second tile, and a valid control Build. Each rejection will assert the relevant state snapshot is unchanged. Existing opening-build, resource-action, resource-market, and broad rule tests will remain green.

## Explicitly Out of Scope

- Changing which Build targets are legal.
- Redesigning the Build modal or highlights.
- Refactoring the resource planner.
- Adding persistence or concurrency control beyond execution-time revalidation.
