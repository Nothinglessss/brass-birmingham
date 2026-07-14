const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);

for (const file of [
    'js/boardGraphSource.js',
    'js/gameData.js',
    'js/gameState.js',
    'js/resourcePlanner.js',
    'js/gameLogic.js',
    'js/uiManager.js',
]) {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, file), 'utf8'), context);
}

vm.runInContext(
    `globalThis.GameState = GameState;
     globalThis.GameLogic = GameLogic;
     globalThis.UIManager = UIManager;
     globalThis.INDUSTRY_TYPES = INDUSTRY_TYPES;
     globalThis.CARD_TYPES = CARD_TYPES;
     globalThis.ACTIONS = ACTIONS;
     globalThis.getIndustryCardTypes = getIndustryCardTypes;`,
    context
);

function normalized(value) {
    return JSON.parse(JSON.stringify(value));
}

function completeDeck(numPlayers) {
    const names = Array.from({ length: numPlayers }, (_, index) => `Player ${index + 1}`);
    const game = new context.GameState(numPlayers, names);
    return game.drawDeck.concat(...game.players.map(player => player.hand));
}

function dualCards(deck) {
    return deck.filter(card => {
        const types = context.getIndustryCardTypes(card);
        return types.includes(context.INDUSTRY_TYPES.COTTON_MILL) &&
            types.includes(context.INDUSTRY_TYPES.MANUFACTURER);
    });
}

function testDeckUsesOfficialDualCardCounts() {
    const expectations = [
        { players: 2, total: 40, dual: 0 },
        { players: 3, total: 54, dual: 6 },
        { players: 4, total: 64, dual: 8 },
    ];

    for (const expected of expectations) {
        const deck = completeDeck(expected.players);
        assert.equal(deck.length, expected.total, `${expected.players}-player deck total`);
        assert.equal(dualCards(deck).length, expected.dual, `${expected.players}-player dual cards`);
    }
}

function testDualCardBuildsEitherPrintedIndustry() {
    const game = new context.GameState(3, ['Ada', 'Ben', 'Cy']);
    const logic = new context.GameLogic(game);
    game.players[0].hand = [{
        type: context.CARD_TYPES.INDUSTRY,
        industryTypes: [
            context.INDUSTRY_TYPES.COTTON_MILL,
            context.INDUSTRY_TYPES.MANUFACTURER,
        ],
        name: 'Cotton Mill / Manufacturer',
    }];

    const validFor = industryType => Array.from(logic.getValidCardsForAction(
        0,
        context.ACTIONS.BUILD,
        { cityId: 'birmingham', slotIndex: 0, industryType }
    ));

    assert.deepEqual(validFor(context.INDUSTRY_TYPES.COTTON_MILL), [0]);
    assert.deepEqual(validFor(context.INDUSTRY_TYPES.MANUFACTURER), [0]);
    assert.deepEqual(validFor(context.INDUSTRY_TYPES.IRON_WORKS), []);
}

function testDualCardViewModelShowsBothIndustries() {
    const ui = new context.UIManager();
    const card = {
        type: context.CARD_TYPES.INDUSTRY,
        industryTypes: [
            context.INDUSTRY_TYPES.COTTON_MILL,
            context.INDUSTRY_TYPES.MANUFACTURER,
        ],
    };

    const view = normalized(ui.getIndustryCardViewModel(card));
    assert.equal(view.name, 'Cotton Mill / Manufacturer');
    assert.equal(view.icons.length, 2);
    assert.ok(view.icons.every(icon => icon.includes('<svg')));
}

testDeckUsesOfficialDualCardCounts();
testDualCardBuildsEitherPrintedIndustry();
testDualCardViewModelShowsBothIndustries();
console.log('dual industry card tests passed');
