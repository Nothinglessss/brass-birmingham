// ============================================================================
// Brass: Birmingham - Game Logic
// ============================================================================

class GameLogic {
    constructor(gameState) {
        this.state = gameState;
        this.resourcePlanner = new ResourcePlanner(gameState);
    }

    planBuildResources(context, selections = []) {
        return this.resourcePlanner.planBuild(context, selections);
    }

    planDevelopResources(context, selections = []) {
        return this.resourcePlanner.planDevelop(context, selections);
    }

    planNetworkResources(context, selections = []) {
        return this.resourcePlanner.planNetwork(context, selections);
    }

    planSellResources(context, selections = []) {
        return this.resourcePlanner.planSell(context, selections);
    }

    completeResourcePlan(planFactory) {
        const selections = [];
        for (let guard = 0; guard < 50; guard++) {
            const plan = planFactory(selections);
            if (plan.status !== 'choice') return plan;
            const firstOption = plan.nextChoice?.options?.[0];
            if (!firstOption) {
                return { status: 'impossible', message: 'No legal resource source is available' };
            }
            selections.push(firstOption.id);
        }
        return { status: 'invalid', message: 'Resource plan did not resolve' };
    }

    previewDevelopResources(playerId, industryTypes) {
        return this.completeResourcePlan(selections => this.planDevelopResources({
            playerId,
            industryTypes,
        }, selections));
    }

    commitResourcePlan(plan) {
        for (const unit of plan.consumptions) {
            if (unit.sourceType === 'market') {
                const marketKey = `${unit.resource}Market`;
                if (this.state[marketKey] > 0) this.state[marketKey]--;
            } else if (unit.sourceType === 'merchant') {
                this.state.merchantTiles[unit.merchantIndex].hasBeer = false;
            } else {
                this.state.consumeResource(unit.key);
            }
        }
    }

    // ========================================================================
    // Action Validation
    // ========================================================================

    canPerformAction(action, playerId) {
        const player = this.state.players[playerId];
        if (player.hand.length === 0) return false;

        switch (action) {
            case ACTIONS.BUILD: return this.getValidBuildTargets(playerId).length > 0;
            case ACTIONS.NETWORK: return this.getValidNetworkTargets(playerId).length > 0;
            case ACTIONS.DEVELOP: return this.canDevelop(playerId);
            case ACTIONS.SELL: return this.getValidSellTargets(playerId).length > 0;
            case ACTIONS.LOAN: return this.canTakeLoan(playerId);
            case ACTIONS.SCOUT: return this.canScout(playerId);
            case ACTIONS.PASS: return true; // Can always pass
            default: return false;
        }
    }

    // ========================================================================
    // BUILD Action
    // ========================================================================

