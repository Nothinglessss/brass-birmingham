const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const appendedPanels = [];
const playerPanels = {
    innerHTML: '',
    appendChild(panel) {
        appendedPanels.push(panel);
    },
};

const context = {
    console,
    INDUSTRY_TYPES: {
        COTTON_MILL: 'cotton',
        COAL_MINE: 'coal',
        IRON_WORKS: 'iron',
        MANUFACTURER: 'manufacturer',
        POTTERY: 'pottery',
        BREWERY: 'brewery',
    },
    ERA: { CANAL: 'canal' },
    document: {
        getElementById(id) {
            assert.equal(id, 'player-panels');
            return playerPanels;
        },
        createElement(tagName) {
            assert.equal(tagName, 'div');
            return { className: '', style: {}, innerHTML: '' };
        },
    },
};
vm.createContext(context);

const uiManagerSource = fs.readFileSync(path.join(repoRoot, 'js', 'uiManager.js'), 'utf8');
vm.runInContext(`${uiManagerSource}\nglobalThis.UIManager = UIManager;`, context);

function renderPlayerPanel(moneySpentThisRound) {
    appendedPanels.length = 0;
    const manager = Object.create(context.UIManager.prototype);
    manager.state = {
        currentPlayerId: 0,
        era: 'canal',
        moneySpentThisRound,
        players: [{
            id: 0,
            name: 'Ada',
            color: '#c0392b',
            vp: 0,
            money: 83,
            income: 10,
            hand: new Array(8),
            linksRemaining: { canal: 14, rail: 14 },
        }],
    };

    manager.updatePlayerPanels();
    assert.equal(appendedPanels.length, 1);
    return appendedPanels[0].innerHTML;
}

function testCurrentRoundSpendAppearsAfterMoney() {
    const html = renderPlayerPanel({ 0: 17 });

    assert.match(html, /class="player-panel-stat player-panel-spent"/);
    assert.match(html, /title="Money spent this round">£17 spent<\/span>/);

    const moneyIndex = html.indexOf('title="Money"');
    const spentIndex = html.indexOf('title="Money spent this round"');
    const incomeIndex = html.indexOf('title="Income"');
    assert.ok(moneyIndex < spentIndex, 'spend pill should follow current money');
    assert.ok(spentIndex < incomeIndex, 'spend pill should precede income');
}

function testMissingSpendDefaultsToZero() {
    const html = renderPlayerPanel({});
    assert.match(html, /title="Money spent this round">£0 spent<\/span>/);
}

function testSidebarSupportsFivePillsOnOneRow() {
    const css = fs.readFileSync(path.join(repoRoot, 'css', 'style.css'), 'utf8');

    assert.match(css, /#right-panel\s*{[^}]*width:\s*300px;/s);
    assert.match(css, /\.player-panel-stats\s*{[^}]*flex-wrap:\s*nowrap;/s);
    assert.match(css, /\.player-panel-stat\s*{[^}]*white-space:\s*nowrap;/s);
}

testCurrentRoundSpendAppearsAfterMoney();
testMissingSpendDefaultsToZero();
testSidebarSupportsFivePillsOnOneRow();
console.log('player spend UI tests passed');
