# Multi-Industry Sell Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one Sell action and one discarded card to sell multiple legal industries sequentially, including repeated sales of the same product.

**Architecture:** Refactor `GameLogic` so the existing atomic single-industry sale is shared by a first-sale wrapper that discards a card and a continuation wrapper that does not. Add a short-lived Sell session to `UIManager`; after each successful sale it refreshes legal targets and offers Done Selling, while preserving immediate beer and Merchant-bonus resolution.

**Tech Stack:** Browser JavaScript, Node.js `node:assert`, `node:vm`, HTML/CSS modal UI.

---

## File Map

- Modify `js/gameLogic.js`: extract the atomic single-industry sale and expose first/continuation entry points.
- Modify `js/uiManager.js`: manage the sequential Sell session, Done Selling, continuation execution, and cancel/finalize semantics.
- Modify `tests/resource_action_execution.test.js`: cover same-type, mixed-type, multi-bonus, one-card, and atomic continuation rules.
- Modify `tests/resource_picker_ui.test.js`: cover continuation UI state, automatic completion, Done Selling, and cancellation behavior.
- Modify `tests/rule_deviations.test.js`: remove the obsolete regression that requires multiple sales to fail.
- Modify `README.md`: document that one Sell action may repeat sales.

### Task 1: Atomic first and continuation sale APIs

**Files:**
- Modify: `tests/resource_action_execution.test.js`
- Modify: `tests/rule_deviations.test.js`
- Modify: `js/gameLogic.js:725-905`

- [ ] **Step 1: Add failing same-type and mixed-type continuation tests**

Add this setup and tests after the existing Sell tests in `tests/resource_action_execution.test.js`:

```js
function setupMultiSellGame(types, beersToSell = 0) {
    const game = createGame();
    game.players[0].hand = [{
        type: context.CARD_TYPES.LOCATION,
        location: 'birmingham',
        name: 'Birmingham',
    }];
    game.boardIndustries = {};
    types.forEach((type, index) => {
        const tile = makeTile(0, type, 0);
        tile.tileData.beersToSell = beersToSell;
        tile.tileData.income = 0;
        game.boardIndustries[`birmingham_${index}`] = tile;
    });
    game.boardLinks = {
        'birmingham-oxford': { playerId: 0, type: 'canal' },
    };
    game.merchantTiles = types.map(type => ({
        location: 'oxford',
        buys: type,
        hasBeer: beersToSell > 0,
        bonusClaimed: false,
    }));
    return { game, logic: new context.GameLogic(game) };
}

function testOneSellActionSellsTwoIndustriesOfTheSameType() {
    const { game, logic } = setupMultiSellGame([
        context.INDUSTRY_TYPES.MANUFACTURER,
        context.INDUSTRY_TYPES.MANUFACTURER,
    ]);

    const first = logic.executeSell(0, 'birmingham_0', 0, 0);
    const second = logic.executeAdditionalSell(0, 'birmingham_1', 0);

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(game.boardIndustries.birmingham_0.flipped, true);
    assert.equal(game.boardIndustries.birmingham_1.flipped, true);
    assert.equal(game.players[0].hand.length, 0);
}

function testOneSellActionCanMixIndustryTypes() {
    const { game, logic } = setupMultiSellGame([
        context.INDUSTRY_TYPES.MANUFACTURER,
        context.INDUSTRY_TYPES.COTTON_MILL,
    ]);

    const first = logic.executeSell(0, 'birmingham_0', 0, 0);
    const second = logic.executeAdditionalSell(0, 'birmingham_1', 1);

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(game.players[0].hand.length, 0);
}
```

