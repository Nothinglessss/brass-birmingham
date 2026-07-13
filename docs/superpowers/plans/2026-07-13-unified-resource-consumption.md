# Unified Resource Consumption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one rules-correct, player-selectable resource-consumption system for beer, coal, and iron, including owner labels, atomic action execution, and the double-rail Merchant-beer fix.

**Architecture:** Add a pure `ResourcePlanner` that reconstructs legal source options from current `GameState`, replays stable source IDs, auto-resolves forced choices, and returns either the next genuine choice or a complete immutable consumption plan. `GameLogic` remains authoritative: each action replans and validates immediately before committing. `UIManager` provides one shared source picker and passes only stable source IDs, never prices or trusted rule metadata.

**Tech Stack:** Browser-native JavaScript, HTML/CSS, Node.js `node:assert`/`vm` tests, local static HTTP server, in-app browser verification.

**Working-tree safety:** `css/style.css`, `index.html`, and the main JavaScript files already contain user changes. Preserve them. Before every commit, inspect `git diff` and `git diff --cached`; if our hunks cannot be isolated from pre-existing edits, leave that task uncommitted rather than committing unrelated work.

---

## File Structure

- Create `js/resourcePlanner.js`: pure source discovery, staged selection replay, simulation, pricing, and plan validation.
- Create `tests/resource_planner_sources.test.js`: source legality, owner metadata, forced-choice, coal tie, iron fallback, and beer-context contracts.
- Create `tests/resource_action_execution.test.js`: action integration, selected-source consumption, atomic failure, Sell Merchant binding, bonuses, and double rail.
- Create `tests/resource_picker_ui.test.js`: shared picker HTML, owner name/color, Merchant/market labels, phase transitions, and cancellation.
- Modify `js/gameState.js`: expose non-mutating graph/resource helpers needed by the planner and reset Merchant bonus state with Merchant beer.
- Modify `js/gameLogic.js`: construct the planner, expose plan entry points, validate completed plans, and atomically commit Build/Develop/Network/Sell.
- Modify `js/uiManager.js`: insert resource selection between target and card selection and render the shared picker.
- Modify `index.html`: load `resourcePlanner.js` and add the `Select Resources` phase step.
- Modify `css/style.css`: owner chips, source availability, resource summary, and narrow modal layout.
- Modify `README.md`: document player-selected legal resource sourcing.

---

### Task 1: Source Discovery and Owner Metadata

**Files:**
- Create: `js/resourcePlanner.js`
- Create: `tests/resource_planner_sources.test.js`
- Modify: `js/gameState.js` market price helpers
- Modify: `index.html` script list

- [ ] **Step 1: Write failing source-discovery tests**

Create a VM test that loads `boardGraphSource.js`, `gameData.js`, `gameState.js`, and the new planner. Use this public source shape consistently:

```js
{
    id: 'tile:birmingham_3',
    resource: 'beer',
    sourceType: 'brewery',
    key: 'birmingham_3',
    ownerId: 0,
    ownerName: 'Ada',
    ownerColor: '#c0392b',
    locationId: 'birmingham',
    locationName: 'Birmingham',
    available: 2,
}
```

Add these focused assertions:

```js
assert.deepEqual(
    planner.getIronOptions(sim).map(option => option.id).sort(),
    ['tile:birmingham_2', 'tile:dudley_1']
);
assert.equal(planner.getIronOptions(sim).some(option => option.sourceType === 'market'), false);

assert.deepEqual(
    planner.getBeerOptions(sim, {
        playerId: 0,
        requiredLocationId: 'birmingham',
        merchantIndex: 1,
        allowMerchant: true,
    }).map(option => option.id).sort(),
    ['merchant:1', 'tile:birmingham_3', 'tile:burtonOnTrent_1']
);

const adaBeer = planner.getBeerOptions(sim, beerContext)
    .find(option => option.id === 'tile:birmingham_3');
assert.equal(adaBeer.ownerName, 'Ada');
assert.equal(adaBeer.ownerColor, game.players[0].color);

game.boardIndustries = {};
game.boardLinks = { 'birmingham-oxford': { playerId: 0, type: 'canal' } };
game.coalMarket = 0;
game.ironMarket = 0;
assert.equal(game.getCoalPrice(), 8);
assert.equal(game.getIronPrice(), 6);
assert.equal(
    planner.getCoalOptions(planner.createSimulation(), ['birmingham'])[0].price,
    8
);
assert.equal(planner.getIronOptions(planner.createSimulation())[0].price, 6);
```

