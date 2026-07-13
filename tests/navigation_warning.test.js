const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const mainJs = fs.readFileSync(path.join(repoRoot, 'js', 'main.js'), 'utf8');

function createFakeElement(id) {
    const listeners = {};
    const classes = new Set();
    const element = {
        id,
        dataset: {},
        style: {},
        value: '',
        placeholder: '',
        innerHTML: '',
        classList: {
            add(...names) {
                names.forEach(name => classes.add(name));
            },
            remove(...names) {
                names.forEach(name => classes.delete(name));
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
        appendChild() {},
    };
    return element;
}

function createFakeDocument() {
    const elements = {
        'setup-screen': createFakeElement('setup-screen'),
        'game-screen': createFakeElement('game-screen'),
        'start-game-btn': createFakeElement('start-game-btn'),
        'game-board': createFakeElement('game-board'),
    };

    return {
        getElementById(id) {
            return elements[id] || null;
        },
        querySelector(selector) {
            if (selector === '.player-name-inputs') {
                return createFakeElement('player-name-inputs');
            }
            return null;
        },
        querySelectorAll(selector) {
            if (selector === '.count-btn' || selector === '.player-name-input input') {
                return [];
            }
            return [];
        },
        addEventListener(type, handler) {
            if (type === 'DOMContentLoaded') {
                this.domContentLoadedHandler = handler;
            }
        },
    };
}

function createFakeWindow() {
    const listeners = {};
    return {
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

function testActiveGamePreventsBrowserNavigation() {
    const document = createFakeDocument();
    const window = createFakeWindow();
    const context = {
        console,
        document,
        window,
        PLAYER_COLORS: ['#111', '#222', '#333', '#444'],
        GameState: class {
            constructor() {
                this.gameOver = false;
            }
        },
        GameLogic: class {},
        BoardRenderer: class {
            render() {}
        },
        UIManager: class {
            init() {}
        },
    };

    vm.createContext(context);
    vm.runInContext(`${mainJs}\nglobalThis.startGame = startGame;`, context);

    const event = {
        type: 'beforeunload',
        preventDefaultCalled: false,
        preventDefault() {
            this.preventDefaultCalled = true;
        },
    };

    context.startGame(2, ['Alice', 'Bob']);
    window.dispatchEvent(event);

    assert.equal(event.preventDefaultCalled, true);
    assert.equal(event.returnValue, '');
}

function testCompletedGameAllowsBrowserNavigation() {
    const document = createFakeDocument();
    const window = createFakeWindow();
    const context = {
        console,
        document,
        window,
        PLAYER_COLORS: ['#111', '#222', '#333', '#444'],
        GameState: class {
            constructor() {
                this.gameOver = false;
            }
        },
        GameLogic: class {},
        BoardRenderer: class {
            render() {}
        },
        UIManager: class {
            init() {}
        },
    };

    vm.createContext(context);
    vm.runInContext(`${mainJs}\nglobalThis.startGame = startGame;`, context);

    const event = {
        type: 'beforeunload',
        preventDefaultCalled: false,
        preventDefault() {
            this.preventDefaultCalled = true;
        },
    };

    context.startGame(2, ['Alice', 'Bob']);
    context.window.gameState.gameOver = true;
    window.dispatchEvent(event);

    assert.equal(event.preventDefaultCalled, false);
    assert.equal(event.returnValue, undefined);
}

testActiveGamePreventsBrowserNavigation();
testCompletedGameAllowsBrowserNavigation();
console.log('navigation warning tests passed');
