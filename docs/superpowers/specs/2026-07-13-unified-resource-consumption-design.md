# Unified Resource Consumption Design

## Goal

Replace action-specific automatic resource consumption with one rules-aware planning and selection system for beer, coal, and iron. Forced consumption remains automatic. The user is prompted only when two or more legal source choices exist.

The resulting action must be atomic: invalid cards, stale resource selections, insufficient money, or changed board state must leave money, markets, tiles, links, cards, and industry stacks unchanged.

## Rulebook Contract

### Beer

- A player may consume beer from any of their own unflipped Breweries, without a connection requirement.
- A player may consume beer from an opponent's unflipped Brewery only when it is connected to the location where beer is required.
- During a Sell action, beer may be consumed from the barrel beside the specific Merchant selected for that sale.
- Merchant beer is optional and awards that Merchant's bonus only when its barrel is consumed.
- Each barrel in a multi-beer requirement may come from a different legal source.
- A double-rail Network action must consume beer from a Brewery. Merchant beer is never legal.
- If an opponent's Brewery supplies a double-rail action, it must be connected to the second rail Link after that Link is placed.

### Coal

- Coal must come from the closest connected unflipped Coal Mine, measured by the fewest built Link tiles after the consuming tile or Link is placed.
- If multiple Coal Mines are tied at the closest distance, the user chooses between those tied sources.
- When more than one coal is required, legality is recalculated after every cube because depleting a mine may make a different mine the next closest source.
- Coal Market purchases are legal only when no connected unflipped Coal Mine remains and the consuming location is connected to a coal-market Merchant icon.
- Market cubes are taken from the cheapest occupied market spaces first. If the market is empty, the general-supply price applies.

### Iron

- Iron may come from any unflipped Iron Works on the board; no connection is required.
- If multiple Iron Works contain iron, the user chooses the source for each cube.
- Iron Market purchases are legal only after no unflipped Iron Works contains iron.
- Market cubes are taken from the cheapest occupied market spaces first. If the market is empty, the general-supply price applies.

## Interaction Flow

Each resource-consuming action follows the same sequence:

1. Choose the action target, including any destination or ordering required by the rules.
2. Build a resource-consumption plan from the current board state.
3. Automatically fill every forced source.
4. If a plan step has multiple legal choices, show the unified source picker.
5. Continue until the exact required quantity is planned.
6. Choose a valid discard card.
7. Revalidate and commit the entire action atomically.

The source picker uses the existing modal visual language. It shows:

- the resource and remaining quantity;
- source owner and location;
- available cube or barrel count;
- whether the source is a Brewery, Mine, Works, or Merchant;
- the Merchant bonus when Merchant beer is eligible;
- a clear first-Link/second-Link label for double-rail actions.

Selecting the same multi-cube industry repeatedly is allowed up to its available count. Forced market purchases are displayed in the final cost summary but do not require a click.

Cancellation clears the pending plan without changing game state.

## Action-Specific Behavior

### Build

After the player chooses a build location and industry, the planner simulates placing that industry and resolves required coal followed by iron. Coal choices are restricted to tied closest mines; iron choices may use any Works. Market costs feed into the displayed and validated total cost. The industry tile is not removed from the player mat until the final commit.

### Develop

After choosing one or two tiles, the planner resolves one iron per tile. A picker appears only when multiple Iron Works are legal for a required cube. Industry tiles remain on the player mat until the final commit.

### Network

For a single rail, the planner simulates placing the Link, then resolves one coal.

For a double rail, the UI preserves an explicit first and second Link order. The planner simulates and resolves them sequentially:

1. place the first Link in the simulation and resolve its coal;
2. place the second Link in the simulation and resolve its coal;
3. resolve one Brewery-only beer using the completed simulated placement, applying the opponent-connectivity rule to the second Link.

Merchant beer is excluded from both option generation and final validation.

### Sell

A sell target identifies both the industry and the connected matching Merchant. If multiple matching Merchants are available, the user chooses the Merchant as part of target selection. Only that Merchant's barrel may appear as Merchant beer for the sale.

