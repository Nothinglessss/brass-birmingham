const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);

const source = [
    'boardGraphSource.js',
    'gameData.js',
    'gameState.js',
    'resourcePlanner.js',
    'gameLogic.js',
].map(file => fs.readFileSync(path.join(repoRoot, 'js', file), 'utf8')).join('\n');

vm.runInContext(
    `${source}\n` +
    'globalThis.GameState = GameState; globalThis.GameLogic = GameLogic; ' +
    'globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES; globalThis.CARD_TYPES = CARD_TYPES; ' +
    'globalThis.ERA = ERA;',
    context
);

function createGame() {
    const game = new context.GameState(3, ['Ada', 'Ben', 'Cy']);
    game.players.forEach(player => { player.money = 100; });
    return game;
}

function makeTile(playerId, type, resourceCubes) {
    return {
        playerId,
        type,
        tileData: { level: 1, income: 0, vp: 0, linkVP: 0, resourceCubes },
        flipped: false,
        resourceCubes,
    };
}

function snapshot(game) {
    return JSON.stringify(game.toJSON());
}

function setupBreweryBuild() {
    const game = createGame();
    game.players[0].hand = [{
        type: context.CARD_TYPES.WILD_LOCATION,
        name: 'Wild Location',
    }];
    game.boardIndustries = {
        birmingham_2: makeTile(1, context.INDUSTRY_TYPES.IRON_WORKS, 1),
        dudley_0: makeTile(2, context.INDUSTRY_TYPES.IRON_WORKS, 1),
    };
    const logic = new context.GameLogic(game);
    const target = logic.getValidBuildTargets(0).find(candidate =>
        candidate.industryType === context.INDUSTRY_TYPES.BREWERY
    );
    assert.ok(target, 'expected a Brewery build target');
    return { game, logic, target };
}

function testBuildConsumesSelectedIronWorks() {
    const { game, logic, target } = setupBreweryBuild();
    const plan = logic.planBuildResources({
        playerId: 0,
        cityId: target.cityId,
        slotIndex: target.slotIndex,
        industryType: target.industryType,
    }, ['tile:dudley_0']);
    assert.equal(plan.status, 'complete');

    const result = logic.executeBuild(
        0,
        target.cityId,
        target.slotIndex,
        target.industryType,
        0,
        ['tile:dudley_0']
    );

    assert.equal(result.success, true);
    assert.equal(game.boardIndustries.dudley_0.resourceCubes, 0);
    assert.equal(game.boardIndustries.birmingham_2.resourceCubes, 1);
}

function testBuildRejectsIllegalSelectionAtomically() {
    const { game, logic, target } = setupBreweryBuild();
    const before = snapshot(game);

    const result = logic.executeBuild(
        0,
        target.cityId,
        target.slotIndex,
        target.industryType,
        0,
        ['market:iron']
    );

    assert.equal(result.success, false);
    assert.equal(snapshot(game), before);
}

function testDevelopConsumesSelectedIronWorks() {
    const game = createGame();
    game.players[0].hand = [{
        type: context.CARD_TYPES.LOCATION,
        location: 'birmingham',
        name: 'Birmingham',
    }];
    game.boardIndustries = {
        birmingham_2: makeTile(1, context.INDUSTRY_TYPES.IRON_WORKS, 1),
        dudley_0: makeTile(2, context.INDUSTRY_TYPES.IRON_WORKS, 1),
    };
    const logic = new context.GameLogic(game);

    const result = logic.executeDevelop(
        0,
        context.INDUSTRY_TYPES.COTTON_MILL,
        null,
        0,
        ['tile:dudley_0']
    );

    assert.equal(result.success, true);
    assert.equal(game.boardIndustries.dudley_0.resourceCubes, 0);
    assert.equal(game.boardIndustries.birmingham_2.resourceCubes, 1);
}

function setupDoubleRail({ includeBreweries = true } = {}) {
    const game = createGame();
    game.era = context.ERA.RAIL;
    game.isFirstRound = false;
    game.actionsPerTurn = 2;
    game.players[0].hand = [{
        type: context.CARD_TYPES.LOCATION,
        location: 'birmingham',
        name: 'Birmingham',
    }];
    game.boardIndustries = {
        birmingham_0: makeTile(0, context.INDUSTRY_TYPES.COTTON_MILL, 0),
        walsall_0: makeTile(2, context.INDUSTRY_TYPES.COAL_MINE, 2),
    };
    if (includeBreweries) {
        game.boardIndustries.stafford_1 = makeTile(0, context.INDUSTRY_TYPES.BREWERY, 1);
        game.boardIndustries.dudley_0 = makeTile(1, context.INDUSTRY_TYPES.BREWERY, 1);
    }
    game.boardLinks = {
        'birmingham-walsall': { playerId: 0, type: 'rail' },
        'birmingham-oxford': { playerId: 0, type: 'rail' },
    };
    game.merchantTiles = [{
        location: 'oxford',
        buys: context.INDUSTRY_TYPES.MANUFACTURER,
        hasBeer: true,
        bonusClaimed: false,
    }];
    const logic = new context.GameLogic(game);
    return {
        game,
        logic,
        connectionIds: ['birmingham-coventry', 'birmingham-dudley'],
    };
}

