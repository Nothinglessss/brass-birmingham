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
vm.runInContext(`${graphSource}
${gameData}\n${gameState}\nglobalThis.GameState = GameState;`, context);

function createGame() {
    return new context.GameState(3, ['Ada', 'Ben', 'Cy']);
}

function testLeastSpendingGoesFirst() {
    const game = createGame();
    game.turnOrder = [0, 1, 2];
    game.moneySpentThisRound = {
        0: 20,
        1: 5,
        2: 12,
    };

    game.endRound();

    assert.deepEqual(game.turnOrder, [1, 2, 0]);
}

function testTiesKeepCurrentTurnOrder() {
    const game = createGame();
    game.turnOrder = [2, 0, 1];
    game.moneySpentThisRound = {
        0: 10,
        1: 10,
        2: 3,
    };

    game.endRound();

    assert.deepEqual(game.turnOrder, [2, 0, 1]);
}

testLeastSpendingGoesFirst();
testTiesKeepCurrentTurnOrder();
console.log('turn order tests passed');