Also assert that a Sell context never includes a different connected Merchant, and a Network context with `allowMerchant: false` includes no `merchant:*` option.

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/resource_planner_sources.test.js`

Expected: FAIL because `js/resourcePlanner.js` or `ResourcePlanner` does not exist.

- [ ] **Step 3: Implement stable source descriptors**

Create `ResourcePlanner` with these initial methods:

```js
class ResourcePlanner {
    constructor(state) {
        this.state = state;
    }

    getLocationIdForKey(key) {
        return key.startsWith('farm_') ? key.slice(5) : key.split('_')[0];
    }

    getLocationName(locationId) {
        return CITIES[locationId]?.name || BREWERY_FARMS[locationId]?.name ||
            MERCHANTS[locationId]?.name || locationId;
    }

    getTileSource(resource, key, tile) {
        const owner = this.state.players[tile.playerId];
        const locationId = this.getLocationIdForKey(key);
        const sourceType = resource === 'iron' ? 'works' :
            resource === 'coal' ? 'mine' : 'brewery';
        return {
            id: `tile:${key}`,
            resource,
            sourceType,
            key,
            ownerId: tile.playerId,
            ownerName: owner.name,
            ownerColor: owner.color,
            locationId,
            locationName: this.getLocationName(locationId),
            available: tile.resourceCubes,
        };
    }
}
```

Add `createSimulation(extraLinks = [])`, `getIronOptions(simulation)`, `getCoalOptions(simulation, requiredLocationIds)`, and `getBeerOptions(simulation, context)` alongside these concrete descriptor helpers. `createSimulation()` clones resource counts into plain maps, copies `coalMarket`, `ironMarket`, Merchant barrel state, and `boardLinks`, then overlays `extraLinks`; it never retains mutable tile objects. `getIronOptions()` must omit the market while any Works has iron. `getCoalOptions()` must return only mines at the minimum BFS distance and only return a market option when no connected mine remains. Each tile appears once with `available`, not once per cube. Market descriptors use `ownerId: null`, `ownerName: 'Market'`, and the current authoritative price.

Change `GameState.getCoalPrice()` and `GameState.getIronPrice()` so an empty market returns the rulebook general-supply prices rather than `Infinity`:

```js
getCoalPrice() {
    const spaceIndex = COAL_MARKET_PRICES.length - this.coalMarket;
    return COAL_MARKET_PRICES[spaceIndex] ?? 8;
}

