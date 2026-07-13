const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);

const graphJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'brass_birmingham_location_graph.json'), 'utf8'));
const graphSource = fs.readFileSync(path.join(repoRoot, 'js', 'boardGraphSource.js'), 'utf8');
const gameData = fs.readFileSync(path.join(repoRoot, 'js', 'gameData.js'), 'utf8');

vm.runInContext(
    `${graphSource}\n${gameData}\n` +
    `globalThis.BOARD_GRAPH_SOURCE = BOARD_GRAPH_SOURCE; ` +
    `globalThis.BOARD_GRAPH_ID_ALIASES = BOARD_GRAPH_ID_ALIASES; ` +
    `globalThis.normalizeBoardGraphId = normalizeBoardGraphId; ` +
    `globalThis.CONNECTIONS = CONNECTIONS; globalThis.CITIES = CITIES; ` +
    `globalThis.MERCHANTS = MERCHANTS; globalThis.BREWERY_FARMS = BREWERY_FARMS; ` +
    `globalThis.CARD_DECK = CARD_DECK; globalThis.isLocationAvailableForPlayers = isLocationAvailableForPlayers; ` +
    `globalThis.isLocationNetworkAvailableForPlayers = isLocationNetworkAvailableForPlayers;`,
    context
);

function sorted(value) {
    return [...value].sort();
}

function edgeKeyFromEndpoints(endpoints) {
    return sorted(endpoints.map(id => context.normalizeBoardGraphId(id))).join('__');
}

function connectionKey(conn) {
    const endpoints = conn.viaBrewery ? [...conn.cities, conn.viaBrewery] : conn.cities;
    return sorted(endpoints).join('__');
}

function testGraphSourceMirrorsJsonFile() {
    assert.deepEqual(JSON.parse(JSON.stringify(context.BOARD_GRAPH_SOURCE)), graphJson);
}

function testGraphSourceCountsMatchRulebookGraph() {
    assert.equal(context.BOARD_GRAPH_SOURCE.nodes.length, 27);
    assert.equal(context.BOARD_GRAPH_SOURCE.edges.length, 39);
    assert.equal(context.BOARD_GRAPH_SOURCE.counts.industry_locations, 20);
    assert.equal(context.BOARD_GRAPH_SOURCE.counts.merchant_locations, 5);
    assert.equal(context.BOARD_GRAPH_SOURCE.counts.farm_brewery_locations, 2);
}

function testGraphSourceIncludesResponsiveV3LayoutContract() {
    const responsive = context.BOARD_GRAPH_SOURCE.responsive_layout;

    assert.ok(responsive, 'graph source should include responsive layout metadata');
    assert.equal(responsive.version, 'responsive-topology-v3');
    assert.equal(responsive.coordinate_mode, 'computed_at_runtime');
    assert.equal(responsive.global_constraints.node_overlap, 'forbidden');
    assert.equal(responsive.global_constraints.edge_through_node, 'forbidden_except_endpoint');
    assert.equal(responsive.edge_routing.obstacle_avoidance, true);
    assert.equal(responsive.edge_routing.clip_to_rendered_node_bounds, true);
    assert.deepEqual(
        JSON.parse(JSON.stringify(responsive.profiles.square.ranks[2].nodes)),
        ['shrewsbury', 'coalbrookdale', 'wolverhampton', 'farmBreweryNorth', 'cannock']
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(responsive.profiles.landscape.ranks[2].nodes)),
        [
            'shrewsbury', 'coalbrookdale', 'wolverhampton', 'farmBreweryNorth',
            'cannock', 'walsall', 'burtonUponTrent', 'tamworth', 'nuneaton',
        ]
    );
}

function testJsonNodeIdsNormalizeToExistingAppIds() {
    const appNodeIds = new Set([
        ...Object.keys(context.CITIES),
        ...Object.keys(context.MERCHANTS),
        ...Object.keys(context.BREWERY_FARMS),
    ]);

    assert.deepEqual(JSON.parse(JSON.stringify(context.BOARD_GRAPH_ID_ALIASES)), {
        burtonUponTrent: 'burtonOnTrent',
        farmBreweryNorth: 'northern',
        farmBrewerySouth: 'southern',
    });

    for (const node of context.BOARD_GRAPH_SOURCE.nodes) {
        assert.ok(
            appNodeIds.has(context.normalizeBoardGraphId(node.id)),
            `${node.id} should normalize to an existing app node id`
        );
    }
}

function testConnectionsAreDerivedFromJsonEdges() {
    const jsonEdgesByKey = new Map(context.BOARD_GRAPH_SOURCE.edges.map(edge => [edgeKeyFromEndpoints(edge.endpoints), edge]));
    const appConnectionsByKey = new Map(context.CONNECTIONS.map(conn => [connectionKey(conn), conn]));

    assert.equal(appConnectionsByKey.size, 39);
    assert.equal(appConnectionsByKey.size, jsonEdgesByKey.size);

    for (const [key, edge] of jsonEdgesByKey) {
        const conn = appConnectionsByKey.get(key);
        assert.ok(conn, `${edge.id} should derive an app connection`);
        assert.equal(conn.canal, edge.modes.includes('canal'), `${conn.id} canal mode should match JSON`);
        assert.equal(conn.rail, edge.modes.includes('rail'), `${conn.id} rail mode should match JSON`);
    }

    assert.ok(context.CONNECTIONS.some(conn => conn.id === 'stokeOnTrent-warrington'));
    assert.ok(context.CONNECTIONS.some(conn => conn.id === 'redditch-oxford'));
}

function testSouthernFarmBreweryHyperedgeStaysOnePhysicalLink() {
    const conn = context.CONNECTIONS.find(connection => connection.id === 'kidderminster-worcester');

    assert.ok(conn);
    assert.deepEqual(JSON.parse(JSON.stringify(conn.cities)), ['kidderminster', 'worcester']);
    assert.equal(conn.viaBrewery, 'southern');
    assert.equal(
        context.CONNECTIONS.filter(connection =>
            connection.cities.includes('kidderminster') &&
            connection.cities.includes('worcester')
        ).length,
        1
    );
    assert.equal(context.CONNECTIONS.some(connection => connection.id === 'kidderminster-southern'), false);
    assert.equal(context.CONNECTIONS.some(connection => connection.id === 'worcester-southern'), false);
}

function testTwoPlayerCardDeckDoesNotControlBoardGraphAvailability() {
    assert.equal(Boolean(context.CARD_DECK[2].locations.belper), false);
    assert.equal(Boolean(context.CARD_DECK[2].locations.leek), false);

    assert.equal(context.isLocationAvailableForPlayers('belper', 2), true);
    assert.equal(context.isLocationAvailableForPlayers('leek', 2), true);
    assert.equal(context.isLocationNetworkAvailableForPlayers('warrington', 2), true);
    assert.equal(context.isLocationAvailableForPlayers('warrington', 2), false);
}

testGraphSourceMirrorsJsonFile();
testGraphSourceCountsMatchRulebookGraph();
testGraphSourceIncludesResponsiveV3LayoutContract();
testJsonNodeIdsNormalizeToExistingAppIds();
testConnectionsAreDerivedFromJsonEdges();
testSouthernFarmBreweryHyperedgeStaysOnePhysicalLink();
testTwoPlayerCardDeckDoesNotControlBoardGraphAvailability();
console.log('graph source tests passed');