The planner resolves the beer printed on the industry tile. Consuming the selected Merchant's barrel removes it and immediately grants that Merchant's bonus. Selling with Brewery beer does not grant a Merchant bonus.

## Architecture

### Planning model

`GameLogic` owns a pure resource-planning API. A plan contains:

- action context and target identifiers;
- ordered resource requirements;
- selected source identifiers for each unit;
- forced market purchases and their prices;
- total monetary cost;
- a fingerprint of the relevant current state for diagnostics.

Source identifiers are stable data references such as board industry keys, farm Brewery keys, Merchant tile indices, and market entries. UI labels are derived separately so rules code does not depend on HTML.

The planner exposes the next unresolved step with its currently legal options. The UI repeatedly submits one selection until no unresolved choice remains. This staged model supports coal's requirement to recalculate closest mines after each cube.

### Validation and commit

Each `execute*` method accepts the completed resource selections alongside its existing action arguments. Before any mutation it reconstructs the plan from current state and validates:

- the action target and discard card;
- exact resource quantity;
- source type and connectivity;
- source availability after earlier planned consumption;
- coal closest-distance constraints;
- Merchant identity and Merchant-beer restrictions;
- double-rail Brewery and second-Link restrictions;
- market availability and current price;
- final affordability.

Only after all checks pass does a commit phase apply resource depletion, tile flipping and income, market changes, money, target placement/removal, Merchant bonuses, and card discard.

No caller may pass arbitrary prices or source metadata; execution resolves all authoritative values from source identifiers and current state.

### UI integration

`UIManager` stores the pending resource selections with the existing `pendingData`. Choosing a target starts the planning loop. The loop either auto-fills a forced option, renders the picker for multiple options, or advances to card selection when complete.

The phase bar distinguishes `Select Target`, `Select Resources`, and `Discard Card`. Escape/cancel at any point discards the pending plan.

## Error Handling

- A stale or illegal selection returns a specific failure result and performs no mutations.
- If the board changes before commit, the action is replanned; a now-forced source may be auto-filled, while a new choice reopens the picker.
- If no legal allocation exists, the target is not offered. If it becomes impossible while pending, the UI reports that resources are no longer available and returns to target selection.
- Duplicate selections beyond a tile's remaining cubes are rejected.
- Merchant beer selected for Network is rejected even if submitted outside the UI.

## Testing Strategy

### Logic tests

- Beer options include all owned Breweries, only connected opponent Breweries, and only the selected Merchant during Sell.
- Multi-beer requirements can split sources and cannot overdraw a source.
- Double rail never offers or accepts Merchant beer.
- Double-rail opponent beer is validated against the second placed Link.
- Coal offers only tied closest mines, recalculates after depletion, and falls back to market only when allowed.
- Iron offers every Works with iron and falls back to market only after Works are exhausted.
- Unique legal sources are forced; multiple legal sources remain unresolved for the user.
- Invalid and stale selections leave serialized game state unchanged.
- Merchant bonuses occur exactly when Merchant beer is consumed and can occur again after the Canal-to-Rail beer reset.

### UI tests

- Target selection opens the shared picker only for a genuine choice.
- The picker labels resource, owner, location, quantity, and Merchant bonus correctly.
- Repeated selection from a multi-cube source decrements its displayed availability.
- Completing the plan advances to card selection with the chosen source identifiers retained.
- Cancel clears resource selections and restores normal target/action state.

### Rendered verification

Run the local application in a browser and exercise Build, Develop, Sell, and double-rail Network examples at desktop and a narrow viewport. Verify that the modal does not overflow, source rows remain readable, the remaining counter updates, forced choices do not flash a modal, and cancellation returns to the correct phase without consuming resources.

## Scope

This change covers resource source selection and the directly coupled Sell and double-rail rules required to make that selection correct. It does not redesign unrelated action rules, scoring, board rendering, or general modal styling.
