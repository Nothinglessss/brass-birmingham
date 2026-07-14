// ============================================================================
// Brass: Birmingham - Complete Game Data
// ============================================================================

const INDUSTRY_TYPES = {
    COTTON_MILL: 'cottonMill',
    COAL_MINE: 'coalMine',
    IRON_WORKS: 'ironWorks',
    MANUFACTURER: 'manufacturer',
    POTTERY: 'pottery',
    BREWERY: 'brewery'
};

const RESOURCE_TYPES = {
    COAL: 'coal',
    IRON: 'iron',
    BEER: 'beer'
};

const ERA = {
    CANAL: 'canal',
    RAIL: 'rail'
};

const ACTIONS = {
    BUILD: 'build',
    NETWORK: 'network',
    DEVELOP: 'develop',
    SELL: 'sell',
    LOAN: 'loan',
    SCOUT: 'scout',
    PASS: 'pass'
};

const CARD_TYPES = {
    LOCATION: 'location',
    INDUSTRY: 'industry',
    WILD_LOCATION: 'wildLocation',
    WILD_INDUSTRY: 'wildIndustry'
};

// Player colors matching the physical game
const PLAYER_COLORS = ['#c0392b', '#f39c12', '#8e44ad', '#d9d0c2'];
const PLAYER_NAMES = ['Red', 'Yellow', 'Purple', 'White'];
const PLAYER_BG_COLORS = ['#922b21', '#b7770d', '#6c3483', '#b8b0a2'];

// ============================================================================
// Industry Tile Data (from TTS Brass Birmingham implementation)
// ============================================================================
// Each tile: { type, level, count, canalEra, railEra, cost, costCoal, costIron,
//              beersToSell, vp, income, linkVP, canDevelop, resourceCubes }

