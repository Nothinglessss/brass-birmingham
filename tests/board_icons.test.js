const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createFakeElement(tagName) {
    return {
        tagName,
        attrs: {},
        children: [],
        textContent: '',
        setAttribute(key, value) {
            this.attrs[key] = String(value);
        },
        appendChild(child) {
            this.children.push(child);
            return child;
        },
    };
}

function collectNodes(node, predicate, results = []) {
    if (predicate(node)) results.push(node);
    for (const child of node.children || []) {
        collectNodes(child, predicate, results);
    }
    return results;
}

function parseTranslate(transform) {
    const match = /^translate\(([-\d.]+), ([-\d.]+)\)$/.exec(transform);
    assert.ok(match, `Expected translate() transform, got ${transform}`);
    return { x: Number(match[1]), y: Number(match[2]) };
}

function rectBounds(rect, origin = { x: 0, y: 0 }) {
    return {
        left: origin.x + Number(rect.attrs.x),
        top: origin.y + Number(rect.attrs.y),
        right: origin.x + Number(rect.attrs.x) + Number(rect.attrs.width),
        bottom: origin.y + Number(rect.attrs.y) + Number(rect.attrs.height),
    };
}

function boxesOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
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
    `${graphSource}\n${gameData}\n${boardRenderer}\nglobalThis.BoardRenderer = BoardRenderer; globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES;`,
    context
);

function createRenderer() {
    return new context.BoardRenderer(createFakeElement('svg'));
}

