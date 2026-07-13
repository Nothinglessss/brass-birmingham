const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);
for (const file of ['js/boardGraphSource.js', 'js/gameData.js', 'js/gameState.js', 'js/gameLogic.js']) {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, file), 'utf8'), context);
}
vm.runInContext(
    'globalThis.GameState = GameState; globalThis.GameLogic = GameLogic; ' +
    'globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES;',
    context
);

function makeTile(type, cubes) {
    return {
        playerId: 0,
        type,
        tileData: { level: 1, income: 0, vp: 0, linkVP: 0 },
        flipped: false,
        resourceCubes: cubes,
    };
}

{
    const game = new context.GameState(2, ['Ada', 'Ben']);
    const logic = new context.GameLogic(game);
    game.ironMarket = 8;
    game.boardIndustries.birmingham_0 = makeTile(context.INDUSTRY_TYPES.IRON_WORKS, 4);
    const before = game.players[0].money;
    logic.sellNewResourceTileToMarket(0, 'birmingham', 'birmingham_0');
    assert.equal(game.ironMarket, 10);
    assert.equal(game.boardIndustries.birmingham_0.resourceCubes, 2);
    assert.ok(game.players[0].money > before);
}

{
    const game = new context.GameState(2, ['Ada', 'Ben']);
    const logic = new context.GameLogic(game);
    game.coalMarket = 12;
    game.boardIndustries.dudley_0 = makeTile(context.INDUSTRY_TYPES.COAL_MINE, 4);
    game.isConnectedToMerchant = () => false;
    logic.sellNewResourceTileToMarket(0, 'dudley', 'dudley_0');
    assert.equal(game.coalMarket, 12);
    assert.equal(game.boardIndustries.dudley_0.resourceCubes, 4);

    game.isConnectedToMerchant = () => true;
    logic.sellNewResourceTileToMarket(0, 'dudley', 'dudley_0');
    assert.equal(game.coalMarket, 14);
    assert.equal(game.boardIndustries.dudley_0.resourceCubes, 2);
}

console.log('resource market fill tests passed');