const INDUSTRY_DATA = {
    [INDUSTRY_TYPES.BREWERY]: [
        { level: 1, count: 2, canalEra: true,  railEra: false, cost: 5,  costCoal: 0, costIron: 1, beersToSell: null, vp: 4,  income: 4, linkVP: 2, canDevelop: true,  resourceCubes: 1 },
        { level: 2, count: 2, canalEra: true,  railEra: true,  cost: 7,  costCoal: 0, costIron: 1, beersToSell: null, vp: 5,  income: 5, linkVP: 2, canDevelop: true,  resourceCubes: 1 },
        { level: 3, count: 2, canalEra: true,  railEra: true,  cost: 9,  costCoal: 0, costIron: 1, beersToSell: null, vp: 7,  income: 5, linkVP: 2, canDevelop: true,  resourceCubes: 1 },
        { level: 4, count: 1, canalEra: false, railEra: true,  cost: 9,  costCoal: 0, costIron: 1, beersToSell: null, vp: 10, income: 5, linkVP: 2, canDevelop: true,  resourceCubes: 2 },
    ],
    [INDUSTRY_TYPES.COAL_MINE]: [
        { level: 1, count: 1, canalEra: true,  railEra: false, cost: 5,  costCoal: 0, costIron: 0, beersToSell: null, vp: 1,  income: 4, linkVP: 2, canDevelop: true,  resourceCubes: 2 },
        { level: 2, count: 2, canalEra: true,  railEra: true,  cost: 7,  costCoal: 0, costIron: 0, beersToSell: null, vp: 2,  income: 7, linkVP: 1, canDevelop: true,  resourceCubes: 3 },
        { level: 3, count: 2, canalEra: true,  railEra: true,  cost: 8,  costCoal: 0, costIron: 1, beersToSell: null, vp: 3,  income: 6, linkVP: 1, canDevelop: true,  resourceCubes: 4 },
        { level: 4, count: 2, canalEra: true,  railEra: true,  cost: 10, costCoal: 0, costIron: 1, beersToSell: null, vp: 4,  income: 5, linkVP: 1, canDevelop: true,  resourceCubes: 5 },
    ],
    [INDUSTRY_TYPES.COTTON_MILL]: [
        { level: 1, count: 3, canalEra: true,  railEra: false, cost: 12, costCoal: 0, costIron: 0, beersToSell: 1, vp: 5,  income: 5, linkVP: 1, canDevelop: true,  resourceCubes: 0 },
        { level: 2, count: 2, canalEra: true,  railEra: true,  cost: 14, costCoal: 1, costIron: 0, beersToSell: 1, vp: 5,  income: 4, linkVP: 2, canDevelop: true,  resourceCubes: 0 },
        { level: 3, count: 3, canalEra: true,  railEra: true,  cost: 16, costCoal: 1, costIron: 1, beersToSell: 1, vp: 9,  income: 3, linkVP: 1, canDevelop: true,  resourceCubes: 0 },
        { level: 4, count: 3, canalEra: true,  railEra: true,  cost: 18, costCoal: 1, costIron: 1, beersToSell: 1, vp: 12, income: 2, linkVP: 1, canDevelop: true,  resourceCubes: 0 },
    ],
    [INDUSTRY_TYPES.IRON_WORKS]: [
        { level: 1, count: 1, canalEra: true,  railEra: false, cost: 5,  costCoal: 1, costIron: 0, beersToSell: null, vp: 3,  income: 3, linkVP: 1, canDevelop: true,  resourceCubes: 4 },
        { level: 2, count: 1, canalEra: true,  railEra: true,  cost: 7,  costCoal: 1, costIron: 0, beersToSell: null, vp: 5,  income: 3, linkVP: 1, canDevelop: true,  resourceCubes: 4 },
        { level: 3, count: 1, canalEra: true,  railEra: true,  cost: 9,  costCoal: 1, costIron: 0, beersToSell: null, vp: 7,  income: 2, linkVP: 1, canDevelop: true,  resourceCubes: 5 },
        { level: 4, count: 1, canalEra: true,  railEra: true,  cost: 12, costCoal: 1, costIron: 0, beersToSell: null, vp: 9,  income: 1, linkVP: 1, canDevelop: true,  resourceCubes: 6 },
    ],
    [INDUSTRY_TYPES.MANUFACTURER]: [
        { level: 1, count: 1, canalEra: true,  railEra: false, cost: 8,  costCoal: 1, costIron: 0, beersToSell: 1, vp: 3,  income: 5, linkVP: 2, canDevelop: true,  resourceCubes: 0 },
        { level: 2, count: 2, canalEra: true,  railEra: true,  cost: 10, costCoal: 0, costIron: 1, beersToSell: 1, vp: 5,  income: 1, linkVP: 1, canDevelop: true,  resourceCubes: 0 },
        { level: 3, count: 1, canalEra: true,  railEra: true,  cost: 12, costCoal: 2, costIron: 0, beersToSell: 0, vp: 4,  income: 4, linkVP: 0, canDevelop: true,  resourceCubes: 0 },
        { level: 4, count: 1, canalEra: true,  railEra: true,  cost: 8,  costCoal: 0, costIron: 1, beersToSell: 1, vp: 3,  income: 6, linkVP: 1, canDevelop: true,  resourceCubes: 0 },
        { level: 5, count: 2, canalEra: true,  railEra: true,  cost: 16, costCoal: 1, costIron: 0, beersToSell: 2, vp: 8,  income: 2, linkVP: 2, canDevelop: true,  resourceCubes: 0 },
        { level: 6, count: 1, canalEra: true,  railEra: true,  cost: 20, costCoal: 0, costIron: 0, beersToSell: 1, vp: 7,  income: 6, linkVP: 1, canDevelop: true,  resourceCubes: 0 },
        { level: 7, count: 1, canalEra: true,  railEra: true,  cost: 16, costCoal: 1, costIron: 1, beersToSell: 0, vp: 9,  income: 4, linkVP: 0, canDevelop: true,  resourceCubes: 0 },
        { level: 8, count: 2, canalEra: true,  railEra: true,  cost: 20, costCoal: 0, costIron: 2, beersToSell: 1, vp: 11, income: 1, linkVP: 1, canDevelop: true,  resourceCubes: 0 },
    ],
    [INDUSTRY_TYPES.POTTERY]: [
        { level: 1, count: 1, canalEra: true,  railEra: true,  cost: 17, costCoal: 0, costIron: 1, beersToSell: 1, vp: 10, income: 5, linkVP: 1, canDevelop: false, resourceCubes: 0 },
        { level: 2, count: 1, canalEra: true,  railEra: true,  cost: 0,  costCoal: 1, costIron: 0, beersToSell: 1, vp: 1,  income: 1, linkVP: 1, canDevelop: true,  resourceCubes: 0 },
        { level: 3, count: 1, canalEra: true,  railEra: true,  cost: 22, costCoal: 2, costIron: 0, beersToSell: 2, vp: 11, income: 5, linkVP: 1, canDevelop: false, resourceCubes: 0 },
        { level: 4, count: 1, canalEra: true,  railEra: true,  cost: 0,  costCoal: 1, costIron: 0, beersToSell: 1, vp: 1,  income: 1, linkVP: 1, canDevelop: true,  resourceCubes: 0 },
        { level: 5, count: 1, canalEra: false, railEra: true,  cost: 24, costCoal: 2, costIron: 0, beersToSell: 2, vp: 20, income: 5, linkVP: 1, canDevelop: true,  resourceCubes: 0 },
    ],
};

