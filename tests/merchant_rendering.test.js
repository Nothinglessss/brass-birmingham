const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createFakeElement(tagName) {
    const element = {
        tagName,
        attrs: {},
        children: [],
        textContent: '',
        parent: null,
        setAttribute(key, value) {
            this.attrs[key] = String(value);
        },
        appendChild(child) {
            child.parent = this;
            this.children.push(child);
            return child;
        },
        remove() {
            if (!this.parent) return;
            this.parent.children = this.parent.children.filter(child => child !== this);
            this.parent = null;
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            return collectNodes(this, node => {
                if (!node.attrs) return false;
                if (selector.startsWith('#')) return node.attrs.id === selector.slice(1);
                if (selector.startsWith('.')) {
                    return String(node.attrs.class || '').split(/\s+/).includes(selector.slice(1));
                }
                return false;
            }).filter(node => node !== this);
        },
    };
    return element;
}

function collectNodes(node, predicate, results = []) {
    if (predicate(node)) results.push(node);
    for (const child of node.children || []) {
        collectNodes(child, predicate, results);
    }
    return results;
}

const repoRoot = path.resolve(__dirname, '..');
const context = {
    console,
    document: {
        createElementNS(_ns, tagName) {
            return createFakeElement(tagName);
        },
    },
};
vm.createContext(context);

const graphSource = fs.readFileSync(path.join(repoRoot, 'js', 'boardGraphSource.js'), 'utf8');
const gameData = fs.readFileSync(path.join(repoRoot, 'js', 'gameData.js'), 'utf8');
const boardRenderer = fs.readFileSync(path.join(repoRoot, 'js', 'boardRenderer.js'), 'utf8');
vm.runInContext(
    `${graphSource}
${gameData}\n${boardRenderer}\n` +
    `globalThis.BoardRenderer = BoardRenderer; globalThis.MERCHANTS = MERCHANTS; ` +
    `globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES;`,
    context
);

function createRendererWithMerchants(merchantTiles) {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.state = {
        numPlayers: 2,
        merchantTiles,
    };
    renderer.drawMerchants();
    return renderer;
}

function testMerchantLabelsGreyOnlyWhenTheyDoNotAcceptFilteredProduct() {
    const renderer = createRendererWithMerchants([
        {
            location: 'oxford',
            buys: context.INDUSTRY_TYPES.COTTON_MILL,
            hasBeer: true,
            bonusClaimed: false,
        },
        {
            location: 'oxford',
            buys: context.INDUSTRY_TYPES.MANUFACTURER,
            hasBeer: false,
            bonusClaimed: true,
        },
    ]);
    renderer.setMerchantProductFilter(context.INDUSTRY_TYPES.MANUFACTURER);

    const labels = collectNodes(
        renderer.svg,
        node => node.tagName === 'text' && node.attrs.class === 'merchant-buy-label'
    );
    const cotton = labels.find(node => node.textContent === 'Cotton');
    const goods = labels.find(node => node.textContent === 'Goods');

    assert.equal(cotton.attrs.fill, '#555');
    assert.equal(goods.attrs.fill, '#b87333');
}

function testBlankMerchantTileDoesNotRenderSellEntry() {
    const renderer = createRendererWithMerchants([
        {
            location: 'shrewsbury',
            buys: null,
            hasBeer: true,
            bonusClaimed: false,
        },
    ]);
    renderer.setMerchantProductFilter(context.INDUSTRY_TYPES.COTTON_MILL);

    const shrewsbury = collectNodes(
        renderer.svg,
        node => node.attrs && node.attrs['data-merchant'] === 'shrewsbury'
    )[0];
    const label = collectNodes(
        shrewsbury,
        node => node.tagName === 'text' && node.attrs.class === 'merchant-buy-label'
    );
    const beerDots = collectNodes(
        shrewsbury,
        node => node.tagName === 'circle' && node.attrs.class === 'merchant-bonus-beer'
    );
    const slots = collectNodes(
        shrewsbury,
        node => node.tagName === 'rect' && String(node.attrs.class || '').split(/\s+/).includes('merchant-slot')
    );

    assert.equal(label.length, 0);
    assert.equal(beerDots.length, 0);
    assert.equal(slots.length, 0);
}

function testWildcardMerchantRendersAndAcceptsEverySellableProduct() {
    let renderer;
    assert.doesNotThrow(() => {
        renderer = createRendererWithMerchants([{
            location: 'oxford',
            buys: 'any',
            hasBeer: true,
            bonusClaimed: false,
        }]);
    });
    renderer.setMerchantProductFilter(context.INDUSTRY_TYPES.POTTERY);

    const anyLabel = collectNodes(
        renderer.svg,
        node => node.tagName === 'text' && node.attrs.class === 'merchant-buy-label'
    ).find(node => node.textContent === 'Any');

    assert.ok(anyLabel);
    assert.equal(anyLabel.attrs.fill, '#b87333');
}