    getValidBuildTargets(playerId) {
        const player = this.state.players[playerId];
        const targets = [];

        for (const [cityId, city] of Object.entries(CITIES)) {
            if (!isLocationAvailableForPlayers(cityId, this.state.numPlayers)) continue;
            city.slots.forEach((slotTypes, slotIndex) => {
                const key = `${cityId}_${slotIndex}`;
                const existing = this.state.boardIndustries[key];

                // Check each industry type allowed in this slot
                const allowedTypes = Array.isArray(slotTypes) ? slotTypes : [slotTypes];

                for (const indType of allowedTypes) {
                    const nextTile = this.state.getNextTile(playerId, indType);
                    if (!nextTile) continue;

                    // Check era restrictions
                    if (this.state.era === ERA.CANAL && !nextTile.canalEra) continue;
                    if (this.state.era === ERA.RAIL && !nextTile.railEra) continue;

                    // Canal era: only one tile per location per player.
                    // Exclude the current slot from the check: overbuilding it
                    // would replace the existing tile, keeping the count at 1.
                    if (this.state.era === ERA.CANAL) {
                        let hasOwnTileElsewhere = false;
                        for (let i = 0; i < city.slots.length; i++) {
                            if (i === slotIndex) continue; // same slot = potential overbuild, don't count
                            const k = `${cityId}_${i}`;
                            const t = this.state.boardIndustries[k];
                            if (t && t.playerId === playerId) {
                                hasOwnTileElsewhere = true;
                                break;
                            }
                        }
                        if (hasOwnTileElsewhere) continue;
                    }

                    // Check if slot is empty or can be overbuilt
                    if (existing) {
                        // Overbuilding rules
                        if (existing.playerId === playerId) {
                            // Own tile: can replace with same type, higher level
                            if (existing.type === indType && nextTile.level > existing.tileData.level) {
                                // OK - overbuilding own tile
                            } else {
                                continue;
                            }
                        } else {
                            // Opponent tile: can only replace Coal/Iron when 0 cubes of that resource exist
                            if (existing.type === INDUSTRY_TYPES.COAL_MINE ||
                                existing.type === INDUSTRY_TYPES.IRON_WORKS) {
                                // Check if there are 0 resource cubes of that type on entire board
                                if (!this.isResourceDepleted(existing.type)) continue;
                            } else {
                                continue; // Can't overbuild other opponent tiles
                            }
                        }
                    }

                    // Check if player can afford it
                    const cost = this.calculateBuildCost(playerId, indType, cityId);
                    if (cost === null) continue; // Can't afford resources

                    // Check card requirements
                    const hasValidCard = this.hasCardForBuild(playerId, cityId, indType);
                    if (!hasValidCard) continue;

                    targets.push({
                        cityId,
                        slotIndex,
                        industryType: indType,
                        tileData: nextTile,
                        cost,
                    });
                }
            });
        }

        for (const farmId of Object.keys(BREWERY_FARMS)) {
            const existing = this.state.breweryFarmTiles[farmId];
            const nextTile = this.state.getNextTile(playerId, INDUSTRY_TYPES.BREWERY);
            if (existing || !nextTile) continue;
            if (this.state.era === ERA.CANAL && !nextTile.canalEra) continue;
            if (this.state.era === ERA.RAIL && !nextTile.railEra) continue;

            const cost = this.calculateBuildCost(playerId, INDUSTRY_TYPES.BREWERY, farmId);
            if (cost === null) continue;
            if (!this.hasCardForBuild(playerId, farmId, INDUSTRY_TYPES.BREWERY)) continue;

            targets.push({
                cityId: farmId,
                slotIndex: 0,
                industryType: INDUSTRY_TYPES.BREWERY,
                tileData: nextTile,
                cost,
            });
        }

        return targets;
    }

    hasBoardPresence(playerId) {
        return Object.values(this.state.boardLinks)
            .some(link => link.playerId === playerId) ||
            Object.values(this.state.boardIndustries)
                .some(tile => tile.playerId === playerId) ||
            Object.values(this.state.breweryFarmTiles)
                .some(tile => tile.playerId === playerId);
    }

    canUseIndustryCardAtLocation(playerId, cityId) {
        return !this.hasBoardPresence(playerId) ||
            this.state.isInNetwork(playerId, cityId);
    }
    hasCardForBuild(playerId, cityId, industryType) {
        const player = this.state.players[playerId];
        const canUseIndustryCard = this.canUseIndustryCardAtLocation(playerId, cityId);
        for (const card of player.hand) {
            if (isBreweryFarm(cityId)) {
                if (card.type === CARD_TYPES.INDUSTRY &&
                    card.industryType === industryType &&
                    canUseIndustryCard) return true;
                if (card.type === CARD_TYPES.WILD_INDUSTRY && canUseIndustryCard) return true;
                continue;
            }
            if (card.type === CARD_TYPES.LOCATION && card.location === cityId) return true;
            if (card.type === CARD_TYPES.INDUSTRY &&
                card.industryType === industryType &&
                canUseIndustryCard) return true;
            if (card.type === CARD_TYPES.WILD_LOCATION) return true;
            if (card.type === CARD_TYPES.WILD_INDUSTRY && canUseIndustryCard) return true;
        }
        return false;
    }

    calculateBuildCost(playerId, industryType, cityId) {
        const player = this.state.players[playerId];
        const tile = this.state.getNextTile(playerId, industryType);
        if (!tile) return null;

        const plan = this.completeResourcePlan(selections => this.planBuildResources({
            playerId,
            cityId,
            industryType,
        }, selections));
        if (plan.status !== 'complete') return null;

        const moneyCost = tile.cost;
        const coalNeeded = tile.costCoal || 0;
        const ironNeeded = tile.costIron || 0;
        const coalCost = plan.consumptions
            .filter(unit => unit.resource === 'coal')
            .reduce((sum, unit) => sum + unit.price, 0);
        const ironCost = plan.consumptions
            .filter(unit => unit.resource === 'iron')
            .reduce((sum, unit) => sum + unit.price, 0);
        const totalCost = moneyCost + plan.marketCost;
        if (totalCost > player.money) return null;

        return {
            money: moneyCost,
            coal: coalNeeded,
            coalCost,
            iron: ironNeeded,
            ironCost,
            total: totalCost,
        };
    }