getIronPrice() {
    const spaceIndex = IRON_MARKET_PRICES.length - this.ironMarket;
    return IRON_MARKET_PRICES[spaceIndex] ?? 6;
}
```

The planner must still return one reusable market/general-supply option when the corresponding market count is zero. Simulated consumption leaves the count at zero and adds £8 per coal or £6 per iron to `marketCost`.

- [ ] **Step 4: Load the planner in the application**

Insert this script between `gameState.js` and `gameLogic.js`:

```html
<script src="js/resourcePlanner.js?v=resource-choice-v1"></script>
```

- [ ] **Step 5: Run the test and verify GREEN**

Run: `node tests/resource_planner_sources.test.js`

Expected: `resource planner source tests passed`.

- [ ] **Step 6: Commit only isolated new-file changes**

```powershell
git add -- js/resourcePlanner.js tests/resource_planner_sources.test.js
git diff --cached --check
git commit -m "feat: add rules-aware resource source discovery"
```

Leave the pre-existing `index.html` edit unstaged unless its single script hunk can be staged without unrelated changes.

---

### Task 2: Staged Planning, Forced Choices, and Validation

**Files:**
- Modify: `js/resourcePlanner.js`
- Modify: `tests/resource_planner_sources.test.js`

- [ ] **Step 1: Write failing staged-plan tests**

Define the planner result contract:

```js
// Genuine user choice
{
    status: 'choice',
    selections: ['tile:birmingham_3'],
    nextChoice: {
        resource: 'beer',
        remaining: 1,
        options: [
            {
                id: 'tile:birmingham_3', resource: 'beer', sourceType: 'brewery',
                key: 'birmingham_3', ownerId: 0, ownerName: 'Ada',
                ownerColor: '#c0392b', locationId: 'birmingham',
                locationName: 'Birmingham', available: 1,
            },
            {
                id: 'tile:burtonOnTrent_1', resource: 'beer', sourceType: 'brewery',
                key: 'burtonOnTrent_1', ownerId: 1, ownerName: 'Ben',
                ownerColor: '#2980b9', locationId: 'burtonOnTrent',
                locationName: 'Burton-on-Trent', available: 1,
            },
        ],
    },
    consumptions: [{
        resource: 'beer',
        sourceId: 'tile:birmingham_3',
        sourceType: 'brewery',
        key: 'birmingham_3',
    }],
    marketCost: 0,
}

// Fully resolved, including forced sources
{
    status: 'complete',
    selections: ['tile:birmingham_3'],
    consumptions: [{ resource: 'beer', sourceId: 'tile:birmingham_3' }],
    marketCost: 0,
}

// Submitted source is stale or illegal
{ status: 'invalid', message: 'Selected beer source is no longer legal' }
```

Add tests proving:

```js
assert.equal(planner.planSell(sellContext, []).status, 'choice');
assert.equal(planner.planSell(singleSourceContext, []).status, 'complete');
assert.deepEqual(planner.planSell(singleSourceContext, []).selections, []);

const split = planner.planSell(twoBeerContext, [
    'tile:birmingham_3',
    'tile:burtonOnTrent_1',
]);
assert.equal(split.status, 'complete');
assert.equal(split.consumptions.length, 2);

const overdraft = planner.planSell(twoBeerContext, [
    'tile:birmingham_3',
    'tile:birmingham_3',
]);
assert.equal(overdraft.status, 'invalid');
```

Add coal tests where two distance-1 mines yield `choice`, choosing one depletes it in simulation, and the second unit is automatically resolved from the now-unique closest mine. Add iron tests where two Works yield `choice`, one Works yields forced completion, and market price is accumulated only after all Works cubes are simulated away.

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/resource_planner_sources.test.js`

Expected: FAIL because staged `plan*()` methods are missing.

- [ ] **Step 3: Implement replay-based planning**

Add:

```js
plan(action, context, selections = [])
planBuild(context, selections = [])
planDevelop(context, selections = [])
planNetwork(context, selections = [])
planSell(context, selections = [])
resolveRequirement(simulation, requirement, selectionCursor)
applySimulatedConsumption(simulation, source)
```

Every `plan*()` call must create a fresh simulation, replay submitted source IDs in order, auto-apply a source only when exactly one legal option exists, and stop at the first step with two or more options and no submitted selection. Reject missing IDs, wrong resource types, unavailable cubes, disallowed Merchant IDs, or selections beyond required quantity.

Use ordered requirements:

```js
// Build
[{ resource: 'coal', quantity: tile.costCoal },
 { resource: 'iron', quantity: tile.costIron }]

// Develop
[{ resource: 'iron', quantity: industryTypes.length }]

// Sell
[{ resource: 'beer', quantity: tile.tileData.beersToSell }]
```

For Network, create one coal requirement per ordered Link, then one Brewery-only beer requirement for a double rail. Add simulated Links before resolving the coal for that Link.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node tests/resource_planner_sources.test.js`

Expected: all source and staged-plan tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- js/resourcePlanner.js tests/resource_planner_sources.test.js
git diff --cached --check
git commit -m "feat: add staged resource consumption plans"
```

