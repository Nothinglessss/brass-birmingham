const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);

const gameData = fs.readFileSync(path.join(repoRoot, 'js', 'gameData.js'), 'utf8');
const gameState = fs.readFileSync(path.join(repoRoot, 'js', 'gameState.js'), 'utf8');
const resourcePlanner = fs.readFileSync(path.join(repoRoot, 'js', 'resourcePlanner.js'), 'utf8');
const gameLogic = fs.readFileSync(path.join(repoRoot, 'js', 'gameLogic.js'), 'utf8');
vm.runInContext(
    `const BOARD_GRAPH_SOURCE = { nodes: [], edges: [] };\n${gameData}\n${gameState}\n${resourcePlanner}\n${gameLogic}\n` +
    `globalThis.GameState = GameState; globalThis.GameLogic = GameLogic; ` +
    `globalThis.ACTIONS = ACTIONS; ` +
    `globalThis.lowestTrackPositionForIncomeLevel = lowestTrackPositionForIncomeLevel;`,
    context
);

function createGame() {
    return new context.GameState(2, ['Ada', 'Ben']);
}

function testInitialIncomeLevelAndTrackPositionAreDistinct() {
    const game = createGame();

    assert.equal(game.players[0].income, 0);
    assert.equal(game.players[0].incomePosition, 10);
    assert.equal(game.toJSON().players[0].income, 0);
    assert.equal(game.toJSON().players[0].incomePosition, 10);
}

function testIncomeRewardsAdvanceByTrackSpaces() {
    const game = createGame();
    const player = game.players[0];
    player.income = 10;
    player.incomePosition = context.lowestTrackPositionForIncomeLevel(10);

    game.advanceIncomeBySpaces(0, 1);

    assert.equal(player.income, 10);
    assert.equal(player.incomePosition, 30);
}

function testLoansMoveByLevelsAndRespectTheLowerBound() {
    const game = createGame();
    const logic = new context.GameLogic(game);
    const player = game.players[0];
    player.income = 10;
    player.incomePosition = context.lowestTrackPositionForIncomeLevel(10);
    player.hand = [{}];

    assert.equal(logic.executeLoan(0, 0).success, true);
    assert.equal(player.income, 7);
    assert.equal(player.incomePosition, 24);

    player.income = -8;
    player.incomePosition = context.lowestTrackPositionForIncomeLevel(-8);
    player.hand = [{}];
    assert.equal(logic.canPerformAction(context.ACTIONS.LOAN, 0), false);
    assert.equal(logic.executeLoan(0, 0).success, false);
}

testInitialIncomeLevelAndTrackPositionAreDistinct();
testIncomeRewardsAdvanceByTrackSpaces();
testLoansMoveByLevelsAndRespectTheLowerBound();
console.log('income track state tests passed');
