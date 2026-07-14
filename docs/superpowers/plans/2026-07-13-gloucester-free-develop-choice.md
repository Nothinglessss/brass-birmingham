# Gloucester Free Develop Choice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Gloucester's automatic free-Develop tile removal with a validated player choice made before the Sell action commits.

**Architecture:** Detect a completed Sell resource plan that consumes Gloucester merchant beer and pause the UI before card discard to collect one industry type. Pass that choice into `GameLogic.executeSell`, validate it before any mutation, then apply the existing merchant bonus to the chosen industry's lowest tile and report it in the action result.

**Tech Stack:** Browser JavaScript, Node.js `assert`, VM-based unit tests, existing modal/resource-planning UI.

---

## File map

- Create `tests/gloucester_free_develop.test.js`: logic atomicity, chosen-industry behavior, Pottery restriction, and UI state-transition coverage.
- Modify `js/gameLogic.js`: expose free-Develop options, validate a selected industry, and apply it during Sell execution.
- Modify `js/uiManager.js`: pause completed Gloucester resource planning for the choice, render the dialog, resume card discard, and pass the choice to logic.
- Reference `docs/plans/2026-07-13-gloucester-free-develop-choice-design.md`: approved behavior.

`js/gameLogic.js` and `js/uiManager.js` already contain unrelated uncommitted work. Keep edits scoped and do not stage or commit those files automatically.

### Task 1: Add failing Gloucester logic and UI contracts

**Files:**
- Create: `tests/gloucester_free_develop.test.js`

- [ ] **Step 1: Create the regression test**

Create a VM harness loading `boardGraphSource.js`, `gameData.js`, `gameState.js`, `resourcePlanner.js`, `gameLogic.js`, and `uiManager.js`. Add the following focused tests:

```javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);

for (const file of [
    'boardGraphSource.js',
    'gameData.js',
    'gameState.js',
    'resourcePlanner.js',
    'gameLogic.js',
    'uiManager.js',
]) {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, 'js', file), 'utf8'), context);
}

vm.runInContext(
    `globalThis.GameState = GameState;
     globalThis.GameLogic = GameLogic;
     globalThis.UIManager = UIManager;
     globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES;
     globalThis.CARD_TYPES = CARD_TYPES;
     globalThis.ACTIONS = ACTIONS;`,
    context
);

function makeTile(playerId, type, resourceCubes = 0) {
    return {
        playerId,
        type,
        tileData: {
            level: 1,
            income: 3,
            vp: 0,
            linkVP: 0,
            resourceCubes,
            beersToSell: 1,
        },
        flipped: false,
        resourceCubes,
    };
}

function setupGloucesterSell() {
    const game = new context.GameState(2, ['Ada', 'Ben']);
    game.players[0].hand = [{
        type: context.CARD_TYPES.LOCATION,
        location: 'birmingham',
        name: 'Birmingham',
    }];
    game.boardIndustries = {
        birmingham_0: makeTile(0, context.INDUSTRY_TYPES.MANUFACTURER),
        stafford_1: makeTile(0, context.INDUSTRY_TYPES.BREWERY, 1),
    };
    game.boardLinks = {
        'birmingham-dudley': { playerId: 0, type: 'canal' },
        'dudley-kidderminster': { playerId: 0, type: 'canal' },
        'kidderminster-worcester': { playerId: 0, type: 'canal' },
        'gloucester-worcester': { playerId: 0, type: 'canal' },
    };
    game.merchantTiles = [{
        location: 'gloucester',
        buys: context.INDUSTRY_TYPES.MANUFACTURER,
        hasBeer: true,
        bonusClaimed: false,
    }];
    return { game, logic: new context.GameLogic(game) };
}

function snapshot(game) {
    return JSON.stringify(game.toJSON());
}

function usedCount(game, industryType) {
    return game.players[0].industryTiles[industryType]
        .filter(tile => tile.used).length;
}

function testGloucesterChoiceIsRequiredAtomically() {
    const { game, logic } = setupGloucesterSell();
    const before = snapshot(game);

    const result = logic.executeSell(
        0,
        'birmingham_0',
        0,
        0,
        ['merchant:0']
    );

    assert.equal(result.success, false);
    assert.match(result.message, /Choose an industry/i);
    assert.equal(snapshot(game), before);
}

function testGloucesterDevelopsTheChosenIndustry() {
    const { game, logic } = setupGloucesterSell();

    const result = logic.executeSell(
        0,
        'birmingham_0',
        0,
        0,
        ['merchant:0'],
        context.INDUSTRY_TYPES.COTTON_MILL
    );

    assert.equal(result.success, true);
    assert.equal(game.merchantTiles[0].hasBeer, false);
    assert.equal(game.merchantTiles[0].bonusClaimed, true);
    assert.equal(usedCount(game, context.INDUSTRY_TYPES.COTTON_MILL), 1);
    assert.equal(usedCount(game, context.INDUSTRY_TYPES.BREWERY), 0);
    assert.match(result.message, /Cotton Mill Lv1/i);
}

function testLightbulbPotteryCannotBeChosen() {
    const { game, logic } = setupGloucesterSell();
    const before = snapshot(game);

    const result = logic.executeSell(
        0,
        'birmingham_0',
        0,
        0,
        ['merchant:0'],
        context.INDUSTRY_TYPES.POTTERY
    );

    assert.equal(result.success, false);
    assert.equal(snapshot(game), before);
}

function completedGloucesterPlan() {
    return {
        status: 'complete',
        consumptions: [{ sourceType: 'merchant', merchantIndex: 0 }],
        marketCost: 0,
    };
}

function testUiPausesForGloucesterChoice() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.SELL;
    ui.pendingData = {
        tileKey: 'birmingham_0',
        merchantIndex: 0,
        resourceSelections: ['merchant:0'],
    };
    ui.state = {
        currentPlayerId: 0,
        merchantTiles: [{ location: 'gloucester' }],
    };
    const options = [{
        type: context.INDUSTRY_TYPES.COTTON_MILL,
        name: 'Cotton Mill',
        level: 1,
    }];
    ui.logic = {
        planSellResources: () => completedGloucesterPlan(),
        getFreeDevelopOptions: () => options,
    };
    let shown = null;
    ui.showFreeDevelopChoice = value => { shown = value; };
    ui.updatePhaseBar = () => {};

    ui.advanceResourcePlanning();

    assert.equal(ui.actionStep, 1);
    assert.equal(ui.pendingData.selectingFreeDevelop, true);
    assert.equal(shown, options);
}

function testFreeDevelopChoiceResumesPlanning() {
    const ui = new context.UIManager();
    ui.pendingData = {};
    let resumed = 0;
    ui.advanceResourcePlanning = () => { resumed++; };

    ui.selectFreeDevelopIndustry(context.INDUSTRY_TYPES.IRON_WORKS);

    assert.equal(
        ui.pendingData.freeDevelopIndustryType,
        context.INDUSTRY_TYPES.IRON_WORKS
    );
    assert.equal(ui.pendingData.freeDevelopChoiceResolved, true);
    assert.equal(ui.pendingData.selectingFreeDevelop, false);
    assert.equal(resumed, 1);
}

function testFreeDevelopChoiceHtmlIdentifiesIndustryAndLevel() {
    const ui = new context.UIManager();
    const html = ui.renderFreeDevelopChoiceHtml([{
        type: context.INDUSTRY_TYPES.COTTON_MILL,
        name: 'Cotton Mill',
        level: 1,
    }]);

    assert.match(html, /data-industry="cottonMill"/);
    assert.match(html, /Cotton Mill/);
    assert.match(html, /Level 1/);
}

testGloucesterChoiceIsRequiredAtomically();
testGloucesterDevelopsTheChosenIndustry();
testLightbulbPotteryCannotBeChosen();
testUiPausesForGloucesterChoice();
testFreeDevelopChoiceResumesPlanning();
testFreeDevelopChoiceHtmlIdentifiesIndustryAndLevel();
console.log('Gloucester free Develop tests passed');
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
& 'C:\Users\james\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\gloucester_free_develop.test.js
```

