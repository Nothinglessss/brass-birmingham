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
    `globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES; globalThis.CARD_TYPES = CARD_TYPES; ` +
    `globalThis.ERA = ERA; globalThis.ACTIONS = ACTIONS; globalThis.CARD_DECK = CARD_DECK;`,
    context
);

function createGame(numPlayers = 3) {
    const names = ['Ada', 'Ben', 'Cy', 'Dee'].slice(0, numPlayers);
    const game = new context.GameState(numPlayers, names);
    game.players.forEach(p => { p.money = 100; });
    return game;
}

function makeTile(playerId, type, level = 1, resourceCubes = 0) {
    return {
        playerId,
        type,
        tileData: { level, income: 0, vp: 0, linkVP: 0, resourceCubes },
        flipped: false,
        resourceCubes,
    };
}

function testBuildRejectsInvalidDiscardCard() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    game.players[0].hand = [
        { type: context.CARD_TYPES.LOCATION, location: 'dudley', name: 'Dudley' },
        { type: context.CARD_TYPES.LOCATION, location: 'stafford', name: 'Stafford' },
    ];
    game.boardIndustries.dudley_0 = makeTile(1, context.INDUSTRY_TYPES.COAL_MINE, 1, 1);

    const result = logic.executeBuild(0, 'dudley', 1, context.INDUSTRY_TYPES.IRON_WORKS, 1);

    assert.equal(result.success, false);
    assert.equal(game.boardIndustries.dudley_1, undefined);
    assert.equal(game.players[0].hand.length, 2);
}

function testCoalMarketRequiresMerchantConnection() {
    const game = createGame();

    assert.equal(game.findCoalSource('birmingham', 0).some(src => src.type === 'market'), false);

    game.boardLinks['birmingham-oxford'] = { playerId: 1, type: 'canal' };
    assert.equal(game.findCoalSource('birmingham', 0).some(src => src.type === 'market'), true);
}

function testTwoPlayerCardDeckExcludesNorthernLocationsButMapLogicAllowsThem() {
    const game = createGame(2);
    const logic = new context.GameLogic(game);
    game.players[0].hand = [{ type: context.CARD_TYPES.WILD_LOCATION, name: 'Wild Location' }];

    assert.equal(Boolean(context.CARD_DECK[2].locations.belper), false);
    assert.equal(Boolean(context.CARD_DECK[2].locations.leek), false);
    assert.equal(logic.getValidBuildTargets(0).some(t => t.cityId === 'belper'), true);
    assert.equal(logic.getValidBuildTargets(0).some(t => t.cityId === 'leek'), true);
    assert.equal(game.merchantTiles.some(t => t.location === 'warrington'), false);
    assert.equal(logic.getValidNetworkTargets(0).some(t => t.connectionId === 'leek-stokeOnTrent'), true);
    assert.equal(logic.getValidNetworkTargets(0).some(t => t.connectionId === 'burtonOnTrent-derby'), true);
    assert.equal(logic.getValidNetworkTargets(0).some(t => t.connectionId === 'stokeOnTrent-warrington'), true);

    game.era = context.ERA.RAIL;
    assert.equal(logic.getValidNetworkTargets(0).some(t => t.connectionId === 'stokeOnTrent-warrington'), true);
}

function testTwoPlayerWarringtonLinkGrantsCoalMarketAccessOnlyAfterBuilt() {
    const game = createGame(2);

    assert.equal(game.findCoalSource('stokeOnTrent', 0).some(src => src.type === 'market'), false);

    game.boardLinks['stokeOnTrent-warrington'] = { playerId: 0, type: 'canal' };

    assert.equal(game.findCoalSource('stokeOnTrent', 0).some(src => src.type === 'market'), true);
}

function testExternalBreweryFarmsCanBeBuiltWhenInNetwork() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    game.players[0].hand = [{ type: context.CARD_TYPES.INDUSTRY, industryType: context.INDUSTRY_TYPES.BREWERY, name: 'Brewery' }];
    game.boardLinks['cannock-northern'] = { playerId: 0, type: 'canal' };

    const target = logic.getValidBuildTargets(0).find(t => t.cityId === 'northern' && t.industryType === context.INDUSTRY_TYPES.BREWERY);
    assert.ok(target);

    const result = logic.executeBuild(0, target.cityId, target.slotIndex, target.industryType, 0);
    assert.equal(result.success, true);
    assert.equal(game.breweryFarmTiles.northern.type, context.INDUSTRY_TYPES.BREWERY);
}

