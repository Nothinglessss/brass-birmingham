const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function loadContext({ includePlanner = false } = {}) {
    const context = { console };
    vm.createContext(context);

    const files = [
        'boardGraphSource.js',
        'gameData.js',
        'gameState.js',
        ...(includePlanner ? ['resourcePlanner.js'] : []),
    ];
    const source = files
        .map(file => fs.readFileSync(path.join(repoRoot, 'js', file), 'utf8'))
        .join('\n');

    vm.runInContext(
        `${source}\n` +
        'globalThis.GameState = GameState; ' +
        'globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES; ' +
        (includePlanner ? 'globalThis.ResourcePlanner = ResourcePlanner;' : ''),
        context
    );
    return context;
}

function createGame(context) {
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

function testEmptyMarketsUseGeneralSupplyPrices() {
    const context = loadContext();
    const game = createGame(context);
    game.coalMarket = 0;
    game.ironMarket = 0;

    assert.equal(game.getCoalPrice(), 8);
    assert.equal(game.getIronPrice(), 6);
}

function testIndustrySourcesIncludeOwnerIdentity() {
    const context = loadContext({ includePlanner: true });
    const game = createGame(context);
    game.boardIndustries = {
        birmingham_2: makeTile(0, context.INDUSTRY_TYPES.IRON_WORKS, 2),
        dudley_0: makeTile(1, context.INDUSTRY_TYPES.IRON_WORKS, 1),
    };
    const planner = new context.ResourcePlanner(game);

    const options = planner.getIronOptions(planner.createSimulation());

    assert.deepEqual(
        Array.from(options, option => option.id).sort(),
        ['tile:birmingham_2', 'tile:dudley_0']
    );
    const adaIron = options.find(option => option.id === 'tile:birmingham_2');
    assert.equal(adaIron.ownerName, 'Ada');
    assert.equal(adaIron.ownerColor, game.players[0].color);
    assert.equal(adaIron.locationName, 'Birmingham');
    assert.equal(adaIron.available, 2);
    assert.equal(options.some(option => option.sourceType === 'market'), false);
}

function testBeerOptionsRespectOwnerConnectionAndSelectedMerchant() {
    const context = loadContext({ includePlanner: true });
    const game = createGame(context);
    game.boardIndustries = {
        burtonOnTrent_1: makeTile(0, context.INDUSTRY_TYPES.BREWERY, 1),
        dudley_0: makeTile(1, context.INDUSTRY_TYPES.BREWERY, 1),
        stafford_1: makeTile(2, context.INDUSTRY_TYPES.BREWERY, 1),
    };
    game.boardLinks = {
        'birmingham-dudley': { playerId: 0, type: 'canal' },
        'birmingham-oxford': { playerId: 0, type: 'canal' },
        'dudley-worcester': { playerId: 1, type: 'canal' },
    };
    game.merchantTiles = [
        { location: 'oxford', buys: context.INDUSTRY_TYPES.MANUFACTURER, hasBeer: true, bonusClaimed: false },
        { location: 'worcester', buys: context.INDUSTRY_TYPES.MANUFACTURER, hasBeer: true, bonusClaimed: false },
    ];
    const planner = new context.ResourcePlanner(game);
    const simulation = planner.createSimulation();

    const sellOptions = planner.getBeerOptions(simulation, {
        playerId: 0,
        requiredLocationId: 'birmingham',
        merchantIndex: 0,
        allowMerchant: true,
    });

    assert.deepEqual(
        Array.from(sellOptions, option => option.id).sort(),
        ['merchant:0', 'tile:burtonOnTrent_1', 'tile:dudley_0']
    );
    assert.equal(sellOptions.some(option => option.id === 'merchant:1'), false);
    assert.equal(sellOptions.some(option => option.id === 'tile:stafford_1'), false);

    const networkOptions = planner.getBeerOptions(simulation, {
        playerId: 0,
        requiredLocationId: 'birmingham',
        allowMerchant: false,
    });
    assert.equal(networkOptions.some(option => option.id.startsWith('merchant:')), false);
}

function testCoalOptionsOnlyOfferTiedClosestMines() {
    const context = loadContext({ includePlanner: true });
    const game = createGame(context);
    game.boardIndustries = {
        birmingham_0: makeTile(0, context.INDUSTRY_TYPES.COAL_MINE, 1),
        birmingham_1: makeTile(1, context.INDUSTRY_TYPES.COAL_MINE, 2),
        dudley_0: makeTile(2, context.INDUSTRY_TYPES.COAL_MINE, 1),
    };
    game.boardLinks = {
        'birmingham-dudley': { playerId: 0, type: 'canal' },
        'birmingham-oxford': { playerId: 0, type: 'canal' },
    };
    const planner = new context.ResourcePlanner(game);

    const options = planner.getCoalOptions(planner.createSimulation(), ['birmingham']);

    assert.deepEqual(
        Array.from(options, option => option.id).sort(),
        ['tile:birmingham_0', 'tile:birmingham_1']
    );
    assert.equal(options.every(option => option.distance === 0), true);
}

function testEmptyMarketsRemainForcedGeneralSupplySources() {
    const context = loadContext({ includePlanner: true });
    const game = createGame(context);
    game.boardIndustries = {};
    game.boardLinks = { 'birmingham-oxford': { playerId: 0, type: 'canal' } };
    game.coalMarket = 0;
    game.ironMarket = 0;
    const planner = new context.ResourcePlanner(game);

    const coal = planner.getCoalOptions(planner.createSimulation(), ['birmingham']);
    const iron = planner.getIronOptions(planner.createSimulation());

    assert.equal(coal.length, 1);
    assert.equal(coal[0].id, 'market:coal');
    assert.equal(coal[0].price, 8);
    assert.equal(iron.length, 1);
    assert.equal(iron[0].id, 'market:iron');
    assert.equal(iron[0].price, 6);
}

function createSellPlanningGame(context, beerNeeded = 2) {
    const game = createGame(context);
    const sellTile = makeTile(0, context.INDUSTRY_TYPES.MANUFACTURER, 0);
    sellTile.tileData.beersToSell = beerNeeded;
    game.boardIndustries = {
        birmingham_0: sellTile,
        burtonOnTrent_1: makeTile(0, context.INDUSTRY_TYPES.BREWERY, 1),
        dudley_0: makeTile(1, context.INDUSTRY_TYPES.BREWERY, 1),
    };
    game.boardLinks = {
        'birmingham-dudley': { playerId: 0, type: 'canal' },
        'birmingham-oxford': { playerId: 0, type: 'canal' },
    };
    game.merchantTiles = [{
        location: 'oxford',
        buys: context.INDUSTRY_TYPES.MANUFACTURER,
        hasBeer: true,
        bonusClaimed: false,
    }];
    return game;
}

function testSellPlanStopsOnlyForGenuineChoice() {
    const context = loadContext({ includePlanner: true });
    const game = createSellPlanningGame(context, 1);
    const planner = new context.ResourcePlanner(game);

    const result = planner.planSell({
        playerId: 0,
        tileKey: 'birmingham_0',
        merchantIndex: 0,
    });

    assert.equal(result.status, 'choice');
    assert.equal(result.nextChoice.resource, 'beer');
    assert.equal(result.nextChoice.remaining, 1);
    assert.equal(result.nextChoice.options.length, 3);
}

function testSellPlanAutomaticallyUsesUniqueSource() {
    const context = loadContext({ includePlanner: true });
    const game = createSellPlanningGame(context, 1);
    delete game.boardIndustries.dudley_0;
    game.merchantTiles[0].hasBeer = false;
    const planner = new context.ResourcePlanner(game);

    const result = planner.planSell({
        playerId: 0,
        tileKey: 'birmingham_0',
        merchantIndex: 0,
    });

    assert.equal(result.status, 'complete');
    assert.deepEqual(Array.from(result.selections), []);
    assert.equal(result.consumptions.length, 1);
    assert.equal(result.consumptions[0].sourceId, 'tile:burtonOnTrent_1');
}

function testSellPlanCanSplitBeerAcrossSources() {
    const context = loadContext({ includePlanner: true });
    const game = createSellPlanningGame(context, 2);
    const planner = new context.ResourcePlanner(game);

    const result = planner.planSell({
        playerId: 0,
        tileKey: 'birmingham_0',
        merchantIndex: 0,
    }, ['tile:burtonOnTrent_1', 'tile:dudley_0']);

    assert.equal(result.status, 'complete');
    assert.deepEqual(
        Array.from(result.consumptions, unit => unit.sourceId),
        ['tile:burtonOnTrent_1', 'tile:dudley_0']
    );
}

function testSellPlanRejectsOverdrawingSource() {
    const context = loadContext({ includePlanner: true });
    const game = createSellPlanningGame(context, 2);
    const planner = new context.ResourcePlanner(game);

    const result = planner.planSell({
        playerId: 0,
        tileKey: 'birmingham_0',
        merchantIndex: 0,
    }, ['tile:burtonOnTrent_1', 'tile:burtonOnTrent_1']);

    assert.equal(result.status, 'invalid');
    assert.match(result.message, /no longer legal/i);
}

function testDevelopPlanPromptsThenForcesRemainingIron() {
    const context = loadContext({ includePlanner: true });
    const game = createGame(context);
    game.boardIndustries = {
        birmingham_2: makeTile(0, context.INDUSTRY_TYPES.IRON_WORKS, 1),
        dudley_0: makeTile(1, context.INDUSTRY_TYPES.IRON_WORKS, 1),
    };
    const planner = new context.ResourcePlanner(game);
    const planContext = {
        playerId: 0,
        industryTypes: [
            context.INDUSTRY_TYPES.COTTON_MILL,
            context.INDUSTRY_TYPES.COAL_MINE,
        ],
    };

    const choice = planner.planDevelop(planContext);
    assert.equal(choice.status, 'choice');
    assert.equal(choice.nextChoice.options.length, 2);

    const complete = planner.planDevelop(planContext, ['tile:dudley_0']);
    assert.equal(complete.status, 'complete');
    assert.deepEqual(
        Array.from(complete.consumptions, unit => unit.sourceId),
        ['tile:dudley_0', 'tile:birmingham_2']
    );
}

function testBuildPlanRecalculatesClosestCoalAfterEachCube() {
    const context = loadContext({ includePlanner: true });
    const game = createGame(context);
    const nextTile = game.getNextTile(0, context.INDUSTRY_TYPES.MANUFACTURER);
    nextTile.costCoal = 2;
    nextTile.costIron = 0;
    game.boardIndustries = {
        birmingham_0: makeTile(0, context.INDUSTRY_TYPES.COAL_MINE, 1),
        birmingham_1: makeTile(1, context.INDUSTRY_TYPES.COAL_MINE, 2),
    };
    const planner = new context.ResourcePlanner(game);
    const planContext = {
        playerId: 0,
        cityId: 'birmingham',
        slotIndex: 2,
        industryType: context.INDUSTRY_TYPES.MANUFACTURER,
    };

    const choice = planner.planBuild(planContext);
    assert.equal(choice.status, 'choice');
    assert.equal(choice.nextChoice.options.length, 2);

    const complete = planner.planBuild(planContext, ['tile:birmingham_0']);
    assert.equal(complete.status, 'complete');
    assert.deepEqual(
        Array.from(complete.consumptions, unit => unit.sourceId),
        ['tile:birmingham_0', 'tile:birmingham_1']
    );
}

function testApplicationLoadsPlannerBeforeGameLogic() {
    const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    const plannerIndex = html.indexOf('js/resourcePlanner.js');
    const logicIndex = html.indexOf('js/gameLogic.js');

    assert.ok(plannerIndex >= 0, 'resourcePlanner.js should be loaded by index.html');
    assert.ok(plannerIndex < logicIndex, 'resourcePlanner.js should load before gameLogic.js');
}

testEmptyMarketsUseGeneralSupplyPrices();
testIndustrySourcesIncludeOwnerIdentity();
testBeerOptionsRespectOwnerConnectionAndSelectedMerchant();
testCoalOptionsOnlyOfferTiedClosestMines();
testEmptyMarketsRemainForcedGeneralSupplySources();
testSellPlanStopsOnlyForGenuineChoice();
testSellPlanAutomaticallyUsesUniqueSource();
testSellPlanCanSplitBeerAcrossSources();
testSellPlanRejectsOverdrawingSource();
testDevelopPlanPromptsThenForcesRemainingIron();
testBuildPlanRecalculatesClosestCoalAfterEachCube();
testApplicationLoadsPlannerBeforeGameLogic();
console.log('resource planner source tests passed');