Register both functions at the bottom of the test file. Remove `testSellActionRejectsMultipleIndustries` and its invocation from `tests/rule_deviations.test.js` because it asserts the rule deviation being fixed.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tests/resource_action_execution.test.js
```

Expected: FAIL because `logic.executeAdditionalSell` is not defined.

- [ ] **Step 3: Extract the single-industry commit and add the continuation API**

Delete the unused `executeSellLegacy` method. Replace the start of the current `executeSell` with these wrappers and move its target/resource/bonus body, without card validation or card discard, into `executeSellIndustry`:

```js
executeSell(
    playerId,
    tileKey,
    merchantIndex,
    cardIndex,
    resourceSelections = [],
    freeDevelopIndustryType = null
) {
    const validCards = this.getValidCardsForAction(playerId, ACTIONS.SELL);
    if (!validCards.includes(cardIndex)) {
        return { success: false, message: 'Invalid card for this sell action' };
    }

    const result = this.executeSellIndustry(
        playerId,
        tileKey,
        merchantIndex,
        resourceSelections,
        freeDevelopIndustryType
    );
    if (!result.success) return result;

    this.discardCard(playerId, cardIndex);
    return result;
}

executeAdditionalSell(
    playerId,
    tileKey,
    merchantIndex,
    resourceSelections = [],
    freeDevelopIndustryType = null
) {
    return this.executeSellIndustry(
        playerId,
        tileKey,
        merchantIndex,
        resourceSelections,
        freeDevelopIndustryType
    );
}

executeSellIndustry(
    playerId,
    tileKey,
    merchantIndex,
    resourceSelections = [],
    freeDevelopIndustryType = null
) {
    const player = this.state.players[playerId];
    const validTarget = this.getValidSellTargets(playerId).some(target =>
        target.key === tileKey && target.merchantIndex === merchantIndex
    );
    if (!validTarget) {
        return { success: false, message: 'No matching merchant demand for this industry' };
    }

    const resourcePlan = this.planSellResources({
        playerId,
        tileKey,
        merchantIndex,
    }, resourceSelections);
    if (resourcePlan.status !== 'complete') {
        return {
            success: false,
            message: resourcePlan.message || 'Choose beer sources before selling',
        };
    }

    const tile = this.state.boardIndustries[tileKey];
    const usedMerchantBeer = resourcePlan.consumptions.some(unit =>
        unit.sourceType === 'merchant' && unit.merchantIndex === merchantIndex
    );
    const merchant = this.state.merchantTiles[merchantIndex];
    const merchantData = usedMerchantBeer ? MERCHANTS[merchant.location] : null;
    let freeDevelopOption = null;

    if (merchantData?.bonusType === 'develop') {
        const options = this.getFreeDevelopOptions(playerId);
        if (options.length > 0) {
            freeDevelopOption = options.find(option =>
                option.type === freeDevelopIndustryType
            );
            if (!freeDevelopOption) {
                return {
                    success: false,
                    message: 'Choose an industry for Gloucester free Develop',
                };
            }
        }
    }

    this.commitResourcePlan(resourcePlan);
    tile.flipped = true;
    this.state.advanceIncomeBySpaces(playerId, tile.tileData.income);

    let freeDevelopResult = null;
    if (usedMerchantBeer) {
        merchant.bonusClaimed = true;
        if (merchantData) {
            switch (merchantData.bonusType) {
                case 'vp':
                    player.vp += merchantData.bonusAmount;
                    break;
                case 'money':
                    player.money += merchantData.bonusAmount;
                    break;
                case 'income':
                    this.state.advanceIncomeBySpaces(playerId, merchantData.bonusAmount);
                    break;
                case 'develop':
                    if (freeDevelopOption) {
                        freeDevelopResult = this.applyChosenFreeDevelop(
                            playerId,
                            freeDevelopOption.type
                        );
                    }
                    break;
            }
        }
    }

    const baseMessage = `Sold ${INDUSTRY_DISPLAY[tile.type].name} Lv${tile.tileData.level}`;
    const bonusMessage = freeDevelopResult
        ? `; free developed ${freeDevelopResult.name} Lv${freeDevelopResult.level}`
        : '';
    return {
        success: true,
        message: `${baseMessage}${bonusMessage}`,
        freeDevelop: freeDevelopResult,
    };
}
```

The moved body must remain in its current validation-before-mutation order. Remove the existing `this.discardCard(playerId, cardIndex)` from that body.

- [ ] **Step 4: Run the focused logic tests and verify GREEN**

Run:

```powershell
node tests/resource_action_execution.test.js
node tests/gloucester_free_develop.test.js
node tests/rule_deviations.test.js
```

Expected: all three scripts print their passing summaries.

- [ ] **Step 5: Add multiple-bonus and atomic-continuation tests**

Add and register:

```js
function testOneSellActionCanClaimMultipleMerchantBeerBonuses() {
    const { game, logic } = setupMultiSellGame([
        context.INDUSTRY_TYPES.MANUFACTURER,
        context.INDUSTRY_TYPES.MANUFACTURER,
    ], 1);
    const incomePositionBefore = game.players[0].incomePosition;

    const first = logic.executeSell(
        0, 'birmingham_0', 0, 0, ['merchant:0']
    );
    const second = logic.executeAdditionalSell(
        0, 'birmingham_1', 1, ['merchant:1']
    );

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(game.merchantTiles[0].hasBeer, false);
    assert.equal(game.merchantTiles[1].hasBeer, false);
    assert.equal(game.merchantTiles[0].bonusClaimed, true);
    assert.equal(game.merchantTiles[1].bonusClaimed, true);
    assert.equal(game.players[0].incomePosition, incomePositionBefore + 4);
    assert.equal(game.players[0].hand.length, 0);
}

