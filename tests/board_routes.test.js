const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createFakeElement(tagName) {
    const element = {
        tagName,
        attrs: {},
        children: [],
        textContent: '',
        parent: null,
        setAttribute(key, value) {
            this.attrs[key] = String(value);
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
            return collectNodes(this, node => {
                if (!node.attrs) return false;
                if (selector.startsWith('#')) return node.attrs.id === selector.slice(1);
                if (selector.startsWith('.')) {
                    return String(node.attrs.class || '').split(/\s+/).includes(selector.slice(1));
                }
                return false;
            }).filter(node => node !== this);
        },
    };
    return element;
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

const graphSource = fs.readFileSync(path.join(repoRoot, 'js', 'boardGraphSource.js'), 'utf8');
const gameData = fs.readFileSync(path.join(repoRoot, 'js', 'gameData.js'), 'utf8');
const boardRenderer = fs.readFileSync(path.join(repoRoot, 'js', 'boardRenderer.js'), 'utf8');
vm.runInContext(
    `${graphSource}
${gameData}\n${boardRenderer}\n` +
    `globalThis.BoardRenderer = BoardRenderer; globalThis.CITIES = CITIES; ` +
    `globalThis.MERCHANTS = MERCHANTS; globalThis.BREWERY_FARMS = BREWERY_FARMS; ` +
    `globalThis.CONNECTIONS = CONNECTIONS; globalThis.ERA = ERA;`,
    context
);

function getConnection(id) {
    return context.CONNECTIONS.find(conn => conn.id === id);
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function pointInsideBounds(point, bounds) {
    return point.x > bounds.left &&
        point.x < bounds.right &&
        point.y > bounds.top &&
        point.y < bounds.bottom;
}

function pathEndPoint(d) {
    const coords = [...d.matchAll(/[-\d.]+,[-\d.]+/g)].map(match => {
        const [x, y] = match[0].split(',').map(Number);
        return { x, y };
    });
    return coords[coords.length - 1];
}

function parseTranslate(transform) {
    const match = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(transform);
    assert.ok(match, `Expected translate transform: ${transform}`);
    return { x: Number(match[1]), y: Number(match[2]) };
}

function parseTranslateScale(transform) {
    const match = /translate\(([-\d.]+),\s*([-\d.]+)\)(?:\s+scale\(([-\d.]+)\))?/.exec(transform);
    assert.ok(match, `Expected translate/scale transform: ${transform}`);
    return {
        x: Number(match[1]),
        y: Number(match[2]),
        scale: match[3] ? Number(match[3]) : 1,
    };
}

function getRenderedShapeBounds(group) {
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };

    function visit(node, parentTransform = { x: 0, y: 0, scale: 1 }) {
        let transform = parentTransform;
        if (node !== group && node.attrs?.transform) {
            const parsed = parseTranslateScale(node.attrs.transform);
            transform = {
                x: parentTransform.x + parsed.x * parentTransform.scale,
                y: parentTransform.y + parsed.y * parentTransform.scale,
                scale: parentTransform.scale * parsed.scale,
            };
        }

        if (node.tagName === 'rect') {
            const x = transform.x + Number(node.attrs.x) * transform.scale;
            const y = transform.y + Number(node.attrs.y) * transform.scale;
            bounds.left = Math.min(bounds.left, x);
            bounds.right = Math.max(bounds.right, x + Number(node.attrs.width) * transform.scale);
            bounds.top = Math.min(bounds.top, y);
            bounds.bottom = Math.max(bounds.bottom, y + Number(node.attrs.height) * transform.scale);
        } else if (node.tagName === 'circle') {
            const cx = transform.x + Number(node.attrs.cx) * transform.scale;
            const cy = transform.y + Number(node.attrs.cy) * transform.scale;
            const radius = Number(node.attrs.r) * transform.scale;
            bounds.left = Math.min(bounds.left, cx - radius);
            bounds.right = Math.max(bounds.right, cx + radius);
            bounds.top = Math.min(bounds.top, cy - radius);
            bounds.bottom = Math.max(bounds.bottom, cy + radius);
        }

        for (const child of node.children || []) visit(child, transform);
    }

    for (const child of group.children || []) visit(child);
    return bounds;
}

function boundsWidth(bounds) {
    return bounds.right - bounds.left;
}

function boundsHeight(bounds) {
    return bounds.bottom - bounds.top;
}

function boundsOverlap(a, b, gap = 0) {
    return a.left < b.right + gap &&
        a.right > b.left - gap &&
        a.top < b.bottom + gap &&
        a.bottom > b.top - gap;
}

function pointInsideOrOnBounds(point, bounds) {
    return point.x >= bounds.left &&
        point.x <= bounds.right &&
        point.y >= bounds.top &&
        point.y <= bounds.bottom;
}

function orientation(a, b, c) {
    const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
    if (Math.abs(value) < 0.001) return 0;
    return value > 0 ? 1 : 2;
}

function pointOnSegment(a, b, c) {
    return b.x <= Math.max(a.x, c.x) + 0.001 &&
        b.x + 0.001 >= Math.min(a.x, c.x) &&
        b.y <= Math.max(a.y, c.y) + 0.001 &&
        b.y + 0.001 >= Math.min(a.y, c.y);
}

function segmentsIntersect(a, b, c, d) {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && pointOnSegment(a, c, b)) return true;
    if (o2 === 0 && pointOnSegment(a, d, b)) return true;
    if (o3 === 0 && pointOnSegment(c, a, d)) return true;
    if (o4 === 0 && pointOnSegment(c, b, d)) return true;
    return false;
}

