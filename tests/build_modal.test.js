const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);

const graphSource = fs.readFileSync(path.join(repoRoot, 'js', 'boardGraphSource.js'), 'utf8');
const gameData = fs.readFileSync(path.join(repoRoot, 'js', 'gameData.js'), 'utf8');
const uiManager = fs.readFileSync(path.join(repoRoot, 'js', 'uiManager.js'), 'utf8');
vm.runInContext(
    `${graphSource}
${gameData}\n${uiManager}\n` +
    `globalThis.UIManager = UIManager; globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES;`,
    context
);

function testResourceIndustryFlipRequirementShowsResourceCubes() {
    const ui = new context.UIManager();

    assert.equal(
        ui.getBuildFlipRequirementText(context.INDUSTRY_TYPES.COAL_MINE, { resourceCubes: 2 }),
        'Flip: 2 coal'
    );
    assert.equal(
        ui.getBuildFlipRequirementText(context.INDUSTRY_TYPES.IRON_WORKS, { resourceCubes: 6 }),
        'Flip: 6 iron'
    );
    assert.equal(
        ui.getBuildFlipRequirementText(context.INDUSTRY_TYPES.BREWERY, { resourceCubes: 1 }),
        'Flip: 1 beer'
    );
}

function testSellableIndustryFlipRequirementShowsBeerNeededToSell() {
    const ui = new context.UIManager();

    assert.equal(
        ui.getBuildFlipRequirementText(context.INDUSTRY_TYPES.MANUFACTURER, { beersToSell: 2, resourceCubes: 0 }),
        'Flip: 2 beer'
    );
    assert.equal(
        ui.getBuildFlipRequirementText(context.INDUSTRY_TYPES.POTTERY, { beersToSell: 0, resourceCubes: 0 }),
        'Flip: 0 beer'
    );
}

function testBuildModalShowsFlipRequirementWithBuildCost() {
    const ui = new context.UIManager();
    let capturedHtml = '';
    context.document = {
        querySelectorAll() {
            return [];
        },
    };
    ui.showModal = (_title, bodyHtml) => {
        capturedHtml = bodyHtml;
    };

    ui.showBuildModal(0, [{
        cityId: 'birmingham',
        slotIndex: 2,
        industryType: context.INDUSTRY_TYPES.MANUFACTURER,
        tileData: { level: 5, beersToSell: 2, resourceCubes: 0 },
        cost: { total: 17, coal: 1, iron: 0 },
    }]);

    assert.match(capturedHtml, /<div class="choice-item-build-cost">£17/);
    assert.match(capturedHtml, /<div class="choice-item-flip">Flip: 2 beer<\/div>/);
}

testResourceIndustryFlipRequirementShowsResourceCubes();
testSellableIndustryFlipRequirementShowsBeerNeededToSell();
testBuildModalShowsFlipRequirementWithBuildCost();
console.log('build modal tests passed');
