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

function testIndustrySourceViewModelShowsOwner() {
    const ui = new context.UIManager();
    const view = ui.getResourceSourceViewModel({
        id: 'tile:birmingham_3',
        resource: 'beer',
        sourceType: 'brewery',
        ownerId: 0,
        ownerName: 'Ada',
        ownerColor: '#c0392b',
        locationName: 'Birmingham',
        available: 2,
    });

    assert.equal(view.title, 'Ada - Brewery');
    assert.equal(view.detail, 'Birmingham - 2 beer available');
    assert.equal(view.ownerName, 'Ada');
    assert.equal(view.ownerColor, '#c0392b');
}

function testNeutralSourcesHaveClearLabelsAndBonus() {
    const ui = new context.UIManager();
    const market = ui.getResourceSourceViewModel({
        id: 'market:coal',
        resource: 'coal',
        sourceType: 'market',
        locationName: 'Coal Market',
        price: 8,
        generalSupply: true,
    });
    const merchant = ui.getResourceSourceViewModel({
        id: 'merchant:0',
        resource: 'beer',
        sourceType: 'merchant',
        locationName: 'Oxford',
        available: 1,
        bonusType: 'income',
        bonusAmount: 2,
    });

    assert.equal(market.title, 'Coal Market');
    assert.equal(market.detail, 'General supply - £8');
    assert.equal(merchant.title, 'Oxford Merchant');
    assert.match(merchant.bonus, /Income \+2/);
}

function testResourceChoiceHtmlIncludesOwnerAndAvailability() {
    const ui = new context.UIManager();
    const html = ui.renderResourceChoiceHtml({
        resource: 'beer',
        remaining: 1,
        options: [{
            id: 'tile:birmingham_3',
            resource: 'beer',
            sourceType: 'brewery',
            ownerName: 'Ada',
            ownerColor: '#c0392b',
            locationName: 'Birmingham',
            available: 2,
        }],
    });

    assert.match(html, /Ada/);
    assert.match(html, /#c0392b/);
    assert.match(html, /2 beer available/);
    assert.match(html, /data-source="tile:birmingham_3"/);
}

function testForcedPlanSkipsPickerAndAdvancesToCards() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.BUILD;
    ui.pendingData = {
        cityId: 'derby',
        slotIndex: 0,
        industryType: 'brewery',
        resourceSelections: [],
    };
    ui.logic = {
        planBuildResources() {
            return { status: 'complete', consumptions: [], marketCost: 0 };
        },
    };
    let pickerCalls = 0;
    ui.showResourceChoice = () => { pickerCalls++; };
    ui.closeModal = () => {};
    ui.updatePhaseBar = () => {};
    ui.updateHand = () => {};

    ui.advanceResourcePlanning();

    assert.equal(pickerCalls, 0);
    assert.equal(ui.actionStep, 2);
    assert.equal(ui.pendingData.resourcePlan.status, 'complete');
}

function testChoicePlanOpensSharedPicker() {
    const ui = new context.UIManager();
    ui.selectedAction = context.ACTIONS.DEVELOP;
    ui.pendingData = {
        industryType1: 'cotton',
        industryType2: null,
        resourceSelections: [],
    };
    const choice = {
        status: 'choice',
        nextChoice: { resource: 'iron', remaining: 1, options: [{}, {}] },
    };
    ui.logic = { planDevelopResources: () => choice };
    let shown = null;
    ui.showResourceChoice = value => { shown = value; };
    ui.updatePhaseBar = () => {};

    ui.advanceResourcePlanning();

    assert.equal(ui.actionStep, 1);
    assert.equal(shown, choice.nextChoice);
}

function testIndexIncludesResourcePhase() {
    const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    assert.match(html, /data-step="3"[\s\S]*Select Resources/);
    assert.match(html, /data-step="4"[\s\S]*Discard Card/);
}

function testPickerStylesIncludeOwnerAndNarrowViewportRules() {
    const css = fs.readFileSync(path.join(repoRoot, 'css', 'style.css'), 'utf8');
    assert.match(css, /\.resource-owner\s*{/);
    assert.match(css, /\.resource-owner-dot\s*{/);
    assert.match(css, /\.resource-source-bonus\s*{/);
    assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*#modal-content[\s\S]*calc\(100vw - 24px\)/);
}

testIndustrySourceViewModelShowsOwner();
testNeutralSourcesHaveClearLabelsAndBonus();
testResourceChoiceHtmlIncludesOwnerAndAvailability();
testForcedPlanSkipsPickerAndAdvancesToCards();
testChoicePlanOpensSharedPicker();
testIndexIncludesResourcePhase();
testPickerStylesIncludeOwnerAndNarrowViewportRules();
console.log('resource picker UI tests passed');