function testSellActionRejectsMultipleIndustries() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    game.players[0].hand = [{ type: context.CARD_TYPES.LOCATION, location: 'birmingham', name: 'Birmingham' }];
    game.boardIndustries.birmingham_0 = makeTile(0, context.INDUSTRY_TYPES.COTTON_MILL);
    game.boardIndustries.birmingham_0.tileData.beersToSell = 0;
    game.boardIndustries.birmingham_1 = makeTile(0, context.INDUSTRY_TYPES.MANUFACTURER);
    game.boardIndustries.birmingham_1.tileData.beersToSell = 0;

    const result = logic.executeSell(0, ['birmingham_0', 'birmingham_1'], 0);

    assert.equal(result.success, false);
    assert.equal(game.boardIndustries.birmingham_0.flipped, false);
    assert.equal(game.boardIndustries.birmingham_1.flipped, false);
    assert.equal(game.players[0].hand.length, 1);
}

function testClaimedMerchantStillAcceptsMatchingGoodsSale() {
    const game = createGame(2);
    const logic = new context.GameLogic(game);
    game.merchantTiles = [{
        location: 'oxford',
        buys: context.INDUSTRY_TYPES.MANUFACTURER,
        hasBeer: false,
        bonusClaimed: true,
    }];
    game.boardLinks['birmingham-oxford'] = { playerId: 1, type: 'canal' };
    game.boardIndustries.birmingham_0 = makeTile(0, context.INDUSTRY_TYPES.MANUFACTURER);
    game.boardIndustries.birmingham_0.tileData.beersToSell = 1;
    game.boardIndustries.burtonOnTrent_1 = makeTile(0, context.INDUSTRY_TYPES.BREWERY, 1, 1);

    assert.equal(
        logic.getValidSellTargets(0).some(t => t.key === 'birmingham_0'),
        true
    );
}

function testBlankMerchantDoesNotAcceptGoodsSale() {
    const game = createGame(2);
    const logic = new context.GameLogic(game);
    game.players[0].hand = [{ type: context.CARD_TYPES.LOCATION, location: 'birmingham', name: 'Birmingham' }];
    game.merchantTiles = [{
        location: 'oxford',
        buys: null,
        hasBeer: true,
        bonusClaimed: false,
    }];
    game.boardLinks['birmingham-oxford'] = { playerId: 1, type: 'canal' };
    game.boardIndustries.birmingham_0 = makeTile(0, context.INDUSTRY_TYPES.COTTON_MILL);
    game.boardIndustries.birmingham_0.tileData.beersToSell = 1;

    assert.equal(
        logic.getValidSellTargets(0).some(t => t.key === 'birmingham_0'),
        false
    );

    const result = logic.executeSell(0, ['birmingham_0'], 0);

    assert.equal(result.success, false);
    assert.equal(game.boardIndustries.birmingham_0.flipped, false);
    assert.equal(game.players[0].hand.length, 1);
}

function testMerchantTilesAreDealtToMerchantSpacesAfterShuffle() {
    const originalShuffle = context.GameState.prototype.shuffleArray;
    context.GameState.prototype.shuffleArray = arr => arr.reverse();

    try {
        const game = createGame(2);
        const byLocation = game.merchantTiles.reduce((acc, tile) => {
            if (!acc[tile.location]) acc[tile.location] = [];
            acc[tile.location].push(tile.buys);
            return acc;
        }, {});

        assert.deepEqual(byLocation.shrewsbury, [context.INDUSTRY_TYPES.MANUFACTURER]);
        assert.deepEqual(byLocation.gloucester, [
            context.INDUSTRY_TYPES.COTTON_MILL,
            context.INDUSTRY_TYPES.COTTON_MILL,
        ]);
        assert.deepEqual(byLocation.oxford, [
            context.INDUSTRY_TYPES.MANUFACTURER,
            null,
        ]);
    } finally {
        context.GameState.prototype.shuffleArray = originalShuffle;
    }
}

function testRailEraCanBuildTwoRailsWithBeer() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    game.era = context.ERA.RAIL;
    game.isFirstRound = false;
    game.actionsPerTurn = 2;
    game.players[0].hand = [{ type: context.CARD_TYPES.LOCATION, location: 'birmingham', name: 'Birmingham' }];
    game.boardIndustries.birmingham_0 = makeTile(0, context.INDUSTRY_TYPES.COTTON_MILL);
    game.boardIndustries.birmingham_2 = makeTile(1, context.INDUSTRY_TYPES.IRON_WORKS, 2, 4);
    game.boardIndustries.birmingham_3 = makeTile(0, context.INDUSTRY_TYPES.BREWERY, 2, 1);
    game.boardIndustries.walsall_0 = makeTile(1, context.INDUSTRY_TYPES.COAL_MINE, 2, 2);
    game.boardLinks['birmingham-walsall'] = { playerId: 0, type: 'rail' };

    const target = logic.getValidNetworkTargets(0).find(t =>
        t.connectionIds &&
        t.connectionIds.includes('birmingham-coventry') &&
        t.connectionIds.includes('birmingham-dudley')
    );
    assert.ok(target);

    const result = logic.executeNetwork(0, target.connectionIds, 0);
    assert.equal(result.success, true);
    assert.equal(game.boardLinks['birmingham-coventry'].playerId, 0);
    assert.equal(game.boardLinks['birmingham-dudley'].playerId, 0);
    assert.equal(game.boardIndustries.birmingham_3.flipped, true);
}

