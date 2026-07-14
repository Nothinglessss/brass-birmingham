// ============================================================================
// Brass: Birmingham - UI Manager
// Enhanced with phase bar, game log, turn transitions, card selection mode
// ============================================================================

// SVG icon paths for card display
const CARD_SVG_ICONS = {
    [INDUSTRY_TYPES.COTTON_MILL]: '<svg viewBox="-15 -15 30 30" class="card-svg-icon"><path d="M-10,10 L-10,-4 L-6,-4 L-6,-8 L-2,-8 L-2,-12 L2,-12 L2,-8 L10,-8 L10,10 Z" fill="#b8a68e" stroke="#8a7a68" stroke-width="1"/></svg>',
    [INDUSTRY_TYPES.COAL_MINE]: '<svg viewBox="-15 -15 30 30" class="card-svg-icon"><polygon points="0,-12 10,0 0,12 -10,0" fill="#555" stroke="#888" stroke-width="1"/></svg>',
    [INDUSTRY_TYPES.IRON_WORKS]: '<svg viewBox="-15 -15 30 30" class="card-svg-icon"><polygon points="0,-10 5,-8.7 8.7,-5 10,0 8.7,5 5,8.7 0,10 -5,8.7 -8.7,5 -10,0 -8.7,-5 -5,-8.7" fill="#d4760a" stroke="#a05808" stroke-width="1"/><circle cx="0" cy="0" r="3" fill="#2d2519"/></svg>',
    [INDUSTRY_TYPES.MANUFACTURER]: '<svg viewBox="-15 -15 30 30" class="card-svg-icon"><rect x="-8" y="-6" width="16" height="12" rx="1" fill="#8b6914" stroke="#6a5010" stroke-width="1"/><line x1="-8" y1="0" x2="8" y2="0" stroke="#6a5010" stroke-width="0.8"/><line x1="0" y1="-6" x2="0" y2="6" stroke="#6a5010" stroke-width="0.8"/></svg>',
    [INDUSTRY_TYPES.POTTERY]: '<svg viewBox="-15 -15 30 30" class="card-svg-icon"><path d="M-3,-10 L3,-10 L4,-6 L8,2 L6,10 L-6,10 L-8,2 L-4,-6 Z" fill="#b03a2e" stroke="#8a2a20" stroke-width="1"/></svg>',
    [INDUSTRY_TYPES.BREWERY]: '<svg viewBox="-15 -15 30 30" class="card-svg-icon"><ellipse cx="0" cy="0" rx="8" ry="10" fill="#d4a017" stroke="#a08010" stroke-width="1"/><line x1="-7" y1="-3" x2="7" y2="-3" stroke="#a08010" stroke-width="0.8"/><line x1="-7" y1="3" x2="7" y2="3" stroke="#a08010" stroke-width="0.8"/></svg>',
};

class UIManager {
    constructor() {
        this.state = null;
        this.logic = null;
        this.renderer = null;
        this.selectedAction = null;
        this.selectedCard = null;
        this.actionStep = 0; // Multi-step action tracking
        this.pendingData = {}; // Data accumulated during multi-step actions
        this.sellSession = null; // One-card Sell action spanning sequential industries
        this.gameLog = []; // Game log entries
        this.previousPlayerId = null; // Track player changes for transitions
    }

    init(gameState, gameLogic, boardRenderer) {
        this.state = gameState;
        this.logic = gameLogic;
        this.renderer = boardRenderer;

        this.bindEvents();
        this.addLogEntry(null, `Game started with ${this.state.numPlayers} players`, 'system');
        this.addLogEntry(null, `Canal Era`, 'era');
        this.previousPlayerId = this.state.currentPlayerId;
        this.refresh();
    }

    // ========================================================================
    // Event Binding
    // ========================================================================

