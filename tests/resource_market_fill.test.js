const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);

const graphSource = fs.readFileSync(path.join(repoRoot, 'js', 'boardGraphSource.js'), 'utf8');
const gameData = fs.readFileSync(path.join(repoRoot, 'js', 'gameData.js'), 'utf8');
const gameState = fs.readFileSync(path.join(repoRoot, 'js', 'gameState.js'), 'utf8');
const resourcePlanner = fs.readFileSync(path.join(repoRoot, 'js', 'resourcePlanner.js'), 'utf8');
const gameLogic = fs.readFileSync(path.join(repoRoot, 'js', 'gameLogic.js'), 'utf8');
vm.runInContext(
    `${graphSource}
${gameData}\n${gameState}\n${resourcePlanner}\n${gameLogic}\n` +
    `globalThis.GameState = GameState; globalThis.GameLogic = GameLogic; ` +
    `globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES; globalThis.CARD_TYPES = CARD_TYPES;`,
    context
);

function createGame() {
    const game = new context.GameState(3, ['Ada', 'Ben', 'Cy']);
    game.players[0].money = 100;
    return game;
}

function buildWithLocationCard(game, logic, cityId, slotIndex, industryType) {
    game.players[0].hand = [{ type: context.CARD_TYPES.LOCATION, location: cityId, name: cityId }];
    const result = logic.executeBuild(0, cityId, slotIndex, industryType, 0);
    assert.equal(result.success, true, result.message);
}

function testNewIronWorksImmediatelyFillsEmptyIronMarketSlots() {
    const game = createGame();
    const logic = new context.GameLogic(game);

    game.ironMarket = 8;
    game.boardIndustries.dudley_0 = {
        playerId: 1,
        type: context.INDUSTRY_TYPES.COAL_MINE,
        tileData: { level: 1, income: 0 },
        flipped: false,
        resourceCubes: 1,
    };

    buildWithLocationCard(game, logic, 'dudley', 1, context.INDUSTRY_TYPES.IRON_WORKS);

    const tile = game.boardIndustries.dudley_1;
    assert.equal(game.ironMarket, 10);
    assert.equal(tile.resourceCubes, 2);
    assert.equal(tile.flipped, false);
    assert.equal(game.players[0].money, 97);
}

function testNewConnectedCoalMineImmediatelyFillsEmptyCoalMarketSlots() {
    const game = createGame();
    const logic = new context.GameLogic(game);

    game.coalMarket = 12;
    game.boardLinks['coalbrookdale-shrewsbury'] = { playerId: 1, type: 'canal' };

    buildWithLocationCard(game, logic, 'coalbrookdale', 2, context.INDUSTRY_TYPES.COAL_MINE);

    const tile = game.boardIndustries.coalbrookdale_2;
    assert.equal(game.coalMarket, 14);
    assert.equal(tile.resourceCubes, 0);
    assert.equal(tile.flipped, true);
    assert.equal(game.players[0].money, 97);
}

function testNewUnconnectedCoalMineDoesNotFillCoalMarketSlots() {
    const game = createGame();
    const logic = new context.GameLogic(game);

    game.coalMarket = 12;

    buildWithLocationCard(game, logic, 'coalbrookdale', 2, context.INDUSTRY_TYPES.COAL_MINE);

    const tile = game.boardIndustries.coalbrookdale_2;
    assert.equal(game.coalMarket, 12);
    assert.equal(tile.resourceCubes, 2);
    assert.equal(tile.flipped, false);
    assert.equal(game.players[0].money, 95);
}

testNewIronWorksImmediatelyFillsEmptyIronMarketSlots();
testNewConnectedCoalMineImmediatelyFillsEmptyCoalMarketSlots();
testNewUnconnectedCoalMineDoesNotFillCoalMarketSlots();
console.log('resource market fill tests passed');