function segmentIntersectsBounds(seg, bounds) {
    const start = { x: seg.x1, y: seg.y1 };
    const end = { x: seg.x2, y: seg.y2 };
    if (pointInsideOrOnBounds(start, bounds) || pointInsideOrOnBounds(end, bounds)) return true;

    const corners = [
        { x: bounds.left, y: bounds.top },
        { x: bounds.right, y: bounds.top },
        { x: bounds.right, y: bounds.bottom },
        { x: bounds.left, y: bounds.bottom },
    ];
    return corners.some((corner, index) =>
        segmentsIntersect(start, end, corner, corners[(index + 1) % corners.length])
    );
}

function collinearSegmentOverlapLength(first, second) {
    const a = { x: first.x1, y: first.y1 };
    const b = { x: first.x2, y: first.y2 };
    const c = { x: second.x1, y: second.y1 };
    const d = { x: second.x2, y: second.y2 };
    if (orientation(a, b, c) !== 0 || orientation(a, b, d) !== 0) return 0;

    const useX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const firstStart = useX ? a.x : a.y;
    const firstEnd = useX ? b.x : b.y;
    const secondStart = useX ? c.x : c.y;
    const secondEnd = useX ? d.x : d.y;
    return Math.max(0,
        Math.min(Math.max(firstStart, firstEnd), Math.max(secondStart, secondEnd)) -
        Math.max(Math.min(firstStart, firstEnd), Math.min(secondStart, secondEnd))
    );
}

function getVisibleFullscreenBounds(renderer, numPlayers = 4) {
    renderer.state = {
        era: context.ERA.CANAL,
        numPlayers,
        boardLinks: {},
        boardIndustries: {},
        breweryFarmTiles: {},
        merchantTiles: [],
        players: [],
    };

    return [
        ...Object.keys(context.CITIES),
        ...Object.keys(context.MERCHANTS),
        ...Object.keys(context.BREWERY_FARMS),
    ]
        .filter(locationId => renderer.isLocationNetworkVisible(locationId))
        .map(locationId => ({ locationId, bounds: renderer.getLocationContainerBounds(locationId) }));
}

function testReferenceAnchorsPlaceGloucesterAndNorthernBreweryOnCorrectSide() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));

    assert.ok(
        renderer.getLayoutPosition('gloucester').x > renderer.getLayoutPosition('worcester').x,
        'Gloucester should sit southeast of Worcester as on the full board'
    );
    assert.ok(
        renderer.getLayoutPosition('northern').x < renderer.getLayoutPosition('cannock').x,
        'Northern brewery should sit west of Cannock as on the full board'
    );
}

function testGraphRoutesUseSolvedLayoutPositions() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));

    assert.deepEqual(plain(renderer.getConnectionRoutePoints(getConnection('gloucester-worcester'))), plain([
        renderer.getLayoutPosition('gloucester'),
        renderer.getLayoutPosition('worcester'),
    ]));
    assert.deepEqual(plain(renderer.getConnectionRoutePoints(getConnection('birmingham-worcester'))), plain([
        renderer.getLayoutPosition('birmingham'),
        renderer.getLayoutPosition('worcester'),
    ]));
    assert.deepEqual(plain(renderer.getConnectionRoutePoints(getConnection('kidderminster-worcester'))), plain([
        renderer.getLayoutPosition('kidderminster'),
        renderer.getLayoutPosition('southern'),
        renderer.getLayoutPosition('worcester'),
    ]));
}

function testRouteCandidateGenerationPreservesConnectionEndpoints() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    const start = { x: 20, y: 20 };
    const end = { x: 180, y: 20 };
    const obstacles = [{
        locationId: 'diagnostic-obstacle',
        bounds: { left: 10, right: 30, top: 10, bottom: 30 },
    }];

    const points = renderer.getRouteAvoidanceCandidatePoints(start, end, obstacles);
    assert.deepEqual(plain(points.slice(0, 2)), [start, end]);
}