// Helper: is this a resource industry (flips when depleted)?
function isResourceIndustry(type) {
    return type === INDUSTRY_TYPES.COAL_MINE ||
           type === INDUSTRY_TYPES.IRON_WORKS ||
           type === INDUSTRY_TYPES.BREWERY;
}

// Helper: is this a sellable industry (flips when sold)?
function isSellableIndustry(type) {
    return type === INDUSTRY_TYPES.COTTON_MILL ||
           type === INDUSTRY_TYPES.MANUFACTURER ||
           type === INDUSTRY_TYPES.POTTERY;
}

// Industry type display info
const INDUSTRY_DISPLAY = {
    [INDUSTRY_TYPES.COTTON_MILL]:  { name: 'Cotton Mill',  icon: '🏭', color: '#e8d5b7', shortName: 'Cotton' },
    [INDUSTRY_TYPES.COAL_MINE]:    { name: 'Coal Mine',    icon: '⛏️', color: '#4a4a4a', shortName: 'Coal' },
    [INDUSTRY_TYPES.IRON_WORKS]:   { name: 'Iron Works',   icon: '🔩', color: '#d4760a', shortName: 'Iron' },
    [INDUSTRY_TYPES.MANUFACTURER]: { name: 'Manufacturer',  icon: '📦', color: '#8b6914', shortName: 'Goods' },
    [INDUSTRY_TYPES.POTTERY]:      { name: 'Pottery',      icon: '🏺', color: '#c0392b', shortName: 'Pottery' },
    [INDUSTRY_TYPES.BREWERY]:      { name: 'Brewery',      icon: '🍺', color: '#d4a017', shortName: 'Beer' },
};

// ============================================================================
// City Data - All cities on the Birmingham board
// ============================================================================
// Each city has: name, region color, industry slots, and position for rendering
// Industry slots: array of arrays (each sub-array = allowed industry types for that slot)

