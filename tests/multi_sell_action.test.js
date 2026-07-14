const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);

const source = ['gameData.js', 'gameState.js', 'gameLogic.js']
    .map(file => fs.readFileSync(path.join(repoRoot, 'js', file), 'utf8'))
    .join('\n');

vm.runInContext(
    `${source}\n` +
    'globalThis.GameState = GameState; globalThis.GameLogic = GameLogic; ' +
    'globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES; globalThis.CARD_TYPES = CARD_TYPES;',
    context
);

function makeTile(playerId, type, beersToSell = 0) {
    return {
        playerId,
        type,
        tileData: {
            level: 1,
            income: 0,
            vp: 0,
            linkVP: 0,
            resourceCubes: 0,
            beersToSell,
        },
        flipped: false,
        resourceCubes: 0,
    };
}

function setupMultiSellGame(types, beersToSell = 0) {
    const game = new context.GameState(3, ['Ada', 'Ben', 'Cy']);
    game.players[0].hand = [{
        type: context.CARD_TYPES.LOCATION,
        location: 'birmingham',
        name: 'Birmingham',
    }];
    game.boardIndustries = {};
    types.forEach((type, index) => {
        game.boardIndustries[`birmingham_${index}`] = makeTile(0, type, beersToSell);
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

    assert.equal(typeof logic.executeAdditionalSell, 'function');
    const first = logic.executeSell(0, 'birmingham_0', 0);
    const second = logic.executeAdditionalSell(0, 'birmingham_1');

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(game.boardIndustries.birmingham_0.flipped, true);
    assert.equal(game.boardIndustries.birmingham_1.flipped, true);
    assert.equal(game.players[0].hand.length, 0, 'one action discards exactly one card');
}

function testOneSellActionCanMixIndustryTypes() {
    const { game, logic } = setupMultiSellGame([
        context.INDUSTRY_TYPES.MANUFACTURER,
        context.INDUSTRY_TYPES.COTTON_MILL,
    ]);

    const first = logic.executeSell(0, 'birmingham_0', 0);
    const second = logic.executeAdditionalSell(0, 'birmingham_1');

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(game.boardIndustries.birmingham_0.flipped, true);
    assert.equal(game.boardIndustries.birmingham_1.flipped, true);
    assert.equal(game.players[0].hand.length, 0);
}

function testRepeatedSalesCanClaimMultipleMerchantBeerBonuses() {
    const { game, logic } = setupMultiSellGame([
        context.INDUSTRY_TYPES.MANUFACTURER,
        context.INDUSTRY_TYPES.MANUFACTURER,
    ], 1);
    const incomeBefore = game.players[0].income;

    const first = logic.executeSell(0, 'birmingham_0', 0);
    const second = logic.executeAdditionalSell(0, 'birmingham_1');

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(game.merchantTiles[0].hasBeer, false);
    assert.equal(game.merchantTiles[1].hasBeer, false);
    assert.equal(game.merchantTiles[0].bonusClaimed, true);
    assert.equal(game.merchantTiles[1].bonusClaimed, true);
    assert.equal(game.players[0].income, incomeBefore + 4);
    assert.equal(game.players[0].hand.length, 0);
}

testOneSellActionSellsTwoIndustriesOfTheSameType();
testOneSellActionCanMixIndustryTypes();
testRepeatedSalesCanClaimMultipleMerchantBeerBonuses();
console.log('multi-sell action tests passed');
