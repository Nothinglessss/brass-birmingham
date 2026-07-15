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
     globalThis.CARD_TYPES = CARD_TYPES;`,
    context
);

function setup() {
    const game = new context.GameState(3, ['Ada', 'Ben', 'Cy']);
    game.players.forEach(player => { player.money = 100; });
    game.players[0].hand = [{
        type: context.CARD_TYPES.LOCATION,
        location: 'birmingham',
        name: 'Birmingham',
    }];
    return { game, logic: new context.GameLogic(game) };
}

function stateSnapshot(game) {
    const player = game.players[0];
    return JSON.stringify({
        money: player.money,
        hand: player.hand,
        industryTiles: player.industryTiles,
        boardIndustries: game.boardIndustries,
        breweryFarmTiles: game.breweryFarmTiles,
        coalMarket: game.coalMarket,
        ironMarket: game.ironMarket,
    });
}

function placedTile(playerId, type) {
    return {
        playerId,
        type,
        tileData: { level: 1, income: 0, vp: 0, linkVP: 0, resourceCubes: 0 },
        flipped: false,
        resourceCubes: 0,
    };
}

function assertRejectedWithoutMutation(game, result, before) {
    assert.equal(result.success, false);
    assert.match(result.message, /valid build target/i);
    assert.equal(stateSnapshot(game), before);
}

function testRejectsIndustryThatSlotDoesNotAllow() {
    const { game, logic } = setup();
    const before = stateSnapshot(game);

    const result = logic.executeBuild(
        0,
        'birmingham',
        2,
        context.INDUSTRY_TYPES.COTTON_MILL,
        0
    );

    assertRejectedWithoutMutation(game, result, before);
}

function testRevalidatesTargetAfterBoardStateChanges() {
    const { game, logic } = setup();
    const target = logic.getValidBuildTargets(0).find(candidate =>
        candidate.cityId === 'birmingham' &&
        candidate.slotIndex === 0 &&
        candidate.industryType === context.INDUSTRY_TYPES.COTTON_MILL
    );
    assert.ok(target, 'expected the initially legal Cotton Mill target');

    game.boardIndustries.birmingham_1 = placedTile(
        0,
        context.INDUSTRY_TYPES.MANUFACTURER
    );
    const before = stateSnapshot(game);

    const result = logic.executeBuild(
        0,
        target.cityId,
        target.slotIndex,
        target.industryType,
        0
    );

    assertRejectedWithoutMutation(game, result, before);
}

function testRejectsSecondCanalEraTileInSameCity() {
    const { game, logic } = setup();
    game.boardIndustries.birmingham_3 = placedTile(
        0,
        context.INDUSTRY_TYPES.MANUFACTURER
    );
    const before = stateSnapshot(game);

    const result = logic.executeBuild(
        0,
        'birmingham',
        0,
        context.INDUSTRY_TYPES.COTTON_MILL,
        0
    );

    assertRejectedWithoutMutation(game, result, before);
}

function testStillExecutesAValidBuild() {
    const { game, logic } = setup();
    const result = logic.executeBuild(
        0,
        'birmingham',
        0,
        context.INDUSTRY_TYPES.COTTON_MILL,
        0
    );

    assert.equal(result.success, true);
    assert.equal(game.boardIndustries.birmingham_0.playerId, 0);
    assert.equal(game.boardIndustries.birmingham_0.type, context.INDUSTRY_TYPES.COTTON_MILL);
}

testRejectsIndustryThatSlotDoesNotAllow();
testRevalidatesTargetAfterBoardStateChanges();
testRejectsSecondCanalEraTileInSameCity();
testStillExecutesAValidBuild();
console.log('build execution validation tests passed');
