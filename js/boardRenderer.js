// ============================================================================
// Brass: Birmingham - Board Renderer (SVG)
// Enhanced with atmospheric textures, styled connections, and SVG industry icons
// ============================================================================

const FALLBACK_BOARD_LAYOUT_PROFILES = Object.freeze({
    square: Object.freeze({
        ranks: Object.freeze([
            ['warrington', 'stokeOnTrent', 'leek', 'belper', 'nottingham'],
            ['stone', 'stafford', 'uttoxeter', 'derby'],
            ['shrewsbury', 'coalbrookdale', 'wolverhampton', 'northern', 'cannock'],
            ['dudley', 'walsall', 'burtonOnTrent', 'tamworth', 'nuneaton'],
            ['kidderminster', 'birmingham', 'coventry'],
            ['southern', 'worcester', 'gloucester', 'redditch', 'oxford'],
        ]),
        rank_spacing_multiplier: 1.08,
        node_spacing_multiplier: 0.94,
    }),
    landscape: Object.freeze({
        ranks: Object.freeze([
            ['warrington', 'stokeOnTrent', 'leek', 'belper', 'nottingham'],
            ['stone', 'stafford', 'uttoxeter', 'derby'],
            [
                'shrewsbury', 'coalbrookdale', 'wolverhampton', 'northern',
                'cannock', 'walsall', 'burtonOnTrent', 'tamworth', 'nuneaton',
            ],
            ['kidderminster', 'dudley', 'birmingham', 'coventry'],
            ['southern', 'worcester', 'gloucester', 'redditch', 'oxford'],
        ]),
        rank_spacing_multiplier: 0.88,
        node_spacing_multiplier: 1.1,
    }),
});

const boardAnchor = (x, y) => Object.freeze({ x: x / 900, y: y / 850 });
const GEOGRAPHIC_BOARD_ANCHORS = Object.freeze({
    belper: boardAnchor(725, 55),
    derby: boardAnchor(745, 160),
    leek: boardAnchor(440, 45),
    stokeOnTrent: boardAnchor(310, 110),
    stone: boardAnchor(195, 185),
    uttoxeter: boardAnchor(475, 160),
    stafford: boardAnchor(260, 270),
    burtonOnTrent: boardAnchor(620, 280),
    cannock: boardAnchor(350, 355),
    tamworth: boardAnchor(635, 380),
    walsall: boardAnchor(430, 430),
    wolverhampton: boardAnchor(255, 425),
    coalbrookdale: boardAnchor(110, 455),
    dudley: boardAnchor(295, 510),
    kidderminster: boardAnchor(195, 600),
    worcester: boardAnchor(210, 720),
    birmingham: boardAnchor(530, 535),
    coventry: boardAnchor(750, 565),
    nuneaton: boardAnchor(710, 460),
    redditch: boardAnchor(490, 640),
    northern: boardAnchor(275, 360),
    southern: boardAnchor(175, 660),
    shrewsbury: boardAnchor(25, 360),
    gloucester: boardAnchor(360, 790),
    oxford: boardAnchor(610, 740),
    warrington: boardAnchor(180, 80),
    nottingham: boardAnchor(835, 95),
});

class BoardRenderer {
    constructor(svgElement) {
        this.svg = svgElement;
        this.ns = 'http://www.w3.org/2000/svg';
        this.cityLabelOverlay = typeof document.getElementById === 'function'
            ? document.getElementById('city-label-overlay')
            : null;
        this.cityLabelResizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(() => this.syncBoardLabels())
            : null;
        if (this.cityLabelResizeObserver) this.cityLabelResizeObserver.observe(this.svg);
        this.baseBoardWidth = 900;
        this.baseBoardHeight = 850;
        this.citySlotSize = 30;
        this.citySlotGap = 6;
        this.cityPadding = 7;
        this.singleSlotIconSize = 20;
        this.multiSlotIconSize = 14;
        this.builtTileIconSize = 16;
        this.merchantProductFilter = null;
        this.routeEndpointClearance = 5;
        this.routeCornerRadius = 18;
        this.tooltip = null;
        this.layout = this.createLayoutContext('normal');
    }

    createLayoutContext(mode, viewport = null) {
        const isFullscreen = mode === 'fullscreen';
        const width = isFullscreen
            ? Math.max(1, Number(viewport?.width) || this.baseBoardWidth)
            : this.baseBoardWidth;
        const height = isFullscreen
            ? Math.max(1, Number(viewport?.height) || this.baseBoardHeight)
            : this.baseBoardHeight;
        const rawXScale = width / this.baseBoardWidth;
        const rawYScale = height / this.baseBoardHeight;
        const areaScale = Math.sqrt(rawXScale * rawYScale);
        const layout = {
            mode: isFullscreen ? 'fullscreen' : 'normal',
            strategy: 'geographic',
            width,
            height,
            profile: null,
            marginLeft: 0,
            marginRight: 0,
            marginTop: 0,
            marginBottom: 0,
            xScale: rawXScale,
            yScale: rawYScale,
            nodeScale: 1,
            routeScale: 1,
        };
        layout.profile = this.getGraphLayoutProfileName(layout);

        const desiredScale = isFullscreen
            ? Math.min(1.6, Math.max(0.85, Math.min(areaScale, rawXScale * 1.05, rawYScale * 1.25)))
            : 1;
        layout.nodeScale = this.getFittedNodeScale(layout, desiredScale);
        layout.routeScale = layout.nodeScale;
        layout.nodeUnit = this.getMedianLocationHeight(1) * layout.nodeScale;
        layout.nodeGap = this.getMinimumNodeGap(layout);
        layout.rankGap = this.getMinimumRankGap(layout);
        layout.edgeNodeGap = this.getMinimumEdgeToNodeGap(layout);
        layout.outerPadding = this.getOuterPadding(layout);
        layout.marginLeft = layout.outerPadding;
        layout.marginRight = layout.outerPadding;
        layout.marginTop = layout.outerPadding;
        layout.marginBottom = layout.outerPadding;
        layout.xScale = Math.max(1, width - layout.outerPadding * 2) / this.baseBoardWidth;
        layout.yScale = Math.max(1, height - layout.outerPadding * 2) / this.baseBoardHeight;
        layout.positions = this.createGeographicLayoutPositions(layout);
        return layout;
    }

    setLayoutMode(mode = 'normal', viewport = null) {
        this.layout = this.createLayoutContext(mode, viewport);
        if (this.svg) {
            this.svg.setAttribute('viewBox', `0 0 ${this.formatSvgNumber(this.layout.width)} ${this.formatSvgNumber(this.layout.height)}`);
            this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        }
    }

    render(gameState) {
        this.svg.innerHTML = '';
        this.state = gameState;
        this.drawBackground();
        this.drawConnections();
        this.drawBreweryFarms();
        this.drawMerchants();
        this.drawCities();
        this.drawBuiltLinks();
    }

    update(gameState) {
        this.state = gameState;
        this.updateIndustrySlots();
        this.updateLinks();
        this.updateMerchantBeer();
    }

    // ========================================================================
    // Drawing helpers
    // ========================================================================

    createElement(tag, attrs = {}) {
        const el = document.createElementNS(this.ns, tag);
        for (const [key, val] of Object.entries(attrs)) {
            el.setAttribute(key, val);
        }
        return el;
    }

    createGroup(attrs = {}) {
        return this.createElement('g', attrs);
    }

    positionCityLabel(label, anchor) {
        if (!label || !anchor || !this.cityLabelOverlay ||
            typeof anchor.getBoundingClientRect !== 'function' ||
            typeof this.cityLabelOverlay.getBoundingClientRect !== 'function') return;

        const anchorRect = anchor.getBoundingClientRect();
        const overlayRect = this.cityLabelOverlay.getBoundingClientRect();
        const matrix = typeof anchor.getScreenCTM === 'function' ? anchor.getScreenCTM() : null;
        const scale = matrix ? Math.hypot(Number(matrix.a) || 0, Number(matrix.b) || 0) : 1;
        const fontSize = Number(anchor.getAttribute('font-size')) || 10;
        const letterSpacing = Number(anchor.getAttribute('letter-spacing')) || 0;
        const fontWeight = anchor.getAttribute('font-weight');

        label.style.left = `${anchorRect.left + anchorRect.width / 2 - overlayRect.left}px`;
        label.style.top = `${anchorRect.top + anchorRect.height / 2 - overlayRect.top}px`;
        label.style.fontSize = `${fontSize * (scale || 1)}px`;
        label.style.letterSpacing = `${letterSpacing * (scale || 1)}px`;
        if (fontWeight) label.style.fontWeight = fontWeight;
        label.style.pointerEvents = 'none';
    }

    syncCityLabels() {
        if (!this.cityLabelOverlay || typeof document.createElement !== 'function') return;

        const anchors = Array.from(this.svg.querySelectorAll('.city-label'));
        const labels = Array.from(this.cityLabelOverlay.querySelectorAll('.city-label-html'));
        const labelsByCity = new Map(labels.map(label => [label.dataset.city, label]));
        const activeCityIds = new Set();

        for (const anchor of anchors) {
            const cityId = anchor.getAttribute('data-city');
            if (!cityId) continue;
            activeCityIds.add(cityId);

            let label = labelsByCity.get(cityId);
            if (!label) {
                label = document.createElement('span');
                label.className = 'city-label-html';
                label.setAttribute('data-city', cityId);
                label.textContent = anchor.textContent;
                this.cityLabelOverlay.appendChild(label);
            }

            this.positionCityLabel(label, anchor);
        }

        for (const label of labels) {
            if (!activeCityIds.has(label.dataset.city)) label.remove();
        }
    }

    syncMerchantLabels() {
        if (!this.cityLabelOverlay || typeof document.createElement !== 'function') return;

        const anchors = Array.from(this.svg.querySelectorAll('.merchant-label'));
        const labels = Array.from(this.cityLabelOverlay.querySelectorAll('.merchant-label-html'));
        const labelsByMerchant = new Map(labels.map(label => [label.dataset.merchant, label]));
        const activeMerchantIds = new Set();

        for (const anchor of anchors) {
            const merchantId = anchor.getAttribute('data-merchant-label');
            if (!merchantId) continue;
            activeMerchantIds.add(merchantId);

            let label = labelsByMerchant.get(merchantId);
            if (!label) {
                label = document.createElement('span');
                label.className = 'merchant-label-html';
                label.setAttribute('data-merchant', merchantId);
                label.textContent = anchor.textContent;
                this.cityLabelOverlay.appendChild(label);
            }

            this.positionCityLabel(label, anchor);
        }

        for (const label of labels) {
            if (!activeMerchantIds.has(label.dataset.merchant)) label.remove();
        }
    }

    syncBoardLabels() {
        this.syncCityLabels();
        this.syncMerchantLabels();
    }

    formatSvgNumber(value) {
        return Number(value.toFixed(3)).toString();
    }

    getNodeScale() {
        return this.layout?.nodeScale || 1;
    }

    getRouteScale() {
        return this.layout?.routeScale || 1;
    }

    getRouteEndpointClearance() {
        return Math.max(
            this.routeEndpointClearance * this.getNodeScale(),
            this.getMinimumEdgeToNodeGap()
        );
    }

    getMinimumDrawableEdgeLength(layout = this.layout) {
        return 18 * (layout?.routeScale || 1);
    }

    getScaledStrokeWidth(width) {
        return this.formatSvgNumber(width * this.getRouteScale());
    }