function testFarmContainerBoundsReserveBuiltTileFootprint() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.state = {
        numPlayers: 4,
        breweryFarmTiles: {
            southern: {
                type: 'brewery',
                playerId: 0,
                flipped: false,
                resourceCubes: 1,
                tileData: { level: 1, vp: 4 },
            },
        },
        players: [{ color: '#ffffff' }],
    };
    renderer.drawBreweryFarms();

    const farm = collectNodes(renderer.svg, node => node.attrs?.['data-farm'] === 'southern')[0];
    assert.ok(farm, 'southern farm should render');
    const shapes = collectNodes(farm, node => node.tagName === 'rect' || node.tagName === 'circle');
    const rendered = shapes.reduce((bounds, shape) => {
        if (shape.tagName === 'rect') {
            const x = Number(shape.attrs.x);
            const y = Number(shape.attrs.y);
            bounds.left = Math.min(bounds.left, x);
            bounds.right = Math.max(bounds.right, x + Number(shape.attrs.width));
            bounds.top = Math.min(bounds.top, y);
            bounds.bottom = Math.max(bounds.bottom, y + Number(shape.attrs.height));
        } else {
            const cx = Number(shape.attrs.cx);
            const cy = Number(shape.attrs.cy);
            const radius = Number(shape.attrs.r);
            bounds.left = Math.min(bounds.left, cx - radius);
            bounds.right = Math.max(bounds.right, cx + radius);
            bounds.top = Math.min(bounds.top, cy - radius);
            bounds.bottom = Math.max(bounds.bottom, cy + radius);
        }
        return bounds;
    }, { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
    const reserved = renderer.getBaseContainerMetrics('southern', 1);

    assert.ok(reserved.left <= rendered.left, 'farm bounds should reserve the built tile left edge');
    assert.ok(reserved.right >= rendered.right, 'farm bounds should reserve the built tile right edge');
    assert.ok(reserved.top <= rendered.top, 'farm bounds should reserve the built tile top edge');
    assert.ok(reserved.bottom >= rendered.bottom, 'farm bounds should reserve the built tile bottom edge');
}

function testEveryBuiltTileFitsInsideCollisionBounds() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    const builtTile = {
        type: 'brewery',
        playerId: 0,
        flipped: false,
        resourceCubes: 1,
        tileData: { level: 1, vp: 4 },
    };
    const boardIndustries = {};
    for (const [cityId, city] of Object.entries(context.CITIES)) {
        city.slots.forEach((_slot, slotIndex) => {
            boardIndustries[`${cityId}_${slotIndex}`] = { ...builtTile };
        });
    }
    renderer.state = {
        numPlayers: 4,
        boardIndustries,
        breweryFarmTiles: {
            northern: { ...builtTile },
            southern: { ...builtTile },
        },
        players: [{ color: '#ffffff' }],
    };
    renderer.drawCities();
    renderer.drawBreweryFarms();

    const groups = collectNodes(renderer.svg, node =>
        node.attrs?.['data-city'] && String(node.attrs.class || '').split(/\s+/).includes('city-group') ||
        node.attrs?.['data-farm']
    );
    for (const group of groups) {
        const locationId = group.attrs['data-city'] || group.attrs['data-farm'];
        const rendered = getRenderedShapeBounds(group);
        const reserved = renderer.getBaseContainerMetrics(locationId, 1);
        assert.ok(reserved.left <= rendered.left + 0.001, `${locationId} should reserve its left tile edge`);
        assert.ok(reserved.right >= rendered.right - 0.001, `${locationId} should reserve its right tile edge`);
        assert.ok(reserved.top <= rendered.top + 0.001, `${locationId} should reserve its top tile edge`);
        assert.ok(reserved.bottom >= rendered.bottom - 0.001, `${locationId} should reserve its bottom tile edge`);
    }
}

function testRenderedCanalSegmentsStopAtContainerBoundaries() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.state = { era: context.ERA.CANAL };
    renderer.drawConnections();

    const visiblePaths = collectNodes(
        renderer.svg,
        node => node.tagName === 'path' &&
            node.attrs['data-connection'] === 'gloucester-worcester' &&
            node.attrs.stroke === '#66bbee'
    );

    assert.equal(visiblePaths.length, 1);
    assert.ok(
        !pointInsideBounds(
            pathEndPoint(visiblePaths[0].attrs.d),
            renderer.getLocationContainerBounds('worcester')
        ),
        'Worcester route endpoint should stop at the city container boundary'
    );

    const cannockBreweryPaths = collectNodes(
        renderer.svg,
        node => node.tagName === 'path' &&
            node.attrs['data-connection'] === 'cannock-northern' &&
            node.attrs.stroke === '#66bbee'
    );

    assert.equal(cannockBreweryPaths.length, 1);
    const cannockStart = cannockBreweryPaths[0].attrs.d.match(/^M([-\d.]+),([-\d.]+)/);
    assert.ok(cannockStart);
    assert.ok(
        !pointInsideBounds(
            { x: Number(cannockStart[1]), y: Number(cannockStart[2]) },
            renderer.getLocationContainerBounds('cannock')
        ),
        'Cannock route endpoint should stop at the city container boundary'
    );
    assert.ok(
        !pointInsideBounds(
            pathEndPoint(cannockBreweryPaths[0].attrs.d),
            renderer.getLocationContainerBounds('northern')
        ),
        'Northern farm route endpoint should stop at the farm container boundary'
    );
}