function testInvalidAdditionalSaleIsAtomic() {
    const { game, logic } = setupMultiSellGame([
        context.INDUSTRY_TYPES.MANUFACTURER,
        context.INDUSTRY_TYPES.MANUFACTURER,
    ], 1);
    const first = logic.executeSell(
        0, 'birmingham_0', 0, 0, ['merchant:0']
    );
    assert.equal(first.success, true);
    const afterFirstSale = snapshot(game);

    const second = logic.executeAdditionalSell(
        0, 'birmingham_1', 1, ['merchant:0']
    );

    assert.equal(second.success, false);
    assert.equal(snapshot(game), afterFirstSale);
}
```

- [ ] **Step 6: Run the focused test**

Run `node tests/resource_action_execution.test.js`.

Expected: PASS; both Merchant barrels grant their Oxford income bonuses, only one card is gone, and the invalid continuation leaves the post-first-sale snapshot unchanged.

- [ ] **Step 7: Commit the logic slice**

```powershell
git add js/gameLogic.js tests/resource_action_execution.test.js tests/rule_deviations.test.js
git commit -m "fix: support sequential sales in one action"
```

### Task 2: Sequential Sell interaction and Done Selling

**Files:**
- Modify: `tests/resource_picker_ui.test.js`
- Modify: `js/uiManager.js:16-34, 497-579, 814-841, 1118-1164, 1255-1268, 1315-1334`

- [ ] **Step 1: Add failing Sell-session UI tests**

Export `INDUSTRY_TYPES` from the VM context in `tests/resource_picker_ui.test.js`, then add and register:

```js
function sellTarget(key = 'birmingham_0') {
    return {
        key,
        cityId: 'birmingham',
        merchantIndex: 0,
        merchantLocation: 'oxford',
        beerNeeded: 0,
        tile: {
            type: context.INDUSTRY_TYPES.MANUFACTURER,
            tileData: { level: 1, vp: 3, income: 2 },
        },
    };
}

function testSuccessfulSellContinuesWithRefreshedTargets() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.SELL;
    ui.sellSession = { committed: false, messages: [] };
    ui.state = { currentPlayerId: 0 };
    ui.logic = { getValidSellTargets: () => [sellTarget('birmingham_1')] };
    ui.addLogEntry = () => {};
    ui.showToast = () => {};
    ui.updatePhaseBar = () => {};
    ui.updateHand = () => {};
    let reopened = 0;
    ui.startSell = () => { reopened++; };

    ui.handleSellResult({ success: true, message: 'Sold Manufacturer Lv1' });

    assert.equal(ui.sellSession.committed, true);
    assert.deepEqual(ui.sellSession.messages, ['Sold Manufacturer Lv1']);
    assert.equal(reopened, 1);
    assert.equal(ui.actionStep, 0);
}