const CITIES = {
    belper: {
        name: 'Belper',
        region: 'derbyshire',  // teal
        slots: [
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.MANUFACTURER],
            [INDUSTRY_TYPES.COAL_MINE],
            [INDUSTRY_TYPES.POTTERY],
        ],
        x: 725, y: 55
    },
    derby: {
        name: 'Derby',
        region: 'derbyshire',
        slots: [
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.BREWERY],
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.MANUFACTURER],
            [INDUSTRY_TYPES.IRON_WORKS],
        ],
        x: 745, y: 160
    },
    leek: {
        name: 'Leek',
        region: 'staffordshire',  // blue
        slots: [
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.MANUFACTURER],
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.COAL_MINE],
        ],
        x: 440, y: 45
    },
    stokeOnTrent: {
        name: 'Stoke-on-Trent',
        region: 'staffordshire',
        slots: [
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.MANUFACTURER],
            [INDUSTRY_TYPES.POTTERY, INDUSTRY_TYPES.IRON_WORKS],
            [INDUSTRY_TYPES.MANUFACTURER],
        ],
        x: 310, y: 110
    },
    stone: {
        name: 'Stone',
        region: 'staffordshire',
        slots: [
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.BREWERY],
            [INDUSTRY_TYPES.MANUFACTURER, INDUSTRY_TYPES.COAL_MINE],
        ],
        x: 195, y: 185
    },
    uttoxeter: {
        name: 'Uttoxeter',
        region: 'staffordshire',
        slots: [
            [INDUSTRY_TYPES.MANUFACTURER, INDUSTRY_TYPES.BREWERY],
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.BREWERY],
        ],
        x: 475, y: 160
    },
    stafford: {
        name: 'Stafford',
        region: 'midlands',  // red/maroon
        slots: [
            [INDUSTRY_TYPES.MANUFACTURER, INDUSTRY_TYPES.BREWERY],
            [INDUSTRY_TYPES.POTTERY],
        ],
        x: 260, y: 270
    },
    burtonOnTrent: {
        name: 'Burton-on-Trent',
        region: 'midlands',
        slots: [
            [INDUSTRY_TYPES.MANUFACTURER, INDUSTRY_TYPES.COAL_MINE],
            [INDUSTRY_TYPES.BREWERY],
        ],
        x: 620, y: 280
    },
    cannock: {
        name: 'Cannock',
        region: 'midlands',
        slots: [
            [INDUSTRY_TYPES.MANUFACTURER, INDUSTRY_TYPES.COAL_MINE],
            [INDUSTRY_TYPES.COAL_MINE],
        ],
        x: 350, y: 355
    },
    tamworth: {
        name: 'Tamworth',
        region: 'midlands',
        slots: [
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.COAL_MINE],
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.COAL_MINE],
        ],
        x: 635, y: 380
    },
    walsall: {
        name: 'Walsall',
        region: 'midlands',
        slots: [
            [INDUSTRY_TYPES.IRON_WORKS, INDUSTRY_TYPES.MANUFACTURER],
            [INDUSTRY_TYPES.MANUFACTURER, INDUSTRY_TYPES.BREWERY],
        ],
        x: 430, y: 430
    },
    wolverhampton: {
        name: 'Wolverhampton',
        region: 'blackCountry',  // brown/amber
        slots: [
            [INDUSTRY_TYPES.MANUFACTURER],
            [INDUSTRY_TYPES.MANUFACTURER, INDUSTRY_TYPES.COAL_MINE],
        ],
        x: 255, y: 425
    },
    coalbrookdale: {
        name: 'Coalbrookdale',
        region: 'blackCountry',
        slots: [
            [INDUSTRY_TYPES.IRON_WORKS, INDUSTRY_TYPES.BREWERY],
            [INDUSTRY_TYPES.IRON_WORKS],
            [INDUSTRY_TYPES.COAL_MINE],
        ],
        x: 110, y: 455
    },
    dudley: {
        name: 'Dudley',
        region: 'blackCountry',
        slots: [
            [INDUSTRY_TYPES.COAL_MINE],
            [INDUSTRY_TYPES.IRON_WORKS],
        ],
        x: 295, y: 510
    },
    kidderminster: {
        name: 'Kidderminster',
        region: 'blackCountry',
        slots: [
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.COAL_MINE],
            [INDUSTRY_TYPES.COTTON_MILL],
        ],
        x: 195, y: 600
    },
    worcester: {
        name: 'Worcester',
        region: 'blackCountry',
        slots: [
            [INDUSTRY_TYPES.COTTON_MILL],
            [INDUSTRY_TYPES.COTTON_MILL],
        ],
        x: 210, y: 720
    },
    birmingham: {
        name: 'Birmingham',
        region: 'birmingham',  // purple
        slots: [
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.MANUFACTURER],
            [INDUSTRY_TYPES.MANUFACTURER],
            [INDUSTRY_TYPES.IRON_WORKS],
            [INDUSTRY_TYPES.MANUFACTURER],
        ],
        x: 530, y: 535
    },
    coventry: {
        name: 'Coventry',
        region: 'birmingham',
        slots: [
            [INDUSTRY_TYPES.POTTERY],
            [INDUSTRY_TYPES.MANUFACTURER, INDUSTRY_TYPES.COAL_MINE],
            [INDUSTRY_TYPES.IRON_WORKS, INDUSTRY_TYPES.MANUFACTURER],
        ],
        x: 750, y: 565
    },
    nuneaton: {
        name: 'Nuneaton',
        region: 'birmingham',
        slots: [
            [INDUSTRY_TYPES.MANUFACTURER, INDUSTRY_TYPES.BREWERY],
            [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.COAL_MINE],
        ],
        x: 710, y: 460
    },
    redditch: {
        name: 'Redditch',
        region: 'birmingham',
        slots: [
            [INDUSTRY_TYPES.MANUFACTURER, INDUSTRY_TYPES.COAL_MINE],
            [INDUSTRY_TYPES.IRON_WORKS],
        ],
        x: 490, y: 640
    },
};

