// ============================================================================
// Brass: Birmingham - Resource Planning
// ============================================================================

class ResourcePlanner {
    constructor(gameState) {
        this.state = gameState;
    }

    createSimulation(extraLinks = []) {
        const resourceCounts = {};
        for (const [key, tile] of Object.entries(this.state.boardIndustries)) {
            resourceCounts[key] = tile.resourceCubes || 0;
        }
        for (const [farmId, tile] of Object.entries(this.state.breweryFarmTiles)) {
            if (tile) resourceCounts[`farm_${farmId}`] = tile.resourceCubes || 0;
        }

        const boardLinks = { ...this.state.boardLinks };
        for (const entry of extraLinks) {
            const id = typeof entry === 'string' ? entry : entry.id;
            boardLinks[id] = typeof entry === 'string'
                ? { playerId: null, type: 'rail' }
                : { playerId: entry.playerId ?? null, type: entry.type || 'rail' };
        }

        return {
            resourceCounts,
            coalMarket: this.state.coalMarket,
            ironMarket: this.state.ironMarket,
            merchantBeer: this.state.merchantTiles.map(tile => Boolean(tile.hasBeer)),
            boardLinks,
        };
    }

    getLocationIdForKey(key) {
        return key.startsWith('farm_') ? key.slice(5) : key.split('_')[0];
    }

    getLocationName(locationId) {
        return CITIES[locationId]?.name || BREWERY_FARMS[locationId]?.name ||
            MERCHANTS[locationId]?.name || locationId;
    }

    getTileForKey(key) {
        if (key.startsWith('farm_')) {
            return this.state.breweryFarmTiles[key.slice(5)];
        }
        return this.state.boardIndustries[key];
    }

    getTileSource(resource, key, tile, simulation) {
        const owner = this.state.players[tile.playerId];
        const locationId = this.getLocationIdForKey(key);
        const sourceType = resource === 'iron' ? 'works' :
            resource === 'coal' ? 'mine' : 'brewery';
        return {
            id: `tile:${key}`,
            resource,
            sourceType,
            key,
            ownerId: tile.playerId,
            ownerName: owner.name,
            ownerColor: owner.color,
            locationId,
            locationName: this.getLocationName(locationId),
            available: simulation.resourceCounts[key] || 0,
        };
    }

    getResourceTiles(industryType, resource, simulation) {
        const options = [];
        for (const [key, tile] of Object.entries(this.state.boardIndustries)) {
            if (tile.type !== industryType || tile.flipped ||
                (simulation.resourceCounts[key] || 0) <= 0) continue;
            options.push(this.getTileSource(resource, key, tile, simulation));
        }
        if (industryType === INDUSTRY_TYPES.BREWERY) {
            for (const [farmId, tile] of Object.entries(this.state.breweryFarmTiles)) {
                const key = `farm_${farmId}`;
                if (!tile || tile.type !== industryType || tile.flipped ||
                    (simulation.resourceCounts[key] || 0) <= 0) continue;
                options.push(this.getTileSource(resource, key, tile, simulation));
            }
        }
        return options;
    }

    getIronOptions(simulation) {
        const works = this.getResourceTiles(
            INDUSTRY_TYPES.IRON_WORKS,
            'iron',
            simulation
        );
        if (works.length > 0) return works;

        const price = simulation.ironMarket > 0
            ? IRON_MARKET_PRICES[IRON_MARKET_PRICES.length - simulation.ironMarket]
            : 6;
        return [{
            id: 'market:iron',
            resource: 'iron',
            sourceType: 'market',
            ownerId: null,
            ownerName: 'Market',
            ownerColor: null,
            locationId: null,
            locationName: 'Iron Market',
            available: Number.POSITIVE_INFINITY,
            price,
            generalSupply: simulation.ironMarket <= 0,
        }];
    }

    getConnectedLocations(locationId, simulation) {
        const connected = new Set();
        const queue = [locationId];
        while (queue.length > 0) {
            const current = queue.shift();
            if (connected.has(current)) continue;
            connected.add(current);

            for (const connection of CONNECTIONS) {
                if (!simulation.boardLinks[connection.id]) continue;
                const endpoints = connection.viaBrewery
                    ? [...connection.cities, connection.viaBrewery]
                    : connection.cities;
                if (!endpoints.includes(current)) continue;
                for (const endpoint of endpoints) {
                    if (!connected.has(endpoint)) queue.push(endpoint);
                }
            }
        }
        return connected;
    }

    getDistancesFrom(locationIds, simulation) {
        const distances = new Map();
        const queue = locationIds.map(locationId => ({ locationId, distance: 0 }));
        while (queue.length > 0) {
            const { locationId, distance } = queue.shift();
            if (distances.has(locationId) && distances.get(locationId) <= distance) continue;
            distances.set(locationId, distance);

            for (const connection of CONNECTIONS) {
                if (!simulation.boardLinks[connection.id]) continue;
                const endpoints = connection.viaBrewery
                    ? [...connection.cities, connection.viaBrewery]
                    : connection.cities;
                if (!endpoints.includes(locationId)) continue;
                for (const endpoint of endpoints) {
                    if (endpoint !== locationId) {
                        queue.push({ locationId: endpoint, distance: distance + 1 });
                    }
                }
            }
        }
        return distances;
    }