function testSuccessfulSellAutoFinishesWhenNoTargetsRemain() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.SELL;
    ui.sellSession = { committed: false, messages: [] };
    ui.state = { currentPlayerId: 0 };
    ui.logic = { getValidSellTargets: () => [] };
    ui.addLogEntry = () => {};
    let finished = 0;
    ui.finishSellAction = () => { finished++; };

    ui.handleSellResult({ success: true, message: 'Sold Manufacturer Lv1' });

    assert.equal(finished, 1);
}

function testCompletedSellPlanningExecutesContinuationWithoutCardSelection() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.SELL;
    ui.sellSession = { committed: true, messages: ['Sold Manufacturer Lv1'] };
    ui.pendingData = { resourceSelections: [] };
    ui.closeModal = () => {};
    let continuations = 0;
    ui.processAdditionalSell = () => { continuations++; };

    ui.finishResourcePlanning({ status: 'complete', consumptions: [] });

    assert.equal(continuations, 1);
    assert.notEqual(ui.actionStep, 2);
}

function testCancelFinalizesAfterFirstSale() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.SELL;
    ui.sellSession = { committed: true, messages: ['Sold Manufacturer Lv1'] };
    let finished = 0;
    ui.finishSellAction = () => { finished++; };

    ui.cancelAction();

    assert.equal(finished, 1);
}

function testDoneSellingFooterOnlyAppearsAfterCommittedSale() {
    const ui = new context.UIManager();
    assert.equal(ui.renderSellFooterHtml(false), '');
    assert.match(ui.renderSellFooterHtml(true), /Done Selling/);
    assert.match(ui.renderSellFooterHtml(true), /sell-done-btn/);
}
```

- [ ] **Step 2: Run the UI test and verify RED**

Run `node tests/resource_picker_ui.test.js`.

Expected: FAIL because `handleSellResult`, `processAdditionalSell`, and `renderSellFooterHtml` do not exist.

- [ ] **Step 3: Add Sell-session state and safe reset/finalize behavior**

Add `this.sellSession = null` in the constructor. In `onActionSelected` initialize it only for Sell:

```js
this.sellSession = action === ACTIONS.SELL
    ? { committed: false, messages: [] }
    : null;
```

Split the existing reset body out of `cancelAction` and route committed Sell cancellation to finalization:

```js
cancelAction() {
    if (this.selectedAction === ACTIONS.SELL && this.sellSession?.committed) {
        this.finishSellAction();
        return;
    }
    this.resetActionSelection();
}

resetActionSelection() {
    this.selectedAction = null;
    this.actionStep = 0;
    this.pendingData = {};
    this.selectedCard = null;
    this.sellSession = null;
    this.renderer.setMerchantProductFilter(null);
    this.renderer.clearHighlights();
    this.updateActionButtons();
    this.updateHand();
    this.updatePhaseBar();
    this.closeModal();
}

finishSellAction() {
    const messages = this.sellSession?.messages || [];
    this.completeAction({
        success: true,
        message: messages.join(', ') || 'Finished selling',
    });
}
```

Set `sellSession = null` in the successful reset inside `completeAction`. On a failed `completeAction` call `resetActionSelection()` rather than `cancelAction()` so failure cannot be converted to a successful Done after a committed sale.

- [ ] **Step 4: Render and bind Done Selling**

Extract the current Sell target list markup into `renderSellTargetsHtml(targets)`. Add:

```js
renderSellFooterHtml(canFinish) {
    if (!canFinish) return '';
    return '<button class="modal-btn modal-btn-primary" id="sell-done-btn">Done Selling</button>';
}
```

Update `startSell` to initialize a missing session, pass the footer to `showModal`, and bind its button:

```js
this.sellSession ||= { committed: false, messages: [] };
const footerHtml = this.renderSellFooterHtml(this.sellSession.committed);
this.showModal('Sell Goods', this.renderSellTargetsHtml(targets), null, footerHtml);
document.getElementById('sell-done-btn')?.addEventListener('click', () => {
    this.finishSellAction();
});
```

Before the first sale, keep “Select one industry to sell.” After it, show “Select an industry to sell, or finish the action.”

- [ ] **Step 5: Execute continuation sales without card selection**

At the start of `finishResourcePlanning`, after saving the completed plan, add:

```js
if (this.selectedAction === ACTIONS.SELL && this.sellSession?.committed) {
    this.closeModal();
    this.processAdditionalSell();
    return;
}
```

Add:

```js
processAdditionalSell() {
    const result = this.logic.executeAdditionalSell(
        this.state.currentPlayerId,
        this.pendingData.tileKey,
        this.pendingData.merchantIndex,
        this.pendingData.resourceSelections,
        this.pendingData.freeDevelopIndustryType
    );
    this.handleSellResult(result);
}