// Region display colors (background tints for cities)
const REGION_COLORS = {
    derbyshire:   { fill: '#537c80', border: '#3d5c5f' },
    staffordshire:{ fill: '#1e5aa0', border: '#174580' },
    midlands:     { fill: '#8c4e51', border: '#6d3d3f' },
    blackCountry: { fill: '#986627', border: '#7a521f' },
    birmingham:   { fill: '#564a5e', border: '#443b4b' },
};

// ============================================================================
// Brewery Farm locations (standalone brewery spots not in cities)
// ============================================================================
const BREWERY_FARMS = {
    northern: { // Between Cannock and Walsall
        name: 'Brewery (N)',
        x: 275, y: 360,
    },
    southern: { // Between Kidderminster and Worcester
        name: 'Brewery (S)',
        x: 175, y: 660,
    }
};

// ============================================================================
// Merchant (external) locations
// ============================================================================
const MERCHANTS = {
    shrewsbury: {
        name: 'Shrewsbury',
        slots: 1,
        minPlayers: 2,
        bonusType: 'vp',
        bonusAmount: 4,
        x: 25, y: 360,
    },
    gloucester: {
        name: 'Gloucester',
        slots: 2,
        minPlayers: 2,
        bonusType: 'develop',
        bonusAmount: 1,
        x: 360, y: 790,
    },
    oxford: {
        name: 'Oxford',
        slots: 2,
        minPlayers: 2,
        bonusType: 'income',
        bonusAmount: 2,
        x: 610, y: 740,
    },
    warrington: {
        name: 'Warrington',
        slots: 2,
        minPlayers: 3,
        networkMinPlayers: 2,
        bonusType: 'money',
        bonusAmount: 5,
        x: 180, y: 80,
    },
    nottingham: {
        name: 'Nottingham',
        slots: 2,
        minPlayers: 4,
        bonusType: 'vp',
        bonusAmount: 3,
        x: 835, y: 95,
    },
};

// Merchant tiles that get placed: what goods each merchant tile buys.
// null = no goods demand icons; otherwise specific type
const MERCHANT_TILES = {
    2: [
        { buys: null },
        { buys: INDUSTRY_TYPES.MANUFACTURER },
        { buys: INDUSTRY_TYPES.COTTON_MILL },
        { buys: INDUSTRY_TYPES.COTTON_MILL },
        { buys: INDUSTRY_TYPES.MANUFACTURER },
    ],
    3: [
        { buys: INDUSTRY_TYPES.POTTERY },
        { buys: null },
    ],
    4: [
        { buys: INDUSTRY_TYPES.COTTON_MILL },
        { buys: INDUSTRY_TYPES.MANUFACTURER },
    ],
};