    getCoalOptions(simulation, requiredLocationIds) {
        const distances = this.getDistancesFrom(requiredLocationIds, simulation);
        const mines = this.getResourceTiles(
            INDUSTRY_TYPES.COAL_MINE,
            'coal',
            simulation
        ).filter(source => distances.has(source.locationId));

        if (mines.length > 0) {
            const minimumDistance = Math.min(...mines.map(source => distances.get(source.locationId)));
            return mines
                .filter(source => distances.get(source.locationId) === minimumDistance)
                .map(source => ({ ...source, distance: minimumDistance }));
        }

        const connectedToMerchant = requiredLocationIds.some(locationId => {
            const connected = this.getConnectedLocations(locationId, simulation);
            return Array.from(connected).some(isMerchantLocation);
        });
        if (!connectedToMerchant) return [];

        const price = simulation.coalMarket > 0
            ? COAL_MARKET_PRICES[COAL_MARKET_PRICES.length - simulation.coalMarket]
            : 8;
        return [{
            id: 'market:coal',
            resource: 'coal',
            sourceType: 'market',
            ownerId: null,
            ownerName: 'Market',
            ownerColor: null,
            locationId: null,
            locationName: 'Coal Market',
            available: Number.POSITIVE_INFINITY,
            price,
            generalSupply: simulation.coalMarket <= 0,
        }];
    }

    getBeerOptions(simulation, context) {
        const connected = this.getConnectedLocations(
            context.requiredLocationId,
            simulation
        );
        const options = this.getResourceTiles(
            INDUSTRY_TYPES.BREWERY,
            'beer',
            simulation
        ).filter(source => {
            if (source.ownerId === context.playerId) return true;
            return connected.has(source.locationId);
        });

        if (context.allowMerchant && Number.isInteger(context.merchantIndex)) {
            const merchant = this.state.merchantTiles[context.merchantIndex];
            if (merchant && simulation.merchantBeer[context.merchantIndex] &&
                connected.has(merchant.location)) {
                const merchantData = MERCHANTS[merchant.location];
                options.push({
                    id: `merchant:${context.merchantIndex}`,
                    resource: 'beer',
                    sourceType: 'merchant',
                    merchantIndex: context.merchantIndex,
                    ownerId: null,
                    ownerName: 'Merchant',
                    ownerColor: null,
                    locationId: merchant.location,
                    locationName: merchantData?.name || merchant.location,
                    available: 1,
                    bonusType: merchantData?.bonusType || null,
                    bonusAmount: merchantData?.bonusAmount || 0,
                });
            }
        }
        return options;
    }

    applySimulatedConsumption(simulation, source) {
        if (source.sourceType === 'market') {
            if (source.resource === 'coal' && simulation.coalMarket > 0) {
                simulation.coalMarket--;
            }
            if (source.resource === 'iron' && simulation.ironMarket > 0) {
                simulation.ironMarket--;
            }
            return;
        }
        if (source.sourceType === 'merchant') {
            simulation.merchantBeer[source.merchantIndex] = false;
            return;
        }
        simulation.resourceCounts[source.key]--;
    }

    resolveRequirements(simulation, requirements, selections = []) {
        let selectionCursor = 0;
        let marketCost = 0;
        const consumptions = [];

        for (const requirement of requirements) {
            if (requirement.before) requirement.before(simulation);
            for (let unitIndex = 0; unitIndex < requirement.quantity; unitIndex++) {
                const options = requirement.getOptions(simulation);
                if (options.length === 0) {
                    return {
                        status: 'impossible',
                        message: `No legal ${requirement.resource} source is available`,
                        selections: [...selections],
                        consumptions,
                        marketCost,
                    };
                }

                let source;
                if (options.length === 1) {
                    source = options[0];
                } else if (selectionCursor < selections.length) {
                    const sourceId = selections[selectionCursor++];
                    source = options.find(option => option.id === sourceId);
                    if (!source) {
                        return {
                            status: 'invalid',
                            message: `Selected ${requirement.resource} source is no longer legal`,
                            selections: [...selections],
                            consumptions,
                            marketCost,
                        };
                    }
                } else {
                    return {
                        status: 'choice',
                        selections: [...selections],
                        nextChoice: {
                            resource: requirement.resource,
                            remaining: requirement.quantity - unitIndex,
                            options,
                        },
                        consumptions,
                        marketCost,
                    };
                }

                this.applySimulatedConsumption(simulation, source);
                if (source.sourceType === 'market') marketCost += source.price;
                consumptions.push({
                    resource: requirement.resource,
                    sourceId: source.id,
                    sourceType: source.sourceType,
                    key: source.key || null,
                    merchantIndex: Number.isInteger(source.merchantIndex)
                        ? source.merchantIndex
                        : null,
                    price: source.price || 0,
                });
            }
        }

        if (selectionCursor < selections.length) {
            return {
                status: 'invalid',
                message: 'Too many resource sources were selected',
                selections: [...selections],
                consumptions,
                marketCost,
            };
        }

        return {
            status: 'complete',
            selections: [...selections],
            consumptions,
            marketCost,
        };
    }