---

### Task 3: Atomic Build and Develop Execution

**Files:**
- Create: `tests/resource_action_execution.test.js`
- Modify: `js/gameLogic.js`
- Modify: existing VM test loaders that instantiate `GameLogic`

- [ ] **Step 1: Write failing Build and Develop execution tests**

Load `resourcePlanner.js` before `gameLogic.js` in VM tests. Add a `snapshot(game)` helper using `JSON.stringify(game.toJSON())` plus the industry stack `used` flags.

Test selected iron consumption:

```js
const plan = logic.planBuildResources({
    playerId: 0,
    cityId: 'birmingham',
    slotIndex: 2,
    industryType: INDUSTRY_TYPES.MANUFACTURER,
}, ['tile:dudley_1']);
assert.equal(plan.status, 'complete');

const result = logic.executeBuild(
    0, 'birmingham', 2, INDUSTRY_TYPES.MANUFACTURER, 0,
    ['tile:dudley_1']
);
assert.equal(result.success, true);
assert.equal(game.boardIndustries.dudley_1.resourceCubes, 0);
assert.equal(game.boardIndustries.birmingham_2.type, INDUSTRY_TYPES.MANUFACTURER);
```

Test atomic rejection by capturing the snapshot, submitting a stale or wrong resource ID, and asserting exact equality afterward. Repeat for `executeDevelop(..., selections)` and ensure the selected Works is consumed while the unselected Works remains unchanged.

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/resource_action_execution.test.js`

Expected: FAIL because `GameLogic` does not expose plan methods or accept selections.

- [ ] **Step 3: Integrate the planner and central commit helper**

Update the constructor and add:

```js
constructor(gameState) {
    this.state = gameState;
    this.resourcePlanner = new ResourcePlanner(gameState);
}

planBuildResources(context, selections = []) {
    return this.resourcePlanner.planBuild(context, selections);
}

planDevelopResources(context, selections = []) {
    return this.resourcePlanner.planDevelop(context, selections);
}

commitResourcePlan(playerId, plan) {
    for (const unit of plan.consumptions) {
        if (unit.sourceType === 'market') {
            this.state[`${unit.resource}Market`]--;
        } else if (unit.sourceType !== 'merchant') {
            this.state.consumeResource(unit.key);
        }
    }
}
```

Append `resourceSelections = []` to `executeBuild` and `executeDevelop`. Their order must be:

1. validate card, target, developable tiles, and resource plan;
2. require `plan.status === 'complete'` and check `baseCost + plan.marketCost` against money;
3. perform mutations with no remaining failure branches;
4. spend the exact base and market cost once;
5. discard the card last.

Replace `calculateBuildCost()` resource loops with planner pricing so target availability and execution share the same rules.

- [ ] **Step 4: Run focused and regression tests**

Run:

```powershell
node tests/resource_action_execution.test.js
node tests/rule_deviations.test.js
node tests/build_modal.test.js
```

Expected: all three scripts pass.

- [ ] **Step 5: Commit safely**

Stage the new test file. Stage only our `gameLogic.js` hunks after verifying they do not absorb pre-existing edits. If isolation is not provable, leave the production file uncommitted.

---

### Task 4: Ordered Rail Planning and the Merchant-Beer Rule Fix

**Files:**
- Modify: `js/resourcePlanner.js`
- Modify: `js/gameLogic.js`
- Modify: `tests/resource_action_execution.test.js`
- Modify: `tests/rule_deviations.test.js`

- [ ] **Step 1: Write failing Network tests**

Add scenarios proving:

```js
const merchantOnly = logic.planNetworkResources({
    playerId: 0,
    connectionIds: ['birmingham-coventry', 'birmingham-dudley'],
}, []);
assert.equal(merchantOnly.status, 'impossible');