handleSellResult(result) {
    const playerId = this.state.currentPlayerId;
    if (!result.success) {
        this.showToast(result.message, 'error');
        if (!this.sellSession?.committed) {
            this.resetActionSelection();
            return;
        }
        this.pendingData = {};
        this.selectedCard = null;
        this.actionStep = 0;
        if (this.logic.getValidSellTargets(playerId).length > 0) {
            this.startSell(playerId);
        } else {
            this.finishSellAction();
        }
        return;
    }

    this.addLogEntry(playerId, result.message.toLowerCase());
    this.sellSession ||= { committed: false, messages: [] };
    this.sellSession.committed = true;
    this.sellSession.messages.push(result.message);
    this.pendingData = {};
    this.selectedCard = null;
    this.actionStep = 0;

    if (this.logic.getValidSellTargets(playerId).length === 0) {
        this.finishSellAction();
        return;
    }
    this.updatePhaseBar();
    this.updateHand();
    this.startSell(playerId);
}
```

In the Sell branch of `processActionStep`, replace the inline log and `completeAction(result)` with `this.handleSellResult(result)`.

- [ ] **Step 6: Run the UI tests and verify GREEN**

Run:

```powershell
node tests/resource_picker_ui.test.js
node tests/gloucester_free_develop.test.js
```

Expected: both scripts print their passing summaries.

- [ ] **Step 7: Commit the UI slice**

```powershell
git add js/uiManager.js tests/resource_picker_ui.test.js
git commit -m "feat: continue selling until player is done"
```

### Task 3: Documentation and full regression verification

**Files:**
- Modify: `README.md:143-151`

- [ ] **Step 1: Document the corrected Sell action**

Add:

```markdown
A single Sell action may flip any number of your legal sellable industries. After each sale, choose another eligible industry or select **Done Selling**; only the first sale discards a card.
```

- [ ] **Step 2: Run every JavaScript test**

```powershell
$failed = @()
Get-ChildItem -Path tests -Filter '*.test.js' | Sort-Object Name | ForEach-Object {
    node $_.FullName
    if ($LASTEXITCODE -ne 0) { $failed += $_.Name }
}
if ($failed.Count -gt 0) { throw "Failed tests: $($failed -join ', ')" }
```

Expected: every test script prints its passing summary and the command exits successfully.

- [ ] **Step 3: Inspect scope and stale rule text**

```powershell
git diff --check
git diff -- js/gameLogic.js js/uiManager.js tests/resource_action_execution.test.js tests/resource_picker_ui.test.js tests/rule_deviations.test.js README.md
rg -n "exactly one industry|RejectsMultipleIndustries|at most ONE merchant bonus" js tests README.md
```

Expected: no whitespace errors; the diff contains only the planned Sell changes; the search finds no stale single-sale rule assertions.

- [ ] **Step 4: Manually verify the browser interaction**

Serve the repository and reach a state with two connected legal industries of the same product. Verify:

1. The first sale asks for legal beer sources and one card.
2. The first tile flips and applies income and any consumed Merchant-beer bonus.
3. The refreshed modal offers the second same-product industry and Done Selling.
4. The second sale resolves without card selection.
5. Done Selling advances the action exactly once.
6. Cancel or Escape after the first sale also finishes the action.

- [ ] **Step 5: Commit documentation and verification corrections**

```powershell
git add README.md
git commit -m "docs: explain repeated sales in one action"
```
