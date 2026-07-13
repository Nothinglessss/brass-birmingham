# Gloucester Free Develop Choice Design

## Problem

When a player consumes Gloucester's merchant beer during a Sell action, the game applies the free Develop bonus automatically. `applyFreeDevelop` sorts all developable industries by their next tile level and removes the first result. Because equal levels retain the project's industry insertion order, this usually removes a Brewery tile without asking the player.

The rulebook instead lets the player choose an industry, then remove that industry's lowest remaining tile for no iron cost. A Pottery tile displaying the lightbulb icon is not developable.

## Desired interaction

1. The player selects Gloucester's merchant beer as a Sell resource.
2. Once resource planning is complete, the game opens a **Choose Free Develop** dialog.
3. The dialog lists each industry whose next tile is developable, including the tile's level.
4. The player chooses one industry.
5. The normal discard-card step resumes.
6. Sell execution consumes the merchant beer, claims Gloucester's bonus, flips the sold tile, and removes the chosen industry's lowest remaining tile without consuming iron.
7. The action log/result identifies the industry developed by the bonus.

If no industry has a developable next tile, the sale completes and the bonus has no effect.

## State and validation

The choice occurs before the discard card is selected and before Sell execution mutates game state. The chosen industry type is stored in `pendingData` and passed to `GameLogic.executeSell`.

`executeSell` remains the authority for validation. When Gloucester merchant beer is part of the resource plan and at least one free-Develop option exists, execution requires the selected industry to be in the current `getDevelopableTypes` result. A missing or stale choice rejects the action before beer, merchant state, industry state, income, hand, or turn data changes.

Non-Develop merchant bonuses continue to apply automatically. Beer taken from a Brewery does not claim a merchant bonus.

## Implementation shape

- Add a logic query that identifies the merchant Develop bonus and validates/applies one chosen industry.
- Extend `executeSell` with an optional free-Develop industry selection.
- Extend resource-planning completion in `UIManager` to pause for the choice only when the completed Sell plan consumes Gloucester merchant beer.
- Render the choice from `getDevelopableTypes`, then resume the existing card-discard phase.
- Preserve the current shared resource picker and Sell target selection.

This pre-execution choice is preferred over a post-sale dialog because it preserves atomicity if the modal is cancelled or the state becomes invalid. A broader prepare/commit Sell refactor is unnecessary for a single one-tile bonus.

## Verification

Regression coverage will prove that:

- Gloucester merchant beer cannot complete a sale without a choice when valid Develop options exist.
- Rejection is atomic.
- Choosing an industry removes that industry's lowest tile and no other tile.
- Lightbulb Pottery is not offered.
- The UI pauses after resource selection, renders the available industries, stores the selection, and resumes card discard.
- Oxford, Shrewsbury, Warrington, and Nottingham bonuses remain automatic.
- Brewery beer still does not trigger merchant bonuses.

## Non-goals

- Changing which merchants buy each good.
- Changing beer connectivity or consumption rules.
- Allowing two tiles to be developed with Gloucester's bonus.
- Refactoring the legacy Sell path or unrelated action workflows.
