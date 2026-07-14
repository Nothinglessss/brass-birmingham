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
vm.runInContext(
    `${graphSource}
${gameData}\n${gameState}\nglobalThis.GameState = GameState; globalThis.ERA = ERA; globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES;`,
    context
);

function createGame() {
    return new context.GameState(3, ['Ada', 'Ben', 'Cy']);
}

function createTile(type, level) {
    return {
        playerId: 0,
        type,
        level,
        tileData: {
            level,
            vp: 0,
            income: 0,
            linkVP: 0,
        },
        flipped: false,
        resourceCubes: 0,
    };
}

function testCanalEraEndOnlyRemovesLevelOneIndustries() {
    const game = createGame();

    game.boardIndustries = {
        'birmingham_0': createTile(context.INDUSTRY_TYPES.COTTON_MILL, 1),
        'birmingham_1': createTile(context.INDUSTRY_TYPES.MANUFACTURER, 2),
        'coventry_0': createTile(context.INDUSTRY_TYPES.POTTERY, 3),
    };
    game.breweryFarmTiles = {
        northern: createTile(context.INDUSTRY_TYPES.BREWERY, 1),
        southern: createTile(context.INDUSTRY_TYPES.BREWERY, 2),
    };

    game.endCanalEra();

    assert.equal(game.era, context.ERA.RAIL);
    assert.deepEqual(Object.keys(game.boardIndustries).sort(), ['birmingham_1', 'coventry_0']);
    assert.deepEqual(Object.keys(game.breweryFarmTiles), ['southern']);
}

testCanalEraEndOnlyRemovesLevelOneIndustries();
console.log('canal era tests passed');