    executeBuild(playerId, cityId, slotIndex, industryType, cardIndex, resourceSelections = []) {
        const player = this.state.players[playerId];
        const key = isBreweryFarm(cityId) ? `farm_${cityId}` : `${cityId}_${slotIndex}`;
        const validCards = this.getValidCardsForAction(playerId, ACTIONS.BUILD, { cityId, slotIndex, industryType });
        if (!validCards.includes(cardIndex)) {
            return { success: false, message: 'Invalid card for this build' };
        }

        const resourcePlan = this.planBuildResources({
            playerId,
            cityId,
            slotIndex,
            industryType,
        }, resourceSelections);
        if (resourcePlan.status !== 'complete') {
            return {
                success: false,
                message: resourcePlan.message || 'Choose resource sources before building',
            };
        }
        const totalCost = resourcePlan.baseCost + resourcePlan.marketCost;
        if (totalCost > player.money) {
            return { success: false, message: 'Cannot afford this build' };
        }

        const tileData = this.state.useNextTile(playerId, industryType);
        if (!tileData) return { success: false, message: 'No tile available' };

        this.state.spendMoney(playerId, totalCost);
        this.commitResourcePlan(resourcePlan);

        // Remove the existing tile if overbuilding
        const existing = isBreweryFarm(cityId) ? this.state.breweryFarmTiles[cityId] : this.state.boardIndustries[key];
        if (existing) {
            // Overbuilt tile is removed from the game
        }

        // Place the tile
        const placedTile = {
            playerId,
            type: industryType,
            tileData: tileData,
            flipped: false,
            resourceCubes: tileData.resourceCubes || 0,
        };
        if (isBreweryFarm(cityId)) {
            this.state.breweryFarmTiles[cityId] = placedTile;
        } else {
            this.state.boardIndustries[key] = placedTile;
        }
        this.sellNewResourceTileToMarket(playerId, cityId, key);

        // Discard the used card
        this.discardCard(playerId, cardIndex);

        const locationName = CITIES[cityId]?.name || BREWERY_FARMS[cityId]?.name || cityId;
        return { success: true, message: `Built ${INDUSTRY_DISPLAY[industryType].name} Level ${tileData.level} in ${locationName}` };
    }

    sellNewResourceTileToMarket(playerId, cityId, key) {
        const tile = key.startsWith('farm_') ? this.state.breweryFarmTiles[cityId] : this.state.boardIndustries[key];
        if (!tile || tile.resourceCubes <= 0) return;

        let sale = null;
        if (tile.type === INDUSTRY_TYPES.IRON_WORKS) {
            sale = this.state.sellIronToMarket(tile.resourceCubes);
        } else if (tile.type === INDUSTRY_TYPES.COAL_MINE && this.state.isConnectedToMerchant(cityId)) {
            sale = this.state.sellCoalToMarket(tile.resourceCubes);
        }

        if (!sale || sale.sold <= 0) return;

        tile.resourceCubes -= sale.sold;
        this.state.players[playerId].money += sale.revenue;

        if (tile.resourceCubes <= 0) {
            this.state.flipTile(key, tile);
        }
    }