// ============================================================================
// Network Connections (Links)
// ============================================================================
// The JSON graph uses official/rulebook IDs. Keep app-facing IDs stable for
// save keys, CSS/data attributes, and existing game terminology.
const BOARD_GRAPH_ID_ALIASES = {
    burtonUponTrent: 'burtonOnTrent',
    farmBreweryNorth: 'northern',
    farmBrewerySouth: 'southern',
};

const BOARD_GRAPH_EDGE_ID_OVERRIDES = {
    oxford__redditch: 'redditch-oxford',
    kidderminster__worcester__farmBrewerySouth: 'kidderminster-worcester',
};

const CONNECTION_LAYOUT_OVERRIDES = {};

function normalizeBoardGraphId(id) {
    return BOARD_GRAPH_ID_ALIASES[id] || id;
}

function getBoardGraphNode(locationId) {
    return BOARD_GRAPH_SOURCE.nodes.find(node => normalizeBoardGraphId(node.id) === locationId) || null;
}

function includesPlayerCount(counts, numPlayers) {
    return Array.isArray(counts) && counts.includes(numPlayers);
}

function getBoardGraphConnectionId(edge, endpoints) {
    return BOARD_GRAPH_EDGE_ID_OVERRIDES[edge.id] || endpoints.join('-');
}

function deriveConnectionFromBoardGraphEdge(edge) {
    const endpoints = edge.endpoints.map(normalizeBoardGraphId);
    const breweryEndpoints = endpoints.filter(isBreweryFarm);
    const isHyperedge = edge.edge_type === 'link_space_hyperedge';
    const networkEndpoints = isHyperedge
        ? endpoints.filter(endpoint => !isBreweryFarm(endpoint))
        : endpoints;
    const id = getBoardGraphConnectionId(edge, endpoints);
    const connection = {
        id,
        cities: networkEndpoints,
        canal: edge.modes.includes('canal'),
        rail: edge.modes.includes('rail'),
    };

    if (isHyperedge && breweryEndpoints.length > 0) {
        connection.viaBrewery = breweryEndpoints[0];
    }

    return {
        ...connection,
        ...(CONNECTION_LAYOUT_OVERRIDES[id] || {}),
    };
}

function deriveConnectionsFromBoardGraph(graph) {
    return graph.edges.map(deriveConnectionFromBoardGraphEdge);
}

const CONNECTIONS = deriveConnectionsFromBoardGraph(BOARD_GRAPH_SOURCE);

// ============================================================================
// Card Deck Composition (by player count)
// ============================================================================
// Location cards + Industry cards

