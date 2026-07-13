# Opening Industry Build Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Industry and Wild Industry cards obey the rulebook's no-tiles opening-build exception so a rules-legal Iron Works can be built outside a player's network.

**Architecture:** Keep resource, era, slot, and affordability validation unchanged. Add two focused `GameLogic` queries for player board presence and Industry-card location eligibility, then reuse that eligibility in target discovery and discard-card validation so the UI and execution paths agree.

**Tech Stack:** Browser JavaScript, Node.js `assert`, `vm`-based test harness, PowerShell test runner.

---

## File map

- Create `tests/opening_industry_build.test.js`: isolated rule-matrix regression tests for standard and Wild Build cards, connected coal, and Farm Breweries.
- Modify `js/gameLogic.js`: centralize board-presence and Industry-card network eligibility; remove the Farm Brewery pre-filter that bypasses the no-tiles exception.
- Reference `docs/plans/2026-07-13-opening-industry-build-design.md`: approved behavior and non-goals.

The existing `js/gameLogic.js` has substantial unrelated uncommitted work, so implementation changes must remain narrowly scoped. Do not stage or commit that whole file automatically.

### Task 1: Add rule-matrix regression coverage

**Files:**
- Create: `tests/opening_industry_build.test.js`
- Reference: `tests/rule_deviations.test.js`

- [ ] **Step 1: Create the focused test file**

```javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);

for (const file of [
    'js/boardGraphSource.js',
    'js/gameData.js',
    'js/gameState.js',
    'js/resourcePlanner.js',
    'js/gameLogic.js',
]) {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, file), 'utf8'), context);
}

vm.runInContext(
    `globalThis.GameState = GameState;
     globalThis.GameLogic = GameLogic;
     globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES;
     globalThis.CARD_TYPES = CARD_TYPES;
     globalThis.ACTIONS = ACTIONS;`,
    context
);

function createGame() {
    const game = new context.GameState(3, ['Ada', 'Ben', 'Cy']);
    game.players.forEach(player => { player.money = 100; });
    return game;
}

function makeTile(playerId, type, resourceCubes = 0) {
    return {
        playerId,
        type,
        tileData: { level: 1, income: 0, vp: 0, linkVP: 0, resourceCubes },
        flipped: false,
        resourceCubes,
    };
}

function addConnectedDudleyCoal(game) {
    game.boardIndustries.dudley_0 = makeTile(
        1,
        context.INDUSTRY_TYPES.COAL_MINE,
        1
    );
}

function findDudleyIronTarget(logic) {
    return logic.getValidBuildTargets(0).find(target =>
        target.cityId === 'dudley' &&
        target.slotIndex === 1 &&
        target.industryType === context.INDUSTRY_TYPES.IRON_WORKS
    );
}

function ironCard(type = context.CARD_TYPES.INDUSTRY) {
    return type === context.CARD_TYPES.WILD_INDUSTRY
        ? { type, name: 'Wild Industry' }
        : {
            type,
            industryType: context.INDUSTRY_TYPES.IRON_WORKS,
            name: 'Iron Works',
        };
}

function testIndustryCardCanOpenWithConnectedIronWorks() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    game.players[0].hand = [ironCard()];
    addConnectedDudleyCoal(game);

    assert.equal(game.isInNetwork(0, 'dudley'), false);
    const target = findDudleyIronTarget(logic);
    assert.ok(target);
    assert.deepEqual(
        Array.from(logic.getValidCardsForAction(0, context.ACTIONS.BUILD, target)),
        [0]
    );

    const result = logic.executeBuild(
        0,
        target.cityId,
        target.slotIndex,
        target.industryType,
        0
    );

    assert.equal(result.success, true);
    assert.equal(game.boardIndustries.dudley_1.playerId, 0);
}

function testOpeningExceptionDoesNotBypassCoal() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    game.players[0].hand = [ironCard()];

    assert.equal(findDudleyIronTarget(logic), undefined);
}

function testIndustryCardNeedsNetworkAfterFirstTile() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    game.players[0].hand = [ironCard()];
    game.boardIndustries.birmingham_0 = makeTile(
        0,
        context.INDUSTRY_TYPES.COTTON_MILL
    );
    addConnectedDudleyCoal(game);

    assert.equal(game.isInNetwork(0, 'dudley'), false);
    assert.equal(findDudleyIronTarget(logic), undefined);
}

function testWildIndustryUsesTheSameNetworkRule() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    game.players[0].hand = [ironCard(context.CARD_TYPES.WILD_INDUSTRY)];
    addConnectedDudleyCoal(game);

    const openingTarget = findDudleyIronTarget(logic);
    assert.ok(openingTarget);
    assert.deepEqual(
        Array.from(logic.getValidCardsForAction(0, context.ACTIONS.BUILD, openingTarget)),
        [0]
    );

    game.boardIndustries.birmingham_0 = makeTile(
        0,
        context.INDUSTRY_TYPES.COTTON_MILL
    );
    assert.equal(findDudleyIronTarget(logic), undefined);
}

function testWildLocationStillIgnoresNetwork() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    game.players[0].hand = [{
        type: context.CARD_TYPES.WILD_LOCATION,
        name: 'Wild Location',
    }];
    game.boardIndustries.birmingham_0 = makeTile(
        0,
        context.INDUSTRY_TYPES.COTTON_MILL
    );
    addConnectedDudleyCoal(game);

    const target = findDudleyIronTarget(logic);
    assert.ok(target);
    assert.deepEqual(
        Array.from(logic.getValidCardsForAction(0, context.ACTIONS.BUILD, target)),
        [0]
    );
}

function testOpeningFarmBreweryThenCountsAsBoardPresence() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    game.players[0].hand = [{
        type: context.CARD_TYPES.INDUSTRY,
        industryType: context.INDUSTRY_TYPES.BREWERY,
        name: 'Brewery',
    }];

    const farmTarget = logic.getValidBuildTargets(0).find(target =>
        target.cityId === 'northern' &&
        target.industryType === context.INDUSTRY_TYPES.BREWERY
    );
    assert.ok(farmTarget);

    const result = logic.executeBuild(
        0,
        farmTarget.cityId,
        farmTarget.slotIndex,
        farmTarget.industryType,
        0
    );
    assert.equal(result.success, true);

    game.players[0].hand = [ironCard()];
    addConnectedDudleyCoal(game);
    assert.equal(findDudleyIronTarget(logic), undefined);
}

testIndustryCardCanOpenWithConnectedIronWorks();
testOpeningExceptionDoesNotBypassCoal();
testIndustryCardNeedsNetworkAfterFirstTile();
testWildIndustryUsesTheSameNetworkRule();
testWildLocationStillIgnoresNetwork();
testOpeningFarmBreweryThenCountsAsBoardPresence();
console.log('opening industry build tests passed');
```