function testIncomeAdvancesByTrackSpacesNotDirectLevels() {
    const game = createGame();

    game.players[0].income = 10;
    game.players[0].incomePosition = context.lowestTrackPositionForIncomeLevel(10);

    game.advanceIncomeBySpaces(0, 1);
    assert.equal(game.players[0].income, 10);

    game.advanceIncomeBySpaces(0, 1);
    assert.equal(game.players[0].income, 11);
}

function testPlayersStartWithZeroIncome() {
    const game = createGame();

    for (const player of game.players) {
        assert.equal(player.income, 0);
        assert.equal(player.incomePosition, 10);
    }

    for (const player of game.toJSON().players) {
        assert.equal(player.income, 0);
        assert.equal(player.incomePosition, 10);
    }
}

function testLoanMovesBackThreeIncomeLevelsToHighestTrackSpace() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    const player = game.players[0];
    player.income = 10;
    player.incomePosition = context.lowestTrackPositionForIncomeLevel(10);
    player.hand = [{ type: context.CARD_TYPES.LOCATION, location: 'birmingham', name: 'Birmingham' }];

    const result = logic.executeLoan(0, 0);

    assert.equal(result.success, true);
    assert.equal(player.income, 7);
    assert.equal(player.incomePosition, 24);
}

function testLoanIsRejectedIfItWouldMoveIncomeBelowMinusTen() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    const player = game.players[0];
    player.income = -8;
    player.incomePosition = context.lowestTrackPositionForIncomeLevel(-8);
    player.hand = [{ type: context.CARD_TYPES.LOCATION, location: 'birmingham', name: 'Birmingham' }];
    const moneyBefore = player.money;

    assert.equal(logic.canPerformAction(context.ACTIONS.LOAN, 0), false);
    const result = logic.executeLoan(0, 0);

    assert.equal(result.success, false);
    assert.equal(player.money, moneyBefore);
    assert.equal(player.income, -8);
    assert.equal(player.incomePosition, 2);
    assert.equal(player.hand.length, 1);
}

function testCanalEraAllowsReplacingOwnTileButNotSecondTileInLocation() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    game.players[0].hand = [{ type: context.CARD_TYPES.LOCATION, location: 'dudley', name: 'Dudley' }];
    game.boardIndustries.dudley_0 = makeTile(0, context.INDUSTRY_TYPES.COAL_MINE, 1, 0);
    game.players[0].industryTiles[context.INDUSTRY_TYPES.COAL_MINE][0].used = true;

    assert.equal(
        logic.getValidBuildTargets(0).some(t =>
            t.cityId === 'dudley' &&
            t.slotIndex === 0 &&
            t.industryType === context.INDUSTRY_TYPES.COAL_MINE
        ),
        true
    );

    game.boardIndustries.dudley_1 = makeTile(1, context.INDUSTRY_TYPES.IRON_WORKS, 1, 0);
    assert.equal(
        logic.getValidBuildTargets(0).some(t =>
            t.cityId === 'dudley' &&
            t.slotIndex === 1 &&
            t.industryType === context.INDUSTRY_TYPES.IRON_WORKS
        ),
        false
    );
}

testBuildRejectsInvalidDiscardCard();
testCoalMarketRequiresMerchantConnection();
testTwoPlayerCardDeckExcludesNorthernLocationsButMapLogicAllowsThem();
testTwoPlayerWarringtonLinkGrantsCoalMarketAccessOnlyAfterBuilt();
testExternalBreweryFarmsCanBeBuiltWhenInNetwork();
testSellActionRejectsMultipleIndustries();
testClaimedMerchantStillAcceptsMatchingGoodsSale();
testBlankMerchantDoesNotAcceptGoodsSale();
testMerchantTilesAreDealtToMerchantSpacesAfterShuffle();
testRailEraCanBuildTwoRailsWithBeer();
testPlayersStartWithZeroIncome();
testIncomeAdvancesByTrackSpacesNotDirectLevels();
testLoanMovesBackThreeIncomeLevelsToHighestTrackSpace();
testLoanIsRejectedIfItWouldMoveIncomeBelowMinusTen();
testCanalEraAllowsReplacingOwnTileButNotSecondTileInLocation();
console.log('rule deviation tests passed');