function testDoubleRailRejectsMerchantOnlyBeer() {
    const { logic, connectionIds } = setupDoubleRail({ includeBreweries: false });

    const plan = logic.planNetworkResources({
        playerId: 0,
        connectionIds,
    });

    assert.equal(plan.status, 'impossible');
    assert.match(plan.message, /beer/i);
}

function testNetworkTargetsExcludeMerchantOnlyDoubleRail() {
    const { logic, connectionIds } = setupDoubleRail({ includeBreweries: false });

    const target = logic.getValidNetworkTargets(0).find(candidate =>
        candidate.type === 'rail-double' &&
        connectionIds.every(id => candidate.connectionIds.includes(id))
    );

    assert.equal(target, undefined);
}

function testDoubleRailBeerOptionsExcludeMerchantAndShowOwners() {
    const { logic, connectionIds } = setupDoubleRail();

    const plan = logic.planNetworkResources({
        playerId: 0,
        connectionIds,
    });

    assert.equal(plan.status, 'choice');
    assert.equal(plan.nextChoice.resource, 'beer');
    assert.equal(plan.nextChoice.options.some(option => option.id.startsWith('merchant:')), false);
    assert.deepEqual(
        Array.from(plan.nextChoice.options, option => option.ownerName).sort(),
        ['Ada', 'Ben']
    );
}

function testDoubleRailConsumesSelectedOpponentBeer() {
    const { game, logic, connectionIds } = setupDoubleRail();

    const result = logic.executeNetwork(
        0,
        connectionIds,
        0,
        ['tile:dudley_0']
    );

    assert.equal(result.success, true);
    assert.equal(game.boardIndustries.dudley_0.resourceCubes, 0);
    assert.equal(game.boardIndustries.stafford_1.resourceCubes, 1);
    assert.equal(game.boardIndustries.walsall_0.resourceCubes, 0);
    assert.equal(game.merchantTiles[0].hasBeer, true);
}

function testDoubleRailRejectsSubmittedMerchantBeerAtomically() {
    const { game, logic, connectionIds } = setupDoubleRail();
    const before = snapshot(game);

    const result = logic.executeNetwork(0, connectionIds, 0, ['merchant:0']);

    assert.equal(result.success, false);
    assert.equal(snapshot(game), before);
}

function setupSellGame() {
    const game = createGame();
    game.players[0].hand = [{
        type: context.CARD_TYPES.LOCATION,
        location: 'birmingham',
        name: 'Birmingham',
    }];
    const sellTile = makeTile(0, context.INDUSTRY_TYPES.MANUFACTURER, 0);
    sellTile.tileData.beersToSell = 1;
    sellTile.tileData.income = 3;
    game.boardIndustries = {
        birmingham_0: sellTile,
        stafford_1: makeTile(0, context.INDUSTRY_TYPES.BREWERY, 1),
    };
    game.boardLinks = {
        'birmingham-oxford': { playerId: 0, type: 'canal' },
        'birmingham-dudley': { playerId: 1, type: 'canal' },
        'dudley-kidderminster': { playerId: 1, type: 'canal' },
        'kidderminster-worcester': { playerId: 1, type: 'canal' },
        'gloucester-worcester': { playerId: 1, type: 'canal' },
    };
    game.merchantTiles = [
        {
            location: 'oxford',
            buys: context.INDUSTRY_TYPES.MANUFACTURER,
            hasBeer: true,
            bonusClaimed: false,
        },
        {
            location: 'gloucester',
            buys: context.INDUSTRY_TYPES.MANUFACTURER,
            hasBeer: true,
            bonusClaimed: false,
        },
    ];
    return { game, logic: new context.GameLogic(game) };
}

function testSellTargetsIdentifySpecificMerchants() {
    const { logic } = setupSellGame();

    const targets = logic.getValidSellTargets(0)
        .filter(target => target.key === 'birmingham_0');

    assert.deepEqual(
        Array.from(targets, target => target.merchantIndex).sort(),
        [0, 1]
    );
}