    getScaledRadius(radius) {
        return this.formatSvgNumber(radius * this.getRouteScale());
    }

    getCityTitleWidth(city, cityWidth) {
        return Math.max(city.name.length * 6.5 + 12, cityWidth - 4);
    }

    getCityVisualWidth(city, layout = this.getCityLayout(city)) {
        return Math.max(layout.width + 6, this.getCityTitleWidth(city, layout.width));
    }

    getBaseContainerMetrics(locationId, scale = this.getNodeScale()) {
        const city = CITIES[locationId];
        if (city) {
            const layout = this.getCityLayout(city);
            const visualWidth = this.getCityVisualWidth(city, layout);
            return {
                left: (-visualWidth / 2) * scale,
                right: (visualWidth / 2) * scale,
                top: -17 * scale,
                bottom: (-17 + layout.height + 6) * scale,
            };
        }

        const merchant = MERCHANTS[locationId];
        if (merchant) {
            const width = 60;
            const height = 30 + merchant.slots * 12;
            return {
                left: (-width / 2) * scale,
                right: (width / 2) * scale,
                top: -12 * scale,
                bottom: (-12 + height) * scale,
            };
        }

        if (BREWERY_FARMS[locationId]) {
            const builtTileExtent = this.citySlotSize / 2 + 5;
            const extent = Math.max(14, builtTileExtent);
            return {
                left: -extent * scale,
                right: extent * scale,
                top: -extent * scale,
                bottom: extent * scale,
            };
        }

        return null;
    }

    getBoundsForPosition(locationId, position, scale = this.getNodeScale(), expand = 0) {
        const metrics = this.getBaseContainerMetrics(locationId, scale);
        if (!metrics) return null;
        return {
            left: position.x + metrics.left - expand,
            right: position.x + metrics.right + expand,
            top: position.y + metrics.top - expand,
            bottom: position.y + metrics.bottom + expand,
        };
    }

    clampLayoutPosition(locationId, position, layout) {
        const metrics = this.getBaseContainerMetrics(locationId, layout.nodeScale);
        if (!metrics) return position;
        return {
            x: Math.min(layout.width - metrics.right, Math.max(-metrics.left, position.x)),
            y: Math.min(layout.height - metrics.bottom, Math.max(-metrics.top, position.y)),
        };
    }

    getAllLocationIds() {
        return [
            ...Object.keys(CITIES),
            ...Object.keys(MERCHANTS),
            ...Object.keys(BREWERY_FARMS),
        ];
    }

    getResponsiveLayoutContract() {
        return BOARD_GRAPH_SOURCE?.responsive_layout || null;
    }

    getGraphLayoutProfileName(layout = this.layout) {
        const responsive = this.getResponsiveLayoutContract();
        const aspectRatio = (layout?.width || this.baseBoardWidth) / (layout?.height || this.baseBoardHeight);
        if (!responsive) return aspectRatio >= 1.35 ? 'landscape' : 'square';
        const selectors = responsive?.profile_selector || [];

        for (const selector of selectors) {
            const minimum = selector.when?.aspect_ratio_min;
            const maximum = selector.when?.aspect_ratio_max;
            if ((minimum == null || aspectRatio >= minimum) &&
                (maximum == null || aspectRatio <= maximum)) {
                return selector.profile;
            }
        }

        const landscape = selectors.find(selector => selector.when?.aspect_ratio_min != null);
        if (landscape && aspectRatio >= landscape.when.aspect_ratio_min) return landscape.profile;
        return selectors[0]?.profile || Object.keys(responsive?.profiles || {})[0] || 'square';
    }

    getGraphLayoutProfile(layout = this.layout) {
        const responsive = this.getResponsiveLayoutContract();
        const profileName = layout?.profile || this.getGraphLayoutProfileName(layout);
        return responsive?.profiles?.[profileName] || FALLBACK_BOARD_LAYOUT_PROFILES[profileName] || null;
    }

    getGraphLayoutRows(layout = this.layout) {
        const profile = this.getGraphLayoutProfile(layout);
        if (!profile?.ranks) return [];
        return profile.ranks.map(rank => {
            const nodes = Array.isArray(rank) ? rank : rank.nodes;
            return nodes.map(normalizeBoardGraphId);
        });
    }

    getMedianLocationHeight(scale = 1) {
        const heights = this.getAllLocationIds()
            .map(locationId => this.getBaseContainerMetrics(locationId, scale))
            .filter(Boolean)
            .map(metrics => metrics.bottom - metrics.top)
            .sort((a, b) => a - b);
        if (heights.length === 0) return 1;
        const middle = Math.floor(heights.length / 2);
        return heights.length % 2 === 0
            ? (heights[middle - 1] + heights[middle]) / 2
            : heights[middle];
    }

    getLayoutConstraint(name, fallback) {
        const value = this.getResponsiveLayoutContract()?.global_constraints?.[name];
        return Number.isFinite(Number(value)) ? Number(value) : fallback;
    }

    getMinimumNodeGap(layout = this.layout) {
        if (Number.isFinite(layout?.nodeGap)) return layout.nodeGap;
        const profileMultiplier = Math.max(
            1,
            Number(this.getGraphLayoutProfile(layout)?.node_spacing_multiplier) || 1
        );
        const unit = this.getMedianLocationHeight(1) * (layout?.nodeScale || 1);
        return this.getLayoutConstraint('minimum_node_gap', 0.42) * profileMultiplier * unit;
    }

    getMinimumRankGap(layout = this.layout) {
        if (Number.isFinite(layout?.rankGap)) return layout.rankGap;
        const profileMultiplier = Math.max(
            1,
            Number(this.getGraphLayoutProfile(layout)?.rank_spacing_multiplier) || 1
        );
        const unit = this.getMedianLocationHeight(1) * (layout?.nodeScale || 1);
        return this.getLayoutConstraint('minimum_rank_gap', 0.92) * profileMultiplier * unit;
    }

    getMinimumEdgeToNodeGap(layout = this.layout) {
        if (Number.isFinite(layout?.edgeNodeGap)) return layout.edgeNodeGap;
        const unit = this.getMedianLocationHeight(1) * (layout?.nodeScale || 1);
        return this.getLayoutConstraint('minimum_edge_to_node_gap', 0.2) * unit;
    }

    getOuterPadding(layout = this.layout) {
        if (Number.isFinite(layout?.outerPadding)) return layout.outerPadding;
        const unit = this.getMedianLocationHeight(1) * (layout?.nodeScale || 1);
        return this.getLayoutConstraint('outer_padding', 0.45) * unit;
    }

    getFittedNodeScale(layout, desiredScale) {
        const rows = this.getGraphLayoutRows(layout);
        const measurementLayout = { ...layout, nodeScale: 1 };
        const nodeGap = this.getMinimumNodeGap(measurementLayout);
        const rankGap = this.getMinimumRankGap(measurementLayout);
        const outerPadding = this.getOuterPadding(measurementLayout);
        const rowMetrics = rows.map(row => row.map(locationId => this.getBaseContainerMetrics(locationId, 1)));
        const requiredWidth = Math.max(...rowMetrics.map(metrics =>
            metrics.reduce((total, metric) => total + (metric.right - metric.left), 0) +
            Math.max(0, metrics.length - 1) * nodeGap
        ), 1) + outerPadding * 2;
        const requiredHeight = rowMetrics.reduce((total, metrics) =>
            total + Math.max(...metrics.map(metric => metric.bottom - metric.top), 0)
        , 0) + Math.max(0, rowMetrics.length - 1) * rankGap + outerPadding * 2;
        const fittedScale = Math.min(layout.width / requiredWidth, layout.height / requiredHeight);
        return Math.max(0.35, Math.min(desiredScale, fittedScale));
    }

