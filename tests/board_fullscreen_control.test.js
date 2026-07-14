const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(repoRoot, 'css', 'style.css'), 'utf8');
const uiManager = fs.readFileSync(path.join(repoRoot, 'js', 'uiManager.js'), 'utf8');
const graphSource = fs.readFileSync(path.join(repoRoot, 'js', 'boardGraphSource.js'), 'utf8');
const gameData = fs.readFileSync(path.join(repoRoot, 'js', 'gameData.js'), 'utf8');

function createFakeElement(id) {
    const listeners = {};
    const classes = new Set();
    const element = {
        id,
        attrs: {},
        dataset: {},
        style: {},
        clientWidth: 0,
        clientHeight: 0,
        className: '',
        classList: {
            add(...names) {
                names.forEach(name => classes.add(name));
                element.className = [...classes].join(' ');
            },
            remove(...names) {
                names.forEach(name => classes.delete(name));
                element.className = [...classes].join(' ');
            },
            contains(name) {
                return classes.has(name);
            },
            toggle(name, force) {
                const shouldAdd = force === undefined ? !classes.has(name) : force;
                if (shouldAdd) {
                    classes.add(name);
                } else {
                    classes.delete(name);
                }
                element.className = [...classes].join(' ');
                return shouldAdd;
            },
        },
        addEventListener(type, handler) {
            listeners[type] = listeners[type] || [];
            listeners[type].push(handler);
        },
        dispatchEvent(event) {
            for (const handler of listeners[event.type] || []) {
                handler(event);
            }
        },
        setAttribute(key, value) {
            this.attrs[key] = String(value);
        },
        getAttribute(key) {
            return this.attrs[key] || null;
        },
        getBoundingClientRect() {
            return {
                width: this.clientWidth,
                height: this.clientHeight,
            };
        },
    };
    return element;
}

function createFakeWindow() {
    const listeners = {};
    return {
        innerWidth: 2048,
        innerHeight: 911,
        addEventListener(type, handler) {
            listeners[type] = listeners[type] || [];
            listeners[type].push(handler);
        },
        dispatchEvent(event) {
            for (const handler of listeners[event.type] || []) {
                handler(event);
            }
        },
    };
}

function createFakeDocument() {
    const listeners = {};
    const elements = {
        'board-container': createFakeElement('board-container'),
        'board-fullscreen-toggle': createFakeElement('board-fullscreen-toggle'),
        'game-board': createFakeElement('game-board'),
        'modal-close': createFakeElement('modal-close'),
        'phase-cancel-btn': createFakeElement('phase-cancel-btn'),
    };
    elements['board-container'].clientWidth = 2048;
    elements['board-container'].clientHeight = 911;
    elements['game-board'].setAttribute('preserveAspectRatio', 'xMidYMid meet');
    elements['game-board'].setAttribute('viewBox', '0 0 900 850');

    return {
        elements,
        getElementById(id) {
            return elements[id] || null;
        },
        querySelectorAll() {
            return [];
        },
        addEventListener(type, handler) {
            listeners[type] = listeners[type] || [];
            listeners[type].push(handler);
        },
        dispatchEvent(event) {
            for (const handler of listeners[event.type] || []) {
                handler(event);
            }
        },
    };
}