- [ ] **Step 2: Run the regression test and verify the current behavior fails**

Run:

```powershell
& 'C:\Users\james\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\opening_industry_build.test.js
```

Expected: FAIL at `assert.ok(target)` in `testIndustryCardCanOpenWithConnectedIronWorks`, demonstrating that connected coal and affordability are valid but the opening Industry card is filtered out.

### Task 2: Centralize and apply Industry-card location eligibility

**Files:**
- Modify: `js/gameLogic.js:157-205`
- Modify: `js/gameLogic.js:1008-1040`
- Test: `tests/opening_industry_build.test.js`

- [ ] **Step 1: Add player-presence and Industry-card eligibility queries before `hasCardForBuild`**

```javascript
    hasBoardPresence(playerId) {
        return Object.values(this.state.boardLinks)
            .some(link => link.playerId === playerId) ||
            Object.values(this.state.boardIndustries)
                .some(tile => tile.playerId === playerId) ||
            Object.values(this.state.breweryFarmTiles)
                .some(tile => tile.playerId === playerId);
    }

    canUseIndustryCardAtLocation(playerId, cityId) {
        return !this.hasBoardPresence(playerId) ||
            this.state.isInNetwork(playerId, cityId);
    }
```

- [ ] **Step 2: Allow the Farm Brewery target loop to reach shared card validation**

Delete only this pre-filter from `getValidBuildTargets`:

```javascript
            if (!this.state.isInNetwork(playerId, farmId)) continue;
```

The subsequent `hasCardForBuild` call remains responsible for enforcing the normal network rule and the no-tiles exception.

- [ ] **Step 3: Use the shared query in `hasCardForBuild`**

Replace the method with:

```javascript
    hasCardForBuild(playerId, cityId, industryType) {
        const player = this.state.players[playerId];
        const canUseIndustryCard = this.canUseIndustryCardAtLocation(playerId, cityId);
        for (const card of player.hand) {
            if (isBreweryFarm(cityId)) {
                if (card.type === CARD_TYPES.INDUSTRY &&
                    card.industryType === industryType &&
                    canUseIndustryCard) return true;
                if (card.type === CARD_TYPES.WILD_INDUSTRY && canUseIndustryCard) return true;
                continue;
            }
            if (card.type === CARD_TYPES.LOCATION && card.location === cityId) return true;
            if (card.type === CARD_TYPES.INDUSTRY &&
                card.industryType === industryType &&
                canUseIndustryCard) return true;
            if (card.type === CARD_TYPES.WILD_LOCATION) return true;
            if (card.type === CARD_TYPES.WILD_INDUSTRY && canUseIndustryCard) return true;
        }
        return false;
    }
```

- [ ] **Step 4: Use the same query in `getValidCardsForAction`**

Immediately after `const validIndices = [];`, add:

```javascript
        const canUseIndustryCardAtTarget = target
            ? this.canUseIndustryCardAtLocation(playerId, target.cityId)
            : false;
```

Then replace only the Build-card matching block inside `if (target)` with:

```javascript
                        if (isBreweryFarm(target.cityId)) {
                            if (card.type === CARD_TYPES.INDUSTRY &&
                                card.industryType === target.industryType &&
                                canUseIndustryCardAtTarget) {
                                validIndices.push(idx);
                            } else if (card.type === CARD_TYPES.WILD_INDUSTRY &&
                                canUseIndustryCardAtTarget) {
                                validIndices.push(idx);
                            }
                            break;
                        }
                        if (card.type === CARD_TYPES.LOCATION && card.location === target.cityId) {
                            validIndices.push(idx);
                        } else if (card.type === CARD_TYPES.INDUSTRY &&
                            card.industryType === target.industryType &&
                            canUseIndustryCardAtTarget) {
                            validIndices.push(idx);
                        } else if (card.type === CARD_TYPES.WILD_LOCATION) {
                            validIndices.push(idx);
                        } else if (card.type === CARD_TYPES.WILD_INDUSTRY &&
                            canUseIndustryCardAtTarget) {
                            validIndices.push(idx);
                        }
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```powershell
& 'C:\Users\james\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\opening_industry_build.test.js
```

Expected: `opening industry build tests passed`.

### Task 3: Verify the fix and inspect the scoped diff

**Files:**
- Test: `tests/opening_industry_build.test.js`
- Test: `tests/rule_deviations.test.js`
- Test: `tests/resource_action_execution.test.js`
- Test: `tests/resource_planner_sources.test.js`
- Inspect: `js/gameLogic.js`

- [ ] **Step 1: Run the directly related suites**

Run:

```powershell
$node = 'C:\Users\james\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\opening_industry_build.test.js
& $node tests\rule_deviations.test.js
& $node tests\resource_action_execution.test.js
& $node tests\resource_planner_sources.test.js
```

Expected: all four commands exit 0 and print their pass messages.

- [ ] **Step 2: Run every test file and compare against the existing baseline**

Run:

```powershell
$node = 'C:\Users\james\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
Get-ChildItem tests -Filter *.test.js | ForEach-Object {
    & $node $_.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Output "FAILED: $($_.Name)"
    }
}
```

Expected: no new failure. The pre-existing `board_routes.test.js` Warrington off-board socket assertion may remain the sole failure; report it separately rather than attributing it to this fix.

- [ ] **Step 3: Inspect only the owned changes**

Run:

```powershell
& 'C:\Users\james\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe' `
  -c safe.directory=C:/birmingham/brass-birmingham diff -- `
  js/gameLogic.js tests/opening_industry_build.test.js
```

Expected: `js/gameLogic.js` still shows earlier unrelated resource-planner work in addition to this fix, while the newly created test file contains only this regression coverage. Do not stage or commit the implementation automatically because doing so would capture unrelated user changes from the shared dirty file.

## Self-review

- Spec coverage: The plan covers standard Industry, Wild Industry, Wild Location, connected-coal preservation, Farm Brewery opening builds, and Farm Breweries counting as board presence.
- Placeholder scan: No TODO, TBD, or unspecified implementation steps remain.
- Type consistency: `hasBoardPresence`, `canUseIndustryCardAtLocation`, `cityId`, `playerId`, `breweryFarmTiles`, and card constants match current project names.