    getGraphLayoutSeed(locationId, layout = this.layout) {
        const rows = this.getGraphLayoutRows(layout);
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const columnIndex = rows[rowIndex].indexOf(locationId);
            if (columnIndex >= 0) {
                return {
                    rowIndex,
                    columnIndex,
                    rowLength: rows[rowIndex].length,
                    rowCount: rows.length,
                };
            }
        }
        return null;
    }

    getProjectedGraphPosition(locationId, layout) {
        const seed = this.getGraphLayoutSeed(locationId, layout);
        if (!seed) return null;
        const innerWidth = layout.width - (layout.marginLeft || 0) - (layout.marginRight || 0);
        const innerHeight = layout.height - (layout.marginTop || 0) - (layout.marginBottom || 0);
        const xRatio = (seed.columnIndex + 0.5) / seed.rowLength;
        const yRatio = (seed.rowIndex + 0.5) / seed.rowCount;
        return {
            x: (layout.marginLeft || 0) + innerWidth * xRatio,
            y: (layout.marginTop || 0) + innerHeight * yRatio,
        };
    }

    createGraphLayoutPositions(layout) {
        const rows = this.getGraphLayoutRows(layout);
        const positions = {};
        const nodeGap = this.getMinimumNodeGap(layout);
        const rankGap = this.getMinimumRankGap(layout);
        const rowMetrics = rows.map(row => row.map(locationId => ({
            locationId,
            metrics: this.getBaseContainerMetrics(locationId, layout.nodeScale),
        })));
        const rowHeights = rowMetrics.map(row => Math.max(
            ...row.map(({ metrics }) => metrics.bottom - metrics.top),
            0
        ));
        const graphHeight = rowHeights.reduce((total, height) => total + height, 0) +
            Math.max(0, rows.length - 1) * rankGap;
        let rowTop = (layout.height - graphHeight) / 2;

        for (let rowIndex = 0; rowIndex < rowMetrics.length; rowIndex++) {
            const row = rowMetrics[rowIndex];
            const rowWidth = row.reduce((total, { metrics }) =>
                total + (metrics.right - metrics.left), 0
            ) + Math.max(0, row.length - 1) * nodeGap;
            let nodeLeft = (layout.width - rowWidth) / 2;

            for (const { locationId, metrics } of row) {
                const nodeHeight = metrics.bottom - metrics.top;
                const nodeTop = rowTop + (rowHeights[rowIndex] - nodeHeight) / 2;
                positions[locationId] = {
                    x: this.formatRouteCoord(nodeLeft - metrics.left),
                    y: this.formatRouteCoord(nodeTop - metrics.top),
                };
                nodeLeft += metrics.right - metrics.left + nodeGap;
            }

            rowTop += rowHeights[rowIndex] + rankGap;
        }
        return positions;
    }

    createGeographicLayoutPositions(layout) {
        const positions = {};
        const innerWidth = Math.max(1, layout.width - layout.outerPadding * 2);
        const innerHeight = Math.max(1, layout.height - layout.outerPadding * 2);

        for (const locationId of this.getAllLocationIds()) {
            const anchor = GEOGRAPHIC_BOARD_ANCHORS[locationId];
            if (!anchor) continue;
            positions[locationId] = this.clampLayoutPosition(locationId, {
                x: layout.outerPadding + anchor.x * innerWidth,
                y: layout.outerPadding + anchor.y * innerHeight,
            }, layout);
        }

        return this.resolveGeographicCollisions(positions, layout);
    }

    resolveGeographicCollisions(positions, layout) {
        const locationIds = this.getAllLocationIds().filter(locationId => positions[locationId]);
        const baseClearance = Math.max(4, this.getMinimumEdgeToNodeGap(layout) * 2);
        const maxIterations = 120;

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            let collisionFound = false;

            for (let firstIndex = 0; firstIndex < locationIds.length; firstIndex++) {
                for (let secondIndex = firstIndex + 1; secondIndex < locationIds.length; secondIndex++) {
                    const firstId = locationIds[firstIndex];
                    const secondId = locationIds[secondIndex];
                    const firstBounds = this.getBoundsForPosition(firstId, positions[firstId], layout.nodeScale);
                    const secondBounds = this.getBoundsForPosition(secondId, positions[secondId], layout.nodeScale);
                    const clearance = baseClearance + (
                        this.locationsShareConnectionSegment(firstId, secondId)
                            ? this.getMinimumDrawableEdgeLength(layout)
                            : 0
                    );
                    const overlapX = Math.min(firstBounds.right, secondBounds.right) -
                        Math.max(firstBounds.left, secondBounds.left) + clearance;
                    const overlapY = Math.min(firstBounds.bottom, secondBounds.bottom) -
                        Math.max(firstBounds.top, secondBounds.top) + clearance;
                    if (overlapX <= 0 || overlapY <= 0) continue;

                    collisionFound = true;
                    const axis = overlapX < overlapY ? 'x' : 'y';
                    const amount = (axis === 'x' ? overlapX : overlapY) / 2 + 0.01;
                    const delta = positions[secondId][axis] - positions[firstId][axis];
                    const anchorDelta = GEOGRAPHIC_BOARD_ANCHORS[secondId][axis] -
                        GEOGRAPHIC_BOARD_ANCHORS[firstId][axis];
                    const direction = Math.sign(delta || anchorDelta || 1);

                    positions[firstId][axis] -= amount * direction;
                    positions[secondId][axis] += amount * direction;
                    positions[firstId] = this.clampLayoutPosition(firstId, positions[firstId], layout);
                    positions[secondId] = this.clampLayoutPosition(secondId, positions[secondId], layout);
                }
            }

            if (!collisionFound) break;
        }

        for (const locationId of locationIds) {
            positions[locationId] = {
                x: this.formatRouteCoord(positions[locationId].x),
                y: this.formatRouteCoord(positions[locationId].y),
            };
        }
        return positions;
    }

    locationsShareConnectionSegment(firstId, secondId) {
        return CONNECTIONS.some(connection => {
            const path = [connection.cities[0]];
            if (connection.viaBrewery) path.push(connection.viaBrewery);
            path.push(connection.cities[1]);
            return path.some((locationId, index) => index > 0 && (
                (path[index - 1] === firstId && locationId === secondId) ||
                (path[index - 1] === secondId && locationId === firstId)
            ));
        });
    }

    getLayoutPoint(point) {
        return {
            x: this.formatRouteCoord((this.layout?.marginLeft || 0) + point.x * (this.layout?.xScale || 1)),
            y: this.formatRouteCoord((this.layout?.marginTop || 0) + point.y * (this.layout?.yScale || 1)),
        };
    }

    getLayoutPosition(locationId) {
        if (this.layout?.positions?.[locationId]) return this.layout.positions[locationId];
        const base = getLocationPosition(locationId);
        return base ? this.getLayoutPoint(base) : null;
    }

    getLocationTransform(locationId) {
        const position = this.getLayoutPosition(locationId);
        if (!position) return '';
        const translate = `translate(${position.x}, ${position.y})`;
        const scale = this.getNodeScale();
        return scale === 1 ? translate : `${translate} scale(${this.formatSvgNumber(scale)})`;
    }

    shadeHexColor(hex, amount) {
        const match = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        if (!match) return hex;

        const target = amount < 0 ? 0 : 255;
        const weight = Math.abs(amount);
        const channels = match[1].match(/.{2}/g).map(part => {
            const value = parseInt(part, 16);
            const shaded = Math.round(value + (target - value) * weight);
            return Math.max(0, Math.min(255, shaded)).toString(16).padStart(2, '0');
        });

        return `#${channels.join('')}`;
    }

    getPlayerTilePalette(playerColor) {
        return {
            builtFill: this.shadeHexColor(playerColor, -0.26),
            builtStroke: this.shadeHexColor(playerColor, 0.18),
            flippedFill: this.shadeHexColor(playerColor, 0.38),
            flippedStroke: this.shadeHexColor(playerColor, -0.18),
            flippedText: '#211714',
        };
    }

    drawBottomRightTileBadge(parent, cx, cy, value) {
        parent.appendChild(this.createElement('circle', {
            cx, cy, r: 6,
            fill: '#c9a84c',
            stroke: '#8a6020',
            'stroke-width': 1,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
        }));

        const text = this.createElement('text', {
            x: cx, y: cy + 3,
            'text-anchor': 'middle',
            'font-size': '7',
            fill: '#1a1510',
            'font-weight': '800',
        });
        text.textContent = value;
        parent.appendChild(text);
    }

    // ========================================================================
    // SVG Industry Icons
    // ========================================================================

    getIndustryArtworkHref(type) {
        const artwork = {
            [INDUSTRY_TYPES.COTTON_MILL]: 'assets/icons/cotton.png',
            [INDUSTRY_TYPES.COAL_MINE]: 'assets/icons/coal.png',
            [INDUSTRY_TYPES.IRON_WORKS]: 'assets/icons/iron.png',
            [INDUSTRY_TYPES.MANUFACTURER]: 'assets/icons/manufactured-goods.png',
            [INDUSTRY_TYPES.POTTERY]: 'assets/icons/pottery.png',
            [INDUSTRY_TYPES.BREWERY]: 'assets/icons/beer-barrel.png',
        };
        return artwork[type] || null;
    }

    drawIconBackdrop(parent, size, context = 'slot') {
        const plateSize = size + (size >= this.singleSlotIconSize ? 4 : 1);
        const halfPlate = plateSize / 2;
        const opacityByContext = {
            slot: '0.94',
            built: '0.9',
            flipped: '0.68',
        };
        const strokeByContext = {
            slot: '#f5d78f',
            built: 'rgba(255,255,255,0.78)',
            flipped: 'rgba(255,255,255,0.55)',
        };

        parent.appendChild(this.createElement('rect', {
            x: -halfPlate,
            y: -halfPlate,
            width: plateSize,
            height: plateSize,
            rx: Math.max(3, size * 0.22),
            ry: Math.max(3, size * 0.22),
            fill: '#ead8b0',
            opacity: opacityByContext[context] || opacityByContext.slot,
            stroke: strokeByContext[context] || strokeByContext.slot,
            'stroke-width': Math.max(0.8, size * 0.07),
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.65))',
            class: 'icon-visibility-plate',
            'data-icon-context': context,
        }));
    }

    getIndustryIcon(type, size = 14, options = {}) {
        const g = this.createGroup();
        const half = size / 2;
        const s = size;
        const outline = '#101010';
        const strokeWidth = Math.max(0.7, size / 18);
        const iconContext = options.context || 'slot';

        g.setAttribute('data-product-icon', type);
        g.setAttribute('data-icon-context', iconContext);

        const artworkHref = this.getIndustryArtworkHref(type);
        if (artworkHref) {
            g.setAttribute('data-icon-source', 'uploaded-artwork');
            this.drawIconBackdrop(g, size, iconContext);
            g.appendChild(this.createElement('image', {
                href: artworkHref,
                x: -half,
                y: -half,
                width: size,
                height: size,
                preserveAspectRatio: 'xMidYMid meet',
            }));
            return g;
        }

        switch (type) {
            case INDUSTRY_TYPES.COTTON_MILL: {
                // Cotton bolls with brown bracts.
                for (const bract of [
                    `M${-half+2},${half-1} Q${-half+3},${1} ${-2},${1.6} Q${-3},${half-1} ${-half+2},${half-1} Z`,
                    `M${half-2},${half-1} Q${half-3},${1} ${2},${1.6} Q${3},${half-1} ${half-2},${half-1} Z`,
                    `M${-1.2},${half-1} Q${0},${1.4} ${1.2},${half-1} Z`,
                ]) {
                    g.appendChild(this.createElement('path', {
                        d: bract,
                        fill: '#8a5a22',
                        stroke: '#3f260d',
                        'stroke-width': strokeWidth,
                    }));
                }
                for (const boll of [
                    { cx: -3.2, cy: -0.4, r: half * 0.42 },
                    { cx: 2.7, cy: -0.7, r: half * 0.44 },
                    { cx: 0, cy: 2.2, r: half * 0.46 },
                    { cx: 0.2, cy: -3.6, r: half * 0.43 },
                ]) {
                    g.appendChild(this.createElement('circle', {
                        cx: boll.cx, cy: boll.cy, r: boll.r,
                        fill: '#f5ecd2',
                        stroke: outline,
                        'stroke-width': strokeWidth,
                    }));
                    g.appendChild(this.createElement('path', {
                        d: `M${boll.cx - boll.r * 0.45},${boll.cy - boll.r * 0.1} Q${boll.cx},${boll.cy - boll.r * 0.45} ${boll.cx + boll.r * 0.45},${boll.cy - boll.r * 0.08}`,
                        fill: 'none',
                        stroke: '#fff9e9',
                        'stroke-width': strokeWidth * 0.7,
                        'stroke-linecap': 'round',
                    }));
                }
                break;
            }
            case INDUSTRY_TYPES.COAL_MINE: {
                // Faceted coal pile.
                const rocks = [
                    { d: `M${-half+1},${2} L${-4.8},${-1.2} L${-1.8},${0.2} L${-2.8},${half-1} Z`, f: '#25262b' },
                    { d: `M${-4.8},${-1.2} L${-3.7},${-4.3} L${-0.8},${-3.2} L${-1.8},${0.2} Z`, f: '#34363d' },
                    { d: `M${-1.8},${0.2} L${-0.8},${-3.2} L${2.8},${-1.3} L${2.2},${2.8} Z`, f: '#2f3036' },
                    { d: `M${2.8},${-1.3} L${5.4},${0.4} L${half-1},${3.3} L${2.2},${2.8} Z`, f: '#24252a' },
                    { d: `M${-3.2},${half-1} L${2.2},${2.8} L${half-1},${3.3} L${4.2},${half-0.8} L${-5.2},${half-0.6} Z`, f: '#191a1e' },
                    { d: `M${-1.8},${0.2} L${0.2},${-1.7} L${2.8},${-1.3} L${2.2},${2.8} Z`, f: '#3f4148' },
                    { d: `M${-4.2},${-2.4} L${-2.8},${-3.6} L${-1.6},${-2.8}`, f: 'none', h: true },
                    { d: `M${0},${-2.4} L${2},${-1.6} L${1.1},${0.5}`, f: 'none', h: true },
                    { d: `M${3.2},${0.1} L${5.1},${0.8}`, f: 'none', h: true },
                ];
                for (const rock of rocks) {
                    g.appendChild(this.createElement('path', {
                        d: rock.d,
                        fill: rock.f,
                        stroke: rock.h ? '#75777b' : outline,
                        'stroke-width': rock.h ? strokeWidth * 0.8 : strokeWidth,
                        'stroke-linecap': 'round',
                        'stroke-linejoin': 'round',
                    }));
                }
                break;
            }
            case INDUSTRY_TYPES.IRON_WORKS: {
                // Stacked iron ingots.
                const ingots = [
                    { x: -5.2, y: 1.4, w: 6.4, h: 3.8 },
                    { x: -0.2, y: 1.3, w: 7.2, h: 4.2 },
                    { x: -2.4, y: -3.6, w: 8.2, h: 4.4 },
                ];
                for (const ingot of ingots) {
                    const x = ingot.x;
                    const y = ingot.y;
                    const w = ingot.w;
                    const h = ingot.h;
                    g.appendChild(this.createElement('path', {
                        d: `M${x},${y} L${x + w * 0.18},${y - h * 0.45} L${x + w},${y - h * 0.22} L${x + w * 0.86},${y + h * 0.72} L${x + w * 0.08},${y + h} Z`,
                        fill: '#7f7669',
                        stroke: outline,
                        'stroke-width': strokeWidth,
                        'stroke-linejoin': 'round',
                    }));
                    g.appendChild(this.createElement('path', {
                        d: `M${x + w * 0.18},${y - h * 0.45} L${x + w},${y - h * 0.22} L${x + w * 0.86},${y + h * 0.12} L${x + w * 0.08},${y + h * 0.02} Z`,
                        fill: '#a49b8e',
                        stroke: '#c9bda8',
                        'stroke-width': strokeWidth * 0.65,
                        'stroke-linejoin': 'round',
                    }));
                }
                break;
            }
            case INDUSTRY_TYPES.MANUFACTURER: {
                // Crate of manufactured goods.
                g.appendChild(this.createElement('path', {
                    d: `M${-half+1},${-1.8} L${-1},${-half+1.2} L${half-1},${-2} L${half-1.2},${half-1.2} L${0},${half-0.2} L${-half+1.2},${half-1.4} Z`,
                    fill: '#8a4f21',
                    stroke: outline,
                    'stroke-width': strokeWidth,
                    'stroke-linejoin': 'round',
                }));
                for (const plank of [
                    `M${-half+1.4},${-0.8} L${0},${0.4} L${half-1.2},${-0.9}`,
                    `M${-half+1.5},${1.9} L${0},${3.1} L${half-1.3},${1.7}`,
                    `M${-1},${-half+1.2} L${0},${half-0.2}`,
                    `M${half-1},${-2} L${0},${half-0.2}`,
                ]) {
                    g.appendChild(this.createElement('path', {
                        d: plank,
                        fill: 'none',
                        stroke: '#d49a3a',
                        'stroke-width': strokeWidth * 0.8,
                        'stroke-linecap': 'round',
                    }));
                }
                for (const gear of [
                    { cx: -1.7, cy: -0.9, r: 2.2 },
                    { cx: 3.3, cy: -0.5, r: 1.9 },
                ]) {
                    g.appendChild(this.createElement('circle', {
                        cx: gear.cx, cy: gear.cy, r: gear.r,
                        fill: '#5e5344',
                        stroke: outline,
                        'stroke-width': strokeWidth,
                    }));
                    g.appendChild(this.createElement('circle', {
                        cx: gear.cx, cy: gear.cy, r: gear.r * 0.35,
                        fill: '#1d1b18',
                        stroke: '#d49a3a',
                        'stroke-width': strokeWidth * 0.45,
                    }));
                }
                for (const part of [
                    `M${-4.6},${-3.1} L${-3.2},${-4.2} L${-2.1},${-3.1} L${-3.5},${-2.1} Z`,
                    `M${1.3},${-4.6} L${2.2},${-5.5} L${4.2},${-2.8} L${3.1},${-2.1} Z`,
                    `M${3.8},${1.2} Q${5.1},${1.2} ${5.2},${2.4} L${4.1},${3.1} Q${3.4},${2.4} ${3.8},${1.2} Z`,
                ]) {
                    g.appendChild(this.createElement('path', {
                        d: part,
                        fill: '#d49a3a',
                        stroke: '#3b2410',
                        'stroke-width': strokeWidth * 0.75,
                        'stroke-linejoin': 'round',
                    }));
                }
                break;
            }
            case INDUSTRY_TYPES.POTTERY: {
                // Decorated ceramic vase.
                g.appendChild(this.createElement('path', {
                    d: `M${-3.4},${-4.1} Q${-2.6},${-1.8} ${-4.8},${0.8} Q${-6.1},${3.6} ${-2.8},${half-1} L${2.8},${half-1} Q${6.1},${3.6} ${4.8},${0.8} Q${2.6},${-1.8} ${3.4},${-4.1} Z`,
                    fill: '#e7d4ab',
                    stroke: outline,
                    'stroke-width': strokeWidth,
                    'stroke-linejoin': 'round',
                }));
                g.appendChild(this.createElement('ellipse', {
                    cx: 0, cy: -4.4, rx: 4.2, ry: 1.35,
                    fill: '#9f7d4f',
                    stroke: outline,
                    'stroke-width': strokeWidth,
                }));
                g.appendChild(this.createElement('ellipse', {
                    cx: 0, cy: -4.5, rx: 2.9, ry: 0.75,
                    fill: '#2a1b12',
                    stroke: '#c9a46e',
                    'stroke-width': strokeWidth * 0.55,
                }));
                for (const bandY of [-2.1, 3.1]) {
                    g.appendChild(this.createElement('path', {
                        d: `M${-4.1},${bandY} Q${0},${bandY + 0.9} ${4.1},${bandY}`,
                        fill: 'none',
                        stroke: '#244a66',
                        'stroke-width': strokeWidth,
                        'stroke-linecap': 'round',
                    }));
                }
                for (const flourish of [
                    `M${-3.1},${1.4} Q${-1.8},${-0.1} ${-0.6},${1.5} Q${-1.9},${1.6} ${-2.4},${2.6}`,
                    `M${3.1},${1.4} Q${1.8},${-0.1} ${0.6},${1.5} Q${1.9},${1.6} ${2.4},${2.6}`,
                    `M${0},${0.6} Q${0.9},${2.1} ${0},${3.1} Q${-0.9},${2.1} ${0},${0.6} Z`,
                ]) {
                    g.appendChild(this.createElement('path', {
                        d: flourish,
                        fill: flourish.endsWith('Z') ? '#244a66' : 'none',
                        stroke: '#244a66',
                        'stroke-width': strokeWidth * 0.8,
                        'stroke-linecap': 'round',
                        'stroke-linejoin': 'round',
                    }));
                }
                g.appendChild(this.createElement('path', {
                    d: `M${-2.8},${half-1} Q${0},${half-0.2} ${2.8},${half-1}`,
                    fill: 'none',
                    stroke: '#80623c',
                    'stroke-width': strokeWidth,
                    'stroke-linecap': 'round',
                }));
                break;
            }
            case INDUSTRY_TYPES.BREWERY: {
                // Tapped beer barrel.
                g.appendChild(this.createElement('path', {
                    d: `M${-half+1.1},${-3.1} Q${0},${-half+1} ${half-1.1},${-3.1} L${half-1.2},${3.1} Q${0},${half-0.8} ${-half+1.2},${3.1} Z`,
                    fill: '#9a5b24',
                    stroke: outline,
                    'stroke-width': strokeWidth,
                    'stroke-linejoin': 'round',
                }));
                g.appendChild(this.createElement('ellipse', {
                    cx: 0, cy: -3.1, rx: half - 1.2, ry: 2.5,
                    fill: '#bd7830',
                    stroke: outline,
                    'stroke-width': strokeWidth,
                }));
                g.appendChild(this.createElement('ellipse', {
                    cx: 0, cy: 3.1, rx: half - 1.2, ry: 2.3,
                    fill: '#6f3f1c',
                    stroke: outline,
                    'stroke-width': strokeWidth,
                }));
                for (const bandX of [-3.4, 3.4]) {
                    g.appendChild(this.createElement('path', {
                        d: `M${bandX},${-4.7} Q${bandX * 1.12},${0} ${bandX},${4.7}`,
                        fill: 'none',
                        stroke: '#2a2118',
                        'stroke-width': strokeWidth * 1.45,
                        'stroke-linecap': 'round',
                    }));
                    g.appendChild(this.createElement('path', {
                        d: `M${bandX - Math.sign(bandX) * 0.25},${-4.2} Q${bandX * 1.02},${0} ${bandX - Math.sign(bandX) * 0.25},${4.2}`,
                        fill: 'none',
                        stroke: '#74614b',
                        'stroke-width': strokeWidth * 0.45,
                        'stroke-linecap': 'round',
                    }));
                }
                for (const plankX of [-1.7, 0, 1.7]) {
                    g.appendChild(this.createElement('path', {
                        d: `M${plankX},${-5.1} Q${plankX + 0.5},${0} ${plankX},${5.1}`,
                        fill: 'none',
                        stroke: '#4d2d15',
                        'stroke-width': strokeWidth * 0.55,
                        'stroke-linecap': 'round',
                    }));
                }
                g.appendChild(this.createElement('path', {
                    d: `M${-2.8},${1.2} H${1.1} Q${2.6},${1.2} ${2.6},${2.6} Q${2.6},${3.6} ${1.5},${3.8}`,
                    fill: 'none',
                    stroke: '#d39a2f',
                    'stroke-width': strokeWidth * 1.4,
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                }));
                g.appendChild(this.createElement('path', {
                    d: `M${-2.9},${0.4} V${2.2} M${-4.1},${0.4} H${-1.7}`,
                    fill: 'none',
                    stroke: '#f4d07a',
                    'stroke-width': strokeWidth,
                    'stroke-linecap': 'round',
                }));
                break;
            }
            default: {
                g.appendChild(this.createElement('circle', {
                    cx: 0, cy: 0, r: half - 2,
                    fill: 'rgba(255,255,255,0.3)',
                }));
            }
        }
        return g;
    }

    // ========================================================================
    // Background with atmospheric texture
    // ========================================================================

    drawBackground() {
        const defs = this.createElement('defs');

        // Parchment noise texture filter
        const noiseFilter = this.createElement('filter', {
            id: 'parchmentNoise', x: '0%', y: '0%', width: '100%', height: '100%'
        });
        const turbulence = this.createElement('feTurbulence', {
            type: 'fractalNoise',
            baseFrequency: '0.65',
            numOctaves: '4',
            stitchTiles: 'stitch',
            result: 'noise',
        });
        noiseFilter.appendChild(turbulence);
        const colorMatrix = this.createElement('feColorMatrix', {
            type: 'saturate', values: '0', in: 'noise', result: 'grayNoise',
        });
        noiseFilter.appendChild(colorMatrix);
        const blend = this.createElement('feBlend', {
            in: 'SourceGraphic', in2: 'grayNoise', mode: 'multiply',
        });
        noiseFilter.appendChild(blend);
        defs.appendChild(noiseFilter);

        // Vignette filter
        const vignetteFilter = this.createElement('filter', {
            id: 'vignette', x: '-10%', y: '-10%', width: '120%', height: '120%',
        });
        const floodVig = this.createElement('feFlood', {
            'flood-color': 'black', 'flood-opacity': '0.4', result: 'flood',
        });
        vignetteFilter.appendChild(floodVig);
        const vigComp = this.createElement('feComposite', {
            in: 'flood', in2: 'SourceGraphic', operator: 'in', result: 'mask',
        });
        vignetteFilter.appendChild(vigComp);
        const vigGauss = this.createElement('feGaussianBlur', {
            in: 'mask', stdDeviation: '80', result: 'blurred',
        });
        vignetteFilter.appendChild(vigGauss);
        const vigBlend = this.createElement('feBlend', {
            in: 'SourceGraphic', in2: 'blurred', mode: 'multiply',
        });
        vignetteFilter.appendChild(vigBlend);
        defs.appendChild(vignetteFilter);

        // Inner shadow for city depth
        const innerShadow = this.createElement('filter', {
            id: 'innerShadow', x: '-10%', y: '-10%', width: '120%', height: '120%',
        });
        innerShadow.appendChild(this.createElement('feGaussianBlur', {
            in: 'SourceAlpha', stdDeviation: '2', result: 'blur',
        }));
        innerShadow.appendChild(this.createElement('feOffset', {
            dx: '0', dy: '1', result: 'offsetBlur',
        }));
        const isFlood = this.createElement('feFlood', {
            'flood-color': 'black', 'flood-opacity': '0.4', result: 'color',
        });
        innerShadow.appendChild(isFlood);
        innerShadow.appendChild(this.createElement('feComposite', {
            in: 'color', in2: 'offsetBlur', operator: 'in', result: 'shadow',
        }));
        innerShadow.appendChild(this.createElement('feComposite', {
            in: 'shadow', in2: 'SourceGraphic', operator: 'over',
        }));
        defs.appendChild(innerShadow);

        // Background gradient - warm sepia/parchment aged map tones
        const bgGrad = this.createElement('radialGradient', { id: 'boardBg', cx: '50%', cy: '45%', r: '70%' });
        bgGrad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#4a3f2a' }));
        bgGrad.appendChild(this.createElement('stop', { offset: '55%', 'stop-color': '#38321e' }));
        bgGrad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#26220e' }));
        defs.appendChild(bgGrad);

        // Flipped tile gradient (green-tinted for sold/depleted)
        const tileFlipped = this.createElement('linearGradient', { id: 'tileFlippedBg', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
        tileFlipped.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#2a4a2a' }));
        tileFlipped.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#1a3a1a' }));
        defs.appendChild(tileFlipped);

        // Glow filter for built tiles
        const glowFilter = this.createElement('filter', {
            id: 'tileGlow', x: '-30%', y: '-30%', width: '160%', height: '160%',
        });
        glowFilter.appendChild(this.createElement('feGaussianBlur', {
            in: 'SourceGraphic', stdDeviation: '2.5', result: 'coloredBlur',
        }));
        const glowMerge = this.createElement('feMerge');
        glowMerge.appendChild(this.createElement('feMergeNode', { in: 'coloredBlur' }));
        glowMerge.appendChild(this.createElement('feMergeNode', { in: 'SourceGraphic' }));
        glowFilter.appendChild(glowMerge);
        defs.appendChild(glowFilter);

        // Region background patterns — richer contrast
        for (const [regionId, colors] of Object.entries(REGION_COLORS)) {
            const grad = this.createElement('radialGradient', { id: `region_${regionId}`, cx: '50%', cy: '50%', r: '60%' });
            grad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': colors.fill, 'stop-opacity': '0.38' }));
            grad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': colors.fill, 'stop-opacity': '0.12' }));
            defs.appendChild(grad);
        }

        this.svg.appendChild(defs);

        // Main board rect with texture
        const bgGroup = this.createGroup({ filter: 'url(#parchmentNoise)' });
        bgGroup.appendChild(this.createElement('rect', {
            x: 0, y: 0, width: this.layout.width, height: this.layout.height,
            fill: 'url(#boardBg)',
            rx: 8, ry: 8,
        }));
        this.svg.appendChild(bgGroup);

        // Vignette overlay
        this.svg.appendChild(this.createElement('rect', {
            x: 0, y: 0, width: this.layout.width, height: this.layout.height,
            fill: 'url(#boardBg)',
            rx: 8, ry: 8,
            opacity: '0.3',
            filter: 'url(#vignette)',
        }));

        // Decorative double-border frame
        this.svg.appendChild(this.createElement('rect', {
            x: 4, y: 4, width: Math.max(0, this.layout.width - 8), height: Math.max(0, this.layout.height - 8),
            fill: 'none',
            stroke: '#5a4a38',
            'stroke-width': 1,
            rx: 7, ry: 7,
        }));
        this.svg.appendChild(this.createElement('rect', {
            x: 8, y: 8, width: Math.max(0, this.layout.width - 16), height: Math.max(0, this.layout.height - 16),
            fill: 'none',
            stroke: '#3a2c20',
            'stroke-width': 0.5,
            rx: 5, ry: 5,
        }));

        // Title
        const titleGroup = this.createGroup({ transform: `translate(${this.layout.width / 2}, ${this.layout.height - 20})` });
        const titleText = this.createElement('text', {
            'text-anchor': 'middle',
            'font-family': 'Cinzel, serif',
            'font-size': '12',
            fill: '#6a5a48',
            'letter-spacing': '4',
        });
        titleText.textContent = 'BRASS: BIRMINGHAM';
        titleGroup.appendChild(titleText);
        this.svg.appendChild(titleGroup);
    }

    // ========================================================================
    // Connections with enhanced canal/rail styling
    // ========================================================================

    resolveRoutePoint(point) {
        if (point.location) {
            const base = getLocationPosition(point.location);
            if (!base) return null;
            return {
                x: base.x + (point.dx || 0),
                y: base.y + (point.dy || 0),
            };
        }

        return { x: point.x, y: point.y };
    }

    getCityLayout(city) {
        const slotsPerRow = Math.min(city.slots.length, 4);
        const rows = Math.ceil(city.slots.length / slotsPerRow);
        return {
            slotsPerRow,
            rows,
            width: slotsPerRow * this.citySlotSize + (slotsPerRow - 1) * this.citySlotGap + this.cityPadding * 2,
            height: rows * this.citySlotSize + (rows - 1) * this.citySlotGap + 26 + this.cityPadding,
        };
    }

    getLocationContainerBounds(locationId, expand = 0) {
        const position = this.getLayoutPosition(locationId);
        if (!position) return null;

        return this.getBoundsForPosition(locationId, position, this.getNodeScale(), expand);
    }

    isPointInsideBounds(point, bounds) {
        return point.x > bounds.left &&
            point.x < bounds.right &&
            point.y > bounds.top &&
            point.y < bounds.bottom;
    }

    clipPointToBoundsExit(point, toward, bounds) {
        if (!this.isPointInsideBounds(point, bounds)) return point;

        const dx = toward.x - point.x;
        const dy = toward.y - point.y;
        const candidates = [];

        const addCandidate = (t) => {
            if (t < 0 || t > 1) return;
            const x = point.x + dx * t;
            const y = point.y + dy * t;
            if (x >= bounds.left - 0.001 && x <= bounds.right + 0.001 &&
                y >= bounds.top - 0.001 && y <= bounds.bottom + 0.001) {
                candidates.push({ t, x, y });
            }
        };

        if (dx < 0) addCandidate((bounds.left - point.x) / dx);
        if (dx > 0) addCandidate((bounds.right - point.x) / dx);
        if (dy < 0) addCandidate((bounds.top - point.y) / dy);
        if (dy > 0) addCandidate((bounds.bottom - point.y) / dy);

        candidates.sort((a, b) => a.t - b.t);
        const exit = candidates[0];
        return exit ? { x: exit.x, y: exit.y } : point;
    }

    isPointInsideOrOnBounds(point, bounds) {
        return point.x >= bounds.left &&
            point.x <= bounds.right &&
            point.y >= bounds.top &&
            point.y <= bounds.bottom;
    }

    pointOnSegment(a, b, c) {
        return b.x <= Math.max(a.x, c.x) + 0.001 &&
            b.x + 0.001 >= Math.min(a.x, c.x) &&
            b.y <= Math.max(a.y, c.y) + 0.001 &&
            b.y + 0.001 >= Math.min(a.y, c.y);
    }

    segmentOrientation(a, b, c) {
        const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
        if (Math.abs(value) < 0.001) return 0;
        return value > 0 ? 1 : 2;
    }

    segmentsIntersect(a, b, c, d) {
        const o1 = this.segmentOrientation(a, b, c);
        const o2 = this.segmentOrientation(a, b, d);
        const o3 = this.segmentOrientation(c, d, a);
        const o4 = this.segmentOrientation(c, d, b);

        if (o1 !== o2 && o3 !== o4) return true;
        if (o1 === 0 && this.pointOnSegment(a, c, b)) return true;
        if (o2 === 0 && this.pointOnSegment(a, d, b)) return true;
        if (o3 === 0 && this.pointOnSegment(c, a, d)) return true;
        if (o4 === 0 && this.pointOnSegment(c, b, d)) return true;
        return false;
    }

    segmentIntersectsBounds(start, end, bounds) {
        if (this.isPointInsideOrOnBounds(start, bounds) || this.isPointInsideOrOnBounds(end, bounds)) return true;

        const corners = [
            { x: bounds.left, y: bounds.top },
            { x: bounds.right, y: bounds.top },
            { x: bounds.right, y: bounds.bottom },
            { x: bounds.left, y: bounds.bottom },
        ];
        return corners.some((corner, index) =>
            this.segmentsIntersect(start, end, corner, corners[(index + 1) % corners.length])
        );
    }

    getFullscreenRouteObstacles(conn) {
        const endpointIds = new Set(conn.cities);
        if (conn.viaBrewery) endpointIds.add(conn.viaBrewery);
        const clearance = Math.max(
            4 * this.getRouteScale(),
            this.getMinimumEdgeToNodeGap() / 2
        );
        return [
            ...Object.keys(CITIES),
            ...Object.keys(MERCHANTS),
            ...Object.keys(BREWERY_FARMS),
        ]
            .filter(locationId => !endpointIds.has(locationId))
            .map(locationId => ({
                locationId,
                bounds: this.getLocationContainerBounds(locationId, clearance),
            }))
            .filter(obstacle => obstacle.bounds);
    }

    getDetourOptionsAroundBounds(start, end, bounds) {
        const margin = 10 * this.getRouteScale();
        return [
            [
                { x: start.x, y: bounds.top - margin },
                { x: end.x, y: bounds.top - margin },
            ],
            [
                { x: start.x, y: bounds.bottom + margin },
                { x: end.x, y: bounds.bottom + margin },
            ],
            [
                { x: bounds.left - margin, y: start.y },
                { x: bounds.left - margin, y: end.y },
            ],
            [
                { x: bounds.right + margin, y: start.y },
                { x: bounds.right + margin, y: end.y },
            ],
        ];
    }

    countRouteObstacleIntersections(points, obstacles) {
        let count = 0;
        for (let i = 0; i < points.length - 1; i++) {
            for (const { bounds } of obstacles) {
                if (this.segmentIntersectsBounds(points[i], points[i + 1], bounds)) count++;
            }
        }
        return count;
    }

    getConnectionRouteLaneOffset(conn) {
        let hash = 0;
        for (const character of conn.id) {
            hash = ((hash * 31) + character.charCodeAt(0)) & 0x7fffffff;
        }
        return (hash % 5) * 4 * this.getRouteScale();
    }

    getRouteAvoidanceCandidatePoints(start, end, obstacles, laneOffset = 0) {
        const margin = Math.max(0.5, 0.5 * this.getRouteScale()) + laneOffset;
        const clamp = point => ({
            x: Math.min(this.layout.width, Math.max(0, point.x)),
            y: Math.min(this.layout.height, Math.max(0, point.y)),
        });

        const points = [start, end];
        for (const { bounds } of obstacles) {
            points.push(
                clamp({ x: bounds.left - margin, y: bounds.top - margin }),
                clamp({ x: bounds.right + margin, y: bounds.top - margin }),
                clamp({ x: bounds.right + margin, y: bounds.bottom + margin }),
                clamp({ x: bounds.left - margin, y: bounds.bottom + margin })
            );
        }

        const seen = new Set();
        return points.filter((point, index) => {
            const key = `${this.formatRouteCoord(point.x)},${this.formatRouteCoord(point.y)}`;
            if (index < 2) {
                seen.add(key);
                return true;
            }
            if (seen.has(key)) return false;
            seen.add(key);
            return !obstacles.some(({ bounds }) => this.isPointInsideOrOnBounds(point, bounds));
        });
    }

    findFullscreenRouteSegment(start, end, obstacles, laneOffset = 0) {
        if (this.countRouteObstacleIntersections([start, end], obstacles) === 0) {
            return [start, end];
        }

        const points = this.getRouteAvoidanceCandidatePoints(start, end, obstacles, laneOffset);
        const distances = new Array(points.length).fill(Infinity);
        const previous = new Array(points.length).fill(-1);
        const visited = new Set();
        distances[0] = 0;

        const canConnect = (a, b) => this.countRouteObstacleIntersections([a, b], obstacles) === 0;

        while (visited.size < points.length) {
            let current = -1;
            let bestDistance = Infinity;
            for (let i = 0; i < points.length; i++) {
                if (!visited.has(i) && distances[i] < bestDistance) {
                    current = i;
                    bestDistance = distances[i];
                }
            }
            if (current === -1 || current === 1) break;

            visited.add(current);
            for (let next = 0; next < points.length; next++) {
                if (next === current || visited.has(next)) continue;
                if (!canConnect(points[current], points[next])) continue;
                const distance = Math.hypot(points[next].x - points[current].x, points[next].y - points[current].y);
                const candidate = distances[current] + distance;
                if (candidate < distances[next]) {
                    distances[next] = candidate;
                    previous[next] = current;
                }
            }
        }

        if (!Number.isFinite(distances[1])) return [start, end];

        const route = [];
        for (let index = 1; index !== -1; index = previous[index]) {
            route.push(points[index]);
            if (index === 0) break;
        }
        return route.reverse();
    }

    avoidFullscreenRouteObstacles(points, conn) {
        if (points.length < 2) return points;

        const obstacles = this.getFullscreenRouteObstacles(conn);
        const laneOffset = this.getConnectionRouteLaneOffset(conn);
        const routed = [points[0]];
        for (let i = 0; i < points.length - 1; i++) {
            const segment = this.findFullscreenRouteSegment(points[i], points[i + 1], obstacles, laneOffset);
            routed.push(...segment.slice(1));
        }
        return routed;
    }

    getBaseConnectionRoutePoints(conn) {
        if (conn.routePoints) {
            return conn.routePoints
                .map(point => this.resolveRoutePoint(point))
                .filter(Boolean);
        }
        return [];
    }

    getConnectionRoutePoints(conn) {
        if (!conn.routePoints) {
            const start = this.getLayoutPosition(conn.cities[0]);
            const end = this.getLayoutPosition(conn.cities[1]);
            if (!start || !end) return [];
            const points = [{ ...start }];
            if (conn.viaBrewery) {
                const brewery = this.getLayoutPosition(conn.viaBrewery);
                if (brewery) points.push({ ...brewery });
            }
            points.push({ ...end });
            return points;
        }

        const points = this.getBaseConnectionRoutePoints(conn).map(point => this.getLayoutPoint(point));
        if (points.length === 0) return points;

        const start = this.getLayoutPosition(conn.cities[0]);
        const end = this.getLayoutPosition(conn.cities[1]);
        if (start) points[0] = { ...start };
        if (end) points[points.length - 1] = { ...end };
        if (conn.viaBrewery && !conn.routePoints && points.length > 2) {
            const brewery = this.getLayoutPosition(conn.viaBrewery);
            if (brewery) points[1] = { ...brewery };
        }
        return points;
    }

    getDrawableConnectionRoutePoints(conn) {
        const points = this.getConnectionRoutePoints(conn).map(point => ({ ...point }));
        const unclippedPoints = points.map(point => ({ ...point }));
        if (points.length < 2) return points;

        const firstBounds = this.getLocationContainerBounds(conn.cities[0], this.getRouteEndpointClearance());
        if (firstBounds && this.isPointInsideBounds(points[0], firstBounds)) {
            let outsideIndex = 1;
            while (outsideIndex < points.length - 1 && this.isPointInsideBounds(points[outsideIndex], firstBounds)) {
                outsideIndex++;
            }
            points[0] = this.clipPointToBoundsExit(points[0], points[outsideIndex], firstBounds);
            points.splice(1, outsideIndex - 1);
        }

        const lastBounds = this.getLocationContainerBounds(conn.cities[1], this.getRouteEndpointClearance());
        if (lastBounds && this.isPointInsideBounds(points[points.length - 1], lastBounds)) {
            const lastIndex = points.length - 1;
            let outsideIndex = lastIndex - 1;
            while (outsideIndex > 0 && this.isPointInsideBounds(points[outsideIndex], lastBounds)) {
                outsideIndex--;
            }
            points[lastIndex] = this.clipPointToBoundsExit(
                points[lastIndex],
                unclippedPoints[outsideIndex] || points[outsideIndex],
                lastBounds
            );
            points.splice(outsideIndex + 1, lastIndex - outsideIndex - 1);
        }

        return this.avoidFullscreenRouteObstacles(points, conn);
    }

    getConnectionSegments(conn) {
        const points = this.getDrawableConnectionRoutePoints(conn);
        const segments = [];

        for (let i = 0; i < points.length - 1; i++) {
            segments.push({
                x1: points[i].x,
                y1: points[i].y,
                x2: points[i + 1].x,
                y2: points[i + 1].y,
            });
        }

        return segments;
    }

    formatRouteCoord(value) {
        return Number(value.toFixed(3));
    }

    getPointDistance(a, b) {
        return Math.hypot(b.x - a.x, b.y - a.y);
    }

    getPointToward(from, to, distance) {
        const total = this.getPointDistance(from, to);
        if (total === 0) return { x: from.x, y: from.y };

        const ratio = Math.min(1, distance / total);
        return {
            x: from.x + (to.x - from.x) * ratio,
            y: from.y + (to.y - from.y) * ratio,
        };
    }

    getRoutePathD(conn) {
        const points = this.getDrawableConnectionRoutePoints(conn);
        if (points.length === 0) return '';

        const coord = point => `${this.formatRouteCoord(point.x)},${this.formatRouteCoord(point.y)}`;
        let d = `M${coord(points[0])}`;

        if (points.length === 1) return d;
        if (points.length === 2) return `${d} L${coord(points[1])}`;

        for (let i = 1; i < points.length - 1; i++) {
            const previous = points[i - 1];
            const current = points[i];
            const next = points[i + 1];
            const trim = Math.min(
                this.routeCornerRadius * this.getRouteScale(),
                this.getPointDistance(previous, current) / 2,
                this.getPointDistance(current, next) / 2
            );

            if (trim <= 0.001) {
                d += ` L${coord(current)}`;
                continue;
            }

            const cornerStart = this.getPointToward(current, previous, trim);
            const cornerEnd = this.getPointToward(current, next, trim);
            d += ` L${coord(cornerStart)} Q ${coord(current)} ${coord(cornerEnd)}`;
        }

        d += ` L${coord(points[points.length - 1])}`;
        return d;
    }

    appendRoutePath(parent, conn, attrs) {
        const d = this.getRoutePathD(conn);
        if (!d) return null;

        const path = this.createElement('path', {
            d,
            fill: 'none',
            ...attrs,
        });
        parent.appendChild(path);
        return path;
    }

    getRouteMidpoint(conn) {
        const points = this.getDrawableConnectionRoutePoints(conn);
        if (points.length === 0) return null;
        if (points.length === 1) return points[0];

        let totalLength = 0;
        const lengths = [];
        for (let i = 0; i < points.length - 1; i++) {
            const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
            lengths.push(length);
            totalLength += length;
        }

        let remaining = totalLength / 2;
        for (let i = 0; i < lengths.length; i++) {
            if (remaining <= lengths[i]) {
                const ratio = lengths[i] === 0 ? 0 : remaining / lengths[i];
                return {
                    x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
                    y: points[i].y + (points[i + 1].y - points[i].y) * ratio,
                };
            }
            remaining -= lengths[i];
        }

        return points[points.length - 1];
    }

    isLocationVisible(locationId) {
        if (!this.state || !this.state.numPlayers) return true;
        return isLocationAvailableForPlayers(locationId, this.state.numPlayers);
    }

    isLocationNetworkVisible(locationId) {
        if (!this.state || !this.state.numPlayers) return true;
        return isLocationNetworkAvailableForPlayers(locationId, this.state.numPlayers);
    }

    isMerchantTradeVisible(locationId) {
        if (!this.state || !this.state.numPlayers) return true;
        return isMerchantTradeAvailableForPlayers(locationId, this.state.numPlayers);
    }

    isConnectionVisible(conn) {
        if (!this.state || !this.state.numPlayers) return true;
        return isConnectionAvailableForPlayers(conn, this.state.numPlayers);
    }

    drawConnections() {
        const connGroup = this.createGroup({ id: 'connections-layer' });

        for (const conn of CONNECTIONS) {
            if (!this.isConnectionVisible(conn)) continue;

            const isCanal = conn.canal;
            const isRail = conn.rail;
            const era = this.state ? this.state.era : ERA.CANAL;
            const segments = this.getConnectionSegments(conn);

            if (isCanal && era === ERA.CANAL) {
                this.appendRoutePath(connGroup, conn, {
                    stroke: '#4499cc',
                    'stroke-width': this.getScaledStrokeWidth(8),
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'stroke-opacity': '0.22',
                    'data-connection': conn.id,
                    class: 'connection-line',
                });
                this.appendRoutePath(connGroup, conn, {
                    stroke: '#3388bb',
                    'stroke-width': this.getScaledStrokeWidth(4),
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'stroke-opacity': '0.45',
                    'data-connection': conn.id,
                    class: 'connection-line',
                    'pointer-events': 'none',
                });
                this.appendRoutePath(connGroup, conn, {
                    stroke: '#66bbee',
                    'stroke-width': this.getScaledStrokeWidth(3),
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'stroke-opacity': '0.7',
                    'data-connection': conn.id,
                    class: 'connection-line',
                    'pointer-events': 'none',
                });

                if (!conn.viaBrewery && isRail) {
                    const midpoint = this.getRouteMidpoint(conn);
                    if (midpoint) {
                        connGroup.appendChild(this.createElement('circle', {
                            cx: midpoint.x, cy: midpoint.y, r: this.getScaledRadius(2.5),
                            fill: '#5599cc', opacity: '0.4',
                            stroke: '#777', 'stroke-width': 0.5,
                        }));
                    }
                }
                continue;
            }

            if (isRail && era === ERA.RAIL) {
                this.appendRoutePath(connGroup, conn, {
                    stroke: '#555',
                    'stroke-width': this.getScaledStrokeWidth(5),
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'stroke-opacity': '0.55',
                    'data-connection': conn.id,
                    class: 'connection-line',
                });
                this.appendRoutePath(connGroup, conn, {
                    stroke: '#888',
                    'stroke-width': this.getScaledStrokeWidth(2),
                    'stroke-linecap': 'butt',
                    'stroke-linejoin': 'round',
                    'stroke-dasharray': '3 7',
                    'stroke-opacity': '0.65',
                    'data-connection': conn.id,
                    class: 'connection-line',
                    'pointer-events': 'none',
                });

                if (!conn.viaBrewery && isCanal) {
                    const midpoint = this.getRouteMidpoint(conn);
                    if (midpoint) {
                        connGroup.appendChild(this.createElement('circle', {
                            cx: midpoint.x, cy: midpoint.y, r: this.getScaledRadius(2.5),
                            fill: '#888', opacity: '0.4',
                            stroke: '#777', 'stroke-width': 0.5,
                        }));
                    }
                }
                continue;
            }

            for (const seg of segments) {
                if (isCanal && era === ERA.CANAL) {
                    // Canal: vibrant blue water with glow
                    // Outer thick translucent glow
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#4499cc',
                        'stroke-width': 8,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.22',
                        'data-connection': conn.id,
                        class: 'connection-line',
                    }));
                    // Mid layer for contrast
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#3388bb',
                        'stroke-width': 4,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.45',
                        'data-connection': conn.id,
                        class: 'connection-line',
                        'pointer-events': 'none',
                    }));
                    // Inner bright center
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#66bbee',
                        'stroke-width': 3,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.7',
                        'data-connection': conn.id,
                        class: 'connection-line',
                        'pointer-events': 'none',
                    }));
                } else if (isRail && era === ERA.RAIL) {
                    // Rail: dark ballast bed with visible tie marks
                    // Outer thick dark ballast
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#555',
                        'stroke-width': 5,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.55',
                        'data-connection': conn.id,
                        class: 'connection-line',
                    }));
                    // Rail sleepers/ties — dotted dark line
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#888',
                        'stroke-width': 2,
                        'stroke-linecap': 'butt',
                        'stroke-dasharray': '3 7',
                        'stroke-opacity': '0.65',
                        'data-connection': conn.id,
                        class: 'connection-line',
                        'pointer-events': 'none',
                    }));
                }
            }

            // Dual connection indicator
            if (!conn.viaBrewery && isCanal && isRail) {
                const midpoint = this.getRouteMidpoint(conn);
                if (!midpoint) continue;
                connGroup.appendChild(this.createElement('circle', {
                    cx: midpoint.x, cy: midpoint.y, r: this.getScaledRadius(2.5),
                    fill: era === ERA.RAIL ? '#888' : '#5599cc', opacity: '0.4',
                    stroke: '#777', 'stroke-width': 0.5,
                }));
            }
        }

        this.svg.appendChild(connGroup);
    }

    // ========================================================================
    // Cities with enhanced styling
    // ========================================================================

    // Returns a slot border color for a given industry type
    getSlotBorderColor(type) {
        const slotColors = {
            [INDUSTRY_TYPES.COTTON_MILL]: '#b8c5a0',
            [INDUSTRY_TYPES.COAL_MINE]: '#6a6a6a',
            [INDUSTRY_TYPES.IRON_WORKS]: '#c87820',
            [INDUSTRY_TYPES.MANUFACTURER]: '#9a7a30',
            [INDUSTRY_TYPES.POTTERY]: '#b05040',
            [INDUSTRY_TYPES.BREWERY]: '#c8a030',
        };
        return slotColors[type] || 'rgba(255,255,255,0.25)';
    }

    drawCities() {
        const cityGroup = this.createGroup({ id: 'cities-layer' });

        for (const [cityId, city] of Object.entries(CITIES)) {
            if (!this.isLocationVisible(cityId)) continue;

            const g = this.createGroup({
                class: 'city-group',
                'data-city': cityId,
                transform: this.getLocationTransform(cityId)
            });

            // Calculate city dimensions
            const layout = this.getCityLayout(city);
            const slotsPerRow = layout.slotsPerRow;
            const cityWidth = layout.width;
            const cityHeight = layout.height;

            const regionColors = REGION_COLORS[city.region] || REGION_COLORS.birmingham;

            // Outer glow ring — larger rounded rect for a distinctive "city node" look
            g.appendChild(this.createElement('rect', {
                x: -cityWidth / 2 - 3,
                y: -17,
                width: cityWidth + 6,
                height: cityHeight + 6,
                rx: 10, ry: 10,
                fill: 'none',
                stroke: regionColors.border,
                'stroke-width': 2.5,
                'stroke-opacity': '0.6',
                filter: 'url(#innerShadow)',
            }));

            // City body — rounded shape (rounder rx/ry)
            g.appendChild(this.createElement('rect', {
                x: -cityWidth / 2,
                y: -14,
                width: cityWidth,
                height: cityHeight,
                rx: 8, ry: 8,
                class: 'city-bg',
                fill: regionColors.fill,
                'fill-opacity': '0.55',
                stroke: regionColors.border,
                'stroke-width': '2',
                filter: 'url(#innerShadow)',
            }));

            // Dark backing rect behind city name for readability
            const nameWidth = this.getCityTitleWidth(city, cityWidth);
            g.appendChild(this.createElement('rect', {
                x: -nameWidth / 2,
                y: -13,
                width: nameWidth,
                height: 16,
                fill: 'rgba(0,0,0,0.72)',
                rx: 5, ry: 5,
                class: 'city-label-bg',
            }));

            // City name — larger and more readable
            const nameText = this.createElement('text', {
                x: 0, y: -2,
                class: 'city-label',
                'data-city': cityId,
                'font-size': city.name.length > 12 ? '8.5' : '10',
                'font-weight': '700',
                'letter-spacing': '0.5',
                fill: '#f0e0c0',
                opacity: '0',
                'aria-hidden': 'true',
                translate: 'no',
            });
            nameText.textContent = city.name;
            g.appendChild(nameText);

            // Industry slots
            const slotStartX = -(slotsPerRow * this.citySlotSize + (slotsPerRow - 1) * this.citySlotGap) / 2;
            const slotStartY = 10;

            city.slots.forEach((slotTypes, idx) => {
                const row = Math.floor(idx / slotsPerRow);
                const col = idx % slotsPerRow;
                const sx = slotStartX + col * (this.citySlotSize + this.citySlotGap);
                const sy = slotStartY + row * (this.citySlotSize + this.citySlotGap);

                const slotGroup = this.createGroup({
                    class: 'industry-slot',
                    'data-city': cityId,
                    'data-slot': idx,
                });

                const typeArr = Array.isArray(slotTypes) ? slotTypes : [slotTypes];

                // Slot border color based on primary type
                const slotBorderColor = this.getSlotBorderColor(typeArr[0]);

                // Slot background with industry-type colored border
                slotGroup.appendChild(this.createElement('rect', {
                    x: sx, y: sy,
                    width: this.citySlotSize, height: this.citySlotSize,
                    rx: 5, ry: 5,
                    fill: 'rgba(0,0,0,0.5)',
                    stroke: slotBorderColor,
                    'stroke-width': '1.5',
                    'stroke-opacity': typeArr.length > 1 ? '0.5' : '0.7',
                }));

                const boardKey = `${cityId}_${idx}`;
                const builtTile = this.state ? this.state.boardIndustries[boardKey] : null;

                if (builtTile) {
                    this.drawBuiltIndustryTile(slotGroup, sx, sy, builtTile);
                } else {
                    // Show the board icons for every legal industry in this city slot.
                    const iconSize = typeArr.length === 1 ? this.singleSlotIconSize : this.multiSlotIconSize;
                    const iconSpacing = this.multiSlotIconSize + 1;
                    typeArr.forEach((type, typeIdx) => {
                        const iconG = this.getIndustryIcon(type, iconSize, { context: 'slot' });
                        const offsetX = typeArr.length === 1 ? 0 : (typeIdx - (typeArr.length - 1) / 2) * iconSpacing;
                        iconG.setAttribute('class', 'slot-industry-icon');
                        iconG.setAttribute('transform', `translate(${sx + this.citySlotSize/2 + offsetX}, ${sy + this.citySlotSize/2})`);
                        iconG.setAttribute('opacity', '1');
                        slotGroup.appendChild(iconG);
                    });
                }

                g.appendChild(slotGroup);
            });

            cityGroup.appendChild(g);
        }

        this.svg.appendChild(cityGroup);
        this.syncCityLabels();
    }

    drawBuiltIndustryTile(parent, x, y, tile) {
        const s = this.citySlotSize;
        const display = INDUSTRY_DISPLAY[tile.type];
        const playerColor = this.state.players[tile.playerId].color;
        const palette = this.getPlayerTilePalette(playerColor);

        // Outer glow for player color — makes tiles visually prominent
        parent.appendChild(this.createElement('rect', {
            x: x - 2, y: y - 2,
            width: s + 4, height: s + 4,
            rx: 6, ry: 6,
            fill: 'none',
            stroke: playerColor,
            'stroke-width': 2,
            'stroke-opacity': tile.flipped ? '0.3' : '0.55',
            filter: `drop-shadow(0 0 3px ${playerColor})`,
        }));

        // Tile background with player color
        parent.appendChild(this.createElement('rect', {
            x, y, width: s, height: s,
            rx: 4, ry: 4,
            fill: tile.flipped ? palette.flippedFill : palette.builtFill,
            stroke: tile.flipped ? palette.flippedStroke : palette.builtStroke,
            'stroke-width': tile.flipped ? 1.5 : 1,
            opacity: tile.flipped ? 0.92 : 1,
            class: 'built-tile' + (tile.flipped ? ' flipped' : ''),
        }));

        // Shine highlight at top of tile
        parent.appendChild(this.createElement('rect', {
            x: x + 2, y: y + 2,
            width: s - 4, height: 4,
            rx: 2, ry: 2,
            fill: 'rgba(255,255,255,0.2)',
        }));

        // Level number — larger and bolder
        const levelText = this.createElement('text', {
            x: x + 4, y: y + 10,
            'font-size': '9',
            fill: tile.flipped ? palette.flippedText : 'white',
            'font-weight': '800',
            'font-family': 'Cinzel, serif',
        });
        levelText.textContent = tile.tileData.level;
        parent.appendChild(levelText);

        // Industry SVG icon in center — larger
        const iconG = this.getIndustryIcon(tile.type, this.builtTileIconSize, {
            context: tile.flipped ? 'flipped' : 'built',
        });
        iconG.setAttribute('transform', `translate(${x + s/2}, ${y + s/2 + 2})`);
        parent.appendChild(iconG);

        // VP badge if flipped — bigger and clearer
        if (tile.flipped) {
            this.drawBottomRightTileBadge(parent, x + s - 5, y + s - 5, tile.tileData.vp);
        }

        // Resource count badge
        if (!tile.flipped && tile.resourceCubes > 0) {
            this.drawBottomRightTileBadge(parent, x + s - 5, y + s - 5, tile.resourceCubes);
        }
    }

    // ========================================================================
    // Merchants
    // ========================================================================

    setMerchantProductFilter(industryType) {
        this.merchantProductFilter = industryType || null;
        this.updateMerchantBeer();
    }

    merchantAcceptsProduct(merchantTile) {
        if (!this.merchantProductFilter) return true;
        return merchantTile.buys === this.merchantProductFilter;
    }

    drawMerchants() {
        const merchantGroup = this.createGroup({ id: 'merchants-layer' });

        for (const [merchId, merch] of Object.entries(MERCHANTS)) {
            if (!this.isLocationNetworkVisible(merchId)) continue;
            const tradeAvailable = this.isMerchantTradeVisible(merchId);
            const matchingTiles = tradeAvailable && this.state
                ? this.state.merchantTiles.filter(t => t.location === merchId && t.buys)
                : [];
            const activeSlots = matchingTiles.length;

            const g = this.createGroup({
                class: 'merchant-group',
                'data-merchant': merchId,
                transform: this.getLocationTransform(merchId)
            });

            const w = 60;
            const h = 30 + activeSlots * 14;

            // Background
            g.appendChild(this.createElement('rect', {
                x: -w / 2, y: -12,
                width: w, height: h,
                class: 'merchant-bg',
            }));

            // Name
            const nameText = this.createElement('text', {
                x: 0, y: 0,
                class: 'merchant-label',
                'data-merchant-label': merchId,
                'font-size': '8',
                'font-weight': '700',
                opacity: '0',
                'aria-hidden': 'true',
                translate: 'no',
            });
            nameText.textContent = merch.name;
            g.appendChild(nameText);

            // Merchant slots
            for (let i = 0; i < activeSlots; i++) {
                const mt = matchingTiles[i];
                g.appendChild(this.createElement('rect', {
                    x: -20, y: 5 + i * 14,
                    width: 40, height: 11,
                    class: 'merchant-slot',
                }));
                const buyText = this.createElement('text', {
                    x: 0, y: 13 + i * 14,
                    class: 'merchant-buy-label',
                    'text-anchor': 'middle',
                    'font-size': '7',
                    fill: this.merchantAcceptsProduct(mt) ? '#b87333' : '#555',
                });
                buyText.textContent = INDUSTRY_DISPLAY[mt.buys].shortName;
                g.appendChild(buyText);

                if (mt.hasBeer) {
                    g.appendChild(this.createElement('circle', {
                        cx: -14, cy: 11 + i * 14,
                        r: 3,
                        class: 'merchant-bonus-beer',
                        fill: '#c9a84c',
                        stroke: '#a08030',
                        'stroke-width': 0.5,
                    }));
                }
            }

            // Bonus indicator
            if (tradeAvailable) {
            const bonusText = this.createElement('text', {
                x: 0, y: h - 16,
                class: 'merchant-bonus-label',
                'text-anchor': 'middle',
                'font-size': '6',
                fill: '#666',
            });
            let bonusStr = '';
            if (merch.bonusType === 'vp') bonusStr = `+${merch.bonusAmount} VP`;
            else if (merch.bonusType === 'money') bonusStr = `+£${merch.bonusAmount}`;
            else if (merch.bonusType === 'income') bonusStr = `+${merch.bonusAmount} Inc`;
            else if (merch.bonusType === 'develop') bonusStr = `Free Dev`;
            bonusText.textContent = bonusStr;
            g.appendChild(bonusText);
            }

            merchantGroup.appendChild(g);
        }

        this.svg.appendChild(merchantGroup);
        this.syncMerchantLabels();
    }

    // ========================================================================
    // Brewery Farms
    // ========================================================================

    drawBreweryFarms() {
        const farmGroup = this.createGroup({ id: 'brewery-farms-layer' });

        for (const [farmId, farm] of Object.entries(BREWERY_FARMS)) {
            if (!this.isLocationVisible(farmId)) continue;

            const g = this.createGroup({
                class: 'brewery-farm',
                'data-farm': farmId,
                transform: this.getLocationTransform(farmId)
            });

            g.appendChild(this.createElement('rect', {
                x: -14, y: -14,
                width: 28, height: 28,
                class: 'brewery-farm-bg',
            }));

            const builtTile = this.state ? this.state.breweryFarmTiles[farmId] : null;
            if (builtTile) {
                const tileOffset = -this.citySlotSize / 2;
                this.drawBuiltIndustryTile(g, tileOffset, tileOffset, builtTile);
            } else {
                // Show brewery icon
                const iconG = this.getIndustryIcon(INDUSTRY_TYPES.BREWERY, 14, { context: 'slot' });
                iconG.setAttribute('transform', 'translate(0, 0)');
                iconG.setAttribute('opacity', '0.4');
                g.appendChild(iconG);
            }

            farmGroup.appendChild(g);
        }

        this.svg.appendChild(farmGroup);
    }

    // ========================================================================
    // Built Links with enhanced styling
    // ========================================================================

    drawBuiltLinks() {
        const linkGroup = this.createGroup({ id: 'built-links-layer' });

        if (!this.state) return;

        for (const [connId, link] of Object.entries(this.state.boardLinks)) {
            const conn = CONNECTIONS.find(c => c.id === connId);
            if (!conn) continue;
            if (!this.isConnectionVisible(conn)) continue;
            if (this.state.era === ERA.CANAL && link.type !== 'canal') continue;
            if (this.state.era === ERA.RAIL && link.type !== 'rail') continue;

            const playerColor = this.state.players[link.playerId].color;
            const segments = this.getConnectionSegments(conn);

            if (link.type === 'canal') {
                this.appendRoutePath(linkGroup, conn, {
                    stroke: '#4499cc',
                    'stroke-width': this.getScaledStrokeWidth(10),
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'stroke-opacity': '0.3',
                    class: 'connection-line built',
                });
                this.appendRoutePath(linkGroup, conn, {
                    stroke: '#3388bb',
                    'stroke-width': this.getScaledStrokeWidth(6),
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'stroke-opacity': '0.5',
                    class: 'connection-line built',
                });
                this.appendRoutePath(linkGroup, conn, {
                    stroke: playerColor,
                    'stroke-width': this.getScaledStrokeWidth(3),
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'stroke-opacity': '0.85',
                    class: 'connection-line built',
                });
            } else {
                this.appendRoutePath(linkGroup, conn, {
                    stroke: '#333',
                    'stroke-width': this.getScaledStrokeWidth(7),
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'stroke-opacity': '0.7',
                    class: 'connection-line built',
                });
                this.appendRoutePath(linkGroup, conn, {
                    stroke: playerColor,
                    'stroke-width': this.getScaledStrokeWidth(4),
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'stroke-opacity': '0.75',
                    class: 'connection-line built',
                });
                this.appendRoutePath(linkGroup, conn, {
                    stroke: 'rgba(0,0,0,0.5)',
                    'stroke-width': this.getScaledStrokeWidth(3),
                    'stroke-linecap': 'butt',
                    'stroke-linejoin': 'round',
                    'stroke-dasharray': '3 8',
                    class: 'connection-line built',
                });
            }

            const builtMidpoint = this.getRouteMidpoint(conn);
            if (!builtMidpoint) continue;

            linkGroup.appendChild(this.createElement('circle', {
                cx: builtMidpoint.x, cy: builtMidpoint.y, r: this.getScaledRadius(6),
                fill: playerColor,
                stroke: 'rgba(255,255,255,0.3)',
                'stroke-width': 0.5,
            }));
            const builtTypeIcon = this.createElement('text', {
                x: builtMidpoint.x, y: builtMidpoint.y + 3 * this.getRouteScale(),
                'text-anchor': 'middle',
                'font-size': this.formatSvgNumber(7 * this.getRouteScale()),
                fill: 'white',
                'pointer-events': 'none',
            });
            builtTypeIcon.textContent = link.type === 'canal' ? '~' : '#';
            linkGroup.appendChild(builtTypeIcon);
            continue;

            const drawBuiltSegment = (seg) => {
                if (link.type === 'canal') {
                    // Built canal: solid thick blue with player color overlay
                    // Outer blue glow (water base)
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#4499cc',
                        'stroke-width': 10,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.3',
                        class: 'connection-line built',
                    }));
                    // Mid blue layer
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#3388bb',
                        'stroke-width': 6,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.5',
                        class: 'connection-line built',
                    }));
                    // Player color overlay — bright center
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: playerColor,
                        'stroke-width': 3,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.85',
                        class: 'connection-line built',
                    }));
                } else {
                    // Built rail: dark with player color, with tie pattern
                    // Outer dark ballast bed
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#333',
                        'stroke-width': 7,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.7',
                        class: 'connection-line built',
                    }));
                    // Player color rail line
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: playerColor,
                        'stroke-width': 4,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.75',
                        class: 'connection-line built',
                    }));
                    // Tie/sleeper pattern over player color
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: 'rgba(0,0,0,0.5)',
                        'stroke-width': 3,
                        'stroke-linecap': 'butt',
                        'stroke-dasharray': '3 8',
                        class: 'connection-line built',
                    }));
                }
            };

            segments.forEach(drawBuiltSegment);

            // Link type indicator at midpoint
            const midpoint = this.getRouteMidpoint(conn);
            if (!midpoint) continue;

            // Small colored circle with type indicator
            linkGroup.appendChild(this.createElement('circle', {
                cx: midpoint.x, cy: midpoint.y, r: 6,
                fill: playerColor,
                stroke: 'rgba(255,255,255,0.3)',
                'stroke-width': 0.5,
            }));
            const typeIcon = this.createElement('text', {
                x: midpoint.x, y: midpoint.y + 3,
                'text-anchor': 'middle',
                'font-size': '7',
                fill: 'white',
                'pointer-events': 'none',
            });
            typeIcon.textContent = link.type === 'canal' ? '~' : '#';
            linkGroup.appendChild(typeIcon);
        }

        this.svg.appendChild(linkGroup);
    }

    // ========================================================================
    // Highlighting for valid placements
    // ========================================================================

    highlightSlots(validSlots) {
        this.clearHighlights();
        for (const slot of validSlots) {
            if (isBreweryFarm(slot.cityId)) {
                const farm = this.svg.querySelector(`.brewery-farm[data-farm="${slot.cityId}"]`);
                if (farm) farm.classList.add('highlight-slot');
                continue;
            }
            const el = this.svg.querySelector(
                `.industry-slot[data-city="${slot.cityId}"][data-slot="${slot.slotIndex}"]`
            );
            if (el) {
                el.classList.add('highlight-slot');
            }
        }
    }

    highlightConnections(validConnections) {
        this.clearHighlights();
        for (const connId of validConnections) {
            const els = this.svg.querySelectorAll(`[data-connection="${connId}"]`);
            els.forEach(el => el.classList.add('highlight'));
        }
    }

    clearHighlights() {
        this.svg.querySelectorAll('.highlight-slot').forEach(el =>
            el.classList.remove('highlight-slot'));
        this.svg.querySelectorAll('.highlight').forEach(el =>
            el.classList.remove('highlight'));
    }

    // ========================================================================
    // Update methods
    // ========================================================================

    updateIndustrySlots() {
        const oldCities = this.svg.querySelector('#cities-layer');
        if (oldCities) oldCities.remove();
        this.drawCities();
    }

    updateLinks() {
        const oldLinks = this.svg.querySelector('#built-links-layer');
        if (oldLinks) oldLinks.remove();
        this.drawBuiltLinks();
    }

    updateMerchantBeer() {
        const oldMerchants = this.svg.querySelector('#merchants-layer');
        if (oldMerchants) oldMerchants.remove();
        this.drawMerchants();
    }

    fullUpdate(gameState) {
        this.state = gameState;
        // Remove all dynamic layers first, then re-add in the correct draw order so
        // that built links always render on top of cities, merchants, and brewery farms.
        this.svg.querySelector('#connections-layer')?.remove();
        this.svg.querySelector('#brewery-farms-layer')?.remove();
        this.svg.querySelector('#merchants-layer')?.remove();
        this.svg.querySelector('#cities-layer')?.remove();
        this.svg.querySelector('#built-links-layer')?.remove();

        this.drawConnections();
        this.drawBreweryFarms();
        this.drawMerchants();
        this.drawCities();
        this.drawBuiltLinks();
    }
}
