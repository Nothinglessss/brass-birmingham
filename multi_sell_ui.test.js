const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = __dirname;
const context = { console };
vm.createContext(context);

const source = [
    'boardGraphSource.js',
    'gameData.js',
    'uiManager.js',
].map(file => fs.readFileSync(path.join(repoRoot, 'js', file), 'utf8')).join('\n');

vm.runInContext(
    `${source}\n` +
    'globalThis.UIManager = UIManager; globalThis.ACTIONS = ACTIONS; ' +
    'globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES;',
    context
);

function sellTarget(key = 'birmingham_0') {
    return {
        key,
        cityId: 'birmingham',
        merchantIndex: 0,
        merchantLocation: 'oxford',
        beerNeeded: 0,
        tile: {
            type: context.INDUSTRY_TYPES.MANUFACTURER,
            tileData: { level: 1, vp: 3, income: 2 },
        },
    };
}

function testSuccessfulSellContinuesWithRefreshedTargets() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.SELL;
    ui.sellSession = { committed: false, messages: [] };
    ui.state = { currentPlayerId: 0 };
    ui.logic = { getValidSellTargets: () => [sellTarget('birmingham_1')] };
    ui.addLogEntry = () => {};
    ui.updatePhaseBar = () => {};
    ui.updateHand = () => {};
    let reopened = 0;
    ui.startSell = () => { reopened++; };

    ui.handleSellResult({ success: true, message: 'Sold Manufacturer Lv1' });

    assert.equal(ui.sellSession.committed, true);
    assert.deepEqual(
        Array.from(ui.sellSession.messages),
        ['Sold Manufacturer Lv1']
    );
    assert.equal(reopened, 1);
    assert.equal(ui.actionStep, 0);
}

function testSuccessfulSellAutoFinishesWhenNoTargetsRemain() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.SELL;
    ui.sellSession = { committed: false, messages: [] };
    ui.state = { currentPlayerId: 0 };
    ui.logic = { getValidSellTargets: () => [] };
    ui.addLogEntry = () => {};
    let finished = 0;
    ui.finishSellAction = () => { finished++; };

    ui.handleSellResult({ success: true, message: 'Sold Manufacturer Lv1' });

    assert.equal(finished, 1);
}

function testCompletedSellPlanningExecutesContinuationWithoutCardSelection() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.SELL;
    ui.sellSession = { committed: true, messages: ['Sold Manufacturer Lv1'] };
    ui.pendingData = { resourceSelections: [] };
    ui.closeModal = () => {};
    let continuations = 0;
    ui.processAdditionalSell = () => { continuations++; };

    ui.finishResourcePlanning({ status: 'complete', consumptions: [] });

    assert.equal(continuations, 1);
    assert.notEqual(ui.actionStep, 2);
}

function testCancelFinalizesAfterFirstSale() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.SELL;
    ui.sellSession = { committed: true, messages: ['Sold Manufacturer Lv1'] };
    let finished = 0;
    ui.finishSellAction = () => { finished++; };

    ui.cancelAction();

    assert.equal(finished, 1);
}

function testDoneSellingFooterOnlyAppearsAfterCommittedSale() {
    const ui = new context.UIManager();
    assert.equal(ui.renderSellFooterHtml(false), '');
    assert.match(ui.renderSellFooterHtml(true), /Done Selling/);
    assert.match(ui.renderSellFooterHtml(true), /sell-done-btn/);
}

testSuccessfulSellContinuesWithRefreshedTargets();
testSuccessfulSellAutoFinishesWhenNoTargetsRemain();
testCompletedSellPlanningExecutesContinuationWithoutCardSelection();
testCancelFinalizesAfterFirstSale();
testDoneSellingFooterOnlyAppearsAfterCommittedSale();
console.log('multi-sell UI tests passed');
