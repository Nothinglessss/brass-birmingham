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