    bindEvents() {
        // Action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                this.onActionSelected(action);
            });
        });

        // Modal close
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());

        // Board click events (delegated)
        document.getElementById('game-board').addEventListener('click', (e) => {
            this.onBoardClick(e);
        });

        // Phase bar cancel button
        document.getElementById('phase-cancel-btn').addEventListener('click', () => {
            this.cancelAction();
        });

        // Escape key to cancel action
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.selectedAction) {
                    this.cancelAction();
                }
            }
        });
    }

    // ========================================================================
    // Refresh UI
    // ========================================================================

    refresh() {
        this.updateTopBar();
        this.updatePlayerPanels();
        this.updateHand();
        this.updateActionButtons();
        this.updatePlayerMat();
        this.updateMarkets();
        this.updatePhaseBar();
        this.renderer.fullUpdate(this.state);
    }

    updateTopBar() {
        const player = this.state.currentPlayer;
        document.getElementById('era-label').textContent =
            this.state.era === ERA.CANAL ? 'Canal Era' : 'Rail Era';
        document.getElementById('round-label').textContent =
            `Round ${this.state.round} | Deck: ${this.state.drawDeck.length}`;

        const playerLabel = document.getElementById('current-player-label');
        playerLabel.textContent = `${player.name}'s Turn`;
        playerLabel.style.backgroundColor = player.color;
        playerLabel.style.color = player.colorName === 'White' ? '#1a1510' : 'white';

        const actionsLeft = this.state.actionsPerTurn - this.state.actionsThisTurn;
        document.getElementById('actions-remaining-label').textContent =
            `${actionsLeft} action${actionsLeft !== 1 ? 's' : ''} left`;

        // Market prices
        const coalPrice = this.state.getCoalPrice();
        const ironPrice = this.state.getIronPrice();
        document.getElementById('coal-price').textContent =
            coalPrice === Infinity ? 'Empty' : `£${coalPrice}`;
        document.getElementById('iron-price').textContent =
            ironPrice === Infinity ? 'Empty' : `£${ironPrice}`;
    }

    updatePlayerPanels() {
        const container = document.getElementById('player-panels');
        container.innerHTML = '';

        for (const player of this.state.players) {
            const isActive = player.id === this.state.currentPlayerId;
            const panel = document.createElement('div');
            panel.className = `player-panel${isActive ? ' active' : ''}`;
            // Set the left border color via the panel itself (CSS uses border-left)
            panel.style.borderLeftColor = player.color;

            panel.innerHTML = `
                <div class="player-panel-header">
                    <span class="player-panel-name" style="color: ${player.color}">${player.name}</span>
                    <span class="player-panel-vp">${player.vp} <span style="font-size:10px;font-weight:400;color:var(--text-muted)">VP</span></span>
                </div>
                <div class="player-panel-stats">
                    <span class="player-panel-stat" title="Money" style="color:#c9a84c">£${player.money}</span>
                    <span class="player-panel-stat player-panel-spent" title="Money spent this round">£${this.state.moneySpentThisRound[player.id] ?? 0} spent</span>
                    <span class="player-panel-stat" title="Income">&#8679; ${player.income}</span>
                    <span class="player-panel-stat" title="Cards">${player.hand.length} cds</span>
                    <span class="player-panel-stat" title="Links">
                        ${this.state.era === ERA.CANAL ? player.linksRemaining.canal : player.linksRemaining.rail} lnk
                    </span>
                </div>
            `;
            container.appendChild(panel);
        }
    }

    updateHand() {
        const container = document.getElementById('player-hand');
        container.innerHTML = '';

        const player = this.state.currentPlayer;
        const playerId = this.state.currentPlayerId;
        const inCardSelectMode = this.actionStep >= 2 && this.selectedAction;

        // Get valid card indices for current action
        let validCardIndices = null;
        if (inCardSelectMode) {
            const target = this.selectedAction === ACTIONS.BUILD ? this.pendingData : null;
            validCardIndices = this.logic.getValidCardsForAction(playerId, this.selectedAction, target);
        }

        player.hand.forEach((card, idx) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            cardEl.dataset.index = idx;

            if (card.type === CARD_TYPES.LOCATION) {
                cardEl.classList.add('location-card');
                const city = CITIES[card.location];
                const regionColor = city ? REGION_COLORS[city.region]?.fill : '#4a4a4a';

                // Apply region color as background tint so cards are visually distinct by region
                if (regionColor) {
                    cardEl.style.borderColor = regionColor;
                    cardEl.style.boxShadow = `0 0 6px ${regionColor}55`;
                }

                cardEl.innerHTML = `
                    <div class="card-type">Location</div>
                    <div style="font-size:20px;margin:4px 0;">📍</div>
                    <div class="card-name">${card.name}</div>
                `;
            } else if (card.type === CARD_TYPES.INDUSTRY) {
                cardEl.classList.add('industry-card');
                const display = INDUSTRY_DISPLAY[card.industryType];
                const svgIcon = CARD_SVG_ICONS[card.industryType] || '';
                cardEl.innerHTML = `
                    <div class="card-type">Industry</div>
                    ${svgIcon || `<div class="card-icon">${display.icon}</div>`}
                    <div class="card-name">${display.name}</div>
                `;
            } else if (card.type === CARD_TYPES.WILD_LOCATION) {
                cardEl.classList.add('wild-card');
                cardEl.innerHTML = `
                    <div class="card-type">Wild</div>
                    <div class="card-icon">&#10038;</div>
                    <div class="card-name">Location</div>
                `;
            } else if (card.type === CARD_TYPES.WILD_INDUSTRY) {
                cardEl.classList.add('wild-card');
                cardEl.innerHTML = `
                    <div class="card-type">Wild</div>
                    <div class="card-icon">&#10040;</div>
                    <div class="card-name">Industry</div>
                `;
            }

            if (this.selectedCard === idx) {
                cardEl.classList.add('selected');
            }

            // Mark cards already queued for scout discard
            if (this.selectedAction === ACTIONS.SCOUT &&
                    this.pendingData.scoutCards && this.pendingData.scoutCards.includes(idx)) {
                cardEl.classList.add('scout-queued');
            }

            // Card selection mode visual states
            if (inCardSelectMode && validCardIndices) {
                if (validCardIndices.includes(idx)) {
                    cardEl.classList.add('valid-discard');
                } else {
                    cardEl.classList.add('invalid-discard');
                }
            }

            cardEl.addEventListener('click', () => this.onCardClicked(idx));
            container.appendChild(cardEl);
        });

        // Toggle card-select-mode class on bottom panel
        const bottomPanel = document.getElementById('bottom-panel');
        if (inCardSelectMode) {
            bottomPanel.classList.add('card-select-mode');
        } else {
            bottomPanel.classList.remove('card-select-mode');
        }
    }

    updateActionButtons() {
        const playerId = this.state.currentPlayerId;

        document.querySelectorAll('.action-btn').forEach(btn => {
            const action = btn.dataset.action;
            const canDo = this.logic.canPerformAction(action, playerId);
            btn.disabled = !canDo;
            btn.classList.toggle('active', this.selectedAction === action);

            // Disabled tooltips
            if (!canDo) {
                const reason = this.logic.getDisabledReason(action, playerId);
                btn.title = reason || 'Cannot perform this action';
            } else {
                // Restore default tooltips
                const defaultTitles = {
                    build: 'Build an industry tile',
                    network: 'Build a canal or rail link',
                    develop: 'Remove lower-level tiles',
                    sell: 'Sell cotton, goods, or pottery',
                    loan: 'Take a £30 loan',
                    scout: 'Trade 3 cards for 2 wild cards',
                    pass: 'Pass (discard a card)',
                };
                btn.title = defaultTitles[action] || '';
            }
        });
    }

    updatePlayerMat() {
        const container = document.getElementById('player-mat');
        container.innerHTML = '';

        const remaining = this.state.getRemainingTiles(this.state.currentPlayerId);

        for (const [type, data] of Object.entries(remaining)) {
            const display = INDUSTRY_DISPLAY[type];
            const div = document.createElement('div');
            div.className = 'mat-industry';

            let tilesHtml = '';
            const allTiles = this.state.currentPlayer.industryTiles[type];
            allTiles.forEach(tile => {
                const cls = tile.used ? 'mat-tile used' : 'mat-tile available';
                tilesHtml += `<div class="${cls}" data-type="${type}" title="${display.name} Lv${tile.level} - Cost: £${tile.cost}">${tile.level}</div>`;
            });

            div.innerHTML = `
                <div class="mat-industry-label">${display.shortName} (${data.count})</div>
                <div class="mat-tiles">${tilesHtml}</div>
            `;
            container.appendChild(div);
        }
    }

    updateMarkets() {
        // Coal market
        const coalTrack = document.getElementById('coal-track');
        coalTrack.innerHTML = '';
        const coalPrice = this.state.getCoalPrice();
        document.getElementById('coal-current-price').textContent =
            coalPrice === Infinity ? 'Empty' : `Price: £${coalPrice}`;

        for (let i = 0; i < COAL_MARKET_PRICES.length; i++) {
            const filled = i >= (COAL_MARKET_PRICES.length - this.state.coalMarket);
            const space = document.createElement('div');
            space.className = `market-space${filled ? ' filled coal' : ''}`;
            space.title = `£${COAL_MARKET_PRICES[i]}`;
            if (!filled) space.textContent = COAL_MARKET_PRICES[i];
            coalTrack.appendChild(space);
        }

        // Iron market
        const ironTrack = document.getElementById('iron-track');
        ironTrack.innerHTML = '';
        const ironPrice = this.state.getIronPrice();
        document.getElementById('iron-current-price').textContent =
            ironPrice === Infinity ? 'Empty' : `Price: £${ironPrice}`;

        for (let i = 0; i < IRON_MARKET_PRICES.length; i++) {
            const filled = i >= (IRON_MARKET_PRICES.length - this.state.ironMarket);
            const space = document.createElement('div');
            space.className = `market-space${filled ? ' filled iron' : ''}`;
            space.title = `£${IRON_MARKET_PRICES[i]}`;
            if (!filled) space.textContent = IRON_MARKET_PRICES[i];
            ironTrack.appendChild(space);
        }
    }

    // ========================================================================
    // Phase Bar
    // ========================================================================

    updatePhaseBar() {
        const bar = document.getElementById('action-phase-bar');
        const steps = bar.querySelectorAll('.phase-step');
        const instruction = document.getElementById('phase-instruction');

        if (!this.selectedAction) {
            bar.classList.add('hidden');
            return;
        }

        bar.classList.remove('hidden');

        // Determine which step we're on
        let currentStep = 1; // Choose Action
        let instructionText = 'Select an action';

        if (this.selectedAction && this.actionStep === 0) {
            currentStep = 2; // Select Target
            instructionText = this.getTargetInstruction();
        } else if (this.actionStep === 1) {
            currentStep = 3; // Select Resources
            instructionText = this.pendingData.selectingFreeDevelop
                ? 'Choose an industry for free Develop'
                : 'Choose which resource source to consume';
        } else if (this.actionStep >= 2) {
            currentStep = 4; // Discard Card
            if (this.selectedAction === ACTIONS.SCOUT) {
                const remaining = 3 - (this.pendingData.scoutCards?.length || 0);
                instructionText = `Select ${remaining} card${remaining !== 1 ? 's' : ''} to discard`;
            } else {
                instructionText = 'Click a card to discard';
            }
        }

        steps.forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            step.classList.remove('active', 'completed');
            if (stepNum < currentStep) {
                step.classList.add('completed');
            } else if (stepNum === currentStep) {
                step.classList.add('active');
            }
        });

        instruction.textContent = instructionText;
    }

    getTargetInstruction() {
        switch (this.selectedAction) {
            case ACTIONS.BUILD: return 'Select what to build from the list';
            case ACTIONS.NETWORK: return 'Select a connection to build';
            case ACTIONS.DEVELOP: return 'Select a tile to develop';
            case ACTIONS.SELL: return 'Select industries to sell';
            case ACTIONS.LOAN: return 'Select a card to discard for £30 loan';
            case ACTIONS.SCOUT: return 'Select 3 cards to discard';
            case ACTIONS.PASS: return 'Select a card to discard';
            default: return '';
        }
    }

    beginResourcePlanning(targetData) {
        this.pendingData = {
            ...targetData,
            resourceSelections: [],
        };
        this.actionStep = 1;
        this.advanceResourcePlanning();
    }

    getPendingResourcePlan() {
        const selections = this.pendingData.resourceSelections || [];
        const playerId = this.state?.currentPlayerId ?? 0;
        switch (this.selectedAction) {
            case ACTIONS.BUILD:
                return this.logic.planBuildResources({
                    playerId,
                    cityId: this.pendingData.cityId,
                    slotIndex: this.pendingData.slotIndex,
                    industryType: this.pendingData.industryType,
                }, selections);
            case ACTIONS.NETWORK:
                return this.logic.planNetworkResources({
                    playerId,
                    connectionIds: Array.isArray(this.pendingData.connectionId)
                        ? this.pendingData.connectionId
                        : [this.pendingData.connectionId],
                }, selections);
            case ACTIONS.DEVELOP:
                return this.logic.planDevelopResources({
                    playerId,
                    industryTypes: this.pendingData.industryType2
                        ? [this.pendingData.industryType1, this.pendingData.industryType2]
                        : [this.pendingData.industryType1],
                }, selections);
            case ACTIONS.SELL:
                return this.logic.planSellResources({
                    playerId,
                    tileKey: this.pendingData.tileKey,
                    merchantIndex: this.pendingData.merchantIndex,
                }, selections);
            default:
                return { status: 'complete', consumptions: [], marketCost: 0 };
        }
    }

    getPendingFreeDevelopOptions(plan) {
        if (this.selectedAction !== ACTIONS.SELL) return [];
        const merchantConsumption = plan.consumptions?.find(unit =>
            unit.sourceType === 'merchant' &&
            unit.merchantIndex === this.pendingData.merchantIndex
        );
        if (!merchantConsumption) return [];

        const merchant = this.state.merchantTiles[merchantConsumption.merchantIndex];
        const merchantData = merchant ? MERCHANTS[merchant.location] : null;
        if (merchantData?.bonusType !== 'develop') return [];

        return this.logic.getFreeDevelopOptions(this.state.currentPlayerId);
    }

    finishResourcePlanning(plan) {
        this.pendingData.resourcePlan = plan;
        this.pendingData.selectingFreeDevelop = false;
        if (this.selectedAction === ACTIONS.SELL && this.sellSession?.committed) {
            this.closeModal();
            this.processAdditionalSell();
            return;
        }
        this.actionStep = 2;
        this.closeModal();
        this.updatePhaseBar();
        this.updateHand();
    }

    advanceResourcePlanning() {
        const plan = this.getPendingResourcePlan();
        if (plan.status === 'complete') {
            const freeDevelopOptions = this.getPendingFreeDevelopOptions(plan);
            if (freeDevelopOptions.length > 0 &&
                !this.pendingData.freeDevelopChoiceResolved) {
                this.pendingData.resourcePlan = plan;
                this.pendingData.selectingFreeDevelop = true;
                this.actionStep = 1;
                this.updatePhaseBar();
                this.showFreeDevelopChoice(freeDevelopOptions);
                return;
            }
            this.finishResourcePlanning(plan);
            return;
        }
        if (plan.status === 'choice') {
            this.actionStep = 1;
            this.updatePhaseBar();
            this.showResourceChoice(plan.nextChoice);
            return;
        }

        this.showToast(plan.message || 'Required resources are no longer available', 'error');
        this.cancelAction();
    }

    getResourceSourceViewModel(source) {
        const resource = source.resource;
        if (source.sourceType === 'market') {
            return {
                title: source.locationName || `${resource} Market`,
                detail: source.generalSupply
                    ? `General supply - £${source.price}`
                    : `Market - £${source.price}`,
                ownerName: 'Neutral',
                ownerColor: null,
                bonus: '',
            };
        }
        if (source.sourceType === 'merchant') {
            const bonusLabels = {
                vp: `VP +${source.bonusAmount}`,
                money: `Money +£${source.bonusAmount}`,
                income: `Income +${source.bonusAmount}`,
                develop: 'Free Develop',
            };
            return {
                title: `${source.locationName} Merchant`,
                detail: `${source.locationName} - 1 beer available`,
                ownerName: 'Neutral',
                ownerColor: null,
                bonus: bonusLabels[source.bonusType] || '',
            };
        }

        const typeLabels = {
            brewery: 'Brewery',
            mine: 'Coal Mine',
            works: 'Iron Works',
        };
        return {
            title: `${source.ownerName} - ${typeLabels[source.sourceType] || 'Industry'}`,
            detail: `${source.locationName} - ${source.available} ${resource} available`,
            ownerName: source.ownerName,
            ownerColor: source.ownerColor,
            bonus: '',
        };
    }

    renderResourceChoiceHtml(choice) {
        let html = `
            <div class="resource-choice-summary">
                Choose ${choice.resource} source - ${choice.remaining} remaining
            </div>
            <div class="choice-list resource-choice-list">
        `;
        for (const source of choice.options) {
            const view = this.getResourceSourceViewModel(source);
            const ownerDot = view.ownerColor
                ? `<span class="resource-owner-dot" style="background:${view.ownerColor}"></span>`
                : '';
            html += `
                <div class="choice-item resource-source" data-source="${source.id}">
                    <div class="choice-item-text">
                        <div class="choice-item-name">${view.title}</div>
                        <div class="choice-item-detail">${view.detail}</div>
                        <div class="resource-owner">${ownerDot}${view.ownerName}</div>
                    </div>
                    ${view.bonus ? `<div class="resource-source-bonus">${view.bonus}</div>` : ''}
                </div>
            `;
        }
        html += '</div>';
        return html;
    }

    showResourceChoice(choice) {
        const resourceName = choice.resource.charAt(0).toUpperCase() + choice.resource.slice(1);
        this.showModal(`Select ${resourceName} Source`, this.renderResourceChoiceHtml(choice), null);
        document.querySelectorAll('#modal-body .resource-source').forEach(item => {
            item.addEventListener('click', () => {
                this.pendingData.resourceSelections.push(item.dataset.source);
                this.advanceResourcePlanning();
            });
        });
    }

    renderFreeDevelopChoiceHtml(options) {
        let html = '<div class="choice-list free-develop-choice-list">';
        for (const option of options) {
            const display = INDUSTRY_DISPLAY[option.type];
            html += `
                <div class="choice-item free-develop-choice"
                     data-industry="${option.type}">
                    <div class="choice-item-icon">${display.icon}</div>
                    <div class="choice-item-text">
                        <div class="choice-item-name">${option.name}</div>
                        <div class="choice-item-detail">Level ${option.level}</div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        return html;
    }

    selectFreeDevelopIndustry(industryType) {
        this.pendingData.freeDevelopIndustryType = industryType;
        this.pendingData.freeDevelopChoiceResolved = true;
        this.pendingData.selectingFreeDevelop = false;
        this.advanceResourcePlanning();
    }

    showFreeDevelopChoice(options) {
        this.showModal(
            'Choose Free Develop',
            this.renderFreeDevelopChoiceHtml(options),
            null
        );
        document.querySelectorAll('#modal-body .free-develop-choice').forEach(item => {
            item.addEventListener('click', () => {
                this.selectFreeDevelopIndustry(item.dataset.industry);
            });
        });
    }

    // ========================================================================
    // Game Log
    // ========================================================================

    addLogEntry(playerId, message, type = 'action') {
        const entry = {
            playerId,
            message,
            type,
            timestamp: Date.now(),
        };

        this.gameLog.unshift(entry); // Newest first
        if (this.gameLog.length > 100) this.gameLog.pop();
        this.renderLog();
    }

    renderLog() {
        const container = document.getElementById('game-log');
        if (!container) return;

        container.innerHTML = '';

        for (const entry of this.gameLog) {
            const div = document.createElement('div');
            div.className = 'log-entry';

            if (entry.type === 'system') {
                div.classList.add('log-system');
                div.textContent = entry.message;
            } else if (entry.type === 'era') {
                div.classList.add('log-era');
                div.textContent = entry.message;
            } else {
                const player = entry.playerId !== null ? this.state.players[entry.playerId] : null;
                if (player) {
                    div.innerHTML = `<span class="log-player" style="color:${player.color}">${player.name}</span> ${entry.message}`;
                } else {
                    div.textContent = entry.message;
                }
            }

            container.appendChild(div);
        }
    }

    // ========================================================================
    // Turn Transition
    // ========================================================================

    showTurnTransition(player) {
        const overlay = document.getElementById('turn-transition');
        const nameEl = document.getElementById('turn-transition-name');

        nameEl.textContent = player.name;
        nameEl.style.color = player.color;

        overlay.classList.remove('hidden', 'fade-out');

        // Auto-dismiss after 1.5s
        setTimeout(() => {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.classList.add('hidden');
                overlay.classList.remove('fade-out');
            }, 500);
        }, 1000);
    }

    // ========================================================================
    // Card Selection
    // ========================================================================

    onCardClicked(index) {
        if (this.selectedAction && this.actionStep >= 2) {
            const target = this.selectedAction === ACTIONS.BUILD ? this.pendingData : null;
            const validCardIndices = this.logic.getValidCardsForAction(
                this.state.currentPlayerId,
                this.selectedAction,
                target
            );
            if (!validCardIndices.includes(index)) return;
        }

        if (this.selectedCard === index) {
            this.selectedCard = null;
        } else {
            this.selectedCard = index;
        }
        this.updateHand();

        // If we have an action selected and this was a card selection step
        if (this.selectedAction && this.actionStep >= 2) {
            this.processActionStep();
        }
    }

    // ========================================================================
    // Action Selection
    // ========================================================================

    onActionSelected(action) {
        if (this.selectedAction === action) {
            this.cancelAction();
            return;
        }

        this.selectedAction = action;
        this.actionStep = 0;
        this.pendingData = {};
        this.selectedCard = null;
        this.sellSession = action === ACTIONS.SELL
            ? { committed: false, messages: [] }
            : null;

        this.updateActionButtons();
        this.updatePhaseBar();
        this.startAction(action);
    }

    cancelAction() {
        if (this.selectedAction === ACTIONS.SELL && this.sellSession?.committed) {
            this.finishSellAction();
            return;
        }
        this.resetActionSelection();
    }

    resetActionSelection() {
        this.selectedAction = null;
        this.actionStep = 0;
        this.pendingData = {};
        this.selectedCard = null;
        this.sellSession = null;
        this.renderer.setMerchantProductFilter(null);
        this.renderer.clearHighlights();
        this.updateActionButtons();
        this.updateHand();
        this.updatePhaseBar();
        this.closeModal();
    }

    finishSellAction() {
        const messages = this.sellSession?.messages || [];
        this.completeAction({
            success: true,
            message: messages.join(', ') || 'Finished selling',
        });
    }

    // ========================================================================
    // Action Execution
    // ========================================================================

    startAction(action) {
        const playerId = this.state.currentPlayerId;

        switch (action) {
            case ACTIONS.BUILD:
                this.startBuild(playerId);
                break;
            case ACTIONS.NETWORK:
                this.startNetwork(playerId);
                break;
            case ACTIONS.DEVELOP:
                this.startDevelop(playerId);
                break;
            case ACTIONS.SELL:
                this.startSell(playerId);
                break;
            case ACTIONS.LOAN:
                this.startLoan(playerId);
                break;
            case ACTIONS.SCOUT:
                this.startScout(playerId);
                break;
            case ACTIONS.PASS:
                this.startPass(playerId);
                break;
        }
    }

    // ========================================================================
    // BUILD
    // ========================================================================

    startBuild(playerId) {
        const targets = this.logic.getValidBuildTargets(playerId);
        if (targets.length === 0) {
            this.showToast('No valid build targets available', 'warning');
            this.cancelAction();
            return;
        }

        // Store targets for board-click selection
        this.pendingData.buildTargets = targets;

        // Highlight valid slots on the board
        this.renderer.highlightSlots(targets);

        this.showBuildModal(playerId, targets);
    }

    getBuildFlipRequirementText(industryType, tileData) {
        if (isResourceIndustry(industryType)) {
            return `Flip: ${tileData.resourceCubes || 0} ${this.getBuildFlipResourceName(industryType)}`;
        }

        if (isSellableIndustry(industryType)) {
            return `Flip: ${tileData.beersToSell || 0} beer`;
        }

        return '';
    }

    getBuildFlipResourceName(industryType) {
        switch (industryType) {
            case INDUSTRY_TYPES.COAL_MINE: return 'coal';
            case INDUSTRY_TYPES.IRON_WORKS: return 'iron';
            case INDUSTRY_TYPES.BREWERY: return 'beer';
            default: return 'resources';
        }
    }

    showBuildModal(playerId, targets) {
        const byCity = {};
        for (const t of targets) {
            if (!byCity[t.cityId]) byCity[t.cityId] = [];
            byCity[t.cityId].push(t);
        }

        let html = '<div class="choice-list">';
        for (const [cityId, cityTargets] of Object.entries(byCity)) {
            const cityName = CITIES[cityId]?.name || BREWERY_FARMS[cityId]?.name || cityId;
            for (const target of cityTargets) {
                const display = INDUSTRY_DISPLAY[target.industryType];
                const flipRequirement = this.getBuildFlipRequirementText(target.industryType, target.tileData);
                html += `
                    <div class="choice-item" data-city="${target.cityId}"
                         data-slot="${target.slotIndex}" data-type="${target.industryType}">
                        <div class="choice-item-icon">${display.icon}</div>
                        <div class="choice-item-text">
                            <div class="choice-item-name">${display.name} Lv${target.tileData.level}</div>
                            <div class="choice-item-detail">${cityName}${CITIES[cityId] ? ` (Slot ${target.slotIndex + 1})` : ''}</div>
                        </div>
                        <div class="choice-item-cost">
                            <div class="choice-item-build-cost">£${target.cost.total}
                                ${target.cost.coal > 0 ? ` + ${target.cost.coal} coal` : ''}
                                ${target.cost.iron > 0 ? ` + ${target.cost.iron} iron` : ''}
                            </div>
                            ${flipRequirement ? `<div class="choice-item-flip">${flipRequirement}</div>` : ''}
                        </div>
                    </div>
                `;
            }
        }
        html += '</div>';

        this.showModal('Build Industry', html, () => {});

        document.querySelectorAll('#modal-body .choice-item').forEach(item => {
            item.addEventListener('click', () => {
                const cityId = item.dataset.city;
                const slotIndex = parseInt(item.dataset.slot);
                const indType = item.dataset.type;
                this.closeModal();
                this.renderer.clearHighlights();
                this.beginResourcePlanning({ cityId, slotIndex, industryType: indType });
            });
        });
    }

    // ========================================================================
    // NETWORK
    // ========================================================================

    startNetwork(playerId) {
        const targets = this.logic.getValidNetworkTargets(playerId);
        if (targets.length === 0) {
            this.showToast('No valid network targets', 'warning');
            this.cancelAction();
            return;
        }

        this.renderer.highlightConnections(targets.flatMap(t => t.connectionIds || [t.connectionId]));

        let html = '<div class="choice-list">';
        for (const target of targets) {
            const city1 = CITIES[target.cities[0]]?.name || MERCHANTS[target.cities[0]]?.name || BREWERY_FARMS[target.cities[0]]?.name || target.cities[0];
            const city2 = CITIES[target.cities[1]]?.name || MERCHANTS[target.cities[1]]?.name || BREWERY_FARMS[target.cities[1]]?.name || target.cities[1];
            const secondLabel = target.secondCities
                ? ` + ${(CITIES[target.secondCities[0]]?.name || MERCHANTS[target.secondCities[0]]?.name || BREWERY_FARMS[target.secondCities[0]]?.name || target.secondCities[0])} - ${(CITIES[target.secondCities[1]]?.name || MERCHANTS[target.secondCities[1]]?.name || BREWERY_FARMS[target.secondCities[1]]?.name || target.secondCities[1])}`
                : '';
            html += `
                <div class="choice-item" data-conns="${(target.connectionIds || [target.connectionId]).join('|')}">
                    <div class="choice-item-icon">${target.type === 'canal' ? '~' : '#'}</div>
                    <div class="choice-item-text">
                        <div class="choice-item-name">${city1} — ${city2}</div>
                        <div class="choice-item-detail">${target.secondCities ? `First link, then${secondLabel}` : target.type}</div>
                    </div>
                    <div class="choice-item-cost">£${target.cost}</div>
                </div>
            `;
        }
        html += '</div>';

        this.showModal('Build Link', html, () => {});

        document.querySelectorAll('#modal-body .choice-item').forEach(item => {
            item.addEventListener('click', () => {
                const ids = item.dataset.conns.split('|');
                this.closeModal();
                this.beginResourcePlanning({
                    connectionId: ids.length === 1 ? ids[0] : ids,
                });
            });
        });
    }

    // ========================================================================
    // DEVELOP
    // ========================================================================

    startDevelop(playerId) {
        const types = this.logic.getDevelopableTypes(playerId);
        if (types.length === 0) {
            this.showToast('Nothing to develop', 'warning');
            this.cancelAction();
            return;
        }

        let html = '<p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;">Remove 1-2 tiles from your mat to access higher levels. Costs 1 iron per tile.</p>';
        html += '<div class="choice-list">';
        for (const t of types) {
            const display = INDUSTRY_DISPLAY[t.type];
            html += `
                <div class="choice-item" data-type="${t.type}">
                    <div class="choice-item-icon">${display.icon}</div>
                    <div class="choice-item-text">
                        <div class="choice-item-name">${display.name} Lv${t.level}</div>
                        <div class="choice-item-detail">Remove this tile</div>
                    </div>
                </div>
            `;
        }
        html += '</div>';

        this.showModal('Develop (Select 1st tile)', html, () => {});

        document.querySelectorAll('#modal-body .choice-item').forEach(item => {
            item.addEventListener('click', () => {
                const type1 = item.dataset.type;
                this.pendingData.industryType1 = type1;
                this.showDevelopSecondChoice(playerId, type1);
            });
        });
    }

    showDevelopSecondChoice(playerId, firstType) {
        const types = this.logic.getDevelopableTypes(playerId);
        const remainingTypes = types.filter(t => {
            if (t.type === firstType) {
                const remaining = this.state.getRemainingTiles(playerId);
                return remaining[t.type].count > 1;
            }
            return true;
        });

        const canAffordTwo = remainingTypes.some(candidate => {
            const plan = this.logic.previewDevelopResources(
                playerId,
                [firstType, candidate.type]
            );
            return plan.status === 'complete' &&
                plan.marketCost <= this.state.players[playerId].money;
        });

        if (!canAffordTwo || remainingTypes.length === 0) {
            this.closeModal();
            this.beginResourcePlanning({
                industryType1: firstType,
                industryType2: null,
            });
            return;
        }

        let html = '<p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;">Optionally develop a second tile (costs another iron).</p>';
        html += '<div class="choice-list">';
        html += '<div class="choice-item" data-type="none"><div class="choice-item-text"><div class="choice-item-name">Done (develop 1 tile only)</div></div></div>';

        for (const t of remainingTypes) {
            const display = INDUSTRY_DISPLAY[t.type];
            html += `
                <div class="choice-item" data-type="${t.type}">
                    <div class="choice-item-icon">${display.icon}</div>
                    <div class="choice-item-text">
                        <div class="choice-item-name">${display.name} Lv${t.level}</div>
                    </div>
                </div>
            `;
        }
        html += '</div>';

        this.showModal('Develop (Optional 2nd tile)', html, () => {});

        document.querySelectorAll('#modal-body .choice-item').forEach(item => {
            item.addEventListener('click', () => {
                const type2 = item.dataset.type;
                this.closeModal();
                this.beginResourcePlanning({
                    industryType1: firstType,
                    industryType2: type2 === 'none' ? null : type2,
                });
            });
        });
    }

    // ========================================================================
    // SELL
    // ========================================================================

    renderSellFooterHtml(canFinish) {
        if (!canFinish) return '';
        return '<button class="modal-btn modal-btn-primary" id="sell-done-btn">Done Selling</button>';
    }

    startSell(playerId) {
        this.sellSession ||= { committed: false, messages: [] };
        const targets = this.logic.getValidSellTargets(playerId);
        if (targets.length === 0) {
            this.showToast('Nothing to sell', 'warning');
            this.cancelAction();
            return;
        }

        const sellTypes = [...new Set(targets.map(target => target.tile.type))];
        this.renderer.setMerchantProductFilter(sellTypes.length === 1 ? sellTypes[0] : null);

        const instruction = this.sellSession.committed
            ? 'Select an industry to sell, or finish the action.'
            : 'Select one industry to sell.';
        let html = `<p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;">${instruction}</p>`;
        html += '<div class="choice-list">';
        for (const target of targets) {
            const display = INDUSTRY_DISPLAY[target.tile.type];
            const cityName = CITIES[target.cityId]?.name || target.cityId;
            const merchantName = MERCHANTS[target.merchantLocation]?.name || target.merchantLocation;
            html += `
                <div class="choice-item" data-key="${target.key}" data-merchant="${target.merchantIndex}" data-selected="false">
                    <div class="choice-item-icon">${display.icon}</div>
                    <div class="choice-item-text">
                        <div class="choice-item-name">${display.name} Lv${target.tile.tileData.level}</div>
                        <div class="choice-item-detail">${cityName} to ${merchantName} | VP: ${target.tile.tileData.vp} | Income: +${target.tile.tileData.income}
                        ${target.beerNeeded > 0 ? ` | Beer: ${target.beerNeeded}` : ''}</div>
                    </div>
                </div>
            `;
        }
        html += '</div>';

        const footerHtml = this.renderSellFooterHtml(this.sellSession.committed);
        this.showModal('Sell Goods', html, null, footerHtml);

        document.getElementById('sell-done-btn')?.addEventListener('click', () => {
            this.finishSellAction();
        });

        document.querySelectorAll('#modal-body .choice-item').forEach(item => {
            item.addEventListener('click', () => {
                const merchantIndex = parseInt(item.dataset.merchant);
                const target = targets.find(t =>
                    t.key === item.dataset.key && t.merchantIndex === merchantIndex
                );
                this.renderer.setMerchantProductFilter(target ? target.tile.type : null);
                this.closeModal();
                this.beginResourcePlanning({
                    tileKey: item.dataset.key,
                    merchantIndex,
                });
            });
        });
    }

    processAdditionalSell() {
        const result = this.logic.executeAdditionalSell(
            this.state.currentPlayerId,
            this.pendingData.tileKey,
            this.pendingData.merchantIndex,
            this.pendingData.resourceSelections,
            this.pendingData.freeDevelopIndustryType
        );
        this.handleSellResult(result);
    }

    handleSellResult(result) {
        const playerId = this.state.currentPlayerId;
        if (!result.success) {
            this.showToast(result.message, 'error');
            if (!this.sellSession?.committed) {
                this.resetActionSelection();
                return;
            }
            this.pendingData = {};
            this.selectedCard = null;
            this.actionStep = 0;
            if (this.logic.getValidSellTargets(playerId).length > 0) {
                this.startSell(playerId);
            } else {
                this.finishSellAction();
            }
            return;
        }

        this.addLogEntry(playerId, result.message.toLowerCase());
        this.sellSession ||= { committed: false, messages: [] };
        this.sellSession.committed = true;
        this.sellSession.messages.push(result.message);
        this.pendingData = {};
        this.selectedCard = null;
        this.actionStep = 0;

        if (this.logic.getValidSellTargets(playerId).length === 0) {
            this.finishSellAction();
            return;
        }
        this.updatePhaseBar();
        this.updateHand();
        this.startSell(playerId);
    }

    // ========================================================================
    // LOAN
    // ========================================================================

    startLoan(playerId) {
        this.actionStep = 2;
        this.updatePhaseBar();
        this.updateHand();
    }

    // ========================================================================
    // SCOUT
    // ========================================================================

    startScout(playerId) {
        this.pendingData.scoutCards = [];
        this.actionStep = 2;
        this.updatePhaseBar();
        this.updateHand();
    }

    // ========================================================================
    // PASS
    // ========================================================================

    startPass(playerId) {
        this.actionStep = 2;
        this.updatePhaseBar();
        this.updateHand();
    }

    // ========================================================================
    // Process multi-step action
    // ========================================================================

    processActionStep() {
        if (this.selectedCard === null) return;

        const playerId = this.state.currentPlayerId;
        const cardIndex = this.selectedCard;

        switch (this.selectedAction) {
            case ACTIONS.BUILD: {
                const result = this.logic.executeBuild(
                    playerId,
                    this.pendingData.cityId,
                    this.pendingData.slotIndex,
                    this.pendingData.industryType,
                    cardIndex,
                    this.pendingData.resourceSelections
                );
                if (result.success) {
                    const display = INDUSTRY_DISPLAY[this.pendingData.industryType];
                    const cityName = CITIES[this.pendingData.cityId]?.name || BREWERY_FARMS[this.pendingData.cityId]?.name || this.pendingData.cityId;
                    this.addLogEntry(playerId, `built ${display.name} in ${cityName}`);
                }
                this.completeAction(result);
                break;
            }

            case ACTIONS.NETWORK: {
                const result = this.logic.executeNetwork(
                    playerId,
                    this.pendingData.connectionId,
                    cardIndex,
                    this.pendingData.resourceSelections
                );
                if (result.success) {
                    this.addLogEntry(playerId, result.message.replace(/^Built /, 'built '));
                }
                this.completeAction(result);
                break;
            }

            case ACTIONS.DEVELOP: {
                const result = this.logic.executeDevelop(
                    playerId,
                    this.pendingData.industryType1,
                    this.pendingData.industryType2,
                    cardIndex,
                    this.pendingData.resourceSelections
                );
                if (result.success) {
                    this.addLogEntry(playerId, result.message.toLowerCase());
                }
                this.completeAction(result);
                break;
            }

            case ACTIONS.SELL: {
                const result = this.logic.executeSell(
                    playerId,
                    this.pendingData.tileKey,
                    this.pendingData.merchantIndex,
                    cardIndex,
                    this.pendingData.resourceSelections,
                    this.pendingData.freeDevelopIndustryType
                );
                this.handleSellResult(result);
                break;
            }

            case ACTIONS.LOAN: {
                const result = this.logic.executeLoan(playerId, cardIndex);
                if (result.success) {
                    this.addLogEntry(playerId, `took £${LOAN_AMOUNT} loan`);
                }
                this.completeAction(result);
                break;
            }

            case ACTIONS.SCOUT: {
                if (!this.pendingData.scoutCards) this.pendingData.scoutCards = [];
                // Prevent selecting the same card index twice
                if (this.pendingData.scoutCards.includes(cardIndex)) {
                    this.selectedCard = null;
                    this.updateHand();
                    break;
                }
                this.pendingData.scoutCards.push(cardIndex);

                if (this.pendingData.scoutCards.length >= 3) {
                    const result = this.logic.executeScout(playerId, this.pendingData.scoutCards);
                    if (result.success) {
                        this.addLogEntry(playerId, 'scouted (gained wild cards)');
                    }
                    this.completeAction(result);
                } else {
                    this.selectedCard = null;
                    this.updatePhaseBar();
                    this.updateHand();
                }
                break;
            }

            case ACTIONS.PASS: {
                const result = this.logic.executePass(playerId, cardIndex);
                if (result.success) {
                    this.addLogEntry(playerId, 'passed');
                }
                this.completeAction(result);
                break;
            }
        }
    }

    completeAction(result) {
        if (result.success) {
            this.showToast(result.message, 'success');
        } else {
            this.showToast(result.message, 'error');
            this.resetActionSelection();
            return;
        }

        const previousPlayerId = this.state.currentPlayerId;

        // Reset action state
        this.selectedAction = null;
        this.actionStep = 0;
        this.pendingData = {};
        this.selectedCard = null;
        this.sellSession = null;
        this.renderer.setMerchantProductFilter(null);
        this.renderer.clearHighlights();

        const turnResult = this.state.advanceTurn();

        if (turnResult === 'endCanalEra') {
            this.addLogEntry(null, 'Canal Era Scoring', 'era');
            const scores = this.state.endCanalEra();
            this.addLogEntry(null, 'Rail Era', 'era');
            this.showScoring('Canal Era Complete', scores);
        } else if (turnResult === 'endGame') {
            this.addLogEntry(null, 'Final Scoring', 'era');
            const scores = this.state.endGame();
            this.showGameOver(scores);
        } else {
            // Check if player changed - show transition
            const newPlayerId = this.state.currentPlayerId;
            if (newPlayerId !== previousPlayerId) {
                this.addLogEntry(null, `${this.state.currentPlayer.name}'s turn`, 'system');
                this.showTurnTransition(this.state.currentPlayer);
            }
        }

        this.refresh();
    }

    // ========================================================================
    // Board Click Handler
    // ========================================================================

    onBoardClick(e) {
        const target = e.target.closest('.industry-slot, .connection-line, .brewery-farm, .merchant-group');
        if (!target) return;

        if (this.selectedAction === ACTIONS.BUILD && this.actionStep === 0) {
            const farm = target.closest('.brewery-farm');
            if (farm && farm.classList.contains('highlight-slot')) {
                const farmId = farm.dataset.farm;
                const targets = (this.pendingData.buildTargets || []).filter(
                    t => t.cityId === farmId
                );
                if (targets.length === 1) {
                    const targetData = {
                        cityId: farmId,
                        slotIndex: targets[0].slotIndex,
                        industryType: targets[0].industryType
                    };
                    this.closeModal();
                    this.renderer.clearHighlights();
                    this.beginResourcePlanning(targetData);
                }
            }

            const slot = target.closest('.industry-slot');
            if (slot && slot.classList.contains('highlight-slot')) {
                const cityId = slot.dataset.city;
                const slotIndex = parseInt(slot.dataset.slot);
                const targets = (this.pendingData.buildTargets || []).filter(
                    t => t.cityId === cityId && t.slotIndex === slotIndex
                );
                if (targets.length === 1) {
                    // Single option for this slot — select it directly
                    this.closeModal();
                    this.renderer.clearHighlights();
                    this.beginResourcePlanning({
                        cityId,
                        slotIndex,
                        industryType: targets[0].industryType,
                    });
                } else if (targets.length > 1) {
                    // Multiple types for this slot — show filtered modal
                    this.closeModal();
                    this.showBuildModal(this.state.currentPlayerId, targets);
                }
            }
        }

        if (this.selectedAction === ACTIONS.NETWORK) {
            const line = target.closest('.connection-line');
            if (line && line.classList.contains('highlight')) {
                const connId = line.dataset.connection;
                this.renderer.clearHighlights();
                this.closeModal();
                this.beginResourcePlanning({ connectionId: connId });
            }
        }
    }

    // ========================================================================
    // Modal
    // ========================================================================

    showModal(title, bodyHtml, onClose, footerHtml = '') {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = bodyHtml;
        document.getElementById('modal-footer').innerHTML = footerHtml;
        document.getElementById('modal-overlay').classList.remove('hidden');
    }

    closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
    }

    // ========================================================================
    // Toast
    // ========================================================================

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ========================================================================
    // Scoring Display
    // ========================================================================

    showScoring(title, scores) {
        const overlay = document.getElementById('scoring-overlay');
        document.getElementById('scoring-title').textContent = title;

        let html = '<table class="scoring-table"><thead><tr><th>Player</th><th>Link VP</th><th>Industry VP</th><th>Total VP</th></tr></thead><tbody>';
        for (const s of scores) {
            const player = this.state.players[s.playerId];
            html += `<tr>
                <td style="color:${player.color}">${player.name}</td>
                <td>${s.linkVP}</td>
                <td>${s.industryVP}</td>
                <td class="total-row">${s.totalVP}</td>
            </tr>`;
        }
        html += '</tbody></table>';

        document.getElementById('scoring-details').innerHTML = html;
        overlay.classList.remove('hidden');

        document.getElementById('scoring-continue-btn').onclick = () => {
            overlay.classList.add('hidden');
            this.refresh();
        };
    }

    showGameOver(scores) {
        const overlay = document.getElementById('gameover-overlay');

        const sorted = [...this.state.players].sort((a, b) => b.vp - a.vp);

        let html = '<table class="scoring-table"><thead><tr><th>Rank</th><th>Player</th><th>VP</th><th>Income</th><th>Money</th></tr></thead><tbody>';
        sorted.forEach((p, i) => {
            html += `<tr${i === 0 ? ' class="total-row"' : ''}>
                <td>${i + 1}</td>
                <td style="color:${p.color}">${p.name}</td>
                <td>${p.vp}</td>
                <td>${p.income}</td>
                <td>£${p.money}</td>
            </tr>`;
        });
        html += '</tbody></table>';

        document.getElementById('final-scores').innerHTML = html;
        overlay.classList.remove('hidden');

        document.getElementById('new-game-btn').onclick = () => {
            overlay.classList.add('hidden');
            document.getElementById('game-screen').classList.remove('active');
            document.getElementById('setup-screen').classList.add('active');
        };
    }
}