function testGraphRoutesRenderAsPathsInCanalAndRailEra() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));

    renderer.state = { era: context.ERA.CANAL, numPlayers: 4 };
    renderer.drawConnections();

    const canalPaths = collectNodes(
        renderer.svg,
        node => node.tagName === 'path' &&
            node.attrs['data-connection'] === 'gloucester-worcester' &&
            node.attrs.stroke === '#66bbee'
    );
    assert.equal(canalPaths.length, 1);
    assert.match(canalPaths[0].attrs.d, /^M[-\d.]+,[-\d.]+/);

    renderer.svg.children = [];
    renderer.state = { era: context.ERA.RAIL, numPlayers: 4 };
    renderer.drawConnections();

    const railPaths = collectNodes(
        renderer.svg,
        node => node.tagName === 'path' &&
            node.attrs['data-connection'] === 'gloucester-worcester' &&
            node.attrs.stroke === '#888'
    );
    assert.equal(railPaths.length, 1);
    assert.match(railPaths[0].attrs.d, /^M[-\d.]+,[-\d.]+/);
    assert.equal(railPaths[0].attrs['stroke-dasharray'], '3 7');
}

function testFullUpdateRedrawsRailEraConnectionsAsRailNotCanal() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    const state = {
        era: context.ERA.CANAL,
        numPlayers: 4,
        boardLinks: {},
        boardIndustries: {},
        breweryFarmTiles: {},
        merchantTiles: [],
        players: [],
    };

    renderer.render(state);
    assert.ok(
        collectNodes(renderer.svg, node => node.tagName === 'path' && node.attrs.stroke === '#66bbee').length > 0,
        'canal era should render blue canal route lines'
    );

    state.era = context.ERA.RAIL;
    renderer.fullUpdate(state);

    assert.equal(
        collectNodes(renderer.svg, node => node.tagName === 'path' && node.attrs.stroke === '#66bbee').length,
        0,
        'rail era should not keep stale blue canal route lines'
    );
    assert.ok(
        collectNodes(renderer.svg, node => node.tagName === 'path' && node.attrs.stroke === '#888' && node.attrs['stroke-dasharray'] === '3 7').length > 0,
        'rail era should render rail route lines'
    );
}

function testFullscreenLayoutUsesViewportAspectAndScalesGraphNodes() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    const normalBounds = renderer.getLocationContainerBounds('birmingham');
    const normalRoute = plain(renderer.getConnectionRoutePoints(getConnection('birmingham-coventry')));

    renderer.setLayoutMode('fullscreen', { width: 2048, height: 911 });

    assert.equal(renderer.layout.mode, 'fullscreen');
    assert.equal(renderer.layout.width, 2048);
    assert.equal(renderer.layout.height, 911);
    assert.ok(renderer.layout.nodeScale > 1.3, 'fullscreen should visibly enlarge city containers');
    assert.notDeepEqual(plain(renderer.getConnectionRoutePoints(getConnection('birmingham-coventry'))), normalRoute);
    assert.deepEqual(
        plain(renderer.getConnectionRoutePoints(getConnection('birmingham-coventry'))),
        plain([
            renderer.getLayoutPosition('birmingham'),
            renderer.getLayoutPosition('coventry'),
        ])
    );

    const fullscreenBounds = renderer.getLocationContainerBounds('birmingham');
    assert.ok(boundsWidth(fullscreenBounds) > boundsWidth(normalBounds) * 1.3);
    assert.ok(boundsHeight(fullscreenBounds) > boundsHeight(normalBounds) * 1.3);

    const endpoint = renderer.getDrawableConnectionRoutePoints(getConnection('birmingham-coventry'))[0];
    assert.equal(
        pointInsideBounds(endpoint, renderer.getLocationContainerBounds('birmingham')),
        false,
        'fullscreen route endpoints should be clipped against enlarged city containers'
    );

    const warringtonBounds = renderer.getLocationContainerBounds('warrington');
    assert.ok(warringtonBounds.left >= 0 && warringtonBounds.top >= 0);
    assert.ok(warringtonBounds.right <= renderer.layout.width && warringtonBounds.bottom <= renderer.layout.height);
}

function testRendererSelectsJsonResponsiveProfileAtAspectBoundary() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));

    renderer.setLayoutMode('fullscreen', { width: 1340, height: 1000 });
    assert.equal(renderer.layout.profile, 'square');
    assert.deepEqual(
        plain(renderer.getGraphLayoutRows(renderer.layout)[2]),
        ['shrewsbury', 'coalbrookdale', 'wolverhampton', 'northern', 'cannock']
    );

    renderer.setLayoutMode('fullscreen', { width: 1350, height: 1000 });
    assert.equal(renderer.layout.profile, 'landscape');
    assert.deepEqual(
        plain(renderer.getGraphLayoutRows(renderer.layout)[2]),
        [
            'shrewsbury', 'coalbrookdale', 'wolverhampton', 'northern',
            'cannock', 'walsall', 'burtonOnTrent', 'tamworth', 'nuneaton',
        ]
    );
}

