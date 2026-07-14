const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const elements = {
    'gameover-overlay': { classList: { remove() {}, add() {} } },
    'final-scores': { innerHTML: '' },
    'new-game-btn': {},
};
const context = {
    console,
    document: {
        getElementById(id) {
            return elements[id];
        },
    },
};
vm.createContext(context);

for (const file of ['js/boardGraphSource.js', 'js/gameData.js', 'js/uiManager.js']) {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, file), 'utf8'), context);
}

vm.runInContext('globalThis.UIManager = UIManager;', context);

function testFormatsMoneyWithOnePoundSign() {
    const ui = new context.UIManager();
    assert.equal(ui.formatGameOverMoney(42), '\u00A342');
}

function testFinalScoresContainNoMojibake() {
    const ui = new context.UIManager();
    ui.state = {
        players: [{
            name: 'Ada',
            color: '#c0392b',
            vp: 100,
            income: 12,
            money: 42,
        }],
    };

    ui.showGameOver([]);

    assert.match(elements['final-scores'].innerHTML, />\u00A342</);
    assert.doesNotMatch(elements['final-scores'].innerHTML, /\uFF82\uFF63/);
}

testFormatsMoneyWithOnePoundSign();
testFinalScoresContainNoMojibake();
console.log('game-over currency tests passed');