    planSell(context, selections = []) {
        const tile = this.state.boardIndustries[context.tileKey];
        const merchant = this.state.merchantTiles[context.merchantIndex];
        if (!tile || tile.playerId !== context.playerId || tile.flipped) {
            return { status: 'invalid', message: 'Sell target is no longer valid' };
        }
        if (!merchant || merchant.buys !== tile.type) {
            return { status: 'invalid', message: 'Selected Merchant does not buy this industry' };
        }

        const requiredLocationId = this.getLocationIdForKey(context.tileKey);
        const simulation = this.createSimulation();
        const connected = this.getConnectedLocations(requiredLocationId, simulation);
        if (!connected.has(merchant.location)) {
            return { status: 'invalid', message: 'Selected Merchant is not connected' };
        }

        const quantity = tile.tileData.beersToSell || 0;
        return this.resolveRequirements(simulation, [{
            resource: 'beer',
            quantity,
            getOptions: currentSimulation => this.getBeerOptions(currentSimulation, {
                playerId: context.playerId,
                requiredLocationId,
                merchantIndex: context.merchantIndex,
                allowMerchant: true,
            }),
        }], selections);
    }

    planDevelop(context, selections = []) {
        const industryTypes = context.industryTypes || [];
        if (industryTypes.length < 1 || industryTypes.length > 2) {
            return { status: 'invalid', message: 'Develop requires one or two industries' };
        }
        for (const industryType of industryTypes) {
            const nextTile = this.state.getNextTile(context.playerId, industryType);
            if (!nextTile || !nextTile.canDevelop) {
                return { status: 'invalid', message: 'Selected industry cannot be developed' };
            }
        }

        const simulation = this.createSimulation();
        return this.resolveRequirements(simulation, [{
            resource: 'iron',
            quantity: industryTypes.length,
            getOptions: currentSimulation => this.getIronOptions(currentSimulation),
        }], selections);
    }

    planBuild(context, selections = []) {
        const tile = this.state.getNextTile(context.playerId, context.industryType);
        if (!tile) return { status: 'invalid', message: 'No industry tile is available' };

        const simulation = this.createSimulation();
        const result = this.resolveRequirements(simulation, [
            {
                resource: 'coal',
                quantity: tile.costCoal || 0,
                getOptions: currentSimulation => this.getCoalOptions(
                    currentSimulation,
                    [context.cityId]
                ),
            },
            {
                resource: 'iron',
                quantity: tile.costIron || 0,
                getOptions: currentSimulation => this.getIronOptions(currentSimulation),
            },
        ], selections);
        return { ...result, baseCost: tile.cost || 0 };
    }

    planNetwork(context, selections = []) {
        const connectionIds = context.connectionIds || [];
        if (connectionIds.length < 1 || connectionIds.length > 2) {
            return { status: 'invalid', message: 'Network requires one or two Links' };
        }
        const connections = connectionIds.map(id => CONNECTIONS.find(connection => connection.id === id));
        if (connections.some(connection => !connection)) {
            return { status: 'invalid', message: 'Network contains an invalid Link' };
        }
        if (connectionIds.some(id => this.state.boardLinks[id])) {
            return { status: 'invalid', message: 'Network Link is already built' };
        }

        const simulation = this.createSimulation();
        const requirements = [];
        const isRail = this.state.era === ERA.RAIL;
        if (isRail) {
            for (const connection of connections) {
                requirements.push({
                    resource: 'coal',
                    quantity: 1,
                    before: currentSimulation => {
                        currentSimulation.boardLinks[connection.id] = {
                            playerId: context.playerId,
                            type: 'rail',
                        };
                    },
                    getOptions: currentSimulation => this.getCoalOptions(
                        currentSimulation,
                        connection.cities
                    ),
                });
            }
        }
        if (isRail && connections.length === 2) {
            const secondConnection = connections[1];
            requirements.push({
                resource: 'beer',
                quantity: 1,
                getOptions: currentSimulation => this.getBeerOptions(currentSimulation, {
                    playerId: context.playerId,
                    requiredLocationId: secondConnection.cities[0],
                    allowMerchant: false,
                }),
            });
        }

        const result = this.resolveRequirements(simulation, requirements, selections);
        const baseCost = isRail
            ? (connections.length === 2 ? RAIL_DOUBLE_LINK_COST : RAIL_LINK_COST)
            : CANAL_LINK_COST;
        return { ...result, baseCost };
    }
}
