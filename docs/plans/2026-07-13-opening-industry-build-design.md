# Opening Industry Build Eligibility Design

## Problem

The Build action filters an Iron Works Industry card out when the active player has no tiles on the board. This happens even when the target slot, era, money, and connected-coal requirements are all satisfied.

The immediate cause is that both build-target discovery and discard-card validation require every Industry and Wild Industry card to target a location in the player's network. They do not implement the rulebook's first-placement exception.

## Rulebook behavior

Build-card eligibility must follow this matrix:

| Card | Normal network requirement | No-tiles exception |
| --- | --- | --- |
| Location | None; build at the named location | Not needed |
| Wild Location | None; acts as any Location card | Not needed |
| Industry | Target must be in the player's network | May build the matching industry anywhere |
| Wild Industry | Acts as any Industry card, so the target must be in-network | May build any industry anywhere |

The no-tiles exception applies only while the player has no Industry or Link tiles anywhere on the board. An external Farm Brewery counts as an Industry tile. Wild Location cards still cannot target Farm Breweries because those locations have no Location cards.

All other Build requirements remain unchanged. In particular, an Iron Works that consumes coal still needs a valid connected coal source after placement.

## Design

Add a single `hasBoardPresence(playerId)` query in `GameLogic`. It returns true when the player owns at least one link, ordinary city industry, or external Farm Brewery.

Add a single Industry-card location query that permits a target when either:

- the location is in the player's network; or
- `hasBoardPresence(playerId)` is false.

Use that query in both paths that currently duplicate card eligibility:

- `hasCardForBuild`, which controls whether a location is offered as a Build target;
- `getValidCardsForAction`, which controls which card can be discarded for the selected target.

Apply it to standard Industry and Wild Industry cards, including Farm Brewery targets. Leave Location and Wild Location behavior unchanged.

This is preferred over duplicating the exception in each branch because target discovery and card selection must not disagree. A broader rewrite of all Build-card matching is unnecessary for this defect.

## Verification

Add regression coverage proving that:

1. A player with no board tiles can use an Iron Works Industry card at an out-of-network Dudley slot when connected coal is available.
2. The same target is rejected once that player has a tile elsewhere and Dudley remains outside their network.
3. A Wild Industry card follows the same network and no-tiles rules.
4. A Wild Location card remains usable outside the player's network regardless of existing tiles.
5. Existing resource-planning and rule-deviation tests continue to pass.

## Non-goals

- Changing coal connectivity or market-consumption rules.
- Special-casing Iron Works instead of correcting shared card eligibility.
- Changing the Scout action or Wild-card pile behavior.
- Refactoring unrelated Build, board, or rendering code.