function testSellPlanOnlyOffersSelectedMerchantBeer() {
    const { logic } = setupSellGame();

    const plan = logic.planSellResources({
        playerId: 0,
        tileKey: 'birmingham_0',
        merchantIndex: 0,
    });

    assert.equal(plan.status, 'choice');
    assert.equal(plan.nextChoice.options.some(option => option.id === 'merchant:0'), true);
    assert.equal(plan.nextChoice.options.some(option => option.id === 'merchant:1'), false);
}

function testBreweryBeerSaleDoesNotClaimMerchantBonus() {
    const { game, logic } = setupSellGame();
    const incomePositionBefore = game.players[0].incomePosition;

    const result = logic.executeSell(
        0,
        'birmingham_0',
        0,
        0,
        ['tile:stafford_1']
    );

    assert.equal(result.success, true);
    assert.equal(game.merchantTiles[0].hasBeer, true);
    assert.equal(game.merchantTiles[0].bonusClaimed, false);
    assert.equal(game.players[0].incomePosition, incomePositionBefore + 3);
}

function testMerchantBeerSaleClaimsThatMerchantsBonus() {
    const { game, logic } = setupSellGame();
    const incomePositionBefore = game.players[0].incomePosition;

    const result = logic.executeSell(
        0,
        'birmingham_0',
        0,
        0,
        ['merchant:0']
    );

    assert.equal(result.success, true);
    assert.equal(game.merchantTiles[0].hasBeer, false);
    assert.equal(game.merchantTiles[0].bonusClaimed, true);
    assert.equal(game.merchantTiles[1].hasBeer, true);
    assert.equal(game.players[0].incomePosition, incomePositionBefore + 5);
}

function testSellRejectsDifferentMerchantBeerAtomically() {
    const { game, logic } = setupSellGame();
    const before = snapshot(game);

    const result = logic.executeSell(
        0,
        'birmingham_0',
        0,
        0,
        ['merchant:1']
    );

    assert.equal(result.success, false);
    assert.equal(snapshot(game), before);
}

function testCanalEraResetAllowsMerchantBonusAgain() {
    const { game } = setupSellGame();
    game.merchantTiles[0].hasBeer = false;
    game.merchantTiles[0].bonusClaimed = true;

    game.endCanalEra();

    assert.equal(game.merchantTiles[0].hasBeer, true);
    assert.equal(game.merchantTiles[0].bonusClaimed, false);
}

function testEmptyIronMarketUsesGeneralSupplyForDevelop() {
    const game = createGame();
    game.ironMarket = 0;
    game.boardIndustries = {};
    game.players[0].hand = [{
        type: context.CARD_TYPES.LOCATION,
        location: 'birmingham',
        name: 'Birmingham',
    }];
    const logic = new context.GameLogic(game);

    assert.equal(logic.canDevelop(0), true);
    const moneyBefore = game.players[0].money;
    const result = logic.executeDevelop(
        0,
        context.INDUSTRY_TYPES.COTTON_MILL,
        null,
        0
    );

    assert.equal(result.success, true);
    assert.equal(game.players[0].money, moneyBefore - 6);
    assert.equal(game.ironMarket, 0);
}

function testEmptyCoalMarketNetworkTargetUsesGeneralSupply() {
    const { game, logic } = setupDoubleRail({ includeBreweries: false });
    game.coalMarket = 0;
    delete game.boardIndustries.walsall_0;

    const plan = logic.planNetworkResources({
        playerId: 0,
        connectionIds: ['birmingham-coventry'],
    });
    assert.equal(plan.status, 'complete');
    assert.equal(plan.marketCost, 8);

    const target = logic.getValidNetworkTargets(0).find(candidate =>
        candidate.connectionIds.length === 1 &&
        candidate.connectionIds[0] === 'birmingham-coventry'
    );
    assert.ok(target, 'expected the general-supply coal rail target');
    assert.equal(target.cost, plan.baseCost + 8);
}

testBuildConsumesSelectedIronWorks();
testBuildRejectsIllegalSelectionAtomically();
testDevelopConsumesSelectedIronWorks();
testDoubleRailRejectsMerchantOnlyBeer();
testNetworkTargetsExcludeMerchantOnlyDoubleRail();
testDoubleRailBeerOptionsExcludeMerchantAndShowOwners();
testDoubleRailConsumesSelectedOpponentBeer();
testDoubleRailRejectsSubmittedMerchantBeerAtomically();
testSellTargetsIdentifySpecificMerchants();
testSellPlanOnlyOffersSelectedMerchantBeer();
testBreweryBeerSaleDoesNotClaimMerchantBonus();
testMerchantBeerSaleClaimsThatMerchantsBonus();
testSellRejectsDifferentMerchantBeerAtomically();
testCanalEraResetAllowsMerchantBonusAgain();
testEmptyIronMarketUsesGeneralSupplyForDevelop();
testEmptyCoalMarketNetworkTargetUsesGeneralSupply();
console.log('resource action execution tests passed');