function testIndustryIconsUseUploadedProductArtwork() {
    const renderer = createRenderer();
    const expectedArtwork = {
        [context.INDUSTRY_TYPES.COTTON_MILL]: 'assets/icons/cotton.png',
        [context.INDUSTRY_TYPES.COAL_MINE]: 'assets/icons/coal.png',
        [context.INDUSTRY_TYPES.IRON_WORKS]: 'assets/icons/iron.png',
        [context.INDUSTRY_TYPES.MANUFACTURER]: 'assets/icons/manufactured-goods.png',
        [context.INDUSTRY_TYPES.POTTERY]: 'assets/icons/pottery.png',
        [context.INDUSTRY_TYPES.BREWERY]: 'assets/icons/beer-barrel.png',
    };

    for (const [type, expectedHref] of Object.entries(expectedArtwork)) {
        const size = 14;
        const icon = renderer.getIndustryIcon(type, size, { context: 'slot' });
        const serialized = JSON.stringify(icon);
        assert.equal(icon.attrs['data-product-icon'], type, `${type} should identify its product icon`);
        assert.equal(icon.attrs['data-icon-context'], 'slot');
        assert.equal(icon.attrs['data-icon-source'], 'uploaded-artwork');
        const assetPath = path.join(repoRoot, expectedHref);
        assert.equal(fs.existsSync(assetPath), true, `${expectedHref} should exist`);
        assert.ok(fs.statSync(assetPath).size < 200 * 1024, `${expectedHref} should be smaller than 200KB`);

        const backdrop = icon.children.find(node => node.attrs && node.attrs.class === 'icon-visibility-plate');
        assert.ok(backdrop, `${type} should render a visibility plate behind the uploaded artwork`);
        assert.equal(backdrop.attrs['data-icon-context'], 'slot');
        assert.ok(Number(backdrop.attrs.width) > size, `${type} backdrop should be wider than the image`);
        assert.ok(Number(backdrop.attrs.height) > size, `${type} backdrop should be taller than the image`);

        const images = collectNodes(icon, node => node.tagName === 'image');
        assert.equal(images.length, 1, `${type} should render one uploaded image asset`);
        assert.ok(icon.children.indexOf(backdrop) < icon.children.indexOf(images[0]), `${type} backdrop should render below the image`);
        assert.equal(images[0].attrs.href, expectedHref);
        assert.equal(images[0].attrs.width, String(size));
        assert.equal(images[0].attrs.height, String(size));
        assert.equal(images[0].attrs.x, String(-size / 2));
        assert.equal(images[0].attrs.y, String(-size / 2));
        assert.equal(images[0].attrs.preserveAspectRatio, 'xMidYMid meet');

        assert.doesNotMatch(serialized, /#f5ecd2|#2f3036|#7f7669|#8a4f21|#e7d4ab|#9a5b24/i, `${type} should not use hand-drawn vector colors`);
    }
}

function testMultiIndustryCitySlotsRenderIconPairs() {
    const renderer = createRenderer();
    renderer.drawCities();

    const slotTexts = collectNodes(renderer.svg, node => node.tagName === 'text' && node.textContent.includes('/'));
    assert.deepEqual(slotTexts.map(node => node.textContent), []);

    const belperFirstSlot = collectNodes(
        renderer.svg,
        node => node.attrs && node.attrs.class === 'industry-slot' && node.attrs['data-city'] === 'belper' && node.attrs['data-slot'] === '0'
    )[0];
    const slotIcons = collectNodes(belperFirstSlot, node => node.attrs && node.attrs.class === 'slot-industry-icon');
    assert.equal(slotIcons.length, 2);
    assert.deepEqual(slotIcons.map(icon => icon.attrs.opacity), ['1', '1']);
    assert.deepEqual(slotIcons.map(icon => icon.attrs['data-icon-context']), ['slot', 'slot']);
}

function testBuiltTileIconsUseStateAwareBackdropsAndBadgesStayOnTop() {
    const renderer = createRenderer();
    renderer.state = {
        players: [
            { color: '#c0392b' },
        ],
    };

    const baseTile = {
        playerId: 0,
        type: context.INDUSTRY_TYPES.COAL_MINE,
        tileData: { level: 2, vp: 5 },
    };

    renderer.drawBuiltIndustryTile(renderer.svg, 0, 0, {
        ...baseTile,
        flipped: false,
        resourceCubes: 3,
    });
    renderer.drawBuiltIndustryTile(renderer.svg, 40, 0, {
        ...baseTile,
        flipped: true,
        resourceCubes: 0,
    });

    const iconGroups = collectNodes(renderer.svg, node => node.attrs && node.attrs['data-product-icon'] === context.INDUSTRY_TYPES.COAL_MINE);
    assert.equal(iconGroups.length, 2);
    assert.equal(iconGroups[0].attrs['data-icon-context'], 'built');
    assert.equal(iconGroups[1].attrs['data-icon-context'], 'flipped');

    const builtPlate = iconGroups[0].children.find(node => node.attrs && node.attrs.class === 'icon-visibility-plate');
    const flippedPlate = iconGroups[1].children.find(node => node.attrs && node.attrs.class === 'icon-visibility-plate');
    assert.equal(builtPlate.attrs['data-icon-context'], 'built');
    assert.equal(flippedPlate.attrs['data-icon-context'], 'flipped');
    assert.ok(Number(flippedPlate.attrs.opacity) < Number(builtPlate.attrs.opacity), 'flipped icon plate should be slightly muted');

    const firstBadgeIndex = renderer.svg.children.findIndex(node => node.tagName === 'circle' && node.attrs.fill === '#c9a84c' && node.attrs.cx === '25');
    const firstIconIndex = renderer.svg.children.indexOf(iconGroups[0]);
    assert.ok(firstBadgeIndex > firstIconIndex, 'resource badge should render above built tile icon');

    const flippedBadgeIndex = renderer.svg.children.findIndex(node => node.tagName === 'circle' && node.attrs.fill === '#c9a84c' && node.attrs.cx === '65');
    const flippedIconIndex = renderer.svg.children.indexOf(iconGroups[1]);
    assert.ok(flippedBadgeIndex > flippedIconIndex, 'VP badge should render above flipped tile icon');
}

function testCitySlotsAndPossibleBuildingIconsAreReadableWithoutOverlapping() {
    const renderer = createRenderer();
    assert.equal(renderer.citySlotSize, 30);
    assert.equal(renderer.citySlotGap, 6);
    assert.equal(renderer.singleSlotIconSize, 20);
    assert.equal(renderer.multiSlotIconSize, 14);

    renderer.drawCities();

    const belperFirstSlot = collectNodes(
        renderer.svg,
        node => node.attrs && node.attrs.class === 'industry-slot' && node.attrs['data-city'] === 'belper' && node.attrs['data-slot'] === '0'
    )[0];
    const slotIcons = collectNodes(belperFirstSlot, node => node.attrs && node.attrs.class === 'slot-industry-icon');
    const iconCenters = slotIcons.map(icon => parseTranslate(icon.attrs.transform));
    assert.ok(
        Math.abs(iconCenters[1].x - iconCenters[0].x) >= renderer.multiSlotIconSize + 1,
        'dual possible-building icons should have at least 1px breathing room'
    );

    const belperSlots = collectNodes(
        renderer.svg,
        node => node.tagName === 'rect' &&
            node.attrs.width === String(renderer.citySlotSize) &&
            node.attrs.height === String(renderer.citySlotSize)
    ).slice(0, 3);
    for (let i = 1; i < belperSlots.length; i++) {
        const previousRight = Number(belperSlots[i - 1].attrs.x) + Number(belperSlots[i - 1].attrs.width);
        const nextLeft = Number(belperSlots[i].attrs.x);
        assert.ok(nextLeft - previousRight >= renderer.citySlotGap);
    }
}

function testLargerCityIconsDoNotOverlapOtherCityIcons() {
    const renderer = createRenderer();
    renderer.drawCities();

    const cityGroups = collectNodes(renderer.svg, node => node.attrs && node.attrs.class === 'city-group');
    const cityBounds = cityGroups.map(group => {
        const origin = parseTranslate(group.attrs.transform);
        const outerGlow = group.children.find(child =>
            child.tagName === 'rect' && child.attrs.fill === 'none' && Number(child.attrs.width) > renderer.citySlotSize
        );
        assert.ok(outerGlow, `Missing outer glow for ${group.attrs['data-city']}`);

        return {
            city: group.attrs['data-city'],
            ...rectBounds(outerGlow, origin),
        };
    });

    for (let i = 0; i < cityBounds.length; i++) {
        for (let j = i + 1; j < cityBounds.length; j++) {
            assert.equal(
                boxesOverlap(cityBounds[i], cityBounds[j]),
                false,
                `${cityBounds[i].city} should not overlap ${cityBounds[j].city}`
            );
        }
    }
}

function testBuiltAndFlippedTilesUsePlayerColorShades() {
    const renderer = createRenderer();
    renderer.state = {
        players: [
            { color: '#c0392b' },
        ],
    };

    const baseTile = {
        playerId: 0,
        type: context.INDUSTRY_TYPES.COTTON_MILL,
        tileData: { level: 2, vp: 5 },
        resourceCubes: 0,
    };

    renderer.drawBuiltIndustryTile(renderer.svg, 0, 0, { ...baseTile, flipped: false });
    renderer.drawBuiltIndustryTile(renderer.svg, 30, 0, { ...baseTile, flipped: true });

    const builtTiles = collectNodes(renderer.svg, node => node.attrs && node.attrs.class && node.attrs.class.includes('built-tile'));
    assert.equal(builtTiles[0].attrs.fill, '#8e2a20');
    assert.equal(builtTiles[1].attrs.fill, '#d8847c');
    assert.notEqual(builtTiles[1].attrs.fill, 'url(#tileFlippedBg)');

    const levelTexts = collectNodes(renderer.svg, node => node.tagName === 'text' && String(node.textContent) === '2');
    assert.equal(levelTexts[0].attrs.fill, 'white');
    assert.equal(levelTexts[1].attrs.fill, '#211714');
}

function testUnflippedResourceTilesShowRemainingCountBadge() {
    const renderer = createRenderer();
    renderer.state = {
        players: [
            { color: '#f39c12' },
        ],
    };

    renderer.drawBuiltIndustryTile(renderer.svg, 0, 0, {
        playerId: 0,
        type: context.INDUSTRY_TYPES.COAL_MINE,
        tileData: { level: 2, vp: 2 },
        flipped: false,
        resourceCubes: 3,
    });

    const resourceCubeRects = collectNodes(renderer.svg, node => node.attrs && node.attrs.class === 'resource-cube');
    assert.equal(resourceCubeRects.length, 0);

    const countBadges = collectNodes(
        renderer.svg,
        node => node.tagName === 'circle' && node.attrs && node.attrs.fill === '#c9a84c' && node.attrs.r === '6'
    );
    assert.equal(countBadges.length, 1);
    assert.equal(countBadges[0].attrs.cx, '25');
    assert.equal(countBadges[0].attrs.cy, '25');

    const countTexts = collectNodes(renderer.svg, node => node.tagName === 'text' && String(node.textContent) === '3');
    assert.equal(countTexts.length, 1);
    assert.equal(countTexts[0].attrs['text-anchor'], 'middle');
    assert.equal(countTexts[0].attrs.fill, '#1a1510');
}

testIndustryIconsUseUploadedProductArtwork();
testMultiIndustryCitySlotsRenderIconPairs();
testBuiltTileIconsUseStateAwareBackdropsAndBadgesStayOnTop();
testCitySlotsAndPossibleBuildingIconsAreReadableWithoutOverlapping();
testLargerCityIconsDoNotOverlapOtherCityIcons();
testBuiltAndFlippedTilesUsePlayerColorShades();
testUnflippedResourceTilesShowRemainingCountBadge();
console.log('board icon tests passed');