Expected: FAIL because `executeSell` still succeeds without a choice and automatically removes Brewery.

### Task 2: Make Sell execution validate and apply the chosen industry

**Files:**
- Modify: `js/gameLogic.js:605-619`
- Modify: `js/gameLogic.js:790-855`
- Test: `tests/gloucester_free_develop.test.js`

- [ ] **Step 1: Add semantic free-Develop helpers after `getDevelopableTypes`**

```javascript
    getFreeDevelopOptions(playerId) {
        return this.getDevelopableTypes(playerId);
    }

    applyChosenFreeDevelop(playerId, industryType) {
        const option = this.getFreeDevelopOptions(playerId)
            .find(candidate => candidate.type === industryType);
        if (!option) return null;

        const tile = this.state.developTile(playerId, industryType);
        if (!tile) return null;
        return {
            industryType,
            name: option.name,
            level: option.level,
        };
    }
```

- [ ] **Step 2: Extend `executeSell` with the optional chosen type**

Change the signature to:

```javascript
    executeSell(
        playerId,
        tileKey,
        merchantIndex,
        cardIndex,
        resourceSelections = [],
        freeDevelopIndustryType = null
    ) {
```

- [ ] **Step 3: Validate the Gloucester choice before mutation**

Immediately after calculating `usedMerchantBeer`, add:

```javascript
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
```

This block must remain before `commitResourcePlan(resourcePlan)`.

- [ ] **Step 4: Apply and report the chosen Develop**

Reuse the already resolved `merchant` and `merchantData` variables inside the bonus block. Replace the Develop case with:

```javascript
                    case 'develop':
                        if (freeDevelopOption) {
                            freeDevelopResult = this.applyChosenFreeDevelop(
                                playerId,
                                freeDevelopOption.type
                            );
                        }
                        break;
```

Declare `let freeDevelopResult = null;` before the bonus block. Build the return message as:

```javascript
        const baseMessage = `Sold ${INDUSTRY_DISPLAY[tile.type].name} Lv${tile.tileData.level}`;
        const bonusMessage = freeDevelopResult
            ? `; free developed ${freeDevelopResult.name} Lv${freeDevelopResult.level}`
            : '';
        return {
            success: true,
            message: `${baseMessage}${bonusMessage}`,
            freeDevelop: freeDevelopResult,
        };
```

- [ ] **Step 5: Run the test and confirm logic tests advance to the UI failure**

Run the new test file. Expected: the three logic tests pass; execution stops at the first missing `UIManager` choice method.

### Task 3: Add the pre-discard choice to resource planning

**Files:**
- Modify: `js/uiManager.js:455-545`
- Modify: `js/uiManager.js:630-650`
- Modify: `js/uiManager.js:1178-1195`
- Test: `tests/gloucester_free_develop.test.js`

- [ ] **Step 1: Show the correct phase instruction**

In the `actionStep === 1` branch of `updatePhaseBar`, use:

```javascript
            instructionText = this.pendingData.selectingFreeDevelop
                ? 'Choose an industry for free Develop'
                : 'Choose which resource source to consume';
```

- [ ] **Step 2: Add plan inspection and completion helpers before `advanceResourcePlanning`**

```javascript
    getPendingFreeDevelopOptions(plan) {
        if (this.selectedAction !== ACTIONS.SELL) return [];
        const merchantConsumption = plan.consumptions?.find(unit =>
            unit.sourceType === 'merchant' &&
            unit.merchantIndex === this.pendingData.merchantIndex
        );
        if (!merchantConsumption) return [];

        const merchant = this.state.merchantTiles[merchantConsumption.merchantIndex];
        const merchantData = merchant ? MERCHANTS[merchant.location] : null;
        if (merchantData?.bonusType !== 'develop') return [];

        return this.logic.getFreeDevelopOptions(this.state.currentPlayerId);
    }

    finishResourcePlanning(plan) {
        this.pendingData.resourcePlan = plan;
        this.pendingData.selectingFreeDevelop = false;
        this.actionStep = 2;
        this.closeModal();
        this.updatePhaseBar();
        this.updateHand();
    }
```

- [ ] **Step 3: Pause a completed Gloucester plan**