    isResourceDepleted(industryType) {
        // Check if there are 0 resource cubes of this type anywhere on the board
        if (industryType === INDUSTRY_TYPES.COAL_MINE) {
            if (this.state.coalMarket > 0) return false;
            for (const tile of Object.values(this.state.boardIndustries)) {
                if (tile.type === INDUSTRY_TYPES.COAL_MINE && !tile.flipped && tile.resourceCubes > 0) {
                    return false;
                }
            }
            return true;
        }
        if (industryType === INDUSTRY_TYPES.IRON_WORKS) {
            if (this.state.ironMarket > 0) return false;
            for (const tile of Object.values(this.state.boardIndustries)) {
                if (tile.type === INDUSTRY_TYPES.IRON_WORKS && !tile.flipped && tile.resourceCubes > 0) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    // ========================================================================
    // NETWORK Action
    // ========================================================================

    getValidNetworkTargets(playerId) {
        const player = this.state.players[playerId];
        const targets = [];
        const era = this.state.era;

        for (const conn of CONNECTIONS) {
            if (!isConnectionAvailableForPlayers(conn, this.state.numPlayers)) continue;
            if (this.state.boardLinks[conn.id]) continue; // Already built

            // Check era
            if (era === ERA.CANAL && !conn.canal) continue;
            if (era === ERA.RAIL && !conn.rail) continue;

            // Check if player has link tiles remaining
            if (era === ERA.CANAL && player.linksRemaining.canal <= 0) continue;
            if (era === ERA.RAIL && player.linksRemaining.rail <= 0) continue;

            // Check network connection (at least one end must be in network)
            // Exception: first link of the game can go anywhere
            const hasAnyLinks = Object.values(this.state.boardLinks).some(l => l.playerId === playerId);
            const hasAnyIndustries = Object.values(this.state.boardIndustries).some(t => t.playerId === playerId);

            if (hasAnyLinks || hasAnyIndustries) {
                const end1InNetwork = this.state.isInNetwork(playerId, conn.cities[0]);
                const end2InNetwork = this.state.isInNetwork(playerId, conn.cities[1]);
                if (!end1InNetwork && !end2InNetwork) continue;
            }

            // Preview resources with the same staged rules used by execution.
            const resourcePlan = this.completeResourcePlan(selections =>
                this.planNetworkResources({
                    playerId,
                    connectionIds: [conn.id],
                }, selections)
            );
            if (resourcePlan.status !== 'complete') continue;
            const cost = resourcePlan.baseCost + resourcePlan.marketCost;
            if (cost > player.money) continue;

            targets.push({
                connectionId: conn.id,
                connectionIds: [conn.id],
                cities: conn.cities,
                cost,
                type: era === ERA.CANAL ? 'canal' : 'rail',
            });
        }

        if (era === ERA.RAIL && player.linksRemaining.rail >= 2) {
            const singleRails = targets.filter(t => t.type === 'rail');
            for (let i = 0; i < singleRails.length; i++) {
                for (let j = i + 1; j < singleRails.length; j++) {
                    const first = singleRails[i];
                    const second = singleRails[j];
                    const connectionIds = [first.connectionId, second.connectionId];
                    const resourcePlan = this.completeResourcePlan(selections =>
                        this.planNetworkResources({ playerId, connectionIds }, selections)
                    );
                    if (resourcePlan.status !== 'complete') continue;
                    const cost = resourcePlan.baseCost + resourcePlan.marketCost;
                    if (cost > player.money) continue;
                    targets.push({
                        connectionId: `${first.connectionId}+${second.connectionId}`,
                        connectionIds,
                        cities: first.cities,
                        secondCities: second.cities,
                        cost,
                        type: 'rail-double',
                    });
                }
            }
        }

        return targets;
    }

    executeNetworkLegacy(playerId, connectionId, cardIndex) {
        const player = this.state.players[playerId];
        const conn = CONNECTIONS.find(c => c.id === connectionId);
        if (!conn) return { success: false, message: 'Invalid connection' };

        const era = this.state.era;
        const linkType = era === ERA.CANAL ? 'canal' : 'rail';

        // Pay cost
        if (era === ERA.CANAL) {
            this.state.spendMoney(playerId, CANAL_LINK_COST);
        } else {
            let totalCost = RAIL_LINK_COST;
            // Consume coal for rail — check both endpoints, use cheapest source
            const src = this.findCheapestCoalForLink(conn, playerId);
            if (src) {
                if (src.type === 'mine') {
                    this.state.consumeResource(src.key);
                } else {
                    totalCost += src.price;
                    this.state.coalMarket--;
                }
            }
            this.state.spendMoney(playerId, totalCost);
        }

        // Place link
        this.state.boardLinks[connectionId] = {
            playerId,
            type: linkType,
        };

        // Reduce remaining links
        if (linkType === 'canal') {
            player.linksRemaining.canal--;
        } else {
            player.linksRemaining.rail--;
        }

        // Discard card
        this.discardCard(playerId, cardIndex);

        const city1 = CITIES[conn.cities[0]]?.name || MERCHANTS[conn.cities[0]]?.name || conn.cities[0];
        const city2 = CITIES[conn.cities[1]]?.name || MERCHANTS[conn.cities[1]]?.name || conn.cities[1];

        return { success: true, message: `Built ${linkType} link: ${city1} - ${city2}` };
    }

    executeNetwork(playerId, connectionId, cardIndex, resourceSelections = []) {
        const player = this.state.players[playerId];
        const connectionIds = Array.isArray(connectionId) ? connectionId : [connectionId];
        const conns = connectionIds.map(id => CONNECTIONS.find(c => c.id === id));
        if (connectionIds.length < 1 || connectionIds.length > 2 || conns.some(conn => !conn)) {
            return { success: false, message: 'Invalid connection' };
        }

        const era = this.state.era;
        const linkType = era === ERA.CANAL ? 'canal' : 'rail';
        if (connectionIds.length > 1 && era !== ERA.RAIL) {
            return { success: false, message: 'Can only build two links in the Rail Era' };
        }
        if (connectionIds.some(id => this.state.boardLinks[id])) {
            return { success: false, message: 'Connection already built' };
        }
        if (connectionIds.length > 1 && player.linksRemaining.rail < 2) {
            return { success: false, message: 'Not enough rail links remaining' };
        }

        const validCards = this.getValidCardsForAction(playerId, ACTIONS.NETWORK);
        if (!validCards.includes(cardIndex)) {
            return { success: false, message: 'Invalid card for this network action' };
        }
        const resourcePlan = this.planNetworkResources({
            playerId,
            connectionIds,
        }, resourceSelections);
        if (resourcePlan.status !== 'complete') {
            return {
                success: false,
                message: resourcePlan.message || 'Choose resource sources before networking',
            };
        }
        const totalCost = resourcePlan.baseCost + resourcePlan.marketCost;
        if (totalCost > player.money) {
            return { success: false, message: 'Cannot afford this network action' };
        }
        this.state.spendMoney(playerId, totalCost);
        this.commitResourcePlan(resourcePlan);

        for (const id of connectionIds) {
            this.state.boardLinks[id] = { playerId, type: linkType };
        }

        if (linkType === 'canal') {
            player.linksRemaining.canal--;
        } else {
            player.linksRemaining.rail -= connectionIds.length;
        }

        this.discardCard(playerId, cardIndex);

        const conn = conns[0];
        const city1 = CITIES[conn.cities[0]]?.name || MERCHANTS[conn.cities[0]]?.name || conn.cities[0];
        const city2 = CITIES[conn.cities[1]]?.name || MERCHANTS[conn.cities[1]]?.name || conn.cities[1];
        const suffix = connectionIds.length === 2 ? ' and another rail link' : '';
        return { success: true, message: `Built ${linkType} link: ${city1} - ${city2}${suffix}` };
    }

    findBeerSourcesForConnections(connectionIds, playerId) {
        const seen = new Set();
        const sources = [];
        for (const id of connectionIds) {
            const conn = CONNECTIONS.find(c => c.id === id);
            if (!conn) continue;
            for (const locationId of conn.cities) {
                for (const src of this.state.findBeerSources(locationId, playerId)) {
                    const key = src.type === 'merchant' ? `merchant_${src.index}` : src.key;
                    if (!seen.has(key)) {
                        seen.add(key);
                        sources.push(src);
                    }
                }
            }
        }
        return sources;
    }

    // Find the cheapest coal source reachable from either endpoint of a connection.
    // Returns the best source object or null if no coal is available.
    findCheapestCoalForLink(conn, playerId) {
        const seen = new Set();
        const candidates = [];

        for (const cityId of conn.cities) {
            const sources = this.state.findCoalSource(cityId, playerId);
            for (const src of sources) {
                const dedupeKey = src.type === 'mine' ? src.key : 'market';
                if (!seen.has(dedupeKey)) {
                    seen.add(dedupeKey);
                    candidates.push(src);
                }
            }
        }

        if (candidates.length === 0) return null;
        // Prefer free (board mine) over market; among market entries pick lowest price
        candidates.sort((a, b) => (a.free ? 0 : a.price) - (b.free ? 0 : b.price));
        return candidates[0];
    }

    // ========================================================================
    // DEVELOP Action
    // ========================================================================

    canDevelop(playerId) {
        const player = this.state.players[playerId];
        for (const [type, tiles] of Object.entries(player.industryTiles)) {
            const nextTile = tiles.find(t => !t.used);
            if (!nextTile || !nextTile.canDevelop) continue;
            const plan = this.previewDevelopResources(playerId, [type]);
            if (plan.status === 'complete' && plan.marketCost <= player.money) return true;
        }
        return false;
    }

    getDevelopableTypes(playerId) {
        const player = this.state.players[playerId];
        const types = [];
        for (const [type, tiles] of Object.entries(player.industryTiles)) {
            const nextTile = tiles.find(t => !t.used);
            if (nextTile && nextTile.canDevelop) {
                types.push({
                    type,
                    tile: nextTile,
                    name: INDUSTRY_DISPLAY[type].name,
                    level: nextTile.level,
                });
            }
        }
        return types;
    }

    executeDevelop(playerId, industryType1, industryType2, cardIndex, resourceSelections = []) {
        // Develop removes 1 or 2 tiles from player mat (uses iron)
        // industryType2 can be null for single develop
        const player = this.state.players[playerId];
        const validCards = this.getValidCardsForAction(playerId, ACTIONS.DEVELOP);
        if (!validCards.includes(cardIndex)) {
            return { success: false, message: 'Invalid card for this develop action' };
        }

        const industryTypes = industryType2
            ? [industryType1, industryType2]
            : [industryType1];
        const resourcePlan = this.planDevelopResources({
            playerId,
            industryTypes,
        }, resourceSelections);
        if (resourcePlan.status !== 'complete') {
            return {
                success: false,
                message: resourcePlan.message || 'Choose iron sources before developing',
            };
        }
        if (resourcePlan.marketCost > player.money) {
            return { success: false, message: 'Cannot afford market iron' };
        }

        if (resourcePlan.marketCost > 0) {
            this.state.spendMoney(playerId, resourcePlan.marketCost);
        }
        this.commitResourcePlan(resourcePlan);

        // Remove tiles from player mat
        const tile1 = this.state.developTile(playerId, industryType1);
        let tile2 = null;
        if (industryType2) {
            tile2 = this.state.developTile(playerId, industryType2);
        }

        // Discard card
        this.discardCard(playerId, cardIndex);

        let msg = `Developed ${INDUSTRY_DISPLAY[industryType1].name}`;
        if (tile2) msg += ` and ${INDUSTRY_DISPLAY[industryType2].name}`;

        return { success: true, message: msg };
    }

    // ========================================================================
    // SELL Action
    // ========================================================================

    getValidSellTargets(playerId) {
        const targets = [];

        for (const [key, tile] of Object.entries(this.state.boardIndustries)) {
            if (tile.playerId !== playerId) continue;
            if (tile.flipped) continue;
            if (!isSellableIndustry(tile.type)) continue;
            const [cityId] = key.split('_');
            const connected = this.state.getConnectedLocations(cityId);
            for (let merchantIndex = 0; merchantIndex < this.state.merchantTiles.length; merchantIndex++) {
                const merchant = this.state.merchantTiles[merchantIndex];
                if (merchant.buys !== tile.type || !connected.has(merchant.location)) continue;

                const plan = this.planSellResources({
                    playerId,
                    tileKey: key,
                    merchantIndex,
                });
                if (plan.status === 'invalid' || plan.status === 'impossible') continue;

                targets.push({
                    key,
                    cityId,
                    tile,
                    beerNeeded: tile.tileData.beersToSell || 0,
                    merchantIndex,
                    merchantLocation: merchant.location,
                });
            }
        }

        return targets;
    }

    executeSell(
        playerId,
        tileKey,
        merchantIndex,
        cardIndex,
        resourceSelections = []
    ) {
        const validCards = this.getValidCardsForAction(playerId, ACTIONS.SELL);
        if (!validCards.includes(cardIndex)) {
            return { success: false, message: 'Invalid card for this sell action' };
        }

        const result = this.executeSellIndustry(
            playerId,
            tileKey,
            merchantIndex,
            resourceSelections
        );
        if (!result.success) return result;

        this.discardCard(playerId, cardIndex);
        return result;
    }

    executeSellIndustry(
        playerId,
        tileKey,
        merchantIndex,
        resourceSelections = []
    ) {
        const player = this.state.players[playerId];
        const validTarget = this.getValidSellTargets(playerId).some(target =>
            target.key === tileKey && target.merchantIndex === merchantIndex
        );
        if (!validTarget) {
            return { success: false, message: 'No matching merchant demand for this industry' };
        }

        const resourcePlan = this.planSellResources({
            playerId,
            tileKey,
            merchantIndex,
        }, resourceSelections);
        if (resourcePlan.status !== 'complete') {
            return {
                success: false,
                message: resourcePlan.message || 'Choose beer sources before selling',
            };
        }

        const tile = this.state.boardIndustries[tileKey];
        const usedMerchantBeer = resourcePlan.consumptions.some(unit =>
            unit.sourceType === 'merchant' && unit.merchantIndex === merchantIndex
        );
        const merchant = this.state.merchantTiles[merchantIndex];
        const merchantData = usedMerchantBeer ? MERCHANTS[merchant.location] : null;
        this.commitResourcePlan(resourcePlan);

        tile.flipped = true;
        this.state.advanceIncomeBySpaces(playerId, tile.tileData.income);

        if (usedMerchantBeer) {
            merchant.bonusClaimed = true;
            if (merchantData) {
                switch (merchantData.bonusType) {
                    case 'vp':
                        player.vp += merchantData.bonusAmount;
                        break;
                    case 'money':
                        player.money += merchantData.bonusAmount;
                        break;
                    case 'income':
                        this.state.advanceIncomeBySpaces(playerId, merchantData.bonusAmount);
                        break;
                    case 'develop':
                        this.applyFreeDevelop(playerId, merchantData.bonusAmount);
                        break;
                }
            }
        }

        const baseMessage = `Sold ${INDUSTRY_DISPLAY[tile.type].name} Lv${tile.tileData.level}`;
        return {
            success: true,
            message: baseMessage,
        };
    }

    executeAdditionalSell(
        playerId,
        tileKey,
        merchantIndex,
        resourceSelections = []
    ) {
        return this.executeSellIndustry(
            playerId,
            tileKey,
            merchantIndex,
            resourceSelections
        );
    }

    // ========================================================================
    // LOAN Action
    // ========================================================================

    canTakeLoan(playerId) {
        const player = this.state.players[playerId];
        const currentPosition = player.incomePosition ?? lowestTrackPositionForIncomeLevel(player.income);
        return incomeLevelFromTrackPosition(currentPosition) - LOAN_INCOME_PENALTY >= MIN_INCOME;
    }

    executeLoan(playerId, cardIndex) {
        if (!this.canTakeLoan(playerId)) {
            return { success: false, message: 'Cannot take a loan below income level -10' };
        }

        const player = this.state.players[playerId];
        player.money += LOAN_AMOUNT;
        this.state.decreaseIncomeByLevels(playerId, LOAN_INCOME_PENALTY);

        this.discardCard(playerId, cardIndex);

        return { success: true, message: `Took £${LOAN_AMOUNT} loan (income -${LOAN_INCOME_PENALTY})` };
    }

    // ========================================================================
    // SCOUT Action
    // ========================================================================

    canScout(playerId) {
        const player = this.state.players[playerId];
        // Need at least 3 cards in hand (1 for action + 2 additional)
        if (player.hand.length < 3) return false;
        // Cannot have wild cards already
        if (player.hasWildLocation || player.hasWildIndustry) return false;
        // Must have wild cards available
        if (this.state.wildLocationPile <= 0 || this.state.wildIndustryPile <= 0) return false;
        return true;
    }

    executeScout(playerId, cardIndices) {
        // cardIndices: [actionCard, extraCard1, extraCard2] (3 cards total)
        const player = this.state.players[playerId];

        if (cardIndices.length !== 3) {
            return { success: false, message: 'Must discard exactly 3 cards' };
        }

        // Remove cards in reverse index order to maintain indices
        const sorted = [...cardIndices].sort((a, b) => b - a);
        for (const idx of sorted) {
            player.hand.splice(idx, 1);
        }

        // Give wild cards
        player.hand.push({
            type: CARD_TYPES.WILD_LOCATION,
            name: 'Wild Location',
        });
        player.hand.push({
            type: CARD_TYPES.WILD_INDUSTRY,
            name: 'Wild Industry',
        });

        player.hasWildLocation = true;
        player.hasWildIndustry = true;

        this.state.wildLocationPile--;
        this.state.wildIndustryPile--;

        return { success: true, message: 'Scouted: gained Wild Location + Wild Industry' };
    }

    // ========================================================================
    // PASS Action
    // ========================================================================

    executePass(playerId, cardIndex) {
        this.discardCard(playerId, cardIndex);
        return { success: true, message: 'Passed' };
    }

    // ========================================================================
    // Free Develop (merchant bonus)
    // ========================================================================

    applyFreeDevelop(playerId, count) {
        for (let i = 0; i < count; i++) {
            // Find the lowest-level developable tile on the player's mat
            const types = this.getDevelopableTypes(playerId);
            if (types.length === 0) break;
            // Pick the lowest level tile
            types.sort((a, b) => a.level - b.level);
            this.state.developTile(playerId, types[0].type);
        }
    }

    // ========================================================================
    // Disabled Reason for Action Buttons
    // ========================================================================

    getDisabledReason(action, playerId) {
        const player = this.state.players[playerId];
        if (player.hand.length === 0) return 'Hand is empty';

        switch (action) {
            case ACTIONS.BUILD:
                if (this.getValidBuildTargets(playerId).length === 0) {
                    return 'No valid build locations';
                }
                return null;
            case ACTIONS.NETWORK: {
                const era = this.state.era;
                if (era === ERA.CANAL && player.linksRemaining.canal <= 0) return 'No canal links remaining';
                if (era === ERA.RAIL && player.linksRemaining.rail <= 0) return 'No rail links remaining';
                if (this.getValidNetworkTargets(playerId).length === 0) return 'No valid connections available';
                return null;
            }
            case ACTIONS.DEVELOP: {
                if (!this.canDevelop(playerId)) return 'No affordable develop action available';
                return null;
            }
            case ACTIONS.SELL:
                if (this.getValidSellTargets(playerId).length === 0) return 'No industries ready to sell';
                return null;
            case ACTIONS.LOAN:
                return this.canTakeLoan(playerId) ? null : 'Loan would lower income below -10';
            case ACTIONS.SCOUT:
                if (player.hand.length < 3) return 'Need at least 3 cards';
                if (player.hasWildLocation || player.hasWildIndustry) return 'Already have wild cards';
                if (this.state.wildLocationPile <= 0 || this.state.wildIndustryPile <= 0) return 'No wild cards available';
                return null;
            case ACTIONS.PASS:
                return null;
            default:
                return 'Unknown action';
        }
    }

    // ========================================================================
    // Card Management
    // ========================================================================
    discardCard(playerId, cardIndex) {
        const player = this.state.players[playerId];
        if (cardIndex < 0 || cardIndex >= player.hand.length) return;

        const card = player.hand[cardIndex];

        // Wild cards go back to their piles
        if (card.type === CARD_TYPES.WILD_LOCATION) {
            this.state.wildLocationPile++;
            player.hasWildLocation = false;
        } else if (card.type === CARD_TYPES.WILD_INDUSTRY) {
            this.state.wildIndustryPile++;
            player.hasWildIndustry = false;
        }

        player.hand.splice(cardIndex, 1);
    }

    // ========================================================================
    // Get valid cards for an action
    // ========================================================================

    getValidCardsForAction(playerId, action, target = null) {
        const player = this.state.players[playerId];
        const validIndices = [];
        const canUseIndustryCardAtTarget = action === ACTIONS.BUILD && target
            ? this.canUseIndustryCardAtLocation(playerId, target.cityId)
            : false;

        player.hand.forEach((card, idx) => {
            switch (action) {
                case ACTIONS.BUILD:
                    if (target) {
                        if (isBreweryFarm(target.cityId)) {
                            if (card.type === CARD_TYPES.INDUSTRY &&
                                card.industryType === target.industryType &&
                                canUseIndustryCardAtTarget) {
                                validIndices.push(idx);
                            } else if (card.type === CARD_TYPES.WILD_INDUSTRY &&
                                canUseIndustryCardAtTarget) {
                                validIndices.push(idx);
                            }
                            break;
                        }
                        if (card.type === CARD_TYPES.LOCATION && card.location === target.cityId) {
                            validIndices.push(idx);
                        } else if (card.type === CARD_TYPES.INDUSTRY &&
                            card.industryType === target.industryType &&
                            canUseIndustryCardAtTarget) {
                            validIndices.push(idx);
                        } else if (card.type === CARD_TYPES.WILD_LOCATION) {
                            validIndices.push(idx);
                        } else if (card.type === CARD_TYPES.WILD_INDUSTRY &&
                            canUseIndustryCardAtTarget) {
                            validIndices.push(idx);
                        }
                    } else {
                        // Any card can potentially be used for build
                        validIndices.push(idx);
                    }
                    break;

                case ACTIONS.NETWORK:
                case ACTIONS.DEVELOP:
                case ACTIONS.SELL:
                case ACTIONS.LOAN:
                case ACTIONS.PASS:
                    // Any card can be discarded for these actions
                    validIndices.push(idx);
                    break;

                case ACTIONS.SCOUT:
                    // All cards are candidates for scout discard
                    validIndices.push(idx);
                    break;
            }
        });

        return validIndices;
    }
}