function testFullscreenKeepsPreferredGeographicLayoutAndFarmClearance() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.getResponsiveLayoutContract = () => null;
    renderer.setLayoutMode('fullscreen', { width: 2048, height: 911 });

    assert.equal(renderer.layout.profile, 'landscape');
    const kidderminsterPosition = renderer.getLayoutPosition('kidderminster');
    const southernPosition = renderer.getLayoutPosition('southern');
    const worcesterPosition = renderer.getLayoutPosition('worcester');
    assert.ok(
        kidderminsterPosition.y < southernPosition.y && southernPosition.y < worcesterPosition.y,
        'the south brewery should stay geographically between Kidderminster and Worcester'
    );

    const southern = renderer.getLocationContainerBounds('southern');
    for (const cityId of ['kidderminster', 'worcester']) {
        assert.equal(
            boundsOverlap(southern, renderer.getLocationContainerBounds(cityId), 4),
            false,
            `south farm brewery should remain clear of ${cityId}`
        );
    }
}

function testJsonRanksRemainGraphMetadataWithoutFlatteningGeography() {
    const viewports = [
        { width: 900, height: 850, mode: 'normal' },
        { width: 2048, height: 911, mode: 'fullscreen' },
    ];

    for (const viewport of viewports) {
        const renderer = new context.BoardRenderer(createFakeElement('svg'));
        if (viewport.mode === 'fullscreen') {
            renderer.setLayoutMode('fullscreen', viewport);
        }

        assert.ok(renderer.getGraphLayoutRows(renderer.layout).length > 0);
        assert.ok(
            renderer.getLayoutPosition('stafford').y < renderer.getLayoutPosition('cannock').y,
            `${viewport.width}x${viewport.height}: Stafford should remain geographically north of Cannock`
        );
        assert.ok(
            renderer.getLayoutPosition('kidderminster').y < renderer.getLayoutPosition('worcester').y,
            `${viewport.width}x${viewport.height}: Kidderminster should remain geographically north of Worcester`
        );
    }
}

function testFullscreenKeepsEveryVisibleContainerInsideViewport() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.setLayoutMode('fullscreen', { width: 2048, height: 911 });

    for (const { locationId, bounds } of getVisibleFullscreenBounds(renderer)) {
        assert.ok(bounds.left >= 0, `${locationId} left edge should be visible`);
        assert.ok(bounds.top >= 0, `${locationId} top edge should be visible`);
        assert.ok(bounds.right <= renderer.layout.width, `${locationId} right edge should be visible`);
        assert.ok(bounds.bottom <= renderer.layout.height, `${locationId} bottom edge should be visible`);
    }
}

function testFullscreenContainersDoNotOverlap() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.setLayoutMode('fullscreen', { width: 2048, height: 911 });
    const locations = getVisibleFullscreenBounds(renderer);

    for (let i = 0; i < locations.length; i++) {
        for (let j = i + 1; j < locations.length; j++) {
            assert.equal(
                boundsOverlap(locations[i].bounds, locations[j].bounds, 4),
                false,
                `${locations[i].locationId} should not overlap ${locations[j].locationId}`
            );
        }
    }
}

function assertLayoutInvariantsForViewport(viewport) {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    if (viewport.mode === 'fullscreen') {
        renderer.setLayoutMode('fullscreen', { width: viewport.width, height: viewport.height });
    }
    const locations = getVisibleFullscreenBounds(renderer);

    for (const { locationId, bounds } of locations) {
        assert.ok(bounds.left >= 0, `${viewport.name}: ${locationId} should not clip left`);
        assert.ok(bounds.top >= 0, `${viewport.name}: ${locationId} should not clip top`);
        assert.ok(bounds.right <= renderer.layout.width, `${viewport.name}: ${locationId} should not clip right`);
        assert.ok(bounds.bottom <= renderer.layout.height, `${viewport.name}: ${locationId} should not clip bottom`);
    }

    for (let i = 0; i < locations.length; i++) {
        for (let j = i + 1; j < locations.length; j++) {
            assert.equal(
                boundsOverlap(locations[i].bounds, locations[j].bounds, 4),
                false,
                `${viewport.name}: ${locations[i].locationId} should not overlap ${locations[j].locationId}`
            );
        }
    }

    for (const conn of context.CONNECTIONS) {
        if (!renderer.isConnectionVisible(conn)) continue;
        const segments = renderer.getConnectionSegments(conn);
        const endpointIds = new Set(conn.cities);
        if (conn.viaBrewery) endpointIds.add(conn.viaBrewery);
        for (const segment of segments) {
            for (const { locationId, bounds } of locations) {
                if (endpointIds.has(locationId)) continue;
                assert.equal(
                    segmentIntersectsBounds(segment, bounds),
                    false,
                    `${viewport.name}: ${conn.id} should not pass through ${locationId}`
                );
            }
        }

        const firstBounds = renderer.getLocationContainerBounds(conn.cities[0]);
        const lastBounds = renderer.getLocationContainerBounds(conn.cities[1]);
        if (firstBounds && segments[0]) {
            assert.equal(
                pointInsideOrOnBounds({ x: segments[0].x1, y: segments[0].y1 }, firstBounds),
                false,
                `${viewport.name}: ${conn.id} should start outside ${conn.cities[0]}`
            );
        }
        if (lastBounds && segments.length) {
            const lastSegment = segments[segments.length - 1];
            assert.equal(
                pointInsideOrOnBounds({ x: lastSegment.x2, y: lastSegment.y2 }, lastBounds),
                false,
                `${viewport.name}: ${conn.id} should end outside ${conn.cities[1]}`
            );
        }
    }
}