Replace the current `plan.status === 'complete'` branch with:

```javascript
        if (plan.status === 'complete') {
            const freeDevelopOptions = this.getPendingFreeDevelopOptions(plan);
            if (freeDevelopOptions.length > 0 &&
                !this.pendingData.freeDevelopChoiceResolved) {
                this.pendingData.resourcePlan = plan;
                this.pendingData.selectingFreeDevelop = true;
                this.actionStep = 1;
                this.updatePhaseBar();
                this.showFreeDevelopChoice(freeDevelopOptions);
                return;
            }
            this.finishResourcePlanning(plan);
            return;
        }
```

- [ ] **Step 4: Add pure rendering, selection, and modal methods after `showResourceChoice`**

```javascript
    renderFreeDevelopChoiceHtml(options) {
        let html = '<div class="choice-list free-develop-choice-list">';
        for (const option of options) {
            const display = INDUSTRY_DISPLAY[option.type];
            html += `
                <div class="choice-item free-develop-choice"
                     data-industry="${option.type}">
                    <div class="choice-item-icon">${display.icon}</div>
                    <div class="choice-item-text">
                        <div class="choice-item-name">${option.name}</div>
                        <div class="choice-item-detail">Level ${option.level}</div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        return html;
    }

    selectFreeDevelopIndustry(industryType) {
        this.pendingData.freeDevelopIndustryType = industryType;
        this.pendingData.freeDevelopChoiceResolved = true;
        this.pendingData.selectingFreeDevelop = false;
        this.advanceResourcePlanning();
    }

    showFreeDevelopChoice(options) {
        this.showModal(
            'Choose Free Develop',
            this.renderFreeDevelopChoiceHtml(options),
            null
        );
        document.querySelectorAll('#modal-body .free-develop-choice').forEach(item => {
            item.addEventListener('click', () => {
                this.selectFreeDevelopIndustry(item.dataset.industry);
            });
        });
    }
```

- [ ] **Step 5: Pass the chosen type into Sell execution**

Append this argument to the `executeSell` call in `processActionStep`:

```javascript
                    this.pendingData.resourceSelections,
                    this.pendingData.freeDevelopIndustryType
```

- [ ] **Step 6: Run the focused test**

Run:

```powershell
& 'C:\Users\james\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\gloucester_free_develop.test.js
```

Expected: `Gloucester free Develop tests passed`.

### Task 4: Verify related actions and the full baseline

**Files:**
- Test: `tests/gloucester_free_develop.test.js`
- Test: `tests/resource_action_execution.test.js`
- Test: `tests/resource_picker_ui.test.js`
- Test: `tests/rule_deviations.test.js`

- [ ] **Step 1: Run directly related suites**

```powershell
$node = 'C:\Users\james\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\gloucester_free_develop.test.js
& $node tests\resource_action_execution.test.js
& $node tests\resource_picker_ui.test.js
& $node tests\rule_deviations.test.js
```

Expected: all four exit 0.

- [ ] **Step 2: Run every test file**

```powershell
$node = 'C:\Users\james\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$failed = @()
Get-ChildItem tests -Filter *.test.js | Sort-Object Name | ForEach-Object {
    & $node $_.FullName
    if ($LASTEXITCODE -ne 0) { $failed += $_.Name }
}
Write-Output "FAILED=$($failed -join ',')"
```

Expected: no new failures. `board_routes.test.js` may remain the sole pre-existing Warrington socket failure.

- [ ] **Step 3: Inspect the scoped files**

Run `git diff --check` and inspect the modified sections of `js/gameLogic.js`, `js/uiManager.js`, and the new test. Do not stage the implementation because the shared files contain unrelated user work.

## Self-review

- Spec coverage: player choice, atomic validation, no iron, one tile, Pottery exclusion, action log, and non-Develop merchant behavior are covered.
- Placeholder scan: no implementation placeholders remain.
- Type consistency: `freeDevelopIndustryType`, `getFreeDevelopOptions`, `applyChosenFreeDevelop`, and `freeDevelopChoiceResolved` are used consistently across logic, UI, and tests.