function parseViewBox(value) {
    const parts = String(value).split(/\s+/).map(Number);
    assert.equal(parts.length, 4, `Expected four-part viewBox, got ${value}`);
    return parts;
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function testBoardHasFullscreenToggleButton() {
    assert.match(indexHtml, /id="board-fullscreen-toggle"/);
    assert.match(indexHtml, /aria-label="Expand map to full screen"/);
    assert.match(indexHtml, /title="Expand map"/);
}

function testFullscreenStylesFillViewportAndKeepControlAboveBoard() {
    assert.match(styles, /#board-container\.board-fullscreen\s*\{/);
    assert.match(styles, /position:\s*fixed/);
    assert.match(styles, /inset:\s*0/);
    assert.match(styles, /z-index:\s*1800/);
    assert.match(styles, /#board-container\.board-fullscreen\s*\{[\s\S]*padding:\s*0\b/);
    assert.match(styles, /#board-container\.board-fullscreen\s+#game-board|#board-container\.board-fullscreen\s+#game-board|#board-container\.board-fullscreen #game-board/);
    assert.match(styles, /#board-fullscreen-toggle\s*\{/);
    assert.match(styles, /bottom:\s*16px/);
    assert.match(styles, /right:\s*16px/);
}

function testUiManagerTogglesFullscreenAndHandlesEscape() {
    assert.match(uiManager, /bindBoardFullscreenToggle\(\)/);
    assert.match(uiManager, /toggleBoardFullscreen/);
    assert.match(uiManager, /board-fullscreen/);
    assert.match(uiManager, /preserveAspectRatio/);
    assert.match(uiManager, /updateBoardFullscreenViewBox/);
    assert.match(uiManager, /aria-label', isFullscreen \? 'Collapse map' : 'Expand map to full screen'/);
    assert.match(uiManager, /e\.key === 'Escape'/);
}

function testUiManagerFullscreenBehavior() {
    const document = createFakeDocument();
    const window = createFakeWindow();
    const context = { console, document, window };
    vm.createContext(context);
    vm.runInContext(`${graphSource}
${gameData}\n${uiManager}\nglobalThis.UIManager = UIManager;`, context);

    const manager = new context.UIManager();
    const rendererCalls = [];
    const redrawCalls = [];
    manager.renderer = {
        setLayoutMode(mode, viewport) {
            rendererCalls.push({ mode, viewport });
        },
        render(state) {
            redrawCalls.push({ method: 'render', state });
        },
        fullUpdate() {},
    };
    manager.bindEvents();

    const container = document.getElementById('board-container');
    const toggle = document.getElementById('board-fullscreen-toggle');
    const board = document.getElementById('game-board');

    toggle.dispatchEvent({ type: 'click' });
    assert.equal(container.classList.contains('board-fullscreen'), true);
    assert.equal(toggle.classList.contains('is-fullscreen'), true);
    assert.equal(board.getAttribute('preserveAspectRatio'), 'xMidYMid meet');
    const fullscreenViewBox = parseViewBox(board.getAttribute('viewBox'));
    assert.deepEqual(fullscreenViewBox, [0, 0, 2048, 911]);
    assert.deepEqual(plain(rendererCalls.at(-1)), { mode: 'fullscreen', viewport: { width: 2048, height: 911 } });
    assert.equal(redrawCalls.at(-1).method, 'render');
    assert.equal(toggle.getAttribute('aria-label'), 'Collapse map');
    assert.equal(toggle.getAttribute('title'), 'Collapse map');

    container.clientWidth = 1200;
    container.clientHeight = 1200;
    window.dispatchEvent({ type: 'resize' });
    const squareViewBox = parseViewBox(board.getAttribute('viewBox'));
    assert.deepEqual(squareViewBox, [0, 0, 1200, 1200]);
    assert.deepEqual(plain(rendererCalls.at(-1)), { mode: 'fullscreen', viewport: { width: 1200, height: 1200 } });
    assert.equal(redrawCalls.at(-1).method, 'render');

    toggle.dispatchEvent({ type: 'click' });
    assert.equal(container.classList.contains('board-fullscreen'), false);
    assert.equal(board.getAttribute('preserveAspectRatio'), 'xMidYMid meet');
    assert.equal(board.getAttribute('viewBox'), '0 0 900 850');
    assert.deepEqual(plain(rendererCalls.at(-1)), { mode: 'normal', viewport: null });
    assert.equal(redrawCalls.at(-1).method, 'render');
    assert.equal(toggle.getAttribute('aria-label'), 'Expand map to full screen');

    toggle.dispatchEvent({ type: 'click' });
    document.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert.equal(container.classList.contains('board-fullscreen'), false);
    assert.equal(board.getAttribute('preserveAspectRatio'), 'xMidYMid meet');
    assert.equal(board.getAttribute('viewBox'), '0 0 900 850');
    assert.deepEqual(plain(rendererCalls.at(-1)), { mode: 'normal', viewport: null });
}

testBoardHasFullscreenToggleButton();
testFullscreenStylesFillViewportAndKeepControlAboveBoard();
testUiManagerTogglesFullscreenAndHandlesEscape();
testUiManagerFullscreenBehavior();
console.log('board fullscreen control tests passed');
