# Multi-Industry Sell Action Design

## Goal

Make the Sell action follow the Brass: Birmingham rulebook: after discarding one card, a player may sell any number of their legal unflipped Cotton Mill, Manufacturer, and Pottery tiles, including multiple tiles of the same industry type.

## Current Behavior

The application resolves one industry sale, discards a card, and immediately completes the action. A player can therefore sell a second tile only by spending their second action and discarding another card.

## Interaction Design

The first sale retains the existing target, resource-source, optional Gloucester free-Develop, and card-selection flow. Once it succeeds, the Sell action remains active instead of advancing the turn.

The application then recalculates the legal sell targets from the updated game state and shows them in the Sell Goods modal. The modal includes a **Done Selling** choice. Selecting another target resolves its resource choices and bonus before returning to the refreshed target list. Additional sales do not request or discard another card.

If no legal sell targets remain after a sale, the action finishes automatically. Each successful sale receives its own game-log entry.

Before the first sale is committed, Cancel and Escape retain their current behavior and abandon the pending action. After the first sale is committed, Cancel and Escape finish the Sell action because its card, resources, income, bonuses, and tile flip have already been applied.

## Rule Semantics

- The action discards exactly one valid card, during the first committed sale.
- Each industry is validated against a connected Merchant that buys its product.
- Each industry consumes its printed beer requirement from legal sources before it flips.
- Legal targets and beer sources are recalculated after every committed sale.
- Merchant beer is restricted to the Merchant selected for that individual sale.
- Consuming Merchant beer grants that Merchant's bonus immediately.
- Multiple Merchant bonuses may be earned in one Sell action when the player consumes beer from multiple eligible Merchant spaces.
- Gloucester's free-Develop choice is resolved immediately before continuing to another sale.
- A sale is atomic: invalid or stale target, resource, card, or free-Develop choices do not partially mutate the game.
- Earlier successful sales remain committed if a later proposed sale becomes invalid.

## Architecture

`GameLogic` will expose a shared single-industry sale operation. The first-sale entry point validates and discards the action card; the continuation entry point performs the same sale without another card. Both paths reuse the existing target validation, resource planner, Merchant bonus handling, and free-Develop handling.

`UIManager` will own a short-lived Sell-session state containing whether the first sale has committed and the accumulated sale messages. It will preserve this state while replacing per-target resource-planning data. After each successful sale it either reopens the refreshed Sell Goods modal or completes the action when the player chooses Done Selling or no targets remain.

This session state is UI orchestration only. Persistent game state continues to live in `GameState`, and every committed rule effect continues to be applied by `GameLogic`.

## Error and Cancellation Behavior

- A failed first sale returns to the normal action-selection state without discarding a card.
- A failed continuation leaves earlier sales committed and returns the player to the refreshed Sell target list when legal targets remain.
- Done Selling is unavailable until at least one sale has committed; before then, cancelling abandons the action.
- Cancel, Escape, and reselecting Sell after a committed sale all finalize the action exactly once.
- Closing a resource or target modal does not silently undo committed sales; the phase bar remains available to finish the action.

## Testing

Logic tests will prove that:

- two same-type industries can be sold through one action while discarding one card;
- different industry types can also be sold in the same action;
- each sale revalidates its Merchant and resource sources;
- multiple consumed Merchant beers grant their respective bonuses;
- a continuation never discards an additional card;
- an invalid continuation is atomic and does not undo earlier sales.

UI tests will prove that:

- a successful first sale offers remaining legal targets and Done Selling;
- a successful continuation does not return to card selection;
- no remaining target completes the action automatically;
- Done Selling advances the turn once;
- Cancel and Escape abandon before the first sale but finalize after it.

The full JavaScript test suite will run after the focused Sell tests.