function testRoutesAndContainersRespectLayoutInvariantsAtAllViewports() {
    const viewports = [
        { name: 'normal 900x850', mode: 'normal' },
        { name: 'reported wide fullscreen 2048x911', mode: 'fullscreen', width: 2048, height: 911 },
        { name: 'desktop 1920x1080', mode: 'fullscreen', width: 1920, height: 1080 },
        { name: 'desktop 1440x900', mode: 'fullscreen', width: 1440, height: 900 },
        { name: 'desktop 1366x768', mode: 'fullscreen', width: 1366, height: 768 },
        { name: 'desktop 1280x720', mode: 'fullscreen', width: 1280, height: 720 },
        { name: 'tablet 1024x768', mode: 'fullscreen', width: 1024, height: 768 },
        { name: 'tablet portrait 768x1024', mode: 'fullscreen', width: 768, height: 1024 },
    ];

    for (const viewport of viewports) {
        assertLayoutInvariantsForViewport(viewport);
    }
}

function testEveryVisibleConnectionHasMinimumDrawableLength() {
    const viewports = [
        { name: 'normal', mode: 'normal', width: 900, height: 850 },
        { name: 'wide fullscreen', mode: 'fullscreen', width: 2048, height: 911 },
        { name: 'desktop', mode: 'fullscreen', width: 1920, height: 1080 },
        { name: 'small desktop', mode: 'fullscreen', width: 1280, height: 720 },
        { name: 'portrait', mode: 'fullscreen', width: 768, height: 1024 },
    ];

    for (const viewport of viewports) {
        const renderer = new context.BoardRenderer(createFakeElement('svg'));
        if (viewport.mode === 'fullscreen') {
            renderer.setLayoutMode('fullscreen', viewport);
        }
        renderer.state = { numPlayers: 4, era: context.ERA.CANAL };
        const minimumLength = renderer.getMinimumDrawableEdgeLength();

        for (const connection of context.CONNECTIONS) {
            if (!renderer.isConnectionVisible(connection)) continue;
            const points = renderer.getDrawableConnectionRoutePoints(connection);
            const drawableLength = points.slice(1).reduce((total, point, index) =>
                total + Math.hypot(point.x - points[index].x, point.y - points[index].y)
            , 0);
            assert.ok(
                drawableLength + 0.001 >= minimumLength,
                `${viewport.name}: ${connection.id} should render at least ${minimumLength} units, got ${drawableLength}`
            );
        }
    }
}

function testSeparateConnectionsDoNotShareVisibleRouteSegments() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.setLayoutMode('fullscreen', { width: 2048, height: 911 });
    renderer.state = { numPlayers: 4, era: context.ERA.CANAL };
    const routes = context.CONNECTIONS
        .filter(connection => renderer.isConnectionVisible(connection))
        .map(connection => ({ connection, segments: renderer.getConnectionSegments(connection) }));
    const maximumOverlap = 2 * renderer.getRouteScale();

    for (let firstIndex = 0; firstIndex < routes.length; firstIndex++) {
        for (let secondIndex = firstIndex + 1; secondIndex < routes.length; secondIndex++) {
            for (const firstSegment of routes[firstIndex].segments) {
                for (const secondSegment of routes[secondIndex].segments) {
                    const overlap = collinearSegmentOverlapLength(firstSegment, secondSegment);
                    assert.ok(
                        overlap <= maximumOverlap + 0.001,
                        `${routes[firstIndex].connection.id} and ${routes[secondIndex].connection.id} ` +
                        `should not share ${overlap} units of the same route lane`
                    );
                }
            }
        }
    }
}

function testNorthernLongRoutesStayOutOfTheTopStokeCorridor() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.setLayoutMode('fullscreen', { width: 2048, height: 911 });
    renderer.state = { numPlayers: 4, era: context.ERA.CANAL };
    const stokeTop = renderer.getLocationContainerBounds('stokeOnTrent').top;

    for (const connectionId of ['burtonOnTrent-stone', 'stone-uttoxeter']) {
        const points = renderer.getDrawableConnectionRoutePoints(getConnection(connectionId));
        assert.ok(
            Math.min(...points.map(point => point.y)) >= stokeTop,
            `${connectionId} should use the middle routing channel instead of arching above Stoke`
        );
    }
}