function testYellowDotRepresentsMerchantBonusBeer() {
    const renderer = createRendererWithMerchants([
        {
            location: 'oxford',
            buys: context.INDUSTRY_TYPES.COTTON_MILL,
            hasBeer: true,
            bonusClaimed: true,
        },
        {
            location: 'oxford',
            buys: context.INDUSTRY_TYPES.MANUFACTURER,
            hasBeer: false,
            bonusClaimed: false,
        },
    ]);

    const beerDots = collectNodes(
        renderer.svg,
        node => node.tagName === 'circle' && node.attrs.class === 'merchant-bonus-beer'
    );

    assert.equal(beerDots.length, 1);
    assert.equal(beerDots[0].attrs.fill, '#c9a84c');

    const label = collectNodes(
        renderer.svg,
        node => node.tagName === 'text' && node.attrs.class === 'merchant-buy-label'
    ).find(node => node.textContent === 'Cotton');
    assert.ok(Number(beerDots[0].attrs.cx) < Number(label.attrs.x));
}

function testMerchantBonusTextRendersBelowProductEntries() {
    const renderer = createRendererWithMerchants([
        {
            location: 'oxford',
            buys: context.INDUSTRY_TYPES.COTTON_MILL,
            hasBeer: true,
            bonusClaimed: false,
        },
        {
            location: 'oxford',
            buys: context.INDUSTRY_TYPES.MANUFACTURER,
            hasBeer: true,
            bonusClaimed: false,
        },
    ]);

    const oxford = collectNodes(
        renderer.svg,
        node => node.attrs && node.attrs['data-merchant'] === 'oxford'
    )[0];
    const productLabels = collectNodes(
        oxford,
        node => node.tagName === 'text' && node.attrs.class === 'merchant-buy-label'
    );
    const bonusLabel = collectNodes(
        oxford,
        node => node.tagName === 'text' && node.attrs.class === 'merchant-bonus-label'
    )[0];
    const background = collectNodes(
        oxford,
        node => node.tagName === 'rect' && node.attrs.class === 'merchant-bg'
    )[0];
    const backgroundBottom = Number(background.attrs.y) + Number(background.attrs.height);

    assert.equal(bonusLabel.textContent, '+2 Inc');
    assert.ok(Number(bonusLabel.attrs.y) > Math.max(...productLabels.map(node => Number(node.attrs.y))));
    assert.ok(Number(bonusLabel.attrs.y) < backgroundBottom);
}

function testMerchantCityLabelsAreBold() {
    const renderer = createRendererWithMerchants([
        {
            location: 'oxford',
            buys: context.INDUSTRY_TYPES.MANUFACTURER,
            hasBeer: false,
            bonusClaimed: false,
        },
    ]);

    const oxfordLabel = collectNodes(
        renderer.svg,
        node => node.tagName === 'text' && node.attrs.class === 'merchant-label' && node.textContent === 'Oxford'
    )[0];

    assert.equal(oxfordLabel.attrs['font-weight'], '700');
}

function testMerchantProductLabelsAreLarger() {
    const renderer = createRendererWithMerchants([
        {
            location: 'oxford',
            buys: context.INDUSTRY_TYPES.MANUFACTURER,
            hasBeer: false,
            bonusClaimed: false,
        },
    ]);

    const goodsLabel = collectNodes(
        renderer.svg,
        node => node.tagName === 'text' && node.attrs.class === 'merchant-buy-label' && node.textContent === 'Goods'
    )[0];

    assert.equal(goodsLabel.attrs['font-size'], '7');
}

function testMerchantWithoutTilesDoesNotRenderEntries() {
    const renderer = createRendererWithMerchants([]);

    const warrington = collectNodes(
        renderer.svg,
        node => node.attrs && node.attrs['data-merchant'] === 'warrington'
    )[0];
    const slots = collectNodes(
        warrington,
        node => node.tagName === 'rect' && String(node.attrs.class || '').split(/\s+/).includes('merchant-slot')
    );
    const labels = collectNodes(
        warrington,
        node => node.tagName === 'text' && node.attrs.class === 'merchant-buy-label'
    );

    assert.equal(slots.length, 0);
    assert.equal(labels.length, 0);
}

function testMerchantBonusTextUsesDarkerGrey() {
    const renderer = createRendererWithMerchants([
        {
            location: 'oxford',
            buys: context.INDUSTRY_TYPES.MANUFACTURER,
            hasBeer: false,
            bonusClaimed: false,
        },
    ]);

    const bonusLabel = collectNodes(
        renderer.svg,
        node => node.tagName === 'text' && node.attrs.class === 'merchant-bonus-label'
    )[0];

    assert.equal(bonusLabel.attrs.fill, '#666');
}

testMerchantLabelsGreyOnlyWhenTheyDoNotAcceptFilteredProduct();
testBlankMerchantTileDoesNotRenderSellEntry();
testWildcardMerchantRendersAndAcceptsEverySellableProduct();
testYellowDotRepresentsMerchantBonusBeer();
testMerchantBonusTextRendersBelowProductEntries();
testMerchantCityLabelsAreBold();
testMerchantProductLabelsAreLarger();
testMerchantWithoutTilesDoesNotRenderEntries();
testMerchantBonusTextUsesDarkerGrey();
console.log('merchant rendering tests passed');
