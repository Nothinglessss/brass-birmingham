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
    'uiManager.js',
].map(file => fs.readFileSync(path.join(repoRoot, 'js', file), 'utf8')).join('\n');

vm.runInContext(
    `${source}\n` +
    'globalThis.UIManager = UIManager; globalThis.ACTIONS = ACTIONS;',
    context
);

const canal = {
    type: 'canal',
    connectionId: 'birmingham-coventry',
    cities: ['birmingham', 'coventry'],
    cost: 3,
};

const rail = {
    type: 'rail',
    connectionId: 'birmingham-coventry',
    cities: ['birmingham', 'coventry'],
    cost: 5,
};

const doubleRail = {
    type: 'rail',
    connectionIds: ['birmingham-coventry', 'birmingham-dudley'],
    cities: ['birmingham', 'coventry'],
    secondCities: ['birmingham', 'dudley'],
    cost: 15,
};

function normalized(value) {
    return JSON.parse(JSON.stringify(value));
}

function testInstructionDistinguishesCanalSingleRailAndDoubleRailChoices() {
    const ui = new context.UIManager();

    assert.equal(ui.getNetworkTargetInstruction([]), 'Select a connection to build');
    assert.equal(ui.getNetworkTargetInstruction([canal]), 'Select a canal link to build');
    assert.equal(ui.getNetworkTargetInstruction([rail]), 'Select a rail link to build');
    assert.equal(
        ui.getNetworkTargetInstruction([rail, doubleRail]),
        'Select one rail link or a two-link Network action'
    );
}

function testTargetViewModelExplainsTwoRailCostAndBothRoutes() {
    const ui = new context.UIManager();

    assert.deepEqual(normalized(ui.getNetworkTargetViewModel(doubleRail)), {
        title: 'Build 2 rails',
        detail: 'Birmingham - Coventry + Birmingham - Dudley',
        cost: '£15 + 2 coal + 1 beer',
    });

    assert.deepEqual(normalized(ui.getNetworkTargetViewModel(rail)), {
        title: 'Build 1 rail',
        detail: 'Birmingham - Coventry',
        cost: '£5',
    });
}

function testPhaseInstructionUsesPendingNetworkTargets() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.NETWORK;
    ui.pendingData = { networkTargets: [rail, doubleRail] };

    assert.equal(
        ui.getTargetInstruction(),
        'Select one rail link or a two-link Network action'
    );
}

testInstructionDistinguishesCanalSingleRailAndDoubleRailChoices();
testTargetViewModelExplainsTwoRailCostAndBothRoutes();
testPhaseInstructionUsesPendingNetworkTargets();
console.log('network action UI tests passed');