function testRendererLayoutDoesNotDependOnAbsoluteNodeCoordinates() {
    const originalCityPositions = Object.fromEntries(
        Object.entries(context.CITIES).map(([id, city]) => [id, { x: city.x, y: city.y }])
    );
    const originalMerchantPositions = Object.fromEntries(
        Object.entries(context.MERCHANTS).map(([id, merchant]) => [id, { x: merchant.x, y: merchant.y }])
    );
    const originalFarmPositions = Object.fromEntries(
        Object.entries(context.BREWERY_FARMS).map(([id, farm]) => [id, { x: farm.x, y: farm.y }])
    );

    try {
        for (const city of Object.values(context.CITIES)) {
            delete city.x;
            delete city.y;
        }
        for (const merchant of Object.values(context.MERCHANTS)) {
            delete merchant.x;
            delete merchant.y;
        }
        for (const farm of Object.values(context.BREWERY_FARMS)) {
            delete farm.x;
            delete farm.y;
        }

        assertLayoutInvariantsForViewport({ name: 'normal without absolute node positions', mode: 'normal' });
        assertLayoutInvariantsForViewport({
            name: 'fullscreen without absolute node positions',
            mode: 'fullscreen',
            width: 2048,
            height: 911,
        });
    } finally {
        for (const [id, position] of Object.entries(originalCityPositions)) {
            context.CITIES[id].x = position.x;
            context.CITIES[id].y = position.y;
        }
        for (const [id, position] of Object.entries(originalMerchantPositions)) {
            context.MERCHANTS[id].x = position.x;
            context.MERCHANTS[id].y = position.y;
        }
        for (const [id, position] of Object.entries(originalFarmPositions)) {
            context.BREWERY_FARMS[id].x = position.x;
            context.BREWERY_FARMS[id].y = position.y;
        }
    }
}

function testContainerBoundsIncludeRenderedCityTitleRibbons() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.drawCities();

    for (const cityId of Object.keys(context.CITIES)) {
        const cityGroup = collectNodes(renderer.svg, node =>
            node.attrs &&
            node.attrs['data-city'] === cityId &&
            String(node.attrs.class || '').split(/\s+/).includes('city-group')
        )[0];
        assert.ok(cityGroup, `${cityId} should render a city group`);

        const labelBg = collectNodes(cityGroup, node =>
            node.attrs && node.attrs.class === 'city-label-bg'
        )[0];
        assert.ok(labelBg, `${cityId} should render a city title ribbon`);

        const bounds = renderer.getLocationContainerBounds(cityId);
        const renderedRibbonWidth = Number(labelBg.attrs.width) * renderer.getNodeScale();
        assert.ok(
            boundsWidth(bounds) + 0.001 >= renderedRibbonWidth,
            `${cityId} container bounds should include rendered title ribbon width`
        );
    }
}

function testFullscreenDrawsScaledCityGroupsInsideViewport() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.setLayoutMode('fullscreen', { width: 2048, height: 911 });
    renderer.state = {
        era: context.ERA.CANAL,
        numPlayers: 2,
        boardLinks: {},
        boardIndustries: {},
        breweryFarmTiles: {},
        merchantTiles: [],
        players: [],
    };

    renderer.drawCities();
    const birmingham = collectNodes(renderer.svg, node => node.attrs && node.attrs['data-city'] === 'birmingham')[0];
    const transform = parseTranslateScale(birmingham.attrs.transform);
    const layoutPos = renderer.getLayoutPosition('birmingham');

    assert.equal(transform.x, layoutPos.x);
    assert.equal(transform.y, layoutPos.y);
    assert.ok(Math.abs(transform.scale - renderer.layout.nodeScale) < 0.001);
    assert.ok(transform.x > context.CITIES.birmingham.x * 2, 'wide fullscreen should spread cities horizontally');
}