const CARD_DECK = {
    // 2-player location cards
    2: {
        locations: {
            stafford: 2, burtonOnTrent: 2, cannock: 2, tamworth: 1,
            walsall: 1, coalbrookdale: 3, dudley: 2, kidderminster: 2,
            wolverhampton: 2, worcester: 2, birmingham: 3, coventry: 3,
            nuneaton: 1, redditch: 1,
        },
        industries: {
            [INDUSTRY_TYPES.IRON_WORKS]: 4,
            [INDUSTRY_TYPES.COAL_MINE]: 2,
            [INDUSTRY_TYPES.POTTERY]: 2,
            [INDUSTRY_TYPES.BREWERY]: 5,
        }
    },
    // 3-player adds these location cards
    3: {
        locations: {
            leek: 2, stokeOnTrent: 3, stone: 2, uttoxeter: 1,
            stafford: 2, burtonOnTrent: 2, cannock: 2, tamworth: 1,
            walsall: 1, coalbrookdale: 3, dudley: 2, kidderminster: 2,
            wolverhampton: 2, worcester: 2, birmingham: 3, coventry: 3,
            nuneaton: 1, redditch: 1,
        },
        industries: {
            [INDUSTRY_TYPES.IRON_WORKS]: 4,
            [INDUSTRY_TYPES.COAL_MINE]: 2,
            [INDUSTRY_TYPES.COTTON_MILL]: 3, // cotton/mfg combined = 6, split
            [INDUSTRY_TYPES.MANUFACTURER]: 3,
            [INDUSTRY_TYPES.POTTERY]: 2,
            [INDUSTRY_TYPES.BREWERY]: 5,
        }
    },
    // 4-player has full deck
    4: {
        locations: {
            belper: 2, derby: 3, leek: 2, stokeOnTrent: 3, stone: 2,
            uttoxeter: 2, stafford: 2, burtonOnTrent: 2, cannock: 2,
            tamworth: 1, walsall: 1, coalbrookdale: 3, dudley: 2,
            kidderminster: 2, wolverhampton: 2, worcester: 2,
            birmingham: 3, coventry: 3, nuneaton: 1, redditch: 1,
        },
        industries: {
            [INDUSTRY_TYPES.IRON_WORKS]: 4,
            [INDUSTRY_TYPES.COAL_MINE]: 3,
            [INDUSTRY_TYPES.COTTON_MILL]: 4, // cotton/mfg combined = 8, split
            [INDUSTRY_TYPES.MANUFACTURER]: 4,
            [INDUSTRY_TYPES.POTTERY]: 3,
            [INDUSTRY_TYPES.BREWERY]: 5,
        }
    }
};

// ============================================================================
// Coal and Iron Market
// ============================================================================
// Coal Market: 14 spaces, prices from cheapest to most expensive
// Initially 13 cubes (first space empty)
const COAL_MARKET_PRICES = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 8];
const COAL_MARKET_INITIAL = 13; // cubes at start (spaces 1-13 filled, space 0 empty)

// Iron Market: 10 spaces
// Initially 8 cubes (first 2 spaces empty)
const IRON_MARKET_PRICES = [1, 1, 2, 2, 3, 3, 4, 5, 6, 6];
const IRON_MARKET_INITIAL = 8; // cubes at start (spaces 2-9 filled, spaces 0-1 empty)

// ============================================================================
// Income Track
// ============================================================================
// Income ranges from -10 to 30
// -10 to 0: 1 track space per level
// 1 to 10: 2 track spaces per level
// 11 to 20: 3 track spaces per level
// 21 to 30: 4 track spaces per level
// Total track spaces: 11 + 20 + 30 + 40 = 101

// Starting money varies by player count per official Brass: Birmingham rules
const INITIAL_MONEY_BY_PLAYERS = { 2: 17, 3: 14, 4: 10 };
const INITIAL_MONEY = 17; // fallback (2-player default)
const INITIAL_INCOME = 0;
const LOAN_AMOUNT = 30;
const LOAN_INCOME_PENALTY = 3;
const MAX_INCOME = 30;
const MIN_INCOME = -10;

const INCOME_TRACK_LEVELS = [];
for (let level = MIN_INCOME; level <= 0; level++) {
    INCOME_TRACK_LEVELS.push(level);
}
for (let level = 1; level <= 10; level++) {
    INCOME_TRACK_LEVELS.push(level, level);
}
for (let level = 11; level <= 20; level++) {
    INCOME_TRACK_LEVELS.push(level, level, level);
}
for (let level = 21; level <= MAX_INCOME; level++) {
    INCOME_TRACK_LEVELS.push(level, level, level, level);
}

function lowestTrackPositionForIncomeLevel(incomeLevel) {
    const idx = INCOME_TRACK_LEVELS.indexOf(incomeLevel);
    if (idx >= 0) return idx;
    return incomeLevel <= MIN_INCOME ? 0 : INCOME_TRACK_LEVELS.length - 1;
}

function highestTrackPositionForIncomeLevel(incomeLevel) {
    const idx = INCOME_TRACK_LEVELS.lastIndexOf(incomeLevel);
    if (idx >= 0) return idx;
    return incomeLevel <= MIN_INCOME ? 0 : INCOME_TRACK_LEVELS.length - 1;
}

