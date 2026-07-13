const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function matchesSelector(node, selector) {
    if (selector.startsWith('#')) return node.attrs.id === selector.slice(1);
    if (selector.startsWith('.')) {
        const classes = String(node.attrs.class || node.className || '').split(/\s+/);
        return classes.includes(selector.slice(1));
    }
    const dataMatch = /^\[data-([\w-]+)="([^"]+)"\]$/.exec(selector);
    if (dataMatch) {
        const attrName = `data-${dataMatch[1]}`;
        const datasetName = dataMatch[1].replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
        return node.attrs[attrName] === dataMatch[2] || node.dataset[datasetName] === dataMatch[2];
    }
    return false;
}

function collectNodes(node, predicate, results = []) {
    if (predicate(node)) results.push(node);
    for (const child of node.children || []) collectNodes(child, predicate, results);
    return results;
}

function createFakeElement(tagName, rect = null) {
    return {
        tagName,
        attrs: {},
        children: [],
        className: '',
        dataset: {},
        style: {},
        textContent: '',
        parent: null,
        rect,
        setAttribute(key, value) {
            this.attrs[key] = String(value);
            if (key === 'class') this.className = String(value);
            if (key.startsWith('data-')) {
                const datasetName = key.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
                this.dataset[datasetName] = String(value);
            }
        },
        getAttribute(key) {
            if (key === 'class' && this.className) return this.className;
            return this.attrs[key] ?? null;
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
            return collectNodes(this, node => matchesSelector(node, selector)).filter(node => node !== this);
        },
        getBoundingClientRect() {
            return this.rect || { left: 100, top: 50, width: 40, height: 10 };
        },
        getScreenCTM() {
            return { a: 1.5, b: 0 };
        },
    };
}

const repoRoot = path.resolve(__dirname, '..');
const svg = createFakeElement('svg');
const overlay = createFakeElement('div', { left: 10, top: 5, width: 900, height: 850 });
overlay.attrs.id = 'city-label-overlay';

const context = {
    console,
    document: {
        createElementNS(_namespace, tagName) {
            return createFakeElement(tagName);
        },
        createElement(tagName) {
            return createFakeElement(tagName);
        },
        getElementById(id) {
            return id === 'city-label-overlay' ? overlay : null;
        },
    },
};
vm.createContext(context);

const graphSourcePath = path.join(repoRoot, 'js', 'boardGraphSource.js');
const graphSource = fs.existsSync(graphSourcePath)
    ? fs.readFileSync(graphSourcePath, 'utf8')
    : 'const BOARD_GRAPH_SOURCE = null; function normalizeBoardGraphId(id) { return id; }';
const gameData = fs.readFileSync(path.join(repoRoot, 'js', 'gameData.js'), 'utf8');
const boardRenderer = fs.readFileSync(path.join(repoRoot, 'js', 'boardRenderer.js'), 'utf8');
vm.runInContext(
    `${graphSource}\n${gameData}\n${boardRenderer}\n` +
    'globalThis.BoardRenderer = BoardRenderer; globalThis.CITIES = CITIES;',
    context
);

const renderer = new context.BoardRenderer(svg);
renderer.drawCities();

const anchors = svg.querySelectorAll('.city-label');
const labels = overlay.querySelectorAll('.city-label-html');
assert.equal(labels.length, Object.keys(context.CITIES).length,
    'each visible SVG city should expose one ordinary HTML label');
assert.equal(anchors[0].attrs.opacity, '0', 'the duplicate SVG text should be visually hidden');
assert.equal(anchors[0].attrs['aria-hidden'], 'true', 'the duplicate SVG text should be hidden from accessibility');
assert.equal(anchors[0].attrs.translate, 'no', 'Google Translate should ignore the duplicate SVG text');
assert.equal(labels[0].style.pointerEvents, 'none', 'HTML labels must not intercept board interaction');
assert.equal(labels[0].style.left, '110px', 'HTML labels should center on the rendered SVG anchor');
assert.equal(labels[0].style.top, '50px', 'HTML labels should retain the rendered SVG vertical position');
assert.equal(labels[0].style.fontSize, '15px', 'HTML labels should inherit the rendered SVG scale');
assert.equal(labels[0].style.letterSpacing, '0.75px', 'HTML labels should preserve scaled letter spacing');

const belperLabel = overlay.querySelector('[data-city="belper"]');
assert.ok(belperLabel, 'Belper should have an HTML label');
belperLabel.textContent = 'Translated Belper';

renderer.updateIndustrySlots();

assert.equal(overlay.querySelectorAll('.city-label-html').length, Object.keys(context.CITIES).length,
    'redrawing cities should not duplicate HTML labels');
assert.equal(overlay.querySelector('[data-city="belper"]').textContent, 'Translated Belper',
    'redrawing cities must preserve text mutated by Google Translate');

console.log('city label translation tests passed');