const withBreweries = logic.planNetworkResources(doubleRailContext, []);
assert.equal(withBreweries.status, 'choice');
assert.equal(withBreweries.nextChoice.options.some(o => o.id.startsWith('merchant:')), false);
assert.deepEqual(
    withBreweries.nextChoice.options.map(o => o.ownerName).sort(),
    ['Ada', 'Ben']
);
```

Submit the opponent Brewery connected through the simulated second Link and assert success. Reverse the Link order in a separate context and assert that the same opponent Brewery is rejected when it is not connected to that order's second Link. Assert an exact state snapshot on invalid Merchant-beer submission.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node tests/resource_action_execution.test.js`

Expected: FAIL because Network still auto-consumes the first source and accepts Merchant sources through `findBeerSourcesForConnections()`.

- [ ] **Step 3: Replace automatic Network consumption**

Add `planNetworkResources(context, selections = [])`. Generate double-rail targets as ordered `connectionIds` and render/store that order. The planner must:

- add the first simulated Link, then resolve its closest coal;
- add the second simulated Link, then resolve its closest coal;
- offer owned Breweries anywhere;
- offer opponent Breweries only from the connected component touching the second simulated Link;
- call beer discovery with `allowMerchant: false`;
- price coal-market units authoritatively;
- return `impossible` when no Brewery beer exists.

Append `resourceSelections = []` to `executeNetwork`. Replan and validate card, ordered Links, link tiles remaining, affordability, coal, and beer before consuming anything. Remove the old `beerSources[0]` branch and do not decrement `merchantTiles[*].hasBeer` anywhere in Network execution.

- [ ] **Step 4: Run focused and regression tests**

Run:

```powershell
node tests/resource_action_execution.test.js
node tests/rule_deviations.test.js
node tests/board_routes.test.js
```

Expected: all pass; the double-rail test now supplies explicit Brewery selection when a genuine choice exists.

- [ ] **Step 5: Commit safely**

Commit only isolated planner/test hunks. Leave overlapping pre-existing `gameLogic.js` edits uncommitted unless the staged diff contains only this task.

---

### Task 5: Merchant-Bound Sell Plans and Bonuses

**Files:**
- Modify: `js/resourcePlanner.js`
- Modify: `js/gameLogic.js`
- Modify: `js/gameState.js`
- Modify: `tests/resource_action_execution.test.js`
- Modify: `tests/rule_deviations.test.js`

- [ ] **Step 1: Write failing Sell tests**

Add two connected matching Merchants and assert `getValidSellTargets()` returns separate targets identified by `merchantIndex`. Verify that only the chosen Merchant appears in beer options.

Add execution assertions:

```js
const brewerySale = logic.executeSell(
    0, 'birmingham_0', oxfordIndex, 0, ['tile:birmingham_3']
);
assert.equal(brewerySale.success, true);
assert.equal(game.merchantTiles[oxfordIndex].hasBeer, true);
assert.equal(game.players[0].income, incomeBefore + tileIncomeOnly);

const merchantSale = logic.executeSell(
    0, 'birmingham_1', oxfordIndex, 0, [`merchant:${oxfordIndex}`]
);
assert.equal(merchantSale.success, true);
assert.equal(game.merchantTiles[oxfordIndex].hasBeer, false);
assert.equal(game.players[0].income, incomeBefore + tileIncome + 2);
```

Assert that a different Merchant ID, a disconnected Merchant, and a Merchant beer submitted for a zero-beer sale are rejected atomically. After `endCanalEra()`, assert both `hasBeer === true` and `bonusClaimed === false` so the replenished barrel can grant its bonus again.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node tests/resource_action_execution.test.js`

Expected: FAIL because Sell does not bind a Merchant and awards a bonus independently of Merchant-beer consumption.

- [ ] **Step 3: Bind Sell targets and execution to a Merchant**

Change Sell targets to:

```js
{
    key,
    cityId,
    tile,
    beerNeeded,
    merchantIndex,
    merchantLocation: merchant.location,
}
```

Remove the `beersToSell === 0` auto-sell exception; every sale must identify a connected Merchant that buys that industry. Replace `executeSell(playerId, tileKeys, cardIndex)` with:

```js
executeSell(playerId, tileKey, merchantIndex, cardIndex, resourceSelections = [])
```

Replan before mutation. Grant a Merchant bonus only for a committed consumption whose `sourceId` is `merchant:${merchantIndex}`. Apply the bonus from that selected Merchant, set `hasBeer = false`, and set `bonusClaimed = true`. Brewery beer never grants a Merchant bonus.

In `GameState.endCanalEra()`, reset both fields together:

```js
for (const merchant of this.merchantTiles) {
    merchant.hasBeer = true;
    merchant.bonusClaimed = false;
}
```

- [ ] **Step 4: Run focused and regression tests**

Run:

```powershell
node tests/resource_action_execution.test.js
node tests/rule_deviations.test.js
node tests/merchant_rendering.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit safely**