function incomeLevelFromTrackPosition(position) {
    const clamped = Math.min(INCOME_TRACK_LEVELS.length - 1, Math.max(0, position));
    return INCOME_TRACK_LEVELS[clamped];
}

// Spending money: the amount you pay per income level on the income track
// From income -10 to 0, pay 1 per level (e.g., income -10 means pay £10)
// Income is the amount of money you receive/pay at the end of each round

// Canal link cost
const CANAL_LINK_COST = 3;
// Rail link cost (1 link)
const RAIL_LINK_COST = 5;
// Rail link cost (2 links in one action)
const RAIL_DOUBLE_LINK_COST = 15;
// Coal needed per rail link
const COAL_PER_RAIL_LINK = 1;
// Beer needed for double rail
const BEER_FOR_DOUBLE_RAIL = 1;

// Hand size
const HAND_SIZE = 8;

// ============================================================================
// Actions per turn by player count and era
// ============================================================================
// First round of canal era: 1 action per player
// All other rounds: 2 actions per player
const ACTIONS_PER_TURN = 2;
const FIRST_ROUND_ACTIONS = 1;

// Number of rounds per era depends on card count
// Canal era ends when all cards are played
// Rail era ends when all cards are played

// ============================================================================
// Position helpers for rendering
// ============================================================================
function getLocationPosition(locationId) {
    if (CITIES[locationId]) return { x: CITIES[locationId].x, y: CITIES[locationId].y };
    if (MERCHANTS[locationId]) return { x: MERCHANTS[locationId].x, y: MERCHANTS[locationId].y };
    if (locationId === 'northern') return { x: BREWERY_FARMS.northern.x, y: BREWERY_FARMS.northern.y };
    if (locationId === 'southern') return { x: BREWERY_FARMS.southern.x, y: BREWERY_FARMS.southern.y };
    return null;
}

function isMerchantLocation(locationId) {
    return !!MERCHANTS[locationId];
}

function isBreweryFarm(locationId) {
    return locationId === 'northern' || locationId === 'southern';
}

function isCity(locationId) {
    return !!CITIES[locationId];
}

function isLocationAvailableForPlayers(locationId, numPlayers) {
    if (isCity(locationId)) {
        const node = getBoardGraphNode(locationId);
        return node ? includesPlayerCount(node.buildable_player_counts, numPlayers) : true;
    }
    if (isMerchantLocation(locationId)) {
        return MERCHANTS[locationId].minPlayers <= numPlayers;
    }
    if (isBreweryFarm(locationId)) {
        const node = getBoardGraphNode(locationId);
        return node ? includesPlayerCount(node.buildable_player_counts, numPlayers) : true;
    }
    return false;
}

function isMerchantTradeAvailableForPlayers(locationId, numPlayers) {
    if (!isMerchantLocation(locationId)) return false;
    return MERCHANTS[locationId].minPlayers <= numPlayers;
}

function isLocationNetworkAvailableForPlayers(locationId, numPlayers) {
    if (isCity(locationId)) {
        const node = getBoardGraphNode(locationId);
        return node ? includesPlayerCount(node.buildable_player_counts, numPlayers) : true;
    }
    if (isMerchantLocation(locationId)) {
        const merchant = MERCHANTS[locationId];
        const minPlayers = merchant.networkMinPlayers ?? merchant.minPlayers;
        return minPlayers <= numPlayers;
    }
    if (isBreweryFarm(locationId)) {
        const node = getBoardGraphNode(locationId);
        return node ? includesPlayerCount(node.buildable_player_counts, numPlayers) : true;
    }
    return false;
}

function isConnectionAvailableForPlayers(conn, numPlayers) {
    if (conn.minPlayers && conn.minPlayers <= numPlayers) return true;
    return conn.cities.every(locationId => isLocationNetworkAvailableForPlayers(locationId, numPlayers));
}
