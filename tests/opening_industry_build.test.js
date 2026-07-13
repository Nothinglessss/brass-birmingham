const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);

for (const file of ['js/gameData.js', 'js/gameState.js', 'js/gameLogic.js']) {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, file), 'utf8'), context);
}
vm.runInContext(
    'globalThis.GameState = GameState; globalThis.GameLogic = GameLogic; ' +
    'globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES; globalThis.CARD_TYPES = CARD_TYPES;',
    context
);

function makeTile(playerId, type) {
    return {
        playerId,
        type,
        tileData: { level: 1, income: 0, vp: 0, linkVP: 0 },
        flipped: false,
        resourceCubes: 0,
    };
}

function createLogic(card) {
    const game = new context.GameState(3, ['Ada', 'Ben', 'Cy']);
    game.players[0].money = 100;
    game.players[0].hand = [card];
    return { game, logic: new context.GameLogic(game) };
}

const industryCard = {
    type: context.CARD_TYPES.INDUSTRY,
    industryType: context.INDUSTRY_TYPES.IRON_WORKS,
};

{
    const { logic } = createLogic(industryCard);
    assert.equal(logic.hasCardForBuild(0, 'dudley', context.INDUSTRY_TYPES.IRON_WORKS), true);
}

{
    const { game, logic } = createLogic(industryCard);
    game.boardIndustries.birmingham_0 = makeTile(0, context.INDUSTRY_TYPES.COTTON_MILL);
    assert.equal(game.isInNetwork(0, 'dudley'), false);
    assert.equal(logic.hasCardForBuild(0, 'dudley', context.INDUSTRY_TYPES.IRON_WORKS), false);
}

{
    const { game, logic } = createLogic({ type: context.CARD_TYPES.WILD_INDUSTRY });
    assert.equal(logic.hasCardForBuild(0, 'dudley', context.INDUSTRY_TYPES.IRON_WORKS), true);
    game.boardLinks['birmingham-dudley'] = { playerId: 0, type: 'canal' };
    assert.equal(logic.hasCardForBuild(0, 'coventry', context.INDUSTRY_TYPES.IRON_WORKS), false);
}

{
    const { game, logic } = createLogic({ type: context.CARD_TYPES.WILD_LOCATION });
    game.boardIndustries.birmingham_0 = makeTile(0, context.INDUSTRY_TYPES.COTTON_MILL);
    assert.equal(logic.hasCardForBuild(0, 'dudley', context.INDUSTRY_TYPES.IRON_WORKS), true);
}

{
    const { game, logic } = createLogic(industryCard);
    game.breweryFarmTiles.northern = makeTile(0, context.INDUSTRY_TYPES.BREWERY);
    assert.equal(logic.hasCardForBuild(0, 'dudley', context.INDUSTRY_TYPES.IRON_WORKS), false);
}

console.log('opening industry build tests passed');