function testRendererShowsTwoPlayerMapCitiesAndWarringtonCoalRoute() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));
    renderer.state = {
        era: context.ERA.CANAL,
        numPlayers: 2,
        boardLinks: {},
        boardIndustries: {},
        breweryFarmTiles: {},
        merchantTiles: [],
        players: [],
    };

    renderer.drawConnections();
    renderer.drawCities();
    renderer.drawMerchants();

    for (const cityId of ['leek', 'stokeOnTrent', 'stone', 'uttoxeter', 'belper', 'derby']) {
        assert.equal(
            collectNodes(renderer.svg, node =>
                node.attrs &&
                node.attrs['data-city'] === cityId &&
                String(node.attrs.class || '').split(/\s+/).includes('city-group')
            ).length,
            1,
            `${cityId} should render on the two-player map even when absent from the two-player card deck`
        );
    }
    const warringtonNodes = collectNodes(renderer.svg, node => node.attrs && node.attrs['data-merchant'] === 'warrington');
    assert.equal(
        warringtonNodes.length,
        1,
        'Warrington should render as a two-player off-board network connection'
    );
    assert.ok(
        collectNodes(renderer.svg, node => node.attrs && node.attrs['data-connection'] === 'stokeOnTrent-warrington').length > 0,
        'Warrington canal route should render on the two-player map'
    );
    assert.equal(
        collectNodes(warringtonNodes[0], node =>
            node.attrs && String(node.attrs.class || '').split(/\s+/).includes('merchant-slot')
        ).length,
        0,
        'Two-player Warrington should not render empty merchant entry boxes'
    );
    assert.equal(
        collectNodes(warringtonNodes[0], node => node.tagName === 'text' && node.attrs.class === 'merchant-buy-label').length,
        0,
        'Two-player Warrington should not render merchant sale demand labels'
    );
    assert.equal(
        collectNodes(warringtonNodes[0], node => node.tagName === 'text' && node.attrs.class === 'merchant-bonus-label').length,
        0,
        'Two-player Warrington should not render a merchant bonus'
    );

    const origin = parseTranslate(warringtonNodes[0].attrs.transform);
    const bg = warringtonNodes[0].children.find(child => child.tagName === 'rect' && child.attrs.class === 'merchant-bg');
    assert.ok(bg, 'Warrington should render a visible panel background');
    const left = origin.x + Number(bg.attrs.x);
    const top = origin.y + Number(bg.attrs.y);
    const right = left + Number(bg.attrs.width);
    const bottom = top + Number(bg.attrs.height);
    assert.ok(left >= 0 && top >= 0 && right <= 900 && bottom <= 850, 'Warrington panel should fit inside the SVG viewBox');

    assert.ok(
        collectNodes(renderer.svg, node => node.attrs && node.attrs['data-city'] === 'birmingham').length > 0,
        'Available two-player cities should still render'
    );

    renderer.svg.children = [];
    renderer.state.era = context.ERA.RAIL;
    renderer.drawConnections();

    assert.ok(
        collectNodes(renderer.svg, node => node.attrs && node.attrs['data-connection'] === 'stokeOnTrent-warrington').length > 0,
        'Warrington rail route should render on the two-player map'
    );
}

function testConnectionSegmentsStopAtCityContainerBoundaries() {
    const renderer = new context.BoardRenderer(createFakeElement('svg'));

    for (const conn of context.CONNECTIONS) {
        const segments = renderer.getConnectionSegments(conn);
        if (segments.length === 0) continue;

        const firstLocation = conn.cities[0];
        const lastLocation = conn.cities[1];
        const firstBounds = renderer.getLocationContainerBounds(firstLocation);
        const lastBounds = renderer.getLocationContainerBounds(lastLocation);
        const firstPoint = { x: segments[0].x1, y: segments[0].y1 };
        const lastSegment = segments[segments.length - 1];
        const lastPoint = { x: lastSegment.x2, y: lastSegment.y2 };

        if (firstBounds) {
            assert.equal(
                pointInsideBounds(firstPoint, firstBounds),
                false,
                `${conn.id} should not start inside ${firstLocation}`
            );
        }
        if (lastBounds) {
            assert.equal(
                pointInsideBounds(lastPoint, lastBounds),
                false,
                `${conn.id} should not end inside ${lastLocation}`
            );
        }
    }
}

testRouteCandidateGenerationPreservesConnectionEndpoints();
testFarmContainerBoundsReserveBuiltTileFootprint();
testEveryBuiltTileFitsInsideCollisionBounds();
testReferenceAnchorsPlaceGloucesterAndNorthernBreweryOnCorrectSide();
testGraphRoutesUseSolvedLayoutPositions();
testRenderedCanalSegmentsStopAtContainerBoundaries();
testGraphRoutesRenderAsPathsInCanalAndRailEra();
testFullUpdateRedrawsRailEraConnectionsAsRailNotCanal();
testFullscreenLayoutUsesViewportAspectAndScalesGraphNodes();
testRendererSelectsJsonResponsiveProfileAtAspectBoundary();
testFullscreenKeepsPreferredGeographicLayoutAndFarmClearance();
testJsonRanksRemainGraphMetadataWithoutFlatteningGeography();
testFullscreenKeepsEveryVisibleContainerInsideViewport();
testFullscreenContainersDoNotOverlap();
testRoutesAndContainersRespectLayoutInvariantsAtAllViewports();
testEveryVisibleConnectionHasMinimumDrawableLength();
testSeparateConnectionsDoNotShareVisibleRouteSegments();
testNorthernLongRoutesStayOutOfTheTopStokeCorridor();
testRendererLayoutDoesNotDependOnAbsoluteNodeCoordinates();
testContainerBoundsIncludeRenderedCityTitleRibbons();
testFullscreenDrawsScaledCityGroupsInsideViewport();
testRendererShowsTwoPlayerMapCitiesAndWarringtonCoalRoute();
testConnectionSegmentsStopAtCityContainerBoundaries();
console.log('board route tests passed');