Stage only isolated Sell/planner/test hunks after inspecting the cached diff. Do not commit unrelated user changes in `gameLogic.js` or `gameState.js`.

---

### Task 6: Unified Resource Picker and Owner Display

**Files:**
- Create: `tests/resource_picker_ui.test.js`
- Modify: `js/uiManager.js`
- Modify: `index.html`
- Modify: `css/style.css`

- [ ] **Step 1: Write failing picker view-model and flow tests**

Test a pure UI view-model method:

```js
const vm = ui.getResourceSourceViewModel({
    id: 'tile:birmingham_3',
    resource: 'beer',
    sourceType: 'brewery',
    ownerId: 0,
    ownerName: 'Ada',
    ownerColor: '#c0392b',
    locationName: 'Birmingham',
    available: 2,
});
assert.equal(vm.title, 'Ada - Brewery');
assert.equal(vm.detail, 'Birmingham - 2 beer available');
assert.equal(vm.ownerColor, '#c0392b');
```

Test neutral labels:

```js
assert.equal(ui.getResourceSourceViewModel(market).title, 'Coal Market');
assert.equal(ui.getResourceSourceViewModel(merchant).title, 'Oxford Merchant');
assert.match(ui.renderResourceChoiceHtml(choice), /Ada/);
assert.match(ui.renderResourceChoiceHtml(choice), /#c0392b/);
assert.match(ui.renderResourceChoiceHtml(choice), /Income \+2/);
```

With stubbed planner results, assert a forced complete plan advances directly to discard-card state without calling `showModal`, a `choice` result opens `Select Beer Source`, clicking adds the source ID and replans, and `cancelAction()` clears `pendingData.resourceSelections`.

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/resource_picker_ui.test.js`

Expected: FAIL because the shared picker and resource phase do not exist.

- [ ] **Step 3: Add the resource phase to the phase bar**

Change the phase bar to four displayed steps:

```text
Choose Action -> Select Target -> Select Resources -> Discard Card
```

Use `actionStep` values `0 = target`, `1 = resources`, and `2 = card`. Non-resource actions and complete forced plans move directly to `2`. Update `onCardClicked()` so only `actionStep === 2` executes an action.

- [ ] **Step 4: Implement the shared planning loop and picker**

Add:

```js
beginResourcePlanning(targetData)
getPendingResourcePlan()
advanceResourcePlanning()
showResourceChoice(choice)
getResourceSourceViewModel(source)
renderResourceChoiceHtml(choice)
```

Every action target handler stores `resourceSelections: []` and calls `beginResourcePlanning()` instead of jumping to card selection. `advanceResourcePlanning()` handles:

- `complete`: close the modal, store the complete plan, set `actionStep = 2`, update phase bar and hand;
- `choice`: set `actionStep = 1`, render two or more legal options;
- `impossible`/`invalid`: show an error and restart that action's target selection without mutating state.

Each industry row must include an owner chip with `ownerName` and a dot using `ownerColor`. Merchant and market rows use neutral chips. For double rail, include `First link` and `Second link` in target details.

Pass `pendingData.resourceSelections` and the selected `merchantIndex` to the updated `execute*` methods.

- [ ] **Step 5: Add responsive picker styles**

Add `.resource-choice-summary`, `.resource-owner`, `.resource-owner-dot`, `.resource-source-availability`, and `.resource-source-bonus`. At `max-width: 600px`, set `#modal-content` to `min-width: 0; width: calc(100vw - 24px);` and allow source details to wrap without horizontal overflow.

