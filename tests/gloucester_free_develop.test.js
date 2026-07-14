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
    ui.closeModal = () => {};
    ui.updatePhaseBar = () => {};
    ui.updateHand = () => {};

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
