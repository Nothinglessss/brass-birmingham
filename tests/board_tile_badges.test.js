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

const gameData = fs.readFileSync(path.join(repoRoot, 'js', 'gameData.js'), 'utf8');
const boardRenderer = fs.readFileSync(path.join(repoRoot, 'js', 'boardRenderer.js'), 'utf8');
vm.runInContext(`${gameData}\n${boardRenderer}\nglobalThis.BoardRenderer = BoardRenderer; globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES;`, context);

function createRenderer() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.state = {
        players: [
            { color: '#c0392b' },
            { color: '#f39c12' },
        ],
    };
    return renderer;
}

function testBuiltAndFlippedTilesUsePlayerColorShades() {
    const renderer = createRenderer();
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

    renderer.drawBuiltIndustryTile(renderer.svg, 0, 0, {
        playerId: 1,
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
    assert.equal(countBadges[0].attrs.cx, '17');
    assert.equal(countBadges[0].attrs.cy, '17');

    const countTexts = collectNodes(renderer.svg, node => node.tagName === 'text' && String(node.textContent) === '3');
    assert.equal(countTexts.length, 1);
    assert.equal(countTexts[0].attrs['text-anchor'], 'middle');
    assert.equal(countTexts[0].attrs.fill, '#1a1510');
}

testBuiltAndFlippedTilesUsePlayerColorShades();
testUnflippedResourceTilesShowRemainingCountBadge();
console.log('board tile badge tests passed');