- [ ] **Step 6: Run UI and logic tests**

Run:

```powershell
node tests/resource_picker_ui.test.js
node tests/build_modal.test.js
node tests/resource_action_execution.test.js
```

Expected: all pass.

- [ ] **Step 7: Commit safely**

Commit the new test file. Stage existing-file hunks only after confirming no pre-existing styling, markup, or UI changes are included.

---

### Task 7: Documentation, Full Regression, and Rendered Verification

**Files:**
- Modify: `README.md`
- Verify: all `tests/*.test.js`
- Verify: rendered local application

- [ ] **Step 1: Update the README behavior statement**

Replace the automatic-sourcing claim with:

```markdown
The game enforces all coal, iron, and beer sourcing rules. Forced sources are consumed automatically; when multiple legal sources exist, you choose the source and can see who owns it before confirming the action.
```

Document that double-rail beer must come from a Brewery and that Merchant bonuses require consuming that Merchant's beer.

- [ ] **Step 2: Run every test script**

Run:

```powershell
$failed = @()
Get-ChildItem tests -Filter '*.test.js' | Sort-Object Name | ForEach-Object {
    & node $_.FullName
    if ($LASTEXITCODE -ne 0) { $failed += $_.Name }
}
if ($failed.Count -gt 0) { throw "Failed tests: $($failed -join ', ')" }
```

Expected: every script prints its pass message and the command exits 0.

- [ ] **Step 3: Start the local app and verify rendered invariants**

Run: `python -m http.server 8080` from the repository root in a hidden background process.

Use the in-app browser at `http://127.0.0.1:8080`, begin a 3-player game, and use page-context evaluation against the exposed `window.gameState`, `window.gameLogic`, and lexical `uiManager` variables to install the same small board states from `resource_action_execution.test.js`. Call `uiManager.refresh()` after each setup, then initiate Build, Develop, Sell, and double-rail Network through the visible action buttons.

Measure and record:

```js
({
  modalWidth: document.querySelector('#modal-content').getBoundingClientRect().width,
  viewportWidth: document.documentElement.clientWidth,
  documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  ownerRows: [...document.querySelectorAll('.resource-owner')].map(el => el.textContent.trim()),
  activePhase: document.querySelector('.phase-step.active')?.textContent.trim(),
})
```

At desktop and 390px width, require `documentOverflow === 0`, `modalWidth <= viewportWidth - 24`, readable owner rows, and `Select Resources` active while the picker is open. Confirm forced single-source cases never display the picker and Escape consumes nothing.

- [ ] **Step 4: Inspect final diffs and working-tree ownership**

Run:

```powershell
git diff --check
git status --short
git diff -- js/resourcePlanner.js js/gameLogic.js js/gameState.js js/uiManager.js index.html css/style.css README.md tests
```

Confirm there are no whitespace errors, no denied files were touched, and unrelated pre-existing changes remain preserved.

- [ ] **Step 5: Final commit only if safe**

If and only if the staged diff contains exclusively the resource-consumption implementation and tests:

```powershell
git diff --cached --check
git commit -m "feat: add player-selected resource consumption"
```

Otherwise leave overlapping implementation changes uncommitted and report that explicitly.

---

## Plan Self-Review

- Spec coverage: beer, coal, iron, forced choices, owner identity, Merchant binding/bonus, ordered double rail, atomicity, cancellation, responsive rendering, and regression testing are each assigned to a task.
- Completeness scan: no deferred implementation markers or unspecified error-handling steps remain.
- Type consistency: all actions pass ordered `resourceSelections` arrays of stable source IDs; planner results consistently use `status`, `selections`, `nextChoice`, `consumptions`, and `marketCost`.
- Scope: changes are limited to resource sourcing and directly coupled Sell/Network correctness.
