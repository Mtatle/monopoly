"use strict";


class GameView {
    constructor() {
        this.initComponents();
        this.gameInProcess = true;
        this.usedQuestions = {}; // Track which questions have been used per tile
        this.adminUsedQuestions = {}; // Track which questions have been used in admin testing
        this.pendingNextPlayer = undefined; // Track pending next player for question cards
        this.suddenDeathMode = false; // Track if we're in sudden death mode
        this.suddenDeathQuestionIndex = 0; // Track current sudden death question
        this.suddenDeathUsedQuestions = {
            unsubscribe: [],
            block: [],
            close: []
        }; // Track used questions per category
        this.suddenDeathTimer = {
            isRunning: false,
            timeLeft: 20,
            intervalId: null
        }; // Timer for sudden death rounds
        
        this.questionCardTimer = {
            isRunning: false,
            timeLeft: 120, // 2 minutes = 120 seconds
            intervalId: null
        }; // Timer for question cards
        
        // Support Bucks Shop System
        this.teamInventories = {
            0: {}, // Team 1 inventory 
            1: {}  // Team 2 inventory
        };
        this.selectedPurchaseItem = null;
        this.teamPoints = [0, 0]; // Initialize team points
        this.teamCash = [24, 24]; // Initialize team cash (Support Bucks)
        this.landOwners = []; // Track tile ownership: null = unowned, 0 = Team 1, 1 = Team 2
        
        // Initialize audio systems with error handling
        this.initializeAudioSystems();

        // Sudden Death Blitz State
        this.suddenDeathBlitz = {
            active: false,
            currentTeam: null,
            currentCategory: null,
            currentQuestionIndex: 0,
            score: 0,
            timerRunning: false
        };

        // Track used surprise cards during admin testing to avoid duplicates
        this.adminUsedSurpriseIndices = [];

        // Modal auto-hide timeout tracking
        this.modalAutoHideTimeout = null;
    }

    initializeAudioSystems() {
        console.log('🔊 Initializing audio systems for user:', this.userName || 'unknown');
        
        // Initialize AudioManager (for dice, move, cash sounds)
        try {
            if (typeof AudioManager !== 'undefined') {
        this.audioManager = new AudioManager();
                console.log('✅ AudioManager initialized successfully');
            } else {
                console.log('❌ AudioManager class not found');
                this.audioManager = null;
            }
        } catch (error) {
            console.log('❌ AudioManager initialization failed:', error);
            this.audioManager = null;
        }
        
        // Initialize card flip sound
        try {
            this.cardFlipSound = new Audio('/static/sound/card-flip.mp3');
            this.cardFlipSound.volume = 0.8;
            this.cardFlipSound.load(); // Preload the audio
            console.log('✅ Card flip sound initialized');
        } catch (error) {
            console.log('❌ Card flip sound initialization failed:', error);
            this.cardFlipSound = null;
        }
        
        // Initialize backup sounds in case AudioManager fails
        try {
            this.backupSounds = {
                dice: new Audio('/static/sound/dice.mp3'),
                move: new Audio('/static/sound/move.mp3'),
                cash: new Audio('/static/sound/cash.mp3'),
                hover: new Audio('/static/sound/hover.mp3')
            };
            
            // Set volume and preload all backup sounds
            Object.keys(this.backupSounds).forEach(key => {
                this.backupSounds[key].volume = 0.6;
                this.backupSounds[key].load();
            });
            
            console.log('✅ Backup sound system initialized');
        } catch (error) {
            console.log('❌ Backup sound system failed:', error);
            this.backupSounds = {};
        }
    }

    playSound(soundName) {
        console.log(`🔊 Playing sound "${soundName}" for user:`, this.userName || 'unknown');
        
        let soundPlayed = false;
        
        // Try AudioManager first
        if (this.audioManager) {
            try {
                this.audioManager.play(soundName);
                console.log(`✅ Sound "${soundName}" played via AudioManager`);
                soundPlayed = true;
            } catch (error) {
                console.log(`❌ AudioManager failed for "${soundName}":`, error);
            }
        }
        
        // Try backup sounds if AudioManager failed
        if (!soundPlayed && this.backupSounds && this.backupSounds[soundName]) {
            try {
                this.backupSounds[soundName].currentTime = 0;
                const playPromise = this.backupSounds[soundName].play();
                
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log(`✅ Sound "${soundName}" played via backup system`);
                    }).catch(error => {
                        console.log(`❌ Backup sound "${soundName}" autoplay blocked:`, error);
                    });
                }
                soundPlayed = true;
            } catch (error) {
                console.log(`❌ Backup sound "${soundName}" failed:`, error);
            }
        }
        
        if (!soundPlayed) {
            console.log(`❌ All sound systems failed for "${soundName}"`);
        }
    }

    initComponents() {
        this.userName = document.getElementById("username").value;
        this.hostName = document.getElementById("hostname").value;
        this.isAdmin = (this.userName === this.hostName);
        this.isSpectator = document.getElementById("is-spectator").value === 'True';

        if (this.userName === this.hostName) {
            this.$exitControl = document.getElementById("exit-control");
            this.$exitControl.addEventListener("click", this.endGame.bind(this));
            
            // Leaderboard button click handler
            this.$leaderboardToggle = document.getElementById("leaderboard-toggle");
            if (this.$leaderboardToggle) {
                this.$leaderboardToggle.addEventListener("click", this.showCurrentLeaderboard.bind(this));
            }
            
            // Initialize admin panel
            this.initAdminPanel();
            
            // Initialize emergency controls
            this.initEmergencyControls();
            this.initTimerControls();
        this.initQuestionCardTimerControls();
        }

        // Initialize dice message after DOM is ready
        const diceMessageElement = document.getElementById("dice-message");
        this.diceMessage = diceMessageElement ? diceMessageElement.innerHTML : "Roll the dice!";

        this.$usersContainer = document.getElementById("users-container");

        this.$modalCard = document.getElementById("modal-card");
        this.$modalCardContent = document.querySelector("#modal-card .card-content-container");
        this.$modalAvatar = document.getElementById("modal-user-avatar");
        this.$modalMessage = document.getElementById("modal-message-container");
        this.$modalButtons = document.getElementById("modal-buttons-container");
        this.$modalTitle = document.getElementById("modal-title");
        this.$modalSubTitle = document.getElementById("modal-subtitle");

        this.showModal(null, "Welcome to Supportopoly", "", "Loading Game...", [], 5);
        this.initBoard();
        this.initSupportBucksShop();
    }

    initBoard() {
        this.gameController = new GameController({
            // The DOM element in which the drawing will happen.
            containerEl: document.getElementById("game-container"),

            // The base URL from where the BoardController will load its data.
            assetsUrl: "/static/3d_assets",

            onBoardPainted: this.initWebSocket.bind(this)
        });

        window.addEventListener("resize", () => {
            this.gameController.resizeBoard();
        }, false);
    }

    initWebSocket() {
        this.socket = new WebSocket(`ws://${window.location.host}/game/${this.hostName}`);

        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleStatusChange(message);
        };
    }

    onDiceRolled() {
        // Play dice sound immediately when admin rolls
        this.playSound("dice");
        
        // Send dice animation start to all clients immediately
        this.socket.send(JSON.stringify({
            action: "dice_animation_start",
            hostname: this.hostName
        }));
        
        const notifyServer = () => {
            this.socket.send(JSON.stringify({
                action: "roll"
            }));
        };
        setTimeout(notifyServer, 2000);
    }

    handleStatusChange(message) {
        console.log(`📨 Message received for user ${this.userName}:`, message.action, message);
        
        const messageHandlers = {
            "init": this.handleInit,
            "add_err": this.handleAddErr,
            "roll_res": this.handleRollRes,
            "roll_error": this.handleRollError,
            "buy_land": this.handleBuyLand,
            "construct": this.handleConstruct,
            "cancel_decision": this.handleCancel,
            "game_end": this.handleGameEnd,
            "admin_move": this.handleAdminMove,
            "admin_modify_money": this.handleAdminModifyMoney,
            "admin_modify_points": this.handleAdminModifyPoints,
            "admin_rent_money": this.handleAdminRentMoney,
            "admin_reset_game": this.handleAdminResetGame,
            "admin_set_turn": this.handleAdminSetTurn,
            "admin_set_ownership": this.handleAdminSetOwnership,
            "admin_test_card": this.handleAdminTestCard,
            "dice_animation_start": this.handleDiceAnimationStart,
            "card_flipped": this.handleCardFlipped,
            "card_closed": this.handleCardClosed,
            "start_sudden_death": this.handleStartSuddenDeath,
            "show_sudden_death_card": this.handleShowSuddenDeathCard,
            "show_sudden_death_category_selection": this.handleShowSuddenDeathCategorySelection,
            "start_sudden_death_timer": this.handleStartSuddenDeathTimer,
            "reset_sudden_death_timer": this.handleResetSuddenDeathTimer,
            "shop_opened": this.handleShopOpened,
            "shop_closed": this.handleShopClosed,
            "item_purchased": this.handleItemPurchased,
            "item_used": this.handleItemUsed,
            "item_usage_modal_opened": this.handleItemUsageModalOpened,
            "item_usage_modal_closed": this.handleItemUsageModalClosed,
            "show_leaderboard": this.handleShowLeaderboard,
            "close_leaderboard": this.handleCloseLeaderboard,
            "sudden_death_update_score": this.handleSuddenDeathUpdateScore,
            "sudden_death_next_card": this.handleSuddenDeathNextCard,
            "show_sudden_death_category_selection": this.handleSuddenDeathShowCategorySelection,
            "start_sudden_death_blitz": this.handleStartSuddenDeathBlitz,
            "start_question_card_timer": this.handleStartQuestionCardTimer,
            "reset_question_card_timer": this.handleResetQuestionCardTimer,
            "surprise_card_inventory_added": this.handleSurpriseCardInventoryAdded
        };

        if (!this.gameInProcess) {
            console.log(`📨 Game not in process, ignoring message for user ${this.userName}`);
            return;
        }

        if (!messageHandlers[message.action]) {
            console.log(`📨 No handler found for action: ${message.action} for user ${this.userName}`);
            return;
        }

        console.log(`📨 Calling handler for action: ${message.action} for user ${this.userName}`);
        messageHandlers[message.action].bind(this)(message);
    }

    /*
    * Init game status, called after ws.connect
    * players: @see initPlayers
    * amount: @see changeCashAmount
    * points: @see changePointsAmount
    * */
    initGame(players, amount, points, posChange) {
        // Init players
        this.initPlayers(players, posChange);

        // Init cash amount
        this.changeCashAmount(amount);

        // Init points amount
        this.changePointsAmount(points);
    }

    /*
    * Display players on the top
    * players: [{
    *   fullName: string, // user full name
    *   userName: string, // username
    *   avatar: string // user avatar url
    * }]
    * */
    initPlayers(players, initPos) {
        this.players = players;
        this.currentPlayer = null;

        // Always show exactly 2 teams regardless of how many people joined
        const teamNames = ["Team 1", "Team 2"];
        const teamCount = 2;

        for (let i = 0; i < teamCount; i++) {
            // Admin manages both teams, so set myPlayerIndex to 0 for admin control
            if (this.userName === this.hostName) this.myPlayerIndex = 0;
            
            // Use team-specific avatars
            const teamAvatar = `<div class="user-group-name">${teamNames[i].charAt(0)}${i + 1}</div>`;

            this.$usersContainer.innerHTML += `
                <div id="user-group-${i}" class="user-group" style="background: ${GameView.PLAYERS_COLORS[i]}">
                    <div class="team-info">
                        ${teamAvatar}
                        <div class="team-name">${teamNames[i]}</div>
                    </div>
                    <span class="user-cash">
                        <div class="supportopoly-cash">SB</div>
                        <div class="user-cash-num">24</div>
                    </span>
                    <span class="user-points">
                        <div class="supportopoly-points">P</div>
                        <div class="user-points-num">0</div>
                    </span>
                    <img class="user-role" src="/static/images/player_${i}.png">
                </div>`;
        }

        // Store team names for reference
        this.teamNames = teamNames;
        this.gameLoadingPromise = this.gameController.addPlayer(teamCount, initPos);
    }

    /*
    * Change the cash balance
    * amounts: [int]
    * */
    changeCashAmount(amounts) {
        console.log(`💰 changeCashAmount called for user ${this.userName}, amounts:`, amounts);
        
        // Check if there was a change in cash (gain or loss)
        const oldCash = [...this.teamCash];
        
        for (let i in amounts) {
            const $cashAmount = document.querySelector(`#user-group-${i} .user-cash-num`);
            $cashAmount.innerText = (amounts[i] >= 0) ? amounts[i] : 0;
        }
        
        // Update internal team cash reference (Support Bucks)
        this.teamCash = [...amounts];
        
        // Check for bankruptcy after updating amounts
        this.checkForBankruptcy(amounts);
        
        // Play cash sound if there was a change
        for (let i = 0; i < amounts.length; i++) {
            if (oldCash[i] !== undefined && amounts[i] !== oldCash[i]) {
                console.log(`💰 Team ${i} cash changed from ${oldCash[i]} to ${amounts[i]}`);
                this.playSound("cash");
                break; // Play sound once for any change
            }
        }
        
        console.log(`💰 Updated teamCash for user ${this.userName}:`, this.teamCash);
    }

    /*
    * Change the points balance
    * points: [int]
    * */
    changePointsAmount(points) {
        // Check if there was a change in points (gain or loss)
        const oldPoints = [...this.teamPoints];
        
        for (let i in points) {
            const $pointsAmount = document.querySelector(`#user-group-${i} .user-points-num`);
            $pointsAmount.innerText = (points[i] >= 0) ? points[i] : 0;
        }
        
        // Update internal team points reference
        this.teamPoints = [...points];
        
        // Play cash sound if there was a change
        for (let i = 0; i < points.length; i++) {
            if (oldPoints[i] !== undefined && points[i] !== oldPoints[i]) {
                console.log(`🏆 Team ${i} points changed from ${oldPoints[i]} to ${points[i]}`);
                this.playSound("cash");
                break; // Play sound once for any change
            }
        }
    }
    
    /*
    * Update team points display using current teamPoints
    * */
    updateTeamPointsDisplay() {
        this.changePointsAmount(this.teamPoints);
    }
    
    /*
    * Update team cash display using current teamCash
    * */
    updateTeamCashDisplay() {
        this.changeCashAmount(this.teamCash);
    }

    /*
    * Check for bankruptcy and show notification
    * amounts: [int] - current cash amounts for all teams
    * */
    checkForBankruptcy(amounts) {
        for (let i = 0; i < amounts.length; i++) {
            if (amounts[i] <= 0) {
                const bankruptTeamName = this.teamNames[i] || `Team ${i + 1}`;
                console.log(`💸 ${bankruptTeamName} is bankrupt with ${amounts[i]} SB!`);
                
                // Show bankruptcy notification immediately (don't wait for server)
                this.showToastNotification(`💸 ${bankruptTeamName} is bankrupt and lost the game!`);
                
                // Optional: Could trigger game end here
                console.log(`🎮 Game should end - ${bankruptTeamName} is bankrupt!`);
                break; // Only show one bankruptcy notification at a time
            }
        }
    }

    /*
    * Change player
    * nextPlayer: int,
    * onDiceRolled: function
    * */
    changePlayer(nextPlayer, onDiceRolled) {
        // update user indicator
        if (this.currentPlayer !== null) {
            let $currentUserGroup = document.getElementById(`user-group-${this.currentPlayer}`);
            $currentUserGroup.classList.remove("active");
        }

        let $nextUserGroup = document.getElementById(`user-group-${nextPlayer}`);
        $nextUserGroup.classList.add("active");

        this.currentPlayer = nextPlayer;
        let title = `${this.teamNames[nextPlayer]}'s Turn!`;

        // Everyone sees the dice modal, but only admin can interact
        const isAdmin = (this.userName === this.hostName);
        const button = (!isAdmin || this.isSpectator) ? [] :
            [{
                text: "Roll",
                callback: () => {
                    document.getElementById("roll").checked = true;
                    document.querySelector("#modal-buttons-container button").disabled = true;
                    document.querySelector("#modal-buttons-container button").innerText = "Hold on...";

                    onDiceRolled();
                }
            }];
        
        // Show dice modal to everyone with same message
        this.showModal(nextPlayer, title, "", this.diceMessage, button);
    }

    /*
    * Display a pop-up modal
    * message: a snippet of text or HTML
    * playerIndex: int,
    * buttons: [{
    *   text: string, // "button text"
    *   callback: function
    * }],
    * displayTime: int // seconds to display
    * */
    showModal(playerIndex, title, subTitle, message, buttons, displayTime) {
        return new Promise(resolve => {
            // Clear any existing auto-hide timeout to prevent conflicts
            if (this.modalAutoHideTimeout) {
                clearTimeout(this.modalAutoHideTimeout);
                this.modalAutoHideTimeout = null;
            }

            if (playerIndex === null) {
                this.$modalAvatar.src = GameView.DEFAULT_AVATAR;
            } else {
                this.$modalAvatar.src = `/static/images/player_${playerIndex}.png`;
                this.$modalAvatar.style.background = GameView.PLAYERS_COLORS[playerIndex];
            }

            if (playerIndex === this.myPlayerIndex) {
                this.$modalAvatar.classList.add("active");
            } else {
                this.$modalAvatar.classList.remove("active");
            }

            this.$modalMessage.innerHTML = message;
            this.$modalButtons.innerHTML = "";

            this.$modalTitle.innerText = title;
            this.$modalSubTitle.innerText = subTitle;

            for (let i in buttons) {
                let button = document.createElement("button");
                button.classList.add("large-button");
                button.id = `modal-button-${i}`;
                button.innerText = buttons[i].text;

                button.addEventListener("click", () => {
                    buttons[i].callback();
                    resolve();
                });



                this.$modalButtons.appendChild(button);
            }

            this.$modalCard.classList.remove("hidden");
            this.$modalCard.classList.remove("modal-hidden");

            // hide modal after a period of time if displayTime is set
            if (displayTime !== undefined && displayTime > 0) {
                this.modalAutoHideTimeout = setTimeout(async () => {
                    await this.hideModal(true);
                    resolve();
                }, displayTime * 1000);
            } else {
                resolve();
            }
        });
    }

    /*
    * Show a simple toast notification that doesn't interrupt game flow
    * */
    showToastNotification(message) {
        console.log(`🍞 Attempting to show toast notification: ${message}`);
        console.log(`🍞 Current user: ${this.userName}, isAdmin: ${this.isAdmin}`);
        
        // Create toast element if it doesn't exist
        let toast = document.getElementById('toast-notification');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast-notification';
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(-150px);
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(248, 249, 250, 0.5) 100%);
                backdrop-filter: blur(10px);
                color: #1f2937;
                padding: 15px 20px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: bold;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                z-index: 99999;
                transition: transform 0.3s ease;
                max-width: 400px;
                word-wrap: break-word;
                text-align: center;
                pointer-events: none;
                border: 2px solid rgba(229, 231, 235, 0.8);
            `;
            document.body.appendChild(toast);
            console.log(`🍞 Created new toast element with z-index 99999`);
        }
        
        // Set message
        toast.textContent = `🛒 ${message}`;
        
        // Force reset position to hidden state
        toast.style.transform = 'translateX(-50%) translateY(-150px)';
        
        // Show toast (slide down from top) with a delay
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(0px)';
            console.log(`🍞 Toast shown with message: ${message}`);
        }, 100);
        
        // Hide toast after 3 seconds (slide back up)
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(-150px)';
            console.log(`🍞 Toast hidden`);
        }, 3500);
    }

    /*
    * Hide the modal
    * */
    hideModal(delayAfter) {
        return new Promise((resolve => {
            // Clear any existing auto-hide timeout when manually hiding
            if (this.modalAutoHideTimeout) {
                clearTimeout(this.modalAutoHideTimeout);
                this.modalAutoHideTimeout = null;
            }

            this.$modalCard.classList.add("modal-hidden");
            // Clean up any special modal classes
            this.$modalCardContent.classList.remove("scoreboard-bg");
            this.$modalCard.classList.remove("scoreboard-bg");
            if (delayAfter === true) {
                setTimeout(() => {
                    resolve();
                }, 500);
            } else {
                resolve();
            }
        }))
    }

    async handleInit(message) {
        let players = message.players;
        let changeCash = message.changeCash;
        let changePoints = message.changePoints;
        let nextPlayer = message.nextPlayer;
        let posChange = message.posChange;
        let eventMsg = message.decision;
        let title = message.title;
        let landname = message.landname;
        let owners = message.owners;
        let houses = message.houses;
        console.log(`🎮 handleInit for user ${this.userName}: changeCash from server:`, changeCash);
        this.initGame(players, changeCash, changePoints, posChange);

        // Store ownership data for tile action logic
        this.landOwners = owners.slice(); // Make a copy

        await this.gameLoadingPromise;
        await this.hideModal(true);

        for (let i = 0; i < owners.length; i++) {
            if (owners[i] !== null) {
                this.gameController.addProperty(PropertyManager.PROPERTY_OWNER_MARK, i, owners[i]);
            }
        }

        for (let i = 0; i < houses.length; i++) {
            if (houses[i] === 4) {
                this.gameController.addProperty(PropertyManager.PROPERTY_HOTEL, i);
            }
            else {
                for (let building_num = 0; building_num < houses[i]; building_num++) {
                    this.gameController.addProperty(PropertyManager.PROPERTY_HOUSE, i);
                }
            }
        }

        if (message.waitDecision === "false") {
            this.changePlayer(nextPlayer, this.onDiceRolled.bind(this));
        } else {
            // Only admin can see and use decision buttons
            const isAdmin = (this.userName === this.hostName);
            const buttons = isAdmin ? [{
                text: "Buy",
                callback: this.confirmDecision.bind(this)
            }, {
                text: "No",
                callback: this.cancelDecision.bind(this)
            }] : [];
            eventMsg = this.teamNames[nextPlayer] + " " + eventMsg;
            this.showModal(nextPlayer, title, landname, eventMsg, buttons);
        }
    }


    async handleAddErr() {
        await this.showModal(null, "Permission Denied", "Game Not Found", "Navigating back... Create your own game with your friends!", [], 5);
        window.location = `http://${window.location.host}/supportopoly/admin`;
    }

    handleRollError(message) {
        console.log("🎲 Roll error received:", message.message);
        
        // Stop dice animation immediately
        const rollCheckbox = document.getElementById('roll');
        if (rollCheckbox) {
            rollCheckbox.checked = false;
            console.log("🎲 Stopping dice animation due to roll error");
        }
        
        // Reset any modal buttons that might be disabled
        const modalButton = document.querySelector("#modal-buttons-container button");
        if (modalButton) {
            modalButton.disabled = false;
            modalButton.innerText = "Roll";
        }
        
        // Show error toast notification
        this.showToastNotification(`⚠️ ${message.message}`);
        
        console.log("🎲 Roll error handled - dice animation stopped, ready to try again");
    }


    async handleRollRes(message) {
        console.log(`🎲 handleRollRes called for user ${this.userName}:`, message);
        
        let currPlayer = message.curr_player;
        let nextPlayer = message.next_player;
        let steps = message.steps;
        let newPos = message.new_pos;
        let eventMsg = message.result;
        let title = message.title;
        let landname = message.landname;

        console.log(`🎲 User ${this.userName} processing roll: player ${currPlayer} rolled ${steps}, moving to position ${newPos}`);

        // Restore the original dice roll modal
        await this.showModal(currPlayer, this.teamNames[currPlayer] + " got " + steps.toString(), "", "", [], 2);
        
        // Move the player and wait for the animation to be noticeable
        this.playSound("move");
        console.log(`🎲 Moving player ${currPlayer} to position ${newPos} for user ${this.userName}`);
        await this.gameController.movePlayer(currPlayer, newPos);
        await new Promise(resolve => setTimeout(resolve, 500)); // Pause to let player land

        // Handle "Go to QA Jail"
        if (message.go_to_jail) {
            await this.showModal(currPlayer, "Go to QA Jail!", "", this.teamNames[currPlayer] + " must go to jail!", [], 2);
            this.playSound("move");
            await this.gameController.movePlayer(currPlayer, 6);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Handle passing START
        if (message.bypass_start === "true") {
            const isCardMessage = eventMsg.includes('SHOW_QUESTION_CARD:') || eventMsg.includes('SHOW_SURPRISE_CARD:');
            if (!isCardMessage) {
                 await this.showModal(currPlayer, "Passed START", "", `${this.teamNames[currPlayer]} collected 10 SB!`, [], 2);
            }
             if (message.is_cash_change === "true") {
                this.changeCashAmount(message.curr_cash);
             }
        }

        // Handle the tile's primary event
        if (message.is_option === "true") {
            const isAdmin = (this.userName === this.hostName);
            const buttons = isAdmin ? [{
                text: "Buy",
                callback: this.confirmDecision.bind(this)
            }, {
                text: "No",
                callback: this.cancelDecision.bind(this)
            }] : [];
            // Add delay for option modals too
            setTimeout(() => {
                this.showModal(currPlayer, title, landname, this.teamNames[currPlayer] + eventMsg, buttons);
            }, 3000); // Same delay as cards
        } else {
            const isCardMessage = eventMsg.includes('SHOW_QUESTION_CARD:') || eventMsg.includes('SHOW_SURPRISE_CARD:');

            if (isCardMessage) {
                console.log(`🎲 Card message detected for user ${this.userName}: ${eventMsg}`);
                // Only change cash if it's not a question card (question cards don't change cash)
                const isQuestionCard = eventMsg.includes('SHOW_QUESTION_CARD:');
                if (message.is_cash_change === "true" && !isQuestionCard) {
                    this.changeCashAmount(message.curr_cash);
                }
                setTimeout(() => {
                    this.detectAndShowCard(eventMsg, currPlayer);
                    if (!isQuestionCard || !this.isAdmin) {
                        this.changePlayer(nextPlayer, this.onDiceRolled.bind(this));
        } else {
                        this.pendingNextPlayer = nextPlayer;
                    }
                }, 3000); // Much longer delay to ensure player animation completes
            } else {
                if (message.new_event === "true") {
                    // Add delay for regular modals too
                    setTimeout(async () => {
                        await this.showModal(currPlayer, title, landname, this.teamNames[currPlayer] + eventMsg, [], 3);
                        // Change player AFTER modal closes
                this.changePlayer(nextPlayer, this.onDiceRolled.bind(this));
                    }, 3000); // Same delay as cards
            } else {
                    // No modal to show, change player immediately
                    if (message.is_cash_change === "true") {
                        this.changeCashAmount(message.curr_cash);
                    }
                this.changePlayer(nextPlayer, this.onDiceRolled.bind(this));
                }
            }
        }

        console.log(`🎲 handleRollRes completed for user ${this.userName}`);
    }

    handleBuyLand(message) {
        const {curr_player, curr_cash, tile_id} = message;
        this.changeCashAmount(curr_cash);
        
        // Update local ownership tracking
        this.landOwners[tile_id] = curr_player;
        
        this.gameController.addProperty(PropertyManager.PROPERTY_OWNER_MARK, tile_id, curr_player);
        let next_player = message.next_player;
        this.changePlayer(next_player, this.onDiceRolled.bind(this));
    }

    handleConstruct(message) {
        let curr_cash = message.curr_cash;
        let tile_id = message.tile_id;
        this.changeCashAmount(curr_cash);
        if (message.build_type === "house") {
            this.gameController.addProperty(PropertyManager.PROPERTY_HOUSE, tile_id);
        } else {
            this.gameController.addProperty(PropertyManager.PROPERTY_HOTEL, tile_id);
        }
        this.changePlayer(message.next_player, this.onDiceRolled.bind(this));
    }

    handleCancel(message) {
        let next_player = message.next_player;
        this.changePlayer(next_player, this.onDiceRolled.bind(this));
    }

    async handleGameEnd(message) {
        this.gameInProcess = false;

        let result = [];
        // let loser = message.loser;
        let all_asset = message.all_asset;
        for (let k = 0; k < all_asset.length; k++) {
            let big_asset = -1e20;
            let big_index = 0;
            for (let i = 0; i < all_asset.length; i++) {
                if (all_asset[i] === null) {
                    continue;
                }
                if (big_asset < all_asset[i]) {
                    big_asset = all_asset[i];
                    big_index = i;
                }
            }
            result.push({
                playerIndex: big_index,
                score: big_asset,
            });
            all_asset.splice(big_index, 1, null);
        }
        this.showScoreboard(result);
    }



    handleAdminMove(message) {
        // Handle admin move - move player to new position
        const playerIndex = message.player_index;
        const oldPosition = message.old_position;
        const newPosition = message.new_position;
        const currCash = message.curr_cash;
        const nextPlayer = message.next_player;

        // Update cash amounts
        this.changeCashAmount(currCash);

        // Move the player on the board with animation
        this.gameController.movePlayer(playerIndex, newPosition);

        // Get tile names for better display
        const tileNames = {
            0: "Start", 1: "Empathy Lane", 2: "Surprise Card", 3: "Moonstar Response Station",
            4: "Knowledge Knoll", 5: "Golden Chest", 6: "QA Jail", 7: "Escalation Ave",
            8: "Riddleton Place", 9: "Starlight Response Station", 10: "Surprise Card", 11: "Sale-A-Vie Blvd",
            12: "Best Agent", 13: "Surprise Card", 14: "Knowledge Square", 15: "Sunshine Response Station",
            16: "Connectivity Cost Center", 17: "Problem Plaza", 18: "Go to QA Jail", 19: "Inquiry Inspections",
            20: "Training Time", 21: "Coupon Court", 22: "Resolution Road", 23: "Surprise Card"
        };

        const tileName = tileNames[newPosition] || `Tile ${newPosition}`;
        const teamName = this.teamNames[playerIndex] || `Team ${playerIndex + 1}`;

        // Show simple admin move notification
        this.showModal(null, "", "", 
            `${teamName} moved to ${tileName}`, 
            [], 2); // Show for 2 seconds

        // Automatically continue to next turn after modal disappears
        setTimeout(() => {
            this.changePlayer(nextPlayer, this.onDiceRolled.bind(this));
        }, 2500); // Wait a bit longer than modal display time
    }

    handleAdminModifyMoney(message) {
        const playerIndex = message.player_index;
        const currCash = message.curr_cash;
        const notificationMessage = message.notification_message;
        
        console.log(`💰 Admin modified money: ${notificationMessage}`);
        console.log(`💰 Received cash amounts:`, currCash);
        console.log(`💰 Previous team cash:`, this.teamCash);
        
        // Update cash amounts (this will automatically check for bankruptcy)
        this.changeCashAmount(currCash);
        
        console.log(`💰 Updated team cash:`, this.teamCash);
        
        // Show toast notification for all players
        this.showToastNotification(notificationMessage);
        
        // Play cash sound for all players
        this.playSound("cash");
    }

    handleAdminModifyPoints(message) {
        const playerIndex = message.player_index;
        const currPoints = message.curr_points;
        const notificationMessage = message.notification_message;
        
        console.log(`⭐ Admin modified points: ${notificationMessage}`);
        console.log(`⭐ Received points amounts:`, currPoints);
        console.log(`⭐ Previous team points:`, this.teamPoints);
        
        // Update points amounts
        this.changePointsAmount(currPoints);
        
        console.log(`⭐ Updated team points:`, this.teamPoints);
        
        // Show toast notification for all players
        this.showToastNotification(notificationMessage);
        
        // Play cash sound for all players (same sound for both money and points)
        this.playSound("cash");
    }

    handleAdminRentMoney(message) {
        const playerIndex = message.player_index;
        const currCash = message.curr_cash;
        const notificationMessage = message.notification_message;
        
        const responseId = `rent_response_${Date.now()}`;
        console.log(`🏠 [${responseId}] Admin rent transfer response: ${notificationMessage}`);
        console.log(`🏠 [${responseId}] Received cash amounts:`, currCash);
        console.log(`🏠 [${responseId}] Previous team cash:`, this.teamCash);
        console.log(`🏠 [${responseId}] Transfer details - Player ${playerIndex} paying, amounts:`, currCash);
        
        // Update cash amounts (this will automatically check for bankruptcy)
        this.changeCashAmount(currCash);
        
        console.log(`🏠 [${responseId}] Updated team cash:`, this.teamCash);
        console.log(`🏠 [${responseId}] Verification - Expected final amounts:`, currCash);
        
        // Show toast notification for all players
        this.showToastNotification(notificationMessage);
        
        // Play cash sound for all players
        this.playSound("cash");
    }

    handleAdminResetGame(message) {
        console.log("🔄 Received admin reset game response:", message);
        
        // Reset the frontend game state
        this.usedQuestions = {}; // Clear used questions
        this.pendingNextPlayer = undefined; // Clear pending states
        
        // Close any open modals or cards
        this.hideModal(false);
        const cardOverlay = document.getElementById('card-overlay');
        if (cardOverlay) {
            cardOverlay.style.display = 'none';
        }
        
        // The server should send an updated game state - handle it like an init
        if (message.players && message.changeCash && message.changePoints && message.posChange !== undefined) {
            // Update the game state
            this.changeCashAmount(message.changeCash);
            this.changePointsAmount(message.changePoints);
            
            // Move all players back to start visually (with slight delays to ensure all movements process)
            for (let i = 0; i < message.posChange.length; i++) {
                // Always move player to start position (tile 0) regardless of current position
                console.log(`Moving player ${i} to START (tile 0)`);
                setTimeout(() => {
                    this.gameController.movePlayer(i, 0);
                }, i * 100); // Stagger the movements slightly
            }
            
            // Clear all properties from the board
            this.gameController.clearAllProperties();
            
            // Show success message
            setTimeout(() => {
                this.showModal(null, "🔄 Game Reset Complete", "", "All teams moved to START. Money reset to 24 SB, points to 0. Team 1's turn!", [], 2);
                
                // Start the game with player 0's turn
                setTimeout(() => {
                    this.changePlayer(0, this.onDiceRolled.bind(this));
                }, 2500);
            }, 500);
        }
    }

    handleAdminSetTurn(message) {
        const playerIndex = message.player_index;
        const teamName = this.teamNames[playerIndex] || `Team ${playerIndex + 1}`;
        
        console.log(`🎯 Admin set turn to: ${teamName}`);
        
        // Directly trigger the turn change without notification
        this.changePlayer(playerIndex, this.onDiceRolled.bind(this));
    }



    handleAdminSetOwnership(message) {
        const tileIndex = message.tile_index;
        const ownerIndex = message.owner_index;
        const notificationMessage = message.notification_message;
        
        console.log(`🏠 Admin set ownership: ${notificationMessage}`);
        
        // Update our local ownership tracking
        this.landOwners[tileIndex] = ownerIndex;
        
        // Remove existing ownership marker for this tile
        this.gameController.removeProperty(PropertyManager.PROPERTY_OWNER_MARK, tileIndex);
        
        // Add new ownership marker if owner is specified
        if (ownerIndex !== null) {
            this.gameController.addProperty(PropertyManager.PROPERTY_OWNER_MARK, tileIndex, ownerIndex);
        }
        
        // Show simple toast notification that doesn't interrupt game flow
        this.showToastNotification(notificationMessage);
    }

    handleAdminTestCard(message) {
        console.log("🃏 Received admin test card broadcast:", message);
        
        const cardType = message.card_type;
        const tileId = message.tile_id;
        const questionIndex = message.question_index; // Will be undefined for surprise cards
        const surpriseIndex = message.surprise_index; // Will be undefined for question cards
        const playerIndex = message.player_index;
        const cost = message.cost;
        const reward = message.reward;
        const tileName = message.tile_name;
        
        // Show the test card to all clients
        if (cardType === 'QUESTION') {
            // Use the specific question index from admin to ensure all clients see the same question
            this.showCard('QUESTION', tileId, 'Test Question Card', questionIndex);
            console.log(`Showing test question card: tile ${tileId}, question index ${questionIndex}`);
        } else if (cardType === 'SURPRISE') {
            this.showCard('SURPRISE', null, 'Test Surprise Card', null, surpriseIndex);
            console.log(`Showing test surprise card: surprise index ${surpriseIndex}`);
            
            // Check if this is an inventory-worthy surprise card (for admin testing)
            if (surpriseIndex !== null && surpriseIndex !== undefined) {
                this.handleInventoryWorthySurpriseCard(surpriseIndex, playerIndex);
            }
        } else if (cardType === 'RESPONSE_STATION') {
            // Response Station - show payment modal with proper station name
            const teamName = this.teamNames[playerIndex] || `Team ${playerIndex + 1}`;
            
            // Get proper station name based on tile ID
            let stationName = "Response Station";
            if (tileId === 3) {
                stationName = "Moonstar Response Station";
            } else if (tileId === 9) {
                stationName = "Starlight Response Station";
            } else if (tileId === 15) {
                stationName = "Sunshine Response Station";
            }
            
            // Check if current user is admin
            const hostname = document.getElementById('hostname').value;
            const username = document.getElementById('username').value;
            const isAdmin = (username === hostname);
            
            // Only show buttons for admin users
            const buttons = isAdmin ? [
                { text: "Pay & Receive", callback: () => { this.hideModal(); } },
                { text: "Skip", callback: () => { this.hideModal(); } }
            ] : [];
            
            this.showModal(playerIndex, stationName, teamName,
                `${teamName} can pay ${cost} SB to receive ${reward} SB if the other team steps on your station!`, buttons);
            console.log(`⚡ ${stationName}: ${teamName} can pay ${cost} SB to get ${reward} SB (admin only: ${isAdmin})`);
        } else if (cardType === 'START_BONUS') {
            // Start tile - collect bonus
            const teamName = this.teamNames[playerIndex] || `Team ${playerIndex + 1}`;
            this.showModal(playerIndex, `Start Bonus!`, teamName,
                `${teamName} collects 10 SB for landing on Start!`, [], 3);
            console.log(`⚡ Start bonus for ${teamName}`);
        } else if (cardType === 'GO_TO_JAIL') {
            // Go to jail
            const teamName = this.teamNames[playerIndex] || `Team ${playerIndex + 1}`;
            this.showModal(playerIndex, `Go to QA Jail!`, teamName,
                `${teamName} must go to jail and is stopped for 1 round!`, [], 3);
            console.log(`⚡ ${teamName} goes to jail`);
        } else if (cardType === 'JAIL_STUCK') {
            // Player landed in jail and is stuck for one turn
            const teamName = this.teamNames[playerIndex] || `Team ${playerIndex + 1}`;
            this.showModal(playerIndex, `QA Jail`, teamName,
                `${teamName} landed in QA Jail and is stopped for one turn!`, [], 3);
            console.log(`⚡ ${teamName} is stuck in jail for one turn`);
        } else if (cardType === 'BUY_STATION') {
            // Unowned station - show purchase option
            const teamName = this.teamNames[playerIndex] || `Team ${playerIndex + 1}`;
            
            // Get proper station name
            let stationName = "Response Station";
            if (tileId === 3) {
                stationName = "Moonstar Response Station";
            } else if (tileId === 9) {
                stationName = "Starlight Response Station";
            } else if (tileId === 15) {
                stationName = "Sunshine Response Station";
            }
            
            // Check if current user is admin
            const hostname = document.getElementById('hostname').value;
            const username = document.getElementById('username').value;
            const isAdmin = (username === hostname);
            
            // Only show buttons for admin users
            const buttons = isAdmin ? [
                { text: "Buy Station", callback: () => { this.hideModal(); } },
                { text: "Skip", callback: () => { this.hideModal(); } }
            ] : [];
            
            this.showModal(playerIndex, `Purchase ${stationName}`, teamName,
                `${teamName} can buy ${stationName} for ${cost} SB!`, buttons);
            console.log(`⚡ ${teamName} can buy ${stationName} for ${cost} SB (admin only: ${isAdmin})`);
        } else if (cardType === 'PAY_RENT') {
            // Owned by another player - must pay rent
            const teamName = this.teamNames[playerIndex] || `Team ${playerIndex + 1}`;
            const ownerIndex = message.owner_index;
            const ownerName = (ownerIndex !== null && ownerIndex !== undefined && Number.isInteger(ownerIndex) && this.teamNames[ownerIndex]) 
                ? this.teamNames[ownerIndex] 
                : `Team ${((Number.isInteger(ownerIndex) ? ownerIndex : 0) + 1)}`;
            
            // Get proper station name
            let stationName = "Response Station";
            if (tileId === 3) {
                stationName = "Moonstar Response Station";
            } else if (tileId === 9) {
                stationName = "Starlight Response Station";
            } else if (tileId === 15) {
                stationName = "Sunshine Response Station";
            }
            
            this.showModal(playerIndex, `Pay Rent`, teamName,
                `${teamName} must pay ${cost} SB rent to ${ownerName} for using ${stationName}!`, [], 3);
            console.log(`⚡ ${teamName} pays ${cost} SB rent to ${ownerName} for ${stationName}`);
        } else if (cardType === 'SPECIAL_TILE') {
            // Other special tiles - use proper messages for each tile type
            const teamName = this.teamNames[playerIndex] || `Team ${playerIndex + 1}`;
            
            let title, message;
            
            if (tileName === "Golden Chest") {
                title = "Golden Chest";
                message = `${teamName} found Golden Chest! Earned 15 SB.`;
            } else if (tileName === "Best Agent") {
                title = "Best Agent";
                message = `${teamName} is the Best Agent! Gained 10 points.`;
            } else if (tileName === "Connectivity Cost Center") {
                title = "Connectivity Cost Center";
                message = `${teamName} must pay 10 SB for connectivity costs.`;
            } else if (tileName === "Training Time") {
                title = "Training Time";
                message = `${teamName} takes a break. Time for a rest!`;
            } else {
                // Fallback for any other special tiles
                title = tileName;
                message = `${teamName} landed on ${tileName}!`;
            }
            
            this.showModal(playerIndex, title, teamName, message, [], 2);
            console.log(`⚡ ${teamName} landed on special tile: ${tileName}`);
        }
        
        // Check if current user is admin
        const hostname = document.getElementById('hostname').value;
        const username = document.getElementById('username').value;
        const isAdmin = (username === hostname);
        
        if (!isAdmin) {
            // For non-admin users, disable ALL interactions with test cards
            const cardOverlay = document.getElementById('card-overlay');
            const cardCloseBtn = document.getElementById('card-close-btn');
            const cardFlipContainer = document.getElementById('card-flip-container');
            
            // Hide close button completely for non-admin users
            if (cardCloseBtn) {
                cardCloseBtn.style.display = 'none';
            }
            
            // Remove any click interactions
            if (cardOverlay) {
                cardOverlay.onclick = null;
            }
            
            if (cardFlipContainer) {
                cardFlipContainer.onclick = null;
            }
            
            console.log("🔒 Test card is read-only for non-admin users");
        }
    }

    handleDiceAnimationStart(message) {
        console.log("🎲 Received dice animation sync from admin");
        
        // Trigger dice animation for all clients by checking the roll checkbox
        const rollCheckbox = document.getElementById('roll');
        if (rollCheckbox) {
            rollCheckbox.checked = true;
        }
        
        // Also play dice sound for all clients using the new sound system
        this.playSound("dice");
    }

    handleCardFlipped(message) {
        console.log("🃏 Received card flip sync from admin");
        
        // Find the card flip container and flip it for all non-admin users
        const cardFlipContainer = document.getElementById('card-flip-container');
        if (cardFlipContainer && !cardFlipContainer.classList.contains('flipped')) {
            // Play card flip sound
            this.playCardFlipSound();
            
            // Flip the card
            cardFlipContainer.classList.add('flipped');
            
            // Check if current user is admin
            const hostname = document.getElementById('hostname').value;
            const username = document.getElementById('username').value;
            const isAdmin = (username === hostname);
            
            if (isAdmin) {
                // Only admin can close cards after flipping
                const cardOverlay = document.getElementById('card-overlay');
                const cardCloseBtn = document.getElementById('card-close-btn');
                
                setTimeout(() => {
                    this.enableCardClosing(cardOverlay, cardCloseBtn);
                }, 800); // Wait for flip animation to complete
            }
            // Non-admin users just see the flip, but cannot close the card
        }
    }

    handleCardClosed(message) {
        console.log("🃏 Received card close sync from admin");
        
        // Close the card for all non-admin users
        const cardOverlay = document.getElementById('card-overlay');
        if (cardOverlay) {
            cardOverlay.style.display = 'none';
        }
        
        // Hide timer for all users when card is closed
        this.hideSuddenDeathTimer();
        
        // Close points tracker for sudden death blitz
        let tracker = document.getElementById('sudden-death-points-tracker');
        if (tracker) tracker.remove();
        let nextBtn = document.getElementById('sudden-death-next-card-btn');
        if (nextBtn) nextBtn.remove();
        
        // Continue game flow if there's a pending next player
        if (this.pendingNextPlayer !== undefined) {
            const nextPlayer = this.pendingNextPlayer;
            this.pendingNextPlayer = undefined; // Clear the pending state
            this.changePlayer(nextPlayer, this.onDiceRolled.bind(this));
        }
    }

    handleStartSuddenDeath(message) {
        console.log("💀 Received sudden death start broadcast");
        
        // Enter sudden death mode for all clients
        this.suddenDeathMode = true;
        this.suddenDeathQuestionIndex = 0;
        
        // Show sudden death announcement only - NO timer yet
        this.showModal(null, "💀 SUDDEN DEATH ROUND!", "", "Time for the final tie-breaker! Special questions will determine the winner.", [], 3);
        
        // Show category selection after announcement
        setTimeout(() => {
            this.socket.send(JSON.stringify({
                action: "show_sudden_death_category_selection",
                hostname: this.hostName
            }));
        }, 3500);
    }

    handleShowSuddenDeathCard(message) {
        console.log("💀 Received sudden death card broadcast:", message);
        
        const category = message.category;
        const questionIndex = message.question_index;
        const categoryQuestions = this.getSuddenDeathQuestionsByCategory(category);
        
        if (questionIndex >= 0 && questionIndex < categoryQuestions.length) {
            const cardData = categoryQuestions[questionIndex];
            
            // Show the sudden death card to all clients
            this.showCard('SUDDEN_DEATH', null, `Sudden Death - ${category.toUpperCase()}`, questionIndex, null, category);
            
            // NOW show the timer (only when card is visible)
            this.showSuddenDeathTimer();
            
            console.log(`💀 Showing ${category} sudden death question ${questionIndex + 1}/${categoryQuestions.length}`);
        }
    }

    handleShowSuddenDeathCategorySelection(message) {
        console.log("💀 Received sudden death category selection broadcast");
        
        // Show category selection modal to all clients
        this.showSuddenDeathCategorySelection();
    }

    handleStartSuddenDeathTimer(message) {
        console.log("⏱️ Received timer start broadcast from admin");
        
        // Start timer countdown for all clients
        this.startTimerCountdown();
    }

    handleResetSuddenDeathTimer(message) {
        console.log("⏰ Received timer reset broadcast from admin");
        
        // Stop any running timer first
        this.stopTimer();
        
        // Reset timer display for all clients - DON'T auto-start
        this.resetTimerDisplay();
    }

    handleStartQuestionCardTimer(message) {
        console.log("⏱️ Received question card timer start broadcast from admin");
        
        // Start timer countdown for all clients
        this.startQuestionCardTimerCountdown();
    }

    handleResetQuestionCardTimer(message) {
        console.log("⏰ Received question card timer reset broadcast from admin");
        
        // Stop any running timer first
        this.stopQuestionCardTimer();
        
        // Reset timer display for all clients - DON'T auto-start
        this.resetQuestionCardTimerDisplay();
    }
    
    handleShopOpened(message) {
        console.log("🛒 Shop opened by admin");
        console.log("🛒 Current user:", this.userName, "Admin:", this.hostName, "isAdmin:", this.isAdmin);
        
        if (!this.isAdmin) {
            // Non-admin players see the shop but can't interact
            console.log("🛒 Non-admin player - showing shop in read-only mode");
            this.updateTeamBalances();
            this.createShopGrid();
            
            if (this.$shopOverlay) {
                console.log("🛒 Showing shop overlay for non-admin");
                this.$shopOverlay.classList.remove('hidden');
            } else {
                console.error("🛒 Shop overlay not found for non-admin player!");
            }
            
            // Hide the close button for non-admin users
            if (this.$shopCloseBtn) {
                this.$shopCloseBtn.style.display = 'none';
            }
            
            // Disable all buy buttons for non-admin
            setTimeout(() => {
                const buyButtons = document.querySelectorAll('.buy-btn');
                console.log("🛒 Found", buyButtons.length, "buy buttons to disable");
                buyButtons.forEach(btn => {
                    btn.disabled = true;
                    btn.textContent = 'Buy Item';
                    btn.style.background = 'rgba(31, 41, 55, 0.3)';
                    btn.style.cursor = 'not-allowed';
                });
            }, 100);
        } else {
            console.log("🛒 Admin player - shop already opened locally");
        }
    }
    
    handleShopClosed(message) {
        console.log("🛒 Shop closed by admin");
        if (!this.isAdmin) {
            this.$shopOverlay.classList.add('hidden');
            this.hidePurchaseSelector();
        }
    }
    
    handleItemPurchased(message) {
        console.log(`🛒 Item purchased: ${message.item.name} for ${this.teamNames[message.team_index]}`);
        console.log(`🛒 Current team cash before purchase:`, this.teamCash);
        
        // Update local team cash (Support Bucks) - use server's updated cash if available
        if (message.updated_team_cash) {
            console.log(`🛒 Using server-provided updated team cash:`, message.updated_team_cash);
            this.teamCash = [...message.updated_team_cash];
        } else {
            // Fallback to local calculation
            this.teamCash[message.team_index] -= message.item.cost;
        }
        console.log(`🛒 Updated team cash after purchase:`, this.teamCash);
        
        // Update team inventory
        if (!this.teamInventories[message.team_index][message.item.id]) {
            this.teamInventories[message.team_index][message.item.id] = 0;
        }
        this.teamInventories[message.team_index][message.item.id]++;
        
        // Update displays
        this.updateTeamCashDisplay();
        this.updateInventoryDisplay();
        
        // Show notification to all players
        this.showToastNotification(`${this.teamNames[message.team_index]} purchased ${message.item.name} for ${message.item.cost} Support Bucks! 🛒`);
        
        // Update shop balances if shop is open
        if (!this.$shopOverlay.classList.contains('hidden')) {
            this.updateTeamBalances();
        }
    }
    
    handleItemUsed(message) {
        console.log(`🎯 Item used: ${message.item.name} by ${this.teamNames[message.team_index]}`);
        
        // Update local team inventory
        this.teamInventories[message.team_index][message.item.id]--;
        
        // Remove item if count is 0
        if (this.teamInventories[message.team_index][message.item.id] <= 0) {
            delete this.teamInventories[message.team_index][message.item.id];
        }
        
        // Update displays
        this.updateInventoryDisplay();
        
        // Show notification to all players
        this.showToastNotification(`${this.teamNames[message.team_index]} used ${message.item.name}! ${message.item.icon}`);
        
        // Close any open modals for all players
        this.closeItemModal();
    }
    
    handleItemUsageModalOpened(message) {
        console.log(`🎒 Admin opened item usage modal for ${message.item.name} (${this.teamNames[message.team_index]})`);
        
        // Show modal to non-admin players in read-only mode
        if (!this.isAdmin) {
            this.showItemUsageModal(message.item, message.team_index, true); // true = read-only mode
        }
    }
    
    handleItemUsageModalClosed(message) {
        console.log(`🎒 Admin closed item usage modal`);
        
        // Close modal for non-admin players
        if (!this.isAdmin) {
            const modal = document.getElementById('item-usage-modal');
            if (modal) {
                modal.classList.add('hidden');
            }
        }
    }

    handleShowLeaderboard(message) {
        console.log("🏆 Received leaderboard broadcast from admin");
        this.displayCurrentLeaderboard();
    }

    handleCloseLeaderboard(message) {
        console.log("🏆 Received leaderboard close broadcast from admin");
        this.hideModal();
    }

    async confirmDecision() {
        // Only admin can make decisions for all players
        const isAdmin = (this.userName === this.hostName);
        if (!isAdmin || this.isSpectator) {
            return;
        }
        
        this.socket.send(JSON.stringify({
            action: "confirm_decision",
            hostname: this.hostName,
        }));

        await this.hideModal(true);
    }

    async cancelDecision() {
        // Only admin can make decisions for all players
        const isAdmin = (this.userName === this.hostName);
        if (!isAdmin || this.isSpectator) {
            return;
        }
        
        this.socket.send(JSON.stringify({
            action: "cancel_decision",
            hostname: this.hostName,
        }));
        await this.hideModal(true);
    }





    /*
    * ScoreList should be sorted
    * [{
    *   playerIndex: int,
    *   score: int
    * }]
    * */
    showScoreboard(scoreList) {
        let scoreboardTemplate = `<div id="scoreboard">`;
        for (let index in scoreList) {
            let rank = parseInt(index) + 1;
            scoreboardTemplate += `
                <div class="scoreboard-row">
                    <span class="scoreboard-ranking">${rank}</span>
                    <img class="chat-message-avatar" src="${this.players[scoreList[index].playerIndex].avatar}">
                    <span class="scoreboard-username">${this.teamNames[scoreList[index].playerIndex]}</span>
                    <div class="scoreboard-stats">
                        <div class="stat-item">
                            <div class="supportopoly-cash">SB</div>
                            <span class="scoreboard-score">${this.teamCash[scoreList[index].playerIndex] || 0}</span>
                        </div>
                        <div class="stat-item">
                            <div class="supportopoly-points">P</div>
                            <span class="scoreboard-score">${this.teamPoints[scoreList[index].playerIndex] || 0}</span>
                        </div>
                    </div>
                </div>`;
        }
        scoreboardTemplate += "</div>";
        this.$modalCardContent.classList.add("scoreboard-bg");
        this.showModal(null, "Scoreboard", "Good Game!", scoreboardTemplate, [{
            text: "Start a New Game",
            callback: () => {
                window.location = `http://${window.location.host}/supportopoly/admin`;
            }
        }]);
    }

    /*
    * Show current leaderboard for admin to check mid-game
    * */
    showCurrentLeaderboard() {
        console.log('🏆 Admin clicked leaderboard button');
        
        if (this.isAdmin) {
            // Admin clicked - broadcast to all players
            this.socket.send(JSON.stringify({
                action: "show_leaderboard",
                hostname: this.hostName
            }));
        }
        
        this.displayCurrentLeaderboard();
    }
    
    /*
    * Display the current leaderboard (called by admin click or broadcast)
    * */
    displayCurrentLeaderboard() {
        console.log('🏆 Displaying current leaderboard');
        
        // Create current leaderboard based on team cash and points
        let currentScoreList = [];
        for (let i = 0; i < this.teamNames.length; i++) {
            const teamCash = this.teamCash[i] || 0;
            const teamPoints = this.teamPoints[i] || 0;
            const totalScore = teamCash + (teamPoints * 10); // Points worth 10 SB each for ranking
            
            currentScoreList.push({
                playerIndex: i,
                score: totalScore
            });
        }
        
        // Sort by total score (highest first)
        currentScoreList.sort((a, b) => b.score - a.score);
        
        // Show current standings
        let scoreboardTemplate = `<div id="scoreboard">`;
        for (let index in currentScoreList) {
            let rank = parseInt(index) + 1;
            scoreboardTemplate += `
                <div class="scoreboard-row">
                    <span class="scoreboard-ranking">${rank}</span>
                    <img class="chat-message-avatar" src="/static/images/player_${currentScoreList[index].playerIndex}.png">
                    <span class="scoreboard-username">${this.teamNames[currentScoreList[index].playerIndex]}</span>
                    <div class="scoreboard-stats">
                        <div class="stat-item">
                            <div class="supportopoly-cash">SB</div>
                            <span class="scoreboard-score">${this.teamCash[currentScoreList[index].playerIndex] || 0}</span>
                        </div>
                        <div class="stat-item">
                            <div class="supportopoly-points">P</div>
                            <span class="scoreboard-score">${this.teamPoints[currentScoreList[index].playerIndex] || 0}</span>
                        </div>
                    </div>
                </div>`;
        }
        scoreboardTemplate += "</div>";
        this.$modalCardContent.classList.add("scoreboard-bg");
        
        // Only admin can close the leaderboard modal
        const hostname = document.getElementById('hostname').value;
        const username = document.getElementById('username').value;
        const isAdmin = (username === hostname);
        
        const buttons = isAdmin ? [{
            text: "Close",
            callback: () => {
                // Admin closing - broadcast to all players
                this.socket.send(JSON.stringify({
                    action: "close_leaderboard",
                    hostname: this.hostName
                }));
                this.hideModal();
            }
        }] : [];
        
        this.showModal(null, "Current Leaderboard", "Team Standings", scoreboardTemplate, buttons);
    }



    showCard(cardType, tileId, actionText, questionIndex = null, surpriseIndex = null, category = null) {
        const cardOverlay = document.getElementById('card-overlay');
        const cardImage = document.getElementById('card-image');
        const cardBackImage = document.getElementById('card-back-image');
        const cardFlipContainer = document.getElementById('card-flip-container');
        const cardCloseBtn = document.getElementById('card-close-btn');
        
        // Reset flip state
        cardFlipContainer.classList.remove('flipped');
        cardFlipContainer.classList.remove('admin-clickable');
        
        // For sudden death cards, always use fast-flip class
        if (cardType === 'SUDDEN_DEATH') {
            cardFlipContainer.classList.add('fast-flip');
        } else {
            cardFlipContainer.classList.remove('fast-flip');
        }
        
        // Remove any existing text overlays
        const existingTextOverlays = cardOverlay.querySelectorAll('.card-text-overlay');
        existingTextOverlays.forEach(overlay => overlay.remove());
        
        let questionImagePath, answerImagePath;
        if (cardType === 'QUESTION') {
            questionImagePath = `/static/3d_assets/cards/${tileId}q.png`;
            answerImagePath = `/static/3d_assets/cards/${tileId}a.png`;
            
            // Use specific question index from server or fall back to random selection
            let cardData;
            if (questionIndex !== null) {
                const allCardData = this.getCardData()[tileId];
                cardData = allCardData && allCardData[questionIndex] ? allCardData[questionIndex] : null;
                console.log('Tile ID:', tileId, 'Server-specified question index:', questionIndex, 'Card Data:', cardData);
        } else {
                // Fallback: Get a random unused question for this tile (for backwards compatibility)
                cardData = this.getRandomUnusedQuestion(tileId);
                console.log('Tile ID:', tileId, 'Random Selected Card Data:', cardData);
            }
            
            if (cardData) {
                // Create text overlays for question and answer
                this.createCardTextOverlay(cardFlipContainer, cardData.question, 'front', cardType, tileId);
                this.createCardTextOverlay(cardFlipContainer, cardData.answer, 'back', cardType, tileId);
            } else {
                console.log('No card data found for tile:', tileId, 'index:', questionIndex);
            }
            
            // Check if current user is admin
            const hostname = document.getElementById('hostname').value;
            const username = document.getElementById('username').value;
            const isAdmin = (username === hostname);
            
            if (isAdmin) {
                cardFlipContainer.classList.add('admin-clickable');
                
                // Add flip functionality for admin
                cardFlipContainer.onclick = () => {
                    if (!cardFlipContainer.classList.contains('flipped')) {
                        // Play card flip sound
                        this.playCardFlipSound();
                        
                        cardFlipContainer.classList.add('flipped');
                        
                        // Send flip notification to all clients
                        this.socket.send(JSON.stringify({
                            action: "card_flipped",
                            hostname: this.hostName
                        }));
                        
                        // Enable closing after flip completes
                        setTimeout(() => {
                            this.enableCardClosing(cardOverlay, cardCloseBtn);
                        }, 800); // Full animation duration
                    }
                };
                
                // Disable closing initially for question cards (admin needs to flip first)
                cardCloseBtn.style.display = 'none';
                cardOverlay.onclick = null;
        } else {
                // Non-admin users cannot interact with question cards at all
                cardFlipContainer.onclick = null;
                cardCloseBtn.style.display = 'none';
                cardOverlay.onclick = null;
            }
            
            cardImage.src = questionImagePath;
            cardBackImage.src = answerImagePath;
            
            // Show question card timer for question cards only
            this.showQuestionCardTimer();
        } else if (cardType === 'SUDDEN_DEATH') {
            // Sudden death cards use special images
            questionImagePath = `/static/3d_assets/cards/sudden-death-q.png`;
            answerImagePath = `/static/3d_assets/cards/sudden-death-a.png`;
            
            // Use specific question index from server with category
            const categoryQuestions = this.getSuddenDeathQuestionsByCategory(category);
            const cardData = categoryQuestions && categoryQuestions[questionIndex] ? categoryQuestions[questionIndex] : null;
            
            if (cardData) {
                // Create text overlays for question and answer
                this.createCardTextOverlay(cardFlipContainer, cardData.question, 'front', cardType, null);
                this.createCardTextOverlay(cardFlipContainer, cardData.answer, 'back', cardType, null);
            } else {
                console.log('No sudden death card data found for category:', category, 'index:', questionIndex);
            }
            
            // Check if current user is admin
            const hostname = document.getElementById('hostname').value;
            const username = document.getElementById('username').value;
            const isAdmin = (username === hostname);
            
            if (isAdmin) {
                cardFlipContainer.classList.add('admin-clickable');
                
                // Add flip functionality for admin
                cardFlipContainer.onclick = () => {
                    if (!cardFlipContainer.classList.contains('flipped')) {
                        // Play card flip sound
                        this.playCardFlipSound();
                        
                        cardFlipContainer.classList.add('flipped');
                        
                        // Send flip notification to all clients
                        this.socket.send(JSON.stringify({
                            action: "card_flipped",
                            hostname: this.hostName
                        }));
                        
                        // Enable closing and show Next Card button after flip completes
                        setTimeout(() => {
                            this.enableSuddenDeathCardClosing(cardOverlay, cardCloseBtn);
                        }, 800); // Full animation duration
                    }
                };
                
                // Disable closing initially for sudden death cards (admin needs to flip first)
                cardCloseBtn.style.display = 'none';
                cardOverlay.onclick = null;
            } else {
                // Non-admin users cannot interact with sudden death cards at all
                cardFlipContainer.onclick = null;
                cardCloseBtn.style.display = 'none';
                cardOverlay.onclick = null;
            }
            
            cardImage.src = questionImagePath;
            cardBackImage.src = answerImagePath;
        } else if (cardType === 'SURPRISE') {
            questionImagePath = `/static/3d_assets/cards/surprise-card.png`;
            cardImage.src = questionImagePath;
            cardBackImage.src = ''; // No back image for surprise cards
            
            // Add surprise card text overlay - use specific index if provided
            const surpriseText = this.getSurpriseCardText(surpriseIndex);
            this.createCardTextOverlay(cardFlipContainer, surpriseText, 'front', cardType, null); // Use 'front' type for plain styling
            
            // Surprise cards can't be flipped - remove any flip functionality
            cardFlipContainer.onclick = null;
            cardFlipContainer.style.cursor = 'default';
            
            // Check if current user is admin for surprise cards too
            const hostname = document.getElementById('hostname').value;
            const username = document.getElementById('username').value;
            const isAdmin = (username === hostname);
            
            if (isAdmin) {
                // Admin can close surprise cards normally
                this.enableCardClosing(cardOverlay, cardCloseBtn);
            } else {
                // Non-admin users cannot close surprise cards
                cardCloseBtn.style.display = 'none';
                cardOverlay.onclick = null;
            }
        }
        
        cardOverlay.style.display = 'flex';
    }

    createCardTextOverlay(parentElement, text, type, cardType = null, tileId = null) {
        const textOverlay = document.createElement('div');
        textOverlay.className = `card-text-overlay card-text-${type}`;
        
        // Function to convert URLs to hyperlinks
        const convertUrlsToLinks = (text) => {
            // URL regex pattern - matches http/https URLs
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            return text.replace(urlRegex, '<a href="$1" target="_blank" style="color: #0066cc; text-decoration: underline;">$1</a>');
        };
        
        // Handle line breaks and special formatting for surprise cards
        if (text.includes('\n')) {
            const lines = text.split('\n');
            let formattedText = '';
            
            // Check if this is a surprise card (first line has quotes and we're using 'front' type)
            const isSurpriseCard = type === 'front' && lines[0].includes('"') && lines[0].startsWith('"') && !text.includes('Unsubscribe?');
            
                    // Check if this is a sudden death card (contains Unsubscribe?, Block?, or Close?)
        const isSuddenDeathCard = text.includes('Unsubscribe?') || text.includes('Block?') || text.includes('Close?');
            
            if (isSurpriseCard) {
                // Make first line (quoted text) bold, rest normal
                formattedText = `<strong>${convertUrlsToLinks(lines[0])}</strong>`;
                if (lines.length > 1) {
                    formattedText += '<br>' + lines.slice(1).map(line => convertUrlsToLinks(line)).join('<br>');
                }
            } else if (isSuddenDeathCard) {
                console.log('💀 Processing sudden death card text:', text);
                // Format sudden death cards with italicized decision prompts
                // Use more aggressive asterisk removal to catch all variations
                formattedText = text
                    .replace(/Unsubscribe\?/g, '<em>Unsubscribe?</em>')
                    .replace(/Block\?/g, '<em>Block?</em>')
                    .replace(/Close\?/g, '<em>Close?</em>')
                    .replace(/\n/g, '<br>');
                // Convert URLs to links after other formatting
                formattedText = convertUrlsToLinks(formattedText);
                console.log('💀 Formatted sudden death text:', formattedText);
            } else {
                // Regular formatting for question cards
                formattedText = text.replace(/\n/g, '<br>');
                // Convert URLs to links
                formattedText = convertUrlsToLinks(formattedText);
            }
            
            textOverlay.innerHTML = formattedText;
        } else {
            // For single line text, convert URLs to links
            const textWithLinks = convertUrlsToLinks(text);
            textOverlay.innerHTML = textWithLinks;
        }
        
        // Dynamic font sizing based on text length - better scaling with larger fonts
        const textLength = text.length;
        let fontSize;
        if (textLength < 80) {
            fontSize = '32px'; // Short text = much bigger font
        } else if (textLength < 150) {
            fontSize = '28px'; // Medium text = bigger font
        } else if (textLength < 250) {
            fontSize = '24px'; // Long text = medium font
        } else {
            fontSize = '20px'; // Very long text = still readable font
        }
        
        // Apply dynamic styling - use more vertical space
        textOverlay.style.fontSize = fontSize;
        textOverlay.style.lineHeight = '1.4'; // Tighter line spacing for better space usage
        textOverlay.style.fontWeight = 'bold';
        
        // Set text color - white for sudden death answer cards, black for everything else
        if (cardType === 'SUDDEN_DEATH' && type === 'back') {
            textOverlay.style.color = 'white';
        } else {
            textOverlay.style.color = 'black';
        }
        textOverlay.style.textAlign = 'center';
        textOverlay.style.position = 'absolute';
        textOverlay.style.top = '50%'; // Center vertically in the card
        
        // Special handling for Knowledge Knoll answer texts - bigger top margin
        if (tileId == 4 && type === 'back') {
            textOverlay.style.marginTop = '80px'; // Bigger offset for Knowledge Knoll answers to avoid PNG image
        } else {
            textOverlay.style.marginTop = '40px'; // Normal offset for all other cards
        }
        textOverlay.style.left = '50%'; // Center horizontally
        textOverlay.style.width = '90%'; // Use more width
        textOverlay.style.maxWidth = '90%';
        textOverlay.style.wordWrap = 'break-word';
        textOverlay.style.padding = '10px 15px'; // Less padding to use more space for text
        textOverlay.style.backfaceVisibility = 'hidden'; // Hide when rotated away
        textOverlay.style.zIndex = '10';
        textOverlay.style.height = 'auto'; // Let content determine height
        textOverlay.style.maxHeight = '60%'; // Don't exceed 60% of card height
        
        // Position based on card type with proper 3D transforms
        if (type === 'front') {
            textOverlay.style.transform = 'translate(-50%, -50%) rotateY(0deg)';
            textOverlay.style.display = 'block';
        } else if (type === 'back') {
            textOverlay.style.transform = 'translate(-50%, -50%) rotateY(180deg)';
            textOverlay.style.display = 'block'; // Always visible, but rotated away initially
        }
        
        parentElement.appendChild(textOverlay);
    }

    enableCardClosing(cardOverlay, cardCloseBtn) {
        const closeCard = () => {
            cardOverlay.style.display = 'none';
            
            // Hide question card timer when card is closed
            this.hideQuestionCardTimer();
            
            // Check if admin is closing the card
            const hostname = document.getElementById('hostname').value;
            const username = document.getElementById('username').value;
            const isAdmin = (username === hostname);
            
            if (isAdmin) {
                // Send card close notification to all clients
                this.socket.send(JSON.stringify({
                    action: "card_closed",
                    hostname: this.hostName
                }));
            }
            
            // If there's a pending next player (for question cards), continue the game flow
            if (this.pendingNextPlayer !== undefined) {
                const nextPlayer = this.pendingNextPlayer;
                this.pendingNextPlayer = undefined; // Clear the pending state
                this.changePlayer(nextPlayer, this.onDiceRolled.bind(this));
            }
        };
        
        cardCloseBtn.style.display = 'block';
        cardCloseBtn.onclick = closeCard;
        cardOverlay.onclick = (e) => {
            if (e.target === cardOverlay) closeCard();
        };
    }

    enableSuddenDeathCardClosing(cardOverlay, cardCloseBtn) {
        const closeCard = () => {
            cardOverlay.style.display = 'none';
            
            // Hide timer when card is closed
            this.hideSuddenDeathTimer();
            
            // Send card close notification to all clients
            this.socket.send(JSON.stringify({
                action: "card_closed",
                hostname: this.hostName
            }));
        };

        const nextCard = () => {
            console.log("💀 Next Card button clicked by admin");
            
            const cardFlipContainer = document.querySelector('#card-overlay .card-flip-container');
            
            if (cardFlipContainer && cardFlipContainer.classList.contains('flipped')) {
                // Card is currently showing answer side - flip it back to question side first
                console.log("💀 Card is flipped, flipping back to question side first");
                
                // Add fast-flip class for instant animation
                cardFlipContainer.classList.add('fast-flip');
                cardFlipContainer.classList.remove('flipped');
                
                // Instant flip - no delay
                console.log("💀 Instant flip, now showing next card");
                this.suddenDeathBlitz.currentQuestionIndex++;
                this.showNextSuddenDeathBlitzCard();
                
                this.socket.send(JSON.stringify({
                    action: 'sudden_death_next_card',
                    category: this.suddenDeathBlitz.currentCategory,
                    question_index: this.suddenDeathBlitz.currentQuestionIndex
                }));
            } else {
                // Card is already on question side - show next card immediately
                console.log("💀 Card is already on question side, showing next card immediately");
                this.suddenDeathBlitz.currentQuestionIndex++;
                this.showNextSuddenDeathBlitzCard();
                
                this.socket.send(JSON.stringify({
                    action: 'sudden_death_next_card',
                    category: this.suddenDeathBlitz.currentCategory,
                    question_index: this.suddenDeathBlitz.currentQuestionIndex
                }));
            }
        };

        // Show both Close and Next Card buttons for sudden death mode
        cardCloseBtn.style.display = 'block';
        cardCloseBtn.textContent = '×';  // Just X, not "Close Card"
        cardCloseBtn.onclick = closeCard;

        // Create and add Next Card button
        let nextCardBtn = document.getElementById('next-card-btn');
        if (!nextCardBtn) {
            nextCardBtn = document.createElement('button');
            nextCardBtn.id = 'next-card-btn';
            nextCardBtn.textContent = 'Next Card';
            nextCardBtn.style.cssText = `
                position: absolute;
                bottom: 20px;
                left: 20px;
                padding: 10px 20px;
                background: linear-gradient(135deg, #ff6b6b, #ee5a24);
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                z-index: 1001;
                box-shadow: 0 4px 12px rgba(238, 90, 36, 0.3);
                transition: all 0.3s ease;
            `;
            
            nextCardBtn.addEventListener('mouseenter', () => {
                nextCardBtn.style.transform = 'scale(1.05)';
                nextCardBtn.style.boxShadow = '0 6px 16px rgba(238, 90, 36, 0.4)';
            });
            
            nextCardBtn.addEventListener('mouseleave', () => {
                nextCardBtn.style.transform = 'scale(1)';
                nextCardBtn.style.boxShadow = '0 4px 12px rgba(238, 90, 36, 0.3)';
            });
            
            cardOverlay.appendChild(nextCardBtn);
        }
        
        nextCardBtn.style.display = 'block';
        nextCardBtn.onclick = nextCard;

        // Allow closing by clicking outside
        cardOverlay.onclick = (e) => {
            if (e.target === cardOverlay) closeCard();
        };
    }

    // Card text data for each tile - now supports multiple questions per tile
    getCardData() {
        return {
            // Tile 1 - Empathy Lane
            1: [
                {
                    question: "The customer is only expressing negative emotions but won't say what the issue is, even after being asked multiple times. What is the best course of action?",
                    answer: "Apologize and acknowledge their frustration, express willingness to help, and let them know you're here when they're ready to share more details."
                },
                {
                    question: "What does \"empathy\" mean in customer support?",
                    answer: "Understanding and acknowledging the customer's feelings and perspective, alongside directly apologizing when necessary."
                },
                {
                    question: "When a customer shares personal information (e.g., about a life event), what should you do?",
                    answer: "Briefly and politely acknowledge it, then guide the conversation back to the issue."
                },
                {
                    question: "The word \"Okay\" can come across as calm, cold, or even annoyed depending on how it's written.\nHow would you use \"Okay\" in a way that feels warm and supportive? Share an example of a message.",
                    answer: "A warm and supportive message might be:\n\"Okay, sounds good! Let me take care of that for you\"\nor\n\"Okay! Thanks so much for your patience — I'll get right on it.\"\n\nThe key is adding friendly context, punctuation (like exclamation marks), or softeners that show care."
                },
                {
                    question: "What's a better way to say: \"You entered the wrong information\"?",
                    answer: "\"It looks like some of the details might be off. Can you please double-check them?\""
                },
                {
                    question: "When a customer provides helpful info like screenshots or order numbers, what should you do?",
                    answer: "We should thank them!"
                },
                {
                    question: "What's wrong with this response? \"It's not my fault, that's just the way it works.\"",
                    answer: "It deflects responsibility and lacks empathy."
                },
                {
                    question: "Why is it important to validate customers' feelings?",
                    answer: "It builds trust and shows them they're being heard."
                },
                {
                    question: "How should you respond when a customer expresses anger, but they're not using abusive language?",
                    answer: "Be empathetic and acknowledge their emotions."
                },
                {
                    question: "True or False: Using emojis can sometimes convey empathy. (elaborate on the chosen option)",
                    answer: "True - when used sparingly and aligned with brand tone."
                },
                {
                    question: "A customer has been going back and forth with support for days. They write: \"Forget it. I give up.\" You believe you might be able to resolve their issue. What will your response be?",
                    answer: "\"I completely get how frustrating this must be. If you're open to it, I'd love a chance to fix it properly now.\""
                },
                {
                    question: "What's a more effective apology than \"Sorry if that caused trouble\"?",
                    answer: "\"I sincerely apologize for the inconvenience you've experienced.\""
                },
                {
                    question: "What should you always do when using a template as part of your response to the customer?",
                    answer: "Personalize it by adding customer-specific details and adapting the tone."
                },
                {
                    question: "A customer writes, \"You clearly don't value your customers.\" What would your response be?",
                    answer: "\"I'm really sorry it's come across that way. I know how important this is, and I'm going to do everything I can to help from here.\""
                },
                {
                    question: "What should you do if your message includes multiple pieces of info?",
                    answer: "Break it into short paragraphs for readability."
                },
                {
                    question: "A customer says: \"This is ridiculous. I've explained this twice already.\"\nHow can you acknowledge their frustration while still asking for clarification? Share your response.",
                    answer: "\"I'm so sorry this has been repetitive - I just want to make sure I fully understand so I can help you resolve this issue.\""
                },
                {
                    question: "True or False: Empathy should only be shown when a customer is upset.",
                    answer: "False - empathy should be part of every customer interaction."
                },
                {
                    question: "How can you validate a customer's frustration without confirming a resolution you can't guarantee?",
                    answer: "By acknowledging the customer's feelings while being transparent about what you can do, without suggesting a specific result."
                },
                {
                    question: "When a customer is excited or happy, what's the empathetic thing to do?",
                    answer: "Mirror their enthusiasm in your response."
                },
                {
                    question: "Fill in the blank: Empathy helps customers feel like they are ______.",
                    answer: "Heard and understood."
                }
            ],
            // Tile 4 - Knowledge Knoll
            4: [
                {
                    question: "FASHION NOVA: What is the main condition that needs to be met for an order to qualify for 1 business day shipping?",
                    answer: "The order must be placed by 3 pm ET."
                },
                {
                    question: "IGLOO: How does Igloo handle returns for products purchased from retailers?",
                    answer: "Igloo products purchased at an authorized retailer are subject to their return policies. Customers need to contact retailers directly for additional information."
                },
                {
                    question: "CALPAK: A customer reaches out asking whether we offer a rewards program. What would your response be?",
                    answer: "We have a VIT club where you can get first access to sales, a special birthday gift, exclusive events, and more. Plus you also get $5 just for signing up 😉 Here's where you can start your VIT journey: https://calpak.attn.tv/sl/UNlPK-CH"
                },
                {
                    question: "PINKLILY: A customer wants to know if there is a limit amount when using AfterPay on the website.",
                    answer: "Yes, your total amount due must be between $35 and $1,000 to use AfterPay on pinklily.com."
                },
                {
                    question: "ACME TOOLS: A customer texts in \"Okay\". What are you going to do?",
                    answer: "Close the conversation."
                },
                {
                    question: "BRILLIANT EARTH: The customer responds with multiple numbers to the journey message. What do you do?",
                    answer: "We don't send jny temp, we recommend items based on their selection instead."
                },
                {
                    question: "BEIS TRAVEL: A customer reaches out asking if reward points expire. What would your response be?",
                    answer: "Reward points expire after 6 months of inactivity. Inactivity refers to customers who have not earned or redeemed any points through completing a purchase within the selected time frame."
                },
                {
                    question: "BABYQUIP: Customer texts us and says, ''I would like to do a long-term rental, do you have any discounts for me based on that?\" What would your response be?",
                    answer: "Yes! If you rent for 9+ days, we'll discount your entire order! (Discount will automatically be applied at checkout.)\n\n1-8 day rental - Daily Rate\n9-16 day rental - 10% off\n17-24 day rental - 20% off\n24+ day rental - 30% off\nPlease note that long term rental discounts do not apply to delivery fees. [from FAQ & Template]"
                },
                {
                    question: "ORU KAYAK: Customer texts us and says, \"What kind of exclusions does your warranty have?\" What would your response be?",
                    answer: "Our warranty is designed to cover defects in materials and workmanship. However, the warranty doesn't cover products used for commercial or rental purposes; normal wear and tear, including punctures, cuts, and abrasions sustained in normal use; damage caused by accident, neglect, or misuse; damage caused by improper storage maintenance, or handling, etc. You can read more about the exclusions here (link)"
                },
                {
                    question: "CUSTOM GOLD GRILLZ: A customer texts in and says, \"I can't afford them, but I really want them\". What will you do?",
                    answer: "Depending on the scenario, either send PTE or share our financing options."
                },
                {
                    question: "BONAFIDE: A customer texts in and says, \"Is it possible to change the payment method for my subscription?\". What would your response be?",
                    answer: "Yes, it is! In order to update your credit card information, first log in to your account here: https://hellobonafide.com/account/login Once you're logged in and on your Subscriptions page, click \"Edit\" under your current billing information. From there, you'll be taken to a page stating that we'll send you an email to update your billing information. Select \"Send Email\" and update your billing preferences accordingly once you receive the email. Let me know how that goes!"
                },
                {
                    question: "MITZI: A customer texts in and says, \"I've been trying to cancel my order. Please help\". What would your response be?",
                    answer: "I'm sorry to hear that! You can cancel an order within a 72-hour window of order placement so long as the order has not yet been shipped. If your order has already shipped (even if within the 72-hour window), it cannot be canceled and will be treated as a return. To request an order cancellation, please contact our team by emailing us at hello@mitzi.com. Please be sure to include your name, address, Mitzi order number, items to be cancelled, and the reason for your cancellation. You will receive an email detailing if the cancellation request was successful. Please allow up to 72 hours to receive your cancellation confirmation."
                },
                {
                    question: "COMFRT: A customer texts in and says, \"I ordered a pre-order item. Why was my account charged?\". What would your response be?",
                    answer: "Thank you for reaching out! Please note that when you place a pre-order, you will be charged at the time of purchase. Your placing of a pre-order constitutes your express agreement to the charging of your provided payment method at such time. You can read more about our Pre Order Terms and Conditions here: https://comfrt.com/pages/pre-order-policy#pre-order-and-estimated-shipping-date"
                },
                {
                    question: "CARDBOARD CUT OUT STANDEES: A customer texts in and says, \"Do you have a discount for me? I want to order about 50 of them.\" What would your response be?",
                    answer: "I can definitely check on this for you. Can you let me know the item type, quantity, and size you're looking to get? Can I also have your e-mail address?"
                },
                {
                    question: "LACOSTE: A customer texts in and says, \"I'm ex-marine, can you offer me a cheaper price?\" What would your response be?",
                    answer: "Thank you for your service! You can learn more and apply for your discount here: https://hosted-pages.id.me/lacoste-military Let me know how that goes!"
                },
                {
                    question: "CHROME INDUSTRIES: A customer texts in and says, \" I bought a Kadet Sling 3 days ago, and now it's on sale?! Can you refund me the balance?\" What would your response be?",
                    answer: "If an item you bought on our site goes on sale within 5 days of purchase, we'll refund the price difference to the original form of payment or with credit. Price adjustments don't stack with promotional codes - we'll provide a partial refund. A receipt must be present to honor a price adjustment. Final sale items aren't eligible for a price adjustment and any items adjusted to final sale prices can't be returned. Please reach out to us at support@chromeindustries.com with your order number and we'll sort out any adjustments."
                },
                {
                    question: "OPEN FARM: A customer texts in and says, \" I want to check out a store with my dog to see if they offer samples before I buy, he's very picky. Is there one near me?\" What steps are you going to take to provide a resolution?",
                    answer: "Search our templates and use the appropriate one: \"Do you have samples?...\" We can also ask for their zip code to narrow down the search for them."
                },
                {
                    question: "STEVE MADDEN: A customer texts in and says, \"I'm trying to use my gift card, but it won't let me\". What steps are you going to take to provide a resolution?",
                    answer: "We should check if it's a physical or digital gift card. Physical Gift cards may be used at Steve Madden retail stores (only stores in the USA, excluding Colorado, Utah, and Savannah, GA locations). Digital Gift Cards that can be used only at stevemadden.com."
                },
                {
                    question: "BRAUN: A customer texts in and says, \"Why am I being charged for tax? I thought you didn't charge that.\" What steps are you going to take to provide a resolution?",
                    answer: "We need to ask the customer in what state the item is going to be delivered. Sales tax is added for taxable items in deliveries to the following states: California, Illinois, New Jersey, New York, Texas, Washington, Florida, and Pennsylvania."
                },
                {
                    question: "HAPPIEST BABY: A customer texts in and says, \"Will you restock the Lola Crib?\" What would your response be?",
                    answer: "I'm so sorry, but the Lola Crib is no longer available. Do you need help with anything else or have any questions about our other products?"
                }
            ],
            // Tile 7 - Escalation Ave
            7: [
                {
                    question: "When should you escalate a conversation?",
                    answer: "When the issue is outside your scope, technical, or unresolved after troubleshooting, or when the notes instruct you to do so immediately"
                },
                {
                    question: "How does our research process help us reduce escalations?",
                    answer: "Allows us to check all of the information at our disposal, which majority of the time will yield the correct response to the customer."
                },
                {
                    question: "How would you handle a customer wanting to make a return after the deadline? They are aware of the return policy deadline but they insist that you double-check with the team.",
                    answer: "Politely explain that our return policy deadlines do not leave much room for exceptions and apologize. Since the customer insists, we can proceed to escalate or send to CS per the Notes"
                },
                {
                    question: "When can you send to CS even if you have escalated?",
                    answer: "When it has been over 2 business days without a response to the escalation, and the cx checks in. But only if there are no notes preventing us from sending to CS."
                },
                {
                    question: "Why do we include the information we do in escalation notes?",
                    answer: "To make it easier for the client to resolve the customer's issue or inquiry"
                },
                {
                    question: "What does \"escalation\" mean in a Concierge context?",
                    answer: "It is referring the cx's inquiry to customer support directly through the UI, and having the customer receive a response in the SMS conversation"
                },
                {
                    question: "If a customer requests to speak to a manager but hasn't explained the issue yet, what should you do first?",
                    answer: "Troubleshoot: Try to understand what the issue is and offer assistance if possible."
                },
                {
                    question: "What's a good phrase to use when informing a customer you're escalating their issue?",
                    answer: "\"Thank you for the information. Let me check with the team and I will get back to you as soon as I get a response. Please hang tight.\""
                },
                {
                    question: "What are the 2 types of escalations we have?",
                    answer: "Pre-purchase and post-purchase"
                },
                {
                    question: "What are the two scenarios where agents can de-escalate an issue?",
                    answer: "1) They can de-esc and re-esc when the customer shared vital info for the resolution\n2) they can de-esc if the customer says their issue has been resolved"
                },
                {
                    question: "\"I returned something, but the tracking shows it's stuck. Will I still get my refund on time?\" How will you provide a resolution to this?",
                    answer: "Advise the customer to contact the courier first. If no info is provided, we can escalate or send to CS based on the notes"
                },
                {
                    question: "\"I returned the wrong item by mistake — what do I do now?\" How will you provide a resolution to this?",
                    answer: "You can escalate or send to CS according to the brand preference."
                },
                {
                    question: "What's a good message to use when a customer insists on escalation but you're still gathering the needed info?",
                    answer: "\"I understand your concern, and I want to make sure we handle this properly. To avoid delays or confusion, I just need a few more details so the team has the full picture. Can I please have your ...\""
                },
                {
                    question: "What should you do if a customer is angry but hasn't provided any actionable details for an escalation?",
                    answer: "Emphasize and acknowledge their frustration, then ask again for specifics and what the issue is that they're facing."
                },
                {
                    question: "A customer bought something and is wondering if they can get a replacement for a part, but the brand doesn't sell parts on the website. What steps are you going to take and will you escalate?",
                    answer: "We'd check notes and templates for replacement information, and if none is available, we'd escalate."
                },
                {
                    question: "What would you do if you found a resolution, but the agent before you has escalated the issue?",
                    answer: "We'd provide the answer using a phrase like \"I just heard back from the team...\" and we'd de-escalate after."
                },
                {
                    question: "The customer says they were charged twice, and both charges have been posted. They provide screenshots of the bank notifications. What are your next steps?",
                    answer: "Ask for email address and order number (s) if available, and ESC or send to CS per the notes."
                },
                {
                    question: "What should you do if a customer provides additional information required to resolve the escalated issue?",
                    answer: "We copy the original escalation note, de-escalate, and compose a new escalation note with both the original and the new information the customer provided."
                },
                {
                    question: "A customer texts in that they have not received an order confirmation email, and they want to know their order number. They confirm they have already checked their spam & promo folders. How do you proceed?",
                    answer: "Shopify Brands: If we see an order, we can check for the order number, but if we don't see an order, we will check if the charge is pending or posted. If it's posted, we need to ask for their email address and escalate.\n\nNon-Shopify Brands: If we see an order, we will gather the email address and escalate. If we don't see an order, we will check if the charge is pending or posted. If it's posted, we will escalate with their email address."
                },
                {
                    question: "Do you need to gather customer information when escalating a pre-purchase issue?",
                    answer: "Yes, if the brand notes/templates require us to do so, or if the issue involves an account-related concern, in which case we ask for the customer's email."
                }
            ],
            // Tile 8 - Riddleton Place
            8: [
                {
                    question: "Answer the riddle: I'm asked when something's lost,\nI'm not a name, not a brand,\nBut I'll tell you where things land.\nWhat am I?",
                    answer: "Tracking number"
                },
                {
                    question: "Answer the riddle: You don't want me, but you need me.\nI'm not a solution, I'm a bridge.\nWhen you can't find what you want,\nI connect you to the next decision.\nWhat am I?",
                    answer: "Escalation"
                },
                {
                    question: "Answer the riddle: I'm a habit, and skipping me makes you look like a fool.\nI spot mistakes, help thoughts align.\nWhat am I?",
                    answer: "Backreading"
                },
                {
                    question: "Answer the riddle: I'm not the final answer,\nBut I help you get things right.\nI live in the UI left and right,\nAnd guide you through the night.\nWhat am I?",
                    answer: "Notes and Templates"
                },
                {
                    question: "Answer the riddle: I'm here when things just aren't quite right,\nNot damaged, but not your delight.\nWithin a window, I open wide - \nBeyond that point, I must subside.",
                    answer: "Returns and Exchanges"
                },
                {
                    question: "Answer the riddle: I'm a code, but I'm not in the automated message, primary email inbox, the UI, or on the website. Where did I go?",
                    answer: "Spam and Promo Folders"
                },
                {
                    question: "Answer the riddle: You liked us once, but now you part,\nNo more deals to warm your heart.",
                    answer: "Unsubscribing"
                },
                {
                    question: "Answer the riddle: I'm not your manager, but I help you win.\nYou cover my blind spots, I cover your spin.\nI might pick up when you're away - \nWho am I, saving the day?",
                    answer: "Teammate/Agent"
                },
                {
                    question: "Answer the riddle: I'm needy, clingy, never chill - \nAlways hungry, never still.\nSome days I'm calm, some days I roar - \nAnswer me or I'll bring more!\nWhat am I?",
                    answer: "Inbox/Queue"
                },
                {
                    question: "Answer the riddle: I save you time and guide your tone,\nBut copy me wrong and you're on your own.\nYou tweak me to fit, I'm not set in stone - \nWhat am I?",
                    answer: "Templates"
                },
                {
                    question: "Answer the riddle: You can't see me, but you feel me.\nToo much and I can steal the scene.\nToo cold, and I might seem mean.\nI shape how every word is seen.\nWhat am I?",
                    answer: "Empathy/Tone"
                },
                {
                    question: "Answer the riddle: I'm not a chain, but I connect,\nOne wrong me and things deflect.\nClick me once to see the source - \nUse me well, stay on course.\nWhat am I?",
                    answer: "Link"
                },
                {
                    question: "Answer the riddle: A button breaks, the site won't load,\nThe cart resets, or screens explode.\nIt's not the agent, it's not the brand - \nYou tag the folks who code by hand.\nWhat Slack space am I?",
                    answer: "#concierge-tech-issues"
                },
                {
                    question: "Answer the riddle: What's changed? What's new? What's rolling out?\nThis is where you clear the doubt.\nFrom sale dates to return delays - \nI keep you looped in on brand days.\nWhat Slack space am I?",
                    answer: "#concierge-brand-updates"
                },
                {
                    question: "Answer the riddle: I work like magic, then I'm gone.\nTry me twice, I won't turn on.\nI play fair\nOnce I'm used, I can't be found.\nWhat am I?",
                    answer: "Welcome Code"
                },
                {
                    question: "Answer the riddle: The customer says, \"I never got it,\"\nYou searched the flow, it's not in their pocket.\nIt's not expired, it's just unseen - \nWhat do you do to keep things clean?",
                    answer: "Post in #concierge-ops-issues"
                },
                {
                    question: "Answer the riddle: I hold the answers, long and short,\nFrom size charts down to return support including the workflow.\nI'm not a person, I don't say \"hey\"- \nBut check with me before you stray.\nWhat am I?",
                    answer: "Knowledge Base"
                },
                {
                    question: "Answer the riddle: I choose the colors, voice, and feel,\nAnd every chat should match my seal.\nYou don't just support - you become me too -\nWho am I, shining through you?",
                    answer: "The Brand/Clients"
                },
                {
                    question: "Answer the riddle: I don't sleep, I don't eat,\nBut I can help you sound real neat.\nAsk me questions, big or small - \nI'll answer fast, I've read it all.\nWhat am I?",
                    answer: "ChatGPT"
                },
                {
                    question: "Answer the riddle: I'm not a button, not a tab,\nBut with a tweak, I make you find fast.\nAdd a word, remove some parts\nI'll find that stash.\nWhat am I?",
                    answer: "URL Trick"
                }
            ],
            // Tile 11 - Sale-A-Vie Blvd
            11: [
                {
                    question: "A customer says, \"What are your most popular products?\" What collection would you send?",
                    answer: "Best-Selling (or \"Most Popular\")."
                },
                {
                    question: "A customer says, \"I am trying to buy a ring for my daughter, but all the natural diamonds are very expensive. Do you have any recommendations?\". What question are you going to ask to narrow down options for them, and what would you recommend?",
                    answer: "Ask for the customer's budget and suggest a lab-grown diamond that is cheaper than natural diamonds."
                },
                {
                    question: "A customer says, \"I want a gift for someone who loves fitness but already has all the gear.\"\nWhat would you recommend?",
                    answer: "Find something that is purchased continuously, such as fitness clothes, personalized items, possibly a supplement subscription or bundle."
                },
                {
                    question: "Describe the Funnel Method process.",
                    answer: "The Funnel Method is used when a customer is looking for a general product (e.g., \"a blue T-shirt\").\nWe start broad with a general category link and ask targeted follow-up questions about preferences.\nWe then refine the options based on their responses and share filtered links or specific product recommendations based on their input."
                },
                {
                    question: "A customer says, \"I'm buying a neck pillow for travel, anything else I shouldn't forget?\" What can you suggest/recommend?",
                    answer: "We can suggest a travel-size skincare set., sleeping mask, earplugs, etc."
                },
                {
                    question: "A customer is asking you to provide different suggestions for purses. How would you approach this?",
                    answer: "We probe for specific preferences, occasion etc. and send suggestions depending on their answers."
                },
                {
                    question: "A customer seems overwhelmed by shoe choices. What's a strategic way to narrow down the options?",
                    answer: "Use the Funnel Method! Start by highlighting 1–2 bestseller shoes or bestseller collection and ask specific follow-up questions like: \"Are you looking for sandals or closed shoes?\", \"What's your budget?\", etc."
                },
                {
                    question: "A customer says, \"I need something breathable, not synthetic, but also cute enough to wear to brunch.\"\nList at least 2 filter keywords that you are going to use.",
                    answer: "Linen, cotton, lightweight, natural, etc."
                },
                {
                    question: "A customer says, \"I want something dressy, but I'm super short and don't want to drown in fabric.\"\nList at least 2 filter keywords that you are going to use.",
                    answer: "Petite, midi length, wrap style, etc."
                },
                {
                    question: "A customer says, \"My teen's starting skincare, they have sensitive skin - nothing harsh, please.\" List at least 2 filter keywords that you are going to use.",
                    answer: "Gentle/sensitive, fragrance-free, dermatologist-approved, non-comedogenic, hypoallergenic, etc."
                },
                {
                    question: "The customer wants to purchase a certain product, but they sound hesitant, and they asked you if the product is actually good or not? What's a good strategy to help the customer trust the brand/product?",
                    answer: "Assure them that the we always do our best to provide the best quality, share some details about the product, share customer reviews if possible"
                },
                {
                    question: "A customer says, \"I love comfort, and I want to buy a Tranquil hoodie with sweat pants for my kiddo's birthday. Her size is small, and I'd like the color cement.\"\nMake a cart for this customer.",
                    answer: "Create a Cart"
                },
                {
                    question: "A customer says, \"I want a lamp under $190 for my 11-inch entryway table, what options does Mitzi have?\" What link would you send?",
                    answer: "https://mitzi.com/collections/table-lamp?sort_by=manual&filter.v.price.gte=0.00&filter.v.price.lte=190.00&filter.p.m.custom.width=Medium+%286%22+to+12%22%29&filter.p.m.custom.rooms=gid%3A%2F%2Fshopify%2FMetaobject%2F84335263896"
                },
                {
                    question: "\"I want a shampoo for damaged hair from Kitsch.\" List 2 options you can recommend and why you would recommend them.",
                    answer: "1) What about our Coconut Oil Shampoo Bar for Dry Damaged Hair here - https://www.mykitsch.com/products/coconut-oil-deep-moisturizing-solid-shampoo-bar?_pos=1&_sid=c997e9ede&_ss=r\n\nIt comes infused with nourishing coconut oil to help hydrate and soften dry, damaged strands.\n\n2) We also have our Rice Water Shampoo Bar for Hair Growth here - https://www.mykitsch.com/products/rice-water-protein-shampoo-bar-strengthening\n\nThe rice water helps to repair damaged hair follicles & prevent split ends."
                },
                {
                    question: "A customer says, \"I want a nice t-shirt for a birthday, but no idea what.\" What are 3 follow-up questions you can ask to narrow down the options for them?",
                    answer: "Is the shirt for themselves or a gift, what is their budget, what is their style preference, what is the size, etc."
                },
                {
                    question: "The customer is committed to buying creme-colored pants! List at least 2 items that would complement the pants.",
                    answer: "Muted earth tone shirt, belt, scarf, jacket, etc."
                },
                {
                    question: "You get this message from an 'Equestrian Collections' customer: \"I need a black medium Blanket Liner for my horse.\" Share at least 2 recommendations.",
                    answer: "1) https://www.equestriancollections.com/products/tough-1-softfleece-blanket-liner?_pos=1&_fid=fe03fa06b&_ss=c&variant=45131201937561\n2) https://www.equestriancollections.com/products/tough-1-softfleece-blanket-linersheet-with-adjustable-leg-straps?_pos=4&_fid=fe03fa06b&_ss=c&variant=45129645654169"
                },
                {
                    question: "You get this message from an 'Open Farm' customer: \"My kitten is obsessed with both chicken and salmon! What options do you have?\". What would you respond?",
                    answer: "You can explore our full range of Kitten Chicken & Salmon recipes, including dry food, wet food, and broth here: https://openfarmpet.com/collections/cat-food?protein=chicken,salmon&lifestage=kitten&sort_by=best-selling\n\nIf you're looking for something extra nourishing, our Kitten Chicken & Salmon Pâté is a great choice: https://openfarmpet.com/products/kitten-chicken-salmon-pate-recipe-for-cats\nIt is created to give growing kittens the building blocks they need to grow healthy. This velvety smooth pâté is crafted with a protein-packed blend of wild-caught salmon, humanely-raised chicken, and chicken liver."
                },
                {
                    question: "You get this message from a 'Green Pan' customer: \"I want to get rid of my old frypans. What options do I have for aluminum frypans?\" What would you respond?",
                    answer: "You can browse our full selection of aluminum frypans here: https://www.greenpan.us/collections/frypans?pf_t_material=material%3Aaluminum I'd recommend our limited edition Stanley Tucci™ Ceramic Nonstick 12\"\" Frypan - https://www.greenpan.us/collections/frypans/products/stanley-tucci%E2%84%A2-ceramic-nonstick-12-frypan-with-lid-calabrian-fig\nIt has the same advanced coating as the stainless steel options, but the aluminium makes it a lighter and more affordable option. Let me know what you think!"
                },
                {
                    question: "You get this message from a 'Jaanuu' customer: \"I desperately need some new scrubs\". Can you please recommend some Women's sets for me?\". What would you respond?",
                    answer: "I'm happy to recommend a few great options! We have our The Alex Essential Scrub Set in Sage here, it is great for a shape-defining look - https://www.jaanuu.com/pages/scrub-sets-layering/the-alex-essential-scrub-set?color=Sage\nThe Sage is also one of our new colors, and it's already trending.\nI would also recommend our The UltraLITE™ Style Scrub Set here - https://www.jaanuu.com/pages/scrub-sets-layering/the-ultralite-style-scrub-set?color=Midnight%20Navy\nIt is engineered for minimal weight and maximum breathability."
                }
            ],
            // Tile 14 - Knowledge Square
            14: [
                {
                    question: "If the note includes the word \"immediately\", what should we do?",
                    answer: "If \"immediately\" is mentioned in the note, do not troubleshoot or ask additional questions. Instead, follow the instructions directly and without delay."
                },
                {
                    question: "What does DNR measure?",
                    answer: "It measures the time from entering a chat to closing it when no reply is needed."
                },
                {
                    question: "Which metric helps evaluate whether agents have a good understanding of our processes, workflows and information?",
                    answer: "QA"
                },
                {
                    question: "Your internet has been acting up and you keep getting kicked out of the UI. What should you do?",
                    answer: "Log connectivity issues in #superhuman-daily, mark yourself unavailable and troubleshoot."
                },
                {
                    question: "What is the name and function of the rectangular box at the bottom of the left-hand side of the UI for Shopify brands?",
                    answer: "The Coupon Inspector: This can be used to check the validity and T&Cs for discount codes."
                },
                {
                    question: "A customer texts, \"I unsubscribed last month and I'm still getting your messages.\" How do we respond?",
                    answer: "We unsubscribe."
                },
                {
                    question: "List all QA categories.",
                    answer: "Issue Identification, Proper Resolution, Product Sales, Accuracy, Workflow, Clarity, Tone"
                },
                {
                    question: "There is a delay between the chat being assigned to you and the customer message being shown (more than a minute). What 3 steps would you follow?",
                    answer: "1) Clear your cookies and cache and reset your browser\n2) Go from one conversation to another or refresh within the conversation\n3) If the messages are not loading after a few minutes, report in #concierge-tech-issues"
                },
                {
                    question: "List 2 WIW actions that will affect your availability.",
                    answer: "1. Not clocking in\n2. Not clocking out"
                },
                {
                    question: "What should you include in a Template Request?",
                    answer: "A clear title, structured information, and source links."
                },
                {
                    question: "What does UT measure?",
                    answer: "It measures the time it takes to enter a new conversation after it has been assigned (this excludes the time you spend in another conversation if you already have an active chat)."
                },
                {
                    question: "What are 2 helpful resources to provide to a customer who has doubts about the size they're getting? Elaborate on your choices.",
                    answer: "The size guide, where they might find extra information on how to measure themselves, and the return policy in case the item isn't a good fit."
                },
                {
                    question: "What is the definition of spamming?",
                    answer: "Spamming is defined as sending more than three (3) messages that are completely unrelated to the brand (e.g. shopping lists, YouTube videos, giveaways, etc.)."
                },
                {
                    question: "After how many messages do we block if the customer is providing negative feedback about the products and services?",
                    answer: "We will not block, we will empathize, probe, and work with them towards a resolution."
                },
                {
                    question: "Why would a customer send a longer order number than the one that appears under customer profile?",
                    answer: "Sometimes the customer profile only shows part of the order number. To see it in full, you'd have to click on the order to go to the brand's website and see the full number"
                },
                {
                    question: "When do we close a conversation? List the four categories.",
                    answer: "Message is clearly not meant for us, our reply adds no value to the conversation, situations when a reply is unnecessary, and the customer asks a question more than two times"
                },
                {
                    question: "Briefly describe Price Matching & Price Adjustments workflow",
                    answer: "Check company notes\nCheck for a brand-specific template\nCheck the brand's website and FAQ page for their policy\nIf there is no brand-specific guidance available, send the relevant global template:\nOnce the customer provides the necessary details, escalate if notes permit."
                },
                {
                    question: "List the sub categories of Proper Resolution.",
                    answer: "Efficient Troubleshooting, Correct Escalation, Double Text & Partial Reply"
                },
                {
                    question: "When do we post in #concierge-ops-issues?",
                    answer: "The customer was informed they'd get a discount code but no discount code was available\nThe customer claims they never received their discount/welcome code\nThe brand persona is not available"
                },
                {
                    question: "How many times do we ask for a screenshot if it's not showing?",
                    answer: "2 times"
                }
            ],
            // Tile 17 - Problem Plaza
            17: [
                {
                    question: "An LG Customer sends you the model number of a fridge they want to get. They ask you if it's available. What steps are you going to take to provide a resolution?",
                    answer: "Find the product page and check for availability. If it's not available online, ask for their zip code to see if it's available in a store near them."
                },
                {
                    question: "A customer texts in and says, 'I used a discount code, then canceled my order. Now I can't use it again.' What steps are you going to take to provide a resolution?",
                    answer: "The code may not work as it was previously used on an order. If we have a code available that's of equal or better value, we should share it with the customer. If we don't have any available, we should escalate or send to CS depending on the notes."
                },
                {
                    question: "A customer texts in and says, 'I placed two orders back-to-back. Can you combine them into one shipment?' What steps are you going to take to provide a resolution?",
                    answer: "Check notes and templates, and check the website to see if the client allows this. If we can't find any information, we should escalate or send to CS depending on the notes."
                },
                {
                    question: "A customer texts in and says, 'I received an extra item I didn't order - what do I do with it?' What steps are you going to take to provide a resolution?",
                    answer: "Check if the customer possibly ordered the item. If they did, educate them. If they didn't escalate."
                },
                {
                    question: "A customer texts in and says, 'My return was approved, but now I want to keep the item. Can I cancel the return?' What steps are you going to take to provide a resolution?",
                    answer: "Gather necessary information and escalate the conversation or send to CS per notes."
                },
                {
                    question: "A customer texts in on Monday and says, 'I need my order by Friday, can you help me?' What steps are you going to take to provide a resolution?",
                    answer: "Check if the brand offers expedited shipping methods that may allow the customer to get the items by Friday, i.e., Overnight or 2-day shipping. If they do, pass the information on and send the GRN template as well. If they don't, educate them about our available shipping options, apologize, and send the CNS template."
                },
                {
                    question: "A customer texts in and says, 'I think I have this figured out. No need to reply.' What do you do?",
                    answer: "Close the conversation."
                },
                {
                    question: "A customer texts in and says, 'I still have products from my last subscription. I want to pause or cancel my subscription. Can you help me, please?' What steps are you going to take to provide a resolution?",
                    answer: "We need to check if the brand offers the option to pause subscriptions and share that information with the customer. If not, check their cancellation policy and provide those details instead."
                },
                {
                    question: "A customer texts in and says, 'Who's this? Why are you texting me? I'm just a kid.' Do you unsubscribe?",
                    answer: "We would not unsubscribe as we don't know if they're under the age of 13."
                },
                {
                    question: "A customer texts in and says, 'My order total changed after I selected a different shipping method. Why is that?' What steps are you going to take to provide a resolution?",
                    answer: "Check the brand's shipping policy to see if they have different prices for different methods and educate the customer. i.e. standard is free but expedited is charged."
                },
                {
                    question: "When would you include a screenshot with your answer to a customer's question? Share 2 scenario examples.",
                    answer: "1. A product comparison page that the customer might have difficulty accessing\n2. Information on a product page that the customer isn't seeing on their end"
                },
                {
                    question: "A customer texts in and says, 'Your texts used to be helpful, but now they're just spammy. I don't want to be rude, but I didn't sign up for this much stuff.' What do you do?",
                    answer: "Send TMT"
                },
                {
                    question: "A customer texts in and says, 'You've been texting me every day, and it's starting to get ridiculous. Enough already.' What do you do?",
                    answer: "Unsubsribe"
                },
                {
                    question: "A customer texts in and says, 'Unreal. I didn't even ask for this. Please leave me alone.' What do you do?",
                    answer: "Unsubsribe"
                },
                {
                    question: "A customer texts in and says, 'I'd prefer just receiving email messages if that's possible.' What do you do?",
                    answer: "Unsubsribe"
                },
                {
                    question: "A customer texts in and says that the discount didn't apply. The agent responded with: 'Sorry, that's weird. It worked for other people. Can you again?' List 2 issues with this response.",
                    answer: "1. Sounds dismissive\n2. Doesn't ask for context (like error message or order details)\n3. Implies customer error without investigation"
                },
                {
                    question: "A customer is furious and yelling via text. The agent responded with: 'Please calm down so I can help you.' List 2 issues with this response.",
                    answer: "1. Telling someone to 'calm down' usually escalates, not de-escalates the situation\n2. Lacks empathy or validation\n3. Makes the issue about the tone instead of the resolution"
                },
                {
                    question: "What does it mean when the error message says, 'The discount code isn't available to you right now'?",
                    answer: "The code may have been used already or is for first-time orders only."
                },
                {
                    question: "A customer texts in and says, 'I'm not sure what size to order anymore, I'm on a weight loss journey and I recently lost 10 lbs.' How would you respond?",
                    answer: "Congratulations on your weight loss! I would suggest taking your recent measurements and comparing them to our size chart here - *link to size chart*. Let me know if you need further help!"
                },
                {
                    question: "A customer texts in and says, 'The product description said 'set of 2', but I only received one. Is that right?' What steps are you going to take to provide a resolution?",
                    answer: "Check to see what they ordered if the information is available in the UI. If not, ask them to tell you what product they purchased. Go to the website to double-check the product details."
                }
            ],
            // Tile 19 - Inquiry Inspections
            19: [
                {
                    question: "\"This isn't working.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I'm sorry to hear that! Could you tell me what specific feature or action isn't working as expected?\n\n- A feature or button is unresponsive (e.g. \"I clicked and nothing happened.\")\n- The product isn't performing as promised (e.g. \"The serum doesn't absorb.\")\n- The discount code didn't apply\n- An error occurred, but the customer isn't describing it"
                },
                {
                    question: "\"Where's the rest of it?\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "Can you clarify what you're missing. Are you referring to your order or something else?\n\n- They received part of a bundle, but not all items\n- They expected additional items (e.g., free gift)\n- They think the product is incomplete (e.g., missing straps or accessories)\n- It was a split shipment, and the rest hasn't arrived yet"
                },
                {
                    question: "\"The numbers are wrong.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I'm sorry about that. Can you please tell me what numbers you're referring to? Are you talking about the pricing in your cart?\n\n- The discount didn't apply correctly at checkout\n- Tax or shipping costs were unexpected\n- Order quantity changed or duplicated\n- Sizing on a garment/item is off compared to what they expected"
                },
                {
                    question: "\"The button is not clicking.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "Thanks for flagging that! Are you referring to the checkout button? Any error messages or specific step it gets stuck on?\n\n- A form or \"Apply\" button is unresponsive (technical error)\n- The add to cart button isn't working\n- They're clicking the wrong thing"
                },
                {
                    question: "\"Missing\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I'm sorry you're missing something. Is it something from your order? Can you let me know what's missing and how many items you received so far?\n\n- One or more items didn't arrive in the box\n- A promised gift or sample wasn't included\n- The package says delivered, but the customer didn't receive it\n- A part of the website/product page is no longer visible"
                },
                {
                    question: "\"This looks different.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I'm sorry for the inconvenience. Just to be sure we're on the same page, are you referring to the item you received or how it appears online?\n\n- The product's packaging or design changed\n- They're comparing an item to a previous order and noticing a difference\n- The color or size seems off from the photo they saw online\n- They're worried they received the wrong version or a fake"
                },
                {
                    question: "\"It's not applying.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "Are you referring to a discount code, gift card, or something else? I'll help you get this sorted.\n\n- A promo or discount code isn't working at checkout\n- A gift card or store credit isn't being accepted\n- A product filter isn't applying"
                },
                {
                    question: "\"I want to fix this.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "Absolutely! I'm happy to help. Can you tell me more about what you're trying to fix so I can walk you through it?\n\n- They made a mistake on the order\n- They want to exchange or return the product\n- The product they received is broken/damaged"
                },
                {
                    question: "\"This is wrong.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "Sorry to hear that you're upset! Can you let me know what seems wrong — the product, the price, or something else?\n\n- They received the incorrect product\n- Something about the product doesn't match the description\n- Their personal info was used or shown incorrectly\n- A billing or charge doesn't match expectations"
                },
                {
                    question: "\"Why is this happening?\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I'd love to take a closer look — could you tell me a bit more about what you're seeing or what you expected instead?\n\n- They are receiving too many promotional messages\n- They want an actual explanation, not just a fix\n- They're worried it will happen again if unresolved\n- They've contacted support before and feel ignored"
                },
                {
                    question: "\"I can't get in.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I'm sorry you're having trouble with getting in. Let's get you back in! Are you having trouble with our website, your login, password reset, or something else?\n\n- Login credentials aren't working\n- They're locked out or forgot their password\n- They expected access to something (e.g. early sale)"
                },
                {
                    question: "\"This isn't the same.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I'm sorry you didn't receive what you wanted. Can you let me know what you expected and what you received instead?\n\n- They've bought this product before and it's changed\n- The product doesn't look the same on the website\n- They think they received the wrong item or a knockoff\n- They believe they were promised something else\n- A recent update (product, UI, content) caught them off guard"
                },
                {
                    question: "\"It's not updating.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I'm sorry for the inconvenience. Are you referring to your order status, shipping info, or something else not updating?\n\n- They made a change and it didn't save\n- A live status (e.g. tracking or order info) hasn't changed\n- The website isn't refreshing with new info"
                },
                {
                    question: "\"Nothing's happening.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I'm here to help! Could you tell me what you're trying to do and what's showing on your screen?\n\n- They made a change (e.g. cart, profile, subscription) and it didn't save\n- A live status (e.g. tracking or order info) hasn't changed\n- The website isn't refreshing with new info\n- They're expecting real-time updates that aren't live yet\n- Their changes are stuck due to a backend or caching issue"
                },
                {
                    question: "\"I don't see it.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "Just to make sure I understand, are you looking for something in your account, email, or package?\n\n- They can't find a discount or promo code\n- They can't see their order confirmation or tracking info\n- They can't see a product on the site\n- They can't see a refund or store credit"
                },
                {
                    question: "\"Where is it?\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I'm happy to help! Just to confirm, are you asking about your package, tracking info, a certain product or something else?\n\n- They're referring to a missing item from a multi-item order\n- They're looking for a product they saw earlier (i.e., something in their cart went missing)\n- They're looking for a discount or promo code"
                },
                {
                    question: "\"I thought it came with something else?\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "Thanks for checking in. Could you let me know what item you are referring to? and what you were expecting it to include so I can take a closer look for you?\n\n- They assumed the product included accessories or components\n- They expected additional features or functionality\n- They believe they bought a bundle but only received one item"
                },
                {
                    question: "\"This doesn't match what I saw earlier.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I'm sorry something is not matching. Are you referring to product details, pricing, or something else that looks different now?\n\n- The price has changed\n- The product listing was updated\n- Their order summary looks different\n- The discount or offer has disappeared"
                },
                {
                    question: "\"Is this real?\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "I understand your concern. Can you let me know what specifically you're questioning - the product authenticity, website legitimacy, or something else? I'm here to help clarify.\n\n- They received a weird-looking or damaged item\n- They think a charge or email might be a scam\n- They're confused by a sudden price drop\n- They're unsure if a product is authentic"
                },
                {
                    question: "\"I never got a follow-up or anything.\"\n\nList at least 2 things the customer might be referring to.",
                    answer: "Sorry about that. Was this a follow-up about an order, a return, or something else we were helping with? Did you call or email us about your concern?\n\n- They were expecting an email update\n- They were told a package or order update would be provided\n- They were waiting on a refund or credit confirmation"
                }
            ],

            // Tile 21 - Coupon Court
            21: [
                {
                    question: "A customer says they never received their referral reward. What steps will you take to provide a resolution?",
                    answer: "Ask them to check their spam and promo folders, and to check if the reward is in their account. Check what the conditions are for them to get a referral reward, and if they were fulfilled. If the answer is yes to all of these, then we gather the necessary information and escalate if notes permit."
                },
                {
                    question: "List 4 reasons a code might not apply, even if it's valid?",
                    answer: "1. Specific instructions for the code to apply (e.g. BOGO deals)\n2. Minimum order total requirement\n3. Eligibility for certain items\n4. Already discounted items\n5. The code was used on a previous order"
                },
                {
                    question: "A customer is complaining about a discount to an item that was excluded. What steps will you take to provide a resolution?",
                    answer: "Apologize to the customer for the inconvenience, research the T&Cs for the discount, and share the information related to exclusions."
                },
                {
                    question: "If the customer says they never got the code they were promised after subscribing, what steps should you take?",
                    answer: "1. Check if the customer was supposed to receive a welcome code\n2. If yes, check the automated message for the code or a link leading to a code\n3. If there is no code available in the conversation thread, check if there is a Concierge code that offers the same discount amount and share that instead\n4. If there is no code available in the UI, search in #concierge-ops-issues channel to see if a general code is available\n5. If there is no code available, we post in the channel"
                },
                {
                    question: "What is the one thing you need to remember when sending a code to the customer?",
                    answer: "We need to share a link where they can shop and use the code."
                },
                {
                    question: "When should you offer the NCODE template without the last sentence?",
                    answer: "If the website doesn't have a sales, clearance, or deals collection, we should apologize to the customer, use the NCODE template, and exclude the last sentence."
                },
                {
                    question: "A customer applies a 20% discount code, but the site also runs an automatic 10% off sale. They want both. What do you do?",
                    answer: "Check if discounts can be stacked. If they can't apologize and educate the customer."
                },
                {
                    question: "The customer wants to use an expired code and demands the discount be honored because \"it worked yesterday.\" What do you do?",
                    answer: "Apologize and explain the code's expiration. Offer another code if available or direct to sales page."
                },
                {
                    question: "A promo was meant for first-time customers. A buyer had already used it, and the coupon got automatically removed at checkout after they entered their details. They're upset. What do you do?",
                    answer: "Politely explain the first-time customer restriction and offer them an alternate active promo if available."
                },
                {
                    question: "A discount code was only valid on orders above $100, but the customer insists they weren't warned. What do you do?",
                    answer: "If conditions were listed, we would educate the customer. If they weren't, we need to clearly state that it was not our intention to be misleading, and that we'll share feedback with our team. In both scenarios, we need to show empathy."
                },
                {
                    question: "A customer resubscribed, received a code, and texted in that it's not working. What do you do?",
                    answer: "We send MKT template."
                },
                {
                    question: "The customer applied a code and got a discount, but claims it should've been higher. What do you do?",
                    answer: "Check the code's terms, exclusions, and what was in their cart. If they misunderstood, clarify the details. If they are right, ESC or send to CS per notes."
                },
                {
                    question: "A customer texts in and says, \"Any codes?\". What do you do?",
                    answer: "Check the conversation history for possible active codes, check if there is a Concierge offer that we can share, check the website for any ongoing promotions, if none, send NCODE"
                },
                {
                    question: "The customer says they haven't received their store credit. Where can you direct them to check?",
                    answer: "Store credits are usually sent via email in the form of a coupon or can be accessed through the customer's account for that specific brand. Ask them to check their account and email, including spam and promo folders."
                },
                {
                    question: "The customer claims the code isn't working for them. They have already sent you a screenshot. You entered the code in the Coupon inspector, and you got the error message: \"Coupon not found\". How would you check whether or not the code is active?",
                    answer: "You need to create a mock cart with eligible items to check if the coupon is valid."
                },
                {
                    question: "If a customer mentions a promotion that isn't visible in the conversation or the brand website, where else can you look for it?",
                    answer: "You can check Milled to see if the promotion was sent via email as well as the brand's official social media pages."
                },
                {
                    question: "A customer texts in and says, \"It said free shipping with a code, but I was still charged.\" They also provide a screenshot. What steps would you take to provide a resolution?",
                    answer: "We need to check the screenshot to see if they applied the code correctly. We also need to check if there are any T&Cs attached to the offer and check if the customer's order qualifies."
                },
                {
                    question: "A customer texts in and says, \"I placed an order an hour ago with the 10% welcome discount, and you just sent me a 20% one. Can I get the new one instead?\". What steps would you take to provide a resolution?",
                    answer: "Check if the 20% off code can be applied to the items the customer ordered. If yes, we would follow the retroactive discount request workflow."
                },
                {
                    question: "A customer texts in and says, \"I found a code online, but it's not working. Can you honor it anyway?\" What steps would you take to provide a resolution?",
                    answer: "We need to check whether the code is from the brand's credible sources. If it's not, we need to educate the customer. If it is, we need to troubleshoot why it may not be working."
                },
                {
                    question: "A customer texts in and says, \"The discount worked, but didn't apply to the full order.\" What steps would you take to provide a resolution?",
                    answer: "Sometimes a code will work on the eligible items in the order, and not apply to the ineligible ones. We need to cross-check for any exclusions. If the code didn't apply to all items because of the exclusions, we would need to educate the customer. If the code isn't working as intended, we need to escalate if notes permit us to do so."
                }
            ],
            // Tile 22 - Resolution Road
            22: [
                {
                    question: "What are the first most important steps to do before responding to a new customer message?",
                    answer: "Read the customer's message and determine if it warrants a response. If it does, back-read and check the notes/templates."
                },
                {
                    question: "How would you research in case you don't know the answer to a customer's question?",
                    answer: "Backread, notes + templates, website, website-related sources, Google search"
                },
                {
                    question: "How long should you ideally take to respond to a customer, on average?",
                    answer: "2 minutes or less."
                },
                {
                    question: "What's the first step to take when a customer issue is unclear?",
                    answer: "If the issue seems relevant to us, ask clarifying questions to gather all necessary details before providing a resolution, and use the \"if-so\" method if applicable."
                },
                {
                    question: "What phrase can we use if AI unexpectedly reveals itself to a customer during a conversation?",
                    answer: "\"I apologize for the confusion caused. The previous messages you received were automated, however I'm here now to provide you with personalized assistance and make sure your concerns are addressed properly.\""
                },
                {
                    question: "A customer is venting emotionally about their bad day and barely mentions the actual issue they are contacting us about. What's your response?",
                    answer: "Thanks for reaching out - I'm really sorry to hear you've been having such a rough day. I'm here to help, can you please tell me more about the issue you're having?"
                },
                {
                    question: "How do you know when it's time to send a conversation closer?",
                    answer: "The issue is resolved, and the customer confirmed it."
                },
                {
                    question: "What's the risk of closing a chat that shouldn't be closed yet?",
                    answer: "We're abandoning the customer, and they may feel ignored or unsupported."
                },
                {
                    question: "What should you do if the customer solution involves steps outside their comfort zone (e.g., tech setup for an elderly individual)?",
                    answer: "Offer to guide them step by step by providing links to help articles on the website, screenshot links, or, if applicable, a mock cart link."
                },
                {
                    question: "If you suspect a customer's issue is user error, what's a tactful way to handle it?",
                    answer: "Gently explain how the feature works and guide them in using it properly without assigning blame."
                },
                {
                    question: "Another agent gave the wrong info. Do you correct it openly or discreetly? Elaborate.",
                    answer: "Be discreet - do not let the customer know they are interacting with multiple agents. Apologize for the confusion, own the mistake, and act as one person."
                },
                {
                    question: "The customer texts in saying they've waited \"months\" for a resolution. What steps are you going to take?",
                    answer: "Apologize and empathize. Troubleshoot to identify the issue and determine if you can provide a resolution. Check how and where the customer reached out to us, and confirm whether they received any response."
                },
                {
                    question: "The customer uses technical words in their inquiry that you're not familiar with. What will you do?",
                    answer: "Research the terms either on the website or on Google to familiarize yourself with them."
                },
                {
                    question: "A customer texts in that they are struggling to redeem their points and asks for our help. What steps are you going to take?",
                    answer: "Ask if they are logged into their account, send the appropriate template if available, or check the website for instructions."
                },
                {
                    question: "A customer threatens to go public on social media if their issue isn't resolved today (It's a Saturday) - but the escalation response will likely only come during the week. What will you do?",
                    answer: "Apologize and empathize. Let them know about the weekend escalations policy."
                },
                {
                    question: "The customer texts you and provides a complaint about something we or the brand can't do anything about. What do you do?",
                    answer: "Apologize and let them know we will pass on the feedback to the team for future improvement."
                },
                {
                    question: "The customer texted us to ask why we don't offer a certain payment option (e.g., Affirm). What will you do?",
                    answer: "Apologize and provide them with the available payment options, and check if they have access to any of the ones we do accept. We would also thank them for the feedback and let them know we will pass it to the team."
                },
                {
                    question: "The customer texts us saying they can't see the \"add to cart\" option on the product page. What is likely going on? Give 2 options.",
                    answer: "1) Technical issue\n2) The product is out of stock"
                },
                {
                    question: "How can we check if the item the customer ordered is a preorder, and when it is supposed to ship?",
                    answer: "We need to check the order details section if available, to see if the product is noted as a pre-order, and whether there is an estimated ship date listed there.\nIf not, get their info and ESC to get an update or send to CS depending on brand notes."
                },
                {
                    question: "A customer tells us they are struggling to place an order on the website. They are 70 years old and not very good with technology. What are three solutions you can provide?",
                    answer: "1) If the brand allows phone orders, send them the number to call.\n2) If it's a Shopify brand, offer to create a cart link for them\n3) If it's a non-Shopify brand, guide them through the online ordering process step by step and provide screenshot links where appropriate."
                }
            ]
        };
    }

    getSurpriseCardText(cardIndex = null) {
        const surpriseCards = [
            "\"Oops! Customer Escalation\"\nLose 2 Support Bucks while you de-escalate the situation.",
            "\"Thanks-a-Latte!\"\nA grateful customer sends you a thank-you note and a digital coffee. ☕ Move ahead 2 spaces.",
            "\"Five-Star Review!\"\nYou've earned a Get out of Jail Card.",
            "\"Oopsie-Daisy Chain\"\nYou sent a double text and didn't acknowledge this in the second message. Go back 1 space.",
            "\"You Nailed a Tough Call\"\nEarn 5 bonus points for empathy and resolution!",
            "\"Chat Champ\"\nYou solved your first chat like a legend. 💪 Collect 1 Support Buck.",
            "\"Caught Using Jargon 😬\"\nMove back 1 space and lose 1 Support Buck.",
            "\"Feature Sneak Attack\"\nNew CALPAK feature launched without telling you. Miss your next turn.",
            "\"You Handled a Bug Report Perfectly!\"\nSteal 3 points from the other team.",
            "\"Outage Outrage\"\nYou lost power during a shift. Lose 3 points.",
            "\"Macro Mayhem\"\nSwap positions with the other team.",
            "\"Bug Whisperer\"\nYou found a bug before it bit. 🐛 Move ahead 3 spaces.",
            "\"Process Update!\"\nSkip your next turn while you attend a (pretend) training session.",
            "\"Audit Ace\"\nRandom Event audit? You're flawless. ✨ Gain 2 Support Bucks.",
            "\"Snack Break!\"\nYou left the UI without going unavailable, lose 4 Support Bucks.",
            "\"Ctrl-Alt-Duh\"\nYour keyboard staged a protest. Skip your next turn.",
            "\"Tech Glitch!\"\nYou're frozen — skip your next turn and mime your reaction.",
            "\"VIP Vibes\"\nA VIP preferred your response to another agent's. Take 2 Support Bucks from the other team.",
            "\"Manager's Shout-Out!\"\nEveryone cheers for your team — collect 2 Support Bucks!",
            "\"Escalation? Never Heard of Her\"\nYou solved a tough one solo. Advance 3 spaces.",
            "\"Zoom Freeze\"\nThe other team skips their next turn while their camera \"reconnects.\"",
            "\"Release Roulette\"\nYou missed the brand updates again. Lose 1 turn to catch up.",
            "\"Shift Happens\"\nYou saved the day by picking up a released shift. You get 5 points.",
            "\"Typo Hunter\"\nYou caught a rogue typo in the docs. 🕵️‍♀️ Collect 1 Support Buck.",
            "\"Double-Down\"\nWhen landing on a question, pay double the price and get a chance for double the points.",
            "\"Auto-Wrong Response\"\nYour auto-reply caused a grammar markdown. Go to Jail.",
            "\"Trivia Trap\"\nThe other team answers a bonus question — if they pass, you gain 4 points and if they fail, you lose 4 points.",
            "\"Secret Shopper Slay\"\nYou passed the secret support test. Collect 2 Support Bucks.",
            "\"Lunch & Learn Luminary\"\nYou corrected the previous agent's error, and the cx's issue has been resolved. Move ahead 1 space + gain 1 Support Buck.",
            "\"Wrong Way Wanda\"\nYou closed the wrong chat. Back it up — go back 2 spaces.",
            "\"Crisis Handler Extraordinaire\"\nComplaint went viral, but you stayed cool. Gain 2 Support Bucks.",
            "\"Inbox Zero Hero\"\nCleared your queue by lunch. Collect 2 Support Bucks.",
            "\"Hyperlink Horror\"\nYou shared the wrong link. Go to Jail.",
            "\"Shoutout Stunner\"\nYou have the best performing KPIs for the week! 🌟 You earn a Get Out of Jail Card.",
            "\"Calm in the Chaos\"\nYour responses soothed worried users during a widespread Fashion Nova shipping delay. Gain 1 Support Buck + gain the points of your next category even if you get the answer wrong.",
            "\"UI Glow-Up\"\nThe UI got an upgrade! ✨ Move ahead 2 spaces.",
            "\"Exec-ellent Summary\"\nThe brand loved how helpful your escalation notes were. Advance 3 spaces.",
            "\"Agony Aunt\"\nCustomer sends a valid inquiry but also includes a lot of personal distress. Skip next turn to solve.",
            "\"Sleep Mode Activated\"\nEnd-of-day exhaustion has hit. Stay put/ skip your next turn.",
            "\"Flawless cart\"\nYou created a cart like a personal shopper. Gain 1 Support Buck."
        ];
        
        // If specific card index provided (from server), use that
        if (cardIndex !== null && cardIndex >= 0 && cardIndex < surpriseCards.length) {
            console.log(`Using server-specified surprise card ${cardIndex + 1}/${surpriseCards.length}: ${surpriseCards[cardIndex].split('\n')[0]}`);
            return surpriseCards[cardIndex];
        }
        
        // Otherwise, randomly select one surprise card
        const randomIndex = Math.floor(Math.random() * surpriseCards.length);
        const selectedCard = surpriseCards[randomIndex];
        
        console.log(`Selected surprise card ${randomIndex + 1}/${surpriseCards.length}: ${selectedCard.split('\n')[0]}`);
        
        return selectedCard;
    }

    // Get a random unused question for a tile
    getRandomUnusedQuestion(tileId) {
        const cardData = this.getCardData()[tileId];
        if (!cardData || cardData.length === 0) {
            return null;
        }

        // Initialize used questions tracking for this tile if not exists
        if (!this.usedQuestions[tileId]) {
            this.usedQuestions[tileId] = [];
        }

        // Find unused questions
        const unusedQuestions = cardData.filter((_, index) => 
            !this.usedQuestions[tileId].includes(index)
        );

        // If no unused questions, reset the pool (all questions become available again)
        if (unusedQuestions.length === 0) {
            console.log(`All questions used for tile ${tileId}, resetting pool`);
            this.usedQuestions[tileId] = [];
            // Return a random question from the full pool
            const randomIndex = Math.floor(Math.random() * cardData.length);
            this.usedQuestions[tileId].push(randomIndex);
            return cardData[randomIndex];
        }

        // Pick a random unused question
        const randomUnusedIndex = Math.floor(Math.random() * unusedQuestions.length);
        const selectedQuestion = unusedQuestions[randomUnusedIndex];
        
        // Find the original index in the full array
        const originalIndex = cardData.indexOf(selectedQuestion);
        
        // Mark this question as used
        this.usedQuestions[tileId].push(originalIndex);
        
        console.log(`Tile ${tileId}: Selected question ${originalIndex + 1}/${cardData.length}, Used: [${this.usedQuestions[tileId].map(i => i + 1).join(', ')}]`);
        
        return selectedQuestion;
    }

    // Get a random unused question for admin testing (separate from normal game)
    getRandomUnusedAdminQuestion(tileId) {
        const cardData = this.getCardData()[tileId];
        if (!cardData || cardData.length === 0) {
            return null;
        }

        // Initialize admin used questions tracking for this tile if not exists
        if (!this.adminUsedQuestions[tileId]) {
            this.adminUsedQuestions[tileId] = [];
        }

        // Find unused question indices
        const unusedIndices = [];
        for (let i = 0; i < cardData.length; i++) {
            if (!this.adminUsedQuestions[tileId].includes(i)) {
                unusedIndices.push(i);
            }
        }

        // If no unused questions, reset the admin pool (all questions become available again)
        if (unusedIndices.length === 0) {
            console.log(`All admin test questions used for tile ${tileId}, resetting admin pool`);
            this.adminUsedQuestions[tileId] = [];
            // Return a random question from the full pool
            const randomIndex = Math.floor(Math.random() * cardData.length);
            this.adminUsedQuestions[tileId].push(randomIndex);
            return { question: cardData[randomIndex], index: randomIndex };
        }

        // Pick a random unused question index
        const randomIndexIndex = Math.floor(Math.random() * unusedIndices.length);
        const selectedIndex = unusedIndices[randomIndexIndex];
        
        // Mark this question as used in admin testing
        this.adminUsedQuestions[tileId].push(selectedIndex);
        
        console.log(`Admin Tile ${tileId}: Selected question ${selectedIndex + 1}/${cardData.length}, Admin Used: [${this.adminUsedQuestions[tileId].map(i => i + 1).join(', ')}]`);
        
        return { question: cardData[selectedIndex], index: selectedIndex };
    }

    detectAndShowCard(eventMsg, currentPlayer = null) {
        if (eventMsg.includes('SHOW_QUESTION_CARD:')) {
            // Extract tile ID and question index from server message
            // Format: SHOW_QUESTION_CARD:tileId:questionIndex
            const parts = eventMsg.split('SHOW_QUESTION_CARD:')[1].split(':');
            const tileId = parts[0];
            const questionIndex = parts[1] ? parseInt(parts[1]) : 0; // Default to 0 if not provided
            this.showCard('QUESTION', tileId, 'Question Card', questionIndex);
            return true;
        } else if (eventMsg.includes('SHOW_SURPRISE_CARD:')) {
            // Extract surprise card index from server message
            // Format: SHOW_SURPRISE_CARD:surpriseIndex OR SHOW_SURPRISE_CARD:actionText (backwards compatible)
            const messagePart = eventMsg.split('SHOW_SURPRISE_CARD:')[1];
            
            // Check if the message contains a numeric index (new format)
            const surpriseIndex = parseInt(messagePart);
            if (!isNaN(surpriseIndex)) {
                // New format with specific index
                this.showCard('SURPRISE', null, 'Surprise Card', null, surpriseIndex);
                console.log(`🃏 Showing surprise card with server-specified index: ${surpriseIndex}`);
                
                // Check if this is an inventory-worthy surprise card
                this.handleInventoryWorthySurpriseCard(surpriseIndex, currentPlayer);
            } else {
                // Old format - backwards compatibility (shouldn't happen but just in case)
                this.showCard('SURPRISE', null, messagePart);
                console.log(`🃏 Showing surprise card with old format: ${messagePart}`);
            }
            return true;
        }
        return false;
    }

    handleInventoryWorthySurpriseCard(surpriseIndex, currentPlayer = null) {
        // Define inventory-worthy surprise cards (indices 0-39)
        // Five-Star Review (index 2) and Shoutout Stunner (index 32) give Get Out of Jail cards
        // Double-Down (index 25) gives Double Down item
        const inventoryCards = {
            2: { // Five-Star Review
                itemId: 'jail_free',
                itemName: 'Get out of Jail Free Card',
                icon: '🗝️',
                message: 'Five-Star Review! You\'ve earned a Get out of Jail Card.'
            },
            32: { // Shoutout Stunner
                itemId: 'jail_free',
                itemName: 'Get out of Jail Free Card',
                icon: '🗝️',
                message: 'Shoutout Stunner! You have the best performing KPIs for the week! 🌟 You earn a Get Out of Jail Card.'
            },
            25: { // Double-Down
                itemId: 'double_down',
                itemName: 'Double Down',
                icon: '⚡',
                message: 'Double-Down! When landing on a question, pay double the price and get a chance for double the points.'
            }
        };

        // Check if this is an inventory-worthy card
        if (inventoryCards[surpriseIndex]) {
            const cardInfo = inventoryCards[surpriseIndex];
            
            // Use the provided current player or fall back to game state detection
            let playerToReceive = currentPlayer;
            if (playerToReceive === null) {
                playerToReceive = this.getCurrentPlayerFromGameState();
            }
            
            if (playerToReceive !== null && playerToReceive !== undefined && this.teamInventories[playerToReceive]) {
                console.log(`🎁 Adding ${cardInfo.itemName} to ${this.teamNames[playerToReceive]}'s inventory from surprise card ${surpriseIndex}`);
                
                // Add item to team inventory
                if (!this.teamInventories[playerToReceive][cardInfo.itemId]) {
                    this.teamInventories[playerToReceive][cardInfo.itemId] = 0;
                }
                this.teamInventories[playerToReceive][cardInfo.itemId]++;
                
                // Update inventory display
                this.updateInventoryDisplay();
                
                // Show toast notification
                this.showToastNotification(`${this.teamNames[playerToReceive]} now have a ${cardInfo.itemName}! 🎁`);
                
                // Broadcast inventory update to all players
                this.socket.send(JSON.stringify({
                    action: "surprise_card_inventory_added",
                    team_index: playerToReceive,
                    item_id: cardInfo.itemId,
                    item_name: cardInfo.itemName,
                    icon: cardInfo.icon,
                    surprise_index: surpriseIndex,
                    hostname: this.hostName
                }));
            } else {
                console.warn('Could not determine current player for inventory card or invalid team index:', playerToReceive);
            }
        }
    }

    getCurrentPlayerFromGameState() {
        // Try to get current player from various sources
        // First, check if we have a pending next player (means current player just finished their turn)
        if (this.pendingNextPlayer !== undefined) {
            // The current player is the one who just finished their turn
            // If pendingNextPlayer is 0, then current player was 1, etc.
            const currentPlayer = this.pendingNextPlayer === 0 ? 1 : 0;
            console.log(`🎯 Determined current player from pendingNextPlayer: ${currentPlayer}`);
            return currentPlayer;
        }
        
        // Fallback: try to get from the game controller or other sources
        // This is a fallback method - the main logic should use pendingNextPlayer
        console.warn('Could not determine current player from game state');
        return null;
    }

    playCardFlipSound() {
        console.log('🔊 Attempting to play card flip sound for user:', this.userName);
        
        // Try card flip sound first
        if (this.cardFlipSound) {
            try {
                this.cardFlipSound.currentTime = 0;
                const playPromise = this.cardFlipSound.play();
                
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('✅ Card flip sound played successfully');
                    }).catch(error => {
                        console.log('❌ Card flip sound autoplay blocked, using fallback');
                        this.playSound("hover"); // Use hover sound as fallback
                    });
                } else {
                    console.log('✅ Card flip sound played (no promise)');
                }
                return;
            } catch (error) {
                console.log('❌ Card flip sound failed:', error);
            }
        }
        
        // Fallback to hover sound
        console.log('🔊 Using hover sound as card flip fallback');
        this.playSound("hover");
    }

    // Sudden Death Round questions separated by category
    getSuddenDeathUnsubscribeQuestions() {
        return [
            {
                question: "\"Do I still get rewards if I unsubscribe?\"\n\n*Unsubscribe?*",
                answer: "No (ask in team channel first if replying)"
            },
            {
                question: "\"How do I unsubscribe from your emails?\"\n\n*Unsubscribe?*",
                answer: "No (ask in team channel first if replying)"
            },
            {
                question: "\"I'm 13 now. I used to shop here with my mom.\"\n\n*Unsubscribe?*",
                answer: "No"
            },
            {
                question: "\"unsubscribe from emails and texts\"\n\n*Unsubscribe?*",
                answer: "Yes"
            },
            {
                question: "\"Could you help me unsubscribe from these texts?\"\n\n*Unsubscribe?*",
                answer: "Yes"
            },
            {
                question: "\"Can I get fewer notifications, please?\"\n\n*Unsubscribe?*",
                answer: "No"
            },
            {
                question: "\"What happens if I unsubscribe?\"\n\n*Unsubscribe?*",
                answer: "No (ask in team channel first if replying)"
            },
            {
                question: "\"Why do you guys text so much? Chill 😅\"\n\n*Unsubscribe?*",
                answer: "No"
            },
            {
                question: "\"I'm only 11 but your clothes are awesome!\"\n\n*Unsubscribe?*",
                answer: "Yes"
            },
            {
                question: "\"F U.\"\n\n*Unsubscribe?*",
                answer: "Yes"
            },
            {
                question: "\"Wow you guys text a lot 😬 not sure how I feel about that\"\n\n*Unsubscribe?*",
                answer: "No"
            },
            {
                question: "\"My little brother loves your gear and he's only 9!\"\n\n*Unsubscribe?*",
                answer: "No (no action unless customer self-reports underage)"
            },
            {
                question: "\"Please cease\"\n\n*Unsubscribe?*",
                answer: "Yes"
            },
            {
                question: "\"I'll block you if this continues...\"\n\n*Unsubscribe?*",
                answer: "Yes"
            },
            {
                question: "\"Why do you keep sending me this?!\"\n\n*Unsubscribe?*",
                answer: "No (frustration, but not a direct unsubscribe)"
            },
            {
                question: "\"Srop texting pls\"\n\n*Unsubscribe?*",
                answer: "Yes"
            },
            {
                question: "\"stp\"\n\n*Unsubscribe?*",
                answer: "Yes"
            },
            {
                question: "\"Remove me if you can't answer this question quickly.\"\n\n*Unsubscribe?*",
                answer: "Yes"
            },
            {
                question: "\"This is annoying, but whatever.\"\n\n*Unsubscribe?*",
                answer: "No"
            },
            {
                question: "\"Shut up bro\"\n\n*Unsubscribe?*",
                answer: "Yes"
            }
        ];
    }

    getSuddenDeathBlockQuestions() {
        return [
            {
                question: "\"Wow… customer service is a joke here.\"\n\nBlock?",
                answer: "No"
            },
            {
                question: "\"Lmfao who runs this garbage company 🤡\"\n\nBlock?",
                answer: "No"
            },
            {
                question: "\"You are so stupid just give me my order.\"\n\nBlock?",
                answer: "Yes"
            },
            {
                question: "\"(unsolicited, nsfw image)\"\n\nBlock?",
                answer: "Yes"
            },
            {
                question: "\"LOL u must be new here.\"\n\nBlock?",
                answer: "Yes"
            },
            {
                question: "\"('free ps5 giveaway 😎 link in bio' 3x over a week)\"\n\nBlock?",
                answer: "Yes"
            },
            {
                question: "\"Do you even speak English?\"\n\nBlock?",
                answer: "Yes"
            },
            {
                question: "\"Kinda feel like you people don't care about your customers...\"\n\nBlock?",
                answer: "No"
            },
            {
                question: "\"Hurry up dumbass\"\n\nBlock?",
                answer: "Yes"
            },
            {
                question: "\"This whole brand is stupid. Who buys this crap?\"\n\nBlock?",
                answer: "No"
            },
            {
                question: "\"This whole brand is garbage and I hope you go bankrupt.\"\n\nBlock?",
                answer: "No"
            },
            {
                question: "\"(Sends 'I love this place!' and then 10 unrelated memes over 2 weeks)\"\n\nBlock?",
                answer: "Yes"
            },
            {
                question: "\"Thanks for the help, but damn you're slow.\"\n\nBlock?",
                answer: "No"
            },
            {
                question: "\"If you ever respond like that again, I'll find you.\"\n\nBlock?",
                answer: "Yes"
            },
            {
                question: "\"Hey queen, you single?\"\n\nBlock?",
                answer: "Yes"
            },
            {
                question: "\"(Customer sends a sarcastic 'such a helpful team')\"\n\nBlock?",
                answer: "No"
            },
            {
                question: "\"Ugly trash, made by clowns for clowns.\"\n\nBlock?",
                answer: "No"
            },
            {
                question: "\"I'm not mad at you but this is trash service.\"\n\nBlock?",
                answer: "No"
            },
            {
                question: "\"I can see why no one likes you.\"\n\nBlock?",
                answer: "Yes"
            },
            {
                question: "\"(Customer sends 2 texts over 2 weeks: 'spaghetti recipe,')\"\n\nBlock?",
                answer: "No"
            }
        ];
    }

    getSuddenDeathCloseQuestions() {
        return [
            {
                question: "\"ok thx! (note: 'Let the customer have the last word')\"\n\nClose?",
                answer: "Yes"
            },
            {
                question: "\"This is the second time I'm asking... Do you give away free stuff?\"\n\nClose?",
                answer: "No"
            },
            {
                question: "\"SAVE20 (after we troubleshooted the code and had a conversation)\"\n\nClose?",
                answer: "Yes"
            },
            {
                question: "\"1, but also 2 (journey response)\"\n\nClose?",
                answer: "Yes"
            },
            {
                question: "\"1, water, land, whatever\"\n\nClose?",
                answer: "Yes"
            },
            {
                question: "\"My friend wants to know more about your company\"\n\nClose?",
                answer: "No"
            },
            {
                question: "\"I copied this from my last text: YES\"\n\nClose?",
                answer: "Yes"
            },
            {
                question: "\"#521677\"\n\nClose?",
                answer: "No"
            },
            {
                question: "\"(broken image)\"\n\nClose?",
                answer: "No"
            },
            {
                question: "\"Heyyyy\"\n\nClose?",
                answer: "No"
            },
            {
                question: "\"SAVE20 works!\"\n\nClose?",
                answer: "No"
            },
            {
                question: "\"My order arrived but I'm confused\"\n\nClose?",
                answer: "No"
            },
            {
                question: "\"ignore this one!\"\n\nClose?",
                answer: "Yes"
            },
            {
                question: "\"Hmm, not sure... (after we gave full response with solution and they don't follow up again)\"\n\nClose?",
                answer: "Yes"
            },
            {
                question: "\"(Customer sends 😬 after we provide a resolution)\"\n\nClose?",
                answer: "Yes"
            },
            {
                question: "\"Can you tell me more about your socks? (but we already answered fully in two messages)\"\n\nClose?",
                answer: "Yes"
            },
            {
                question: "\"SAVE20 (no context)\"\n\nClose?",
                answer: "Yes"
            },
            {
                question: "\"Email: jamie@example.com (sent alone)\"\n\nClose?",
                answer: "No"
            },
            {
                question: "\"1 305 645 2567 (same as customer's phone number)\"\n\nClose?",
                answer: "Yes"
            },
            {
                question: "\"code\"\n\nClose?",
                answer: "Yes"
            }
        ];
    }

    // Helper method to get question data by category
    getSuddenDeathQuestionsByCategory(category) {
        switch (category) {
            case 'unsubscribe':
                return this.getSuddenDeathUnsubscribeQuestions();
            case 'block':
                return this.getSuddenDeathBlockQuestions();
            case 'close':
                return this.getSuddenDeathCloseQuestions();
            default:
                return [];
        }
    }

    // Get random unused question from specific category
    getRandomUnusedSuddenDeathQuestion(category) {
        const questions = this.getSuddenDeathQuestionsByCategory(category);
        if (!questions || questions.length === 0) {
            return null;
        }

        // Get used questions for this category
        const usedQuestions = this.suddenDeathUsedQuestions[category] || [];

        // Find unused questions
        const unusedQuestions = questions.filter((_, index) => !usedQuestions.includes(index));

        // If no unused questions, reset the pool
        if (unusedQuestions.length === 0) {
            console.log(`All ${category} sudden death questions used, resetting pool`);
            this.suddenDeathUsedQuestions[category] = [];
            // Return a random question from the full pool
            const randomIndex = Math.floor(Math.random() * questions.length);
            this.suddenDeathUsedQuestions[category].push(randomIndex);
            return { question: questions[randomIndex], index: randomIndex };
        }

        // Pick a random unused question
        const randomUnusedIndex = Math.floor(Math.random() * unusedQuestions.length);
        const selectedQuestion = unusedQuestions[randomUnusedIndex];
        
        // Find the original index in the full array
        const originalIndex = questions.indexOf(selectedQuestion);
        
        // Mark this question as used
        this.suddenDeathUsedQuestions[category].push(originalIndex);
        
        console.log(`${category.toUpperCase()}: Selected question ${originalIndex + 1}/${questions.length}, Used: [${this.suddenDeathUsedQuestions[category].map(i => i + 1).join(', ')}]`);
        
        return { question: selectedQuestion, index: originalIndex };
    }

    initAdminPanel() {
        this.$adminPanelToggle = document.getElementById("admin-panel-toggle");
        this.$adminPanel = document.getElementById("admin-panel");
        this.$adminPanelClose = document.getElementById("admin-panel-close");
        this.$adminPlayerSelect = document.getElementById("admin-player-select");
        this.$adminTileSelect = document.getElementById("admin-tile-select");
        this.$adminMoveButton = document.getElementById("admin-move-player");

        // Money management controls
        this.$adminMoneyPlayer = document.getElementById("admin-money-player");
        this.$adminMoneyAmount = document.getElementById("admin-money-amount");
        this.$adminAddMoneyButton = document.getElementById("admin-add-money");
        this.$adminRemoveMoneyButton = document.getElementById("admin-remove-money");

        // Points management controls
        this.$adminPointsPlayer = document.getElementById("admin-points-player");
        this.$adminPointsAmount = document.getElementById("admin-points-amount");
        this.$adminAddPointsButton = document.getElementById("admin-add-points");
        this.$adminRemovePointsButton = document.getElementById("admin-remove-points");

        // Turn control
        this.$adminTurnPlayer = document.getElementById("admin-turn-player");
        this.$adminSetTurnButton = document.getElementById("admin-set-turn");

        // Tile ownership controls
        this.$adminOwnershipTile = document.getElementById("admin-ownership-tile");
        this.$adminOwnershipPlayer = document.getElementById("admin-ownership-player");
        this.$adminSetOwnershipButton = document.getElementById("admin-set-ownership");

        // Tile action controls
        this.$adminActionPlayer = document.getElementById("admin-action-player");
        this.$adminTileActionButton = document.getElementById("admin-tile-action");

        // Card tester controls (temporary)
        this.$adminTestTile = document.getElementById("admin-test-tile");
        this.$adminTestCardButton = document.getElementById("admin-test-card");
        // New: special surprise selector & test player selector
        this.$adminSpecialSurprise = document.getElementById("admin-special-surprise");
        this.$adminTestPlayer = document.getElementById("admin-test-player");

        // Admin panel toggle
        this.$adminPanelToggle.addEventListener("click", () => {
            this.toggleAdminPanel();
        });

        // Admin panel close
        this.$adminPanelClose.addEventListener("click", () => {
            this.hideAdminPanel();
        });

        // Admin move player button
        this.$adminMoveButton.addEventListener("click", () => {
            this.adminMovePlayer();
        });

        // Money management buttons
        this.$adminAddMoneyButton.addEventListener("click", () => {
            this.adminModifyMoney(true);
        });

        this.$adminRemoveMoneyButton.addEventListener("click", () => {
            this.adminModifyMoney(false);
        });

        // Rent button
        this.$adminRentMoneyButton = document.getElementById("admin-rent-money");
        this.$adminRentMoneyButton.addEventListener("click", () => {
            this.adminRentMoney();
        });

        // Points management buttons
        this.$adminAddPointsButton.addEventListener("click", () => {
            this.adminModifyPoints(true);
        });

        this.$adminRemovePointsButton.addEventListener("click", () => {
            this.adminModifyPoints(false);
        });

        // Turn control button
        this.$adminSetTurnButton.addEventListener("click", () => {
            this.adminSetTurn();
        });

        // Tile ownership button
        this.$adminSetOwnershipButton.addEventListener("click", () => {
            this.adminSetTileOwnership();
        });

        // Tile action button
        this.$adminTileActionButton.addEventListener("click", () => {
            this.adminTileAction();
        });

        // Card tester button (temporary)
        this.$adminTestCardButton.addEventListener("click", () => {
            this.adminTestCard();
        });

        // Enable/disable buttons based on selections
        const updateMoveButton = () => {
            const playerSelected = this.$adminPlayerSelect.value !== "";
            const tileSelected = this.$adminTileSelect.value !== "";
            this.$adminMoveButton.disabled = !playerSelected || !tileSelected;
        };

        const updateMoneyButtons = () => {
            const playerSelected = this.$adminMoneyPlayer.value !== "";
            const amountEntered = this.$adminMoneyAmount.value !== "";
            this.$adminAddMoneyButton.disabled = !playerSelected || !amountEntered;
            this.$adminRemoveMoneyButton.disabled = !playerSelected || !amountEntered;
            this.$adminRentMoneyButton.disabled = !playerSelected || !amountEntered;
        };

        const updatePointsButtons = () => {
            const playerSelected = this.$adminPointsPlayer.value !== "";
            const amountEntered = this.$adminPointsAmount.value !== "";
            this.$adminAddPointsButton.disabled = !playerSelected || !amountEntered;
            this.$adminRemovePointsButton.disabled = !playerSelected || !amountEntered;
        };

        const updateTestCardButton = () => {
            const tileSelected = this.$adminTestTile.value !== "";
            const specialValid = this.$adminSpecialSurprise ? true : true; // no need to validate
            this.$adminTestCardButton.disabled = !tileSelected;
        };

        const updateTurnButton = () => {
            const playerSelected = this.$adminTurnPlayer.value !== "";
            this.$adminSetTurnButton.disabled = !playerSelected;
        };

        const updateOwnershipButton = () => {
            const tileSelected = this.$adminOwnershipTile.value !== "";
            const ownerSelected = this.$adminOwnershipPlayer.value !== "";
            this.$adminSetOwnershipButton.disabled = !tileSelected || !ownerSelected;
        };

        const updateTileActionButton = () => {
            const playerSelected = this.$adminActionPlayer.value !== "";
            this.$adminTileActionButton.disabled = !playerSelected;
        };

        this.$adminPlayerSelect.addEventListener("change", updateMoveButton);
        this.$adminTileSelect.addEventListener("change", updateMoveButton);
        
        this.$adminMoneyPlayer.addEventListener("change", updateMoneyButtons);
        this.$adminMoneyAmount.addEventListener("input", updateMoneyButtons);
        
        this.$adminPointsPlayer.addEventListener("change", updatePointsButtons);
        this.$adminPointsAmount.addEventListener("input", updatePointsButtons);
        
        this.$adminTurnPlayer.addEventListener("change", updateTurnButton);
        
        this.$adminOwnershipTile.addEventListener("change", updateOwnershipButton);
        this.$adminOwnershipPlayer.addEventListener("change", updateOwnershipButton);
        
        this.$adminActionPlayer.addEventListener("change", updateTileActionButton);
        
        this.$adminTestTile.addEventListener("change", updateTestCardButton);
        if (this.$adminSpecialSurprise) {
            this.$adminSpecialSurprise.addEventListener("change", updateTestCardButton);
        }

        // New: Special Surprise Card Controls
        this.$adminGiveSpecialSurprise = document.getElementById("admin-give-special-surprise");
        if (this.$adminGiveSpecialSurprise) {
            this.$adminGiveSpecialSurprise.addEventListener("click", () => {
                const specialIndex = this.$adminSpecialSurprise && this.$adminSpecialSurprise.value !== "" ? parseInt(this.$adminSpecialSurprise.value) : null;
                const teamIndex = this.$adminTestPlayer && this.$adminTestPlayer.value !== "" ? parseInt(this.$adminTestPlayer.value) : 0;
                if (specialIndex !== null && (specialIndex === 2 || specialIndex === 25 || specialIndex === 32)) {
                    // Directly trigger inventory-worthy surprise card logic
                    this.handleInventoryWorthySurpriseCard(specialIndex, teamIndex);
                } else {
                    alert("Please select a special surprise card.");
                }
            });
        }
    }

    toggleAdminPanel() {
        if (this.$adminPanel.classList.contains("hidden")) {
            this.showAdminPanel();
        } else {
            this.hideAdminPanel();
        }
    }

    showAdminPanel() {
        this.$adminPanel.classList.remove("hidden");
        this.updatePlayerDropdown();
    }

    hideAdminPanel() {
        this.$adminPanel.classList.add("hidden");
    }

    updatePlayerDropdown() {
        // Clear existing options for all player dropdowns
        const dropdowns = [this.$adminPlayerSelect, this.$adminMoneyPlayer, this.$adminPointsPlayer, this.$adminTurnPlayer, this.$adminActionPlayer];
        
        dropdowns.forEach(dropdown => {
            if (dropdown) {
                dropdown.innerHTML = '<option value="">Select Team...</option>';
                
                // Add teams to dropdown
                if (this.teamNames) {
                    this.teamNames.forEach((teamName, index) => {
                        const option = document.createElement("option");
                        option.value = index;
                        option.textContent = teamName;
                        dropdown.appendChild(option);
                    });
                }
            }
        });
    }

    adminMovePlayer() {
        const playerIndex = parseInt(this.$adminPlayerSelect.value);
        const tileIndex = parseInt(this.$adminTileSelect.value);

        if (isNaN(playerIndex) || isNaN(tileIndex)) {
            return;
        }

        // Send admin move command to server
        this.socket.send(JSON.stringify({
            action: "admin_move",
            player_index: playerIndex,
            tile_index: tileIndex,
            hostname: this.hostName
        }));

        // Visual feedback
        this.$adminMoveButton.textContent = "Moving...";
        this.$adminMoveButton.disabled = true;

        // Reset button after a delay
        setTimeout(() => {
            this.$adminMoveButton.textContent = "🚀 Move Player";
            this.$adminMoveButton.disabled = false;
        }, 2000);

        // Hide admin panel after move
        this.hideAdminPanel();
    }

    adminModifyMoney(isAdd) {
        const playerIndex = parseInt(this.$adminMoneyPlayer.value);
        const amount = parseInt(this.$adminMoneyAmount.value);

        if (isNaN(playerIndex) || isNaN(amount) || amount === 0) {
            return;
        }

        // Prevent duplicate requests by checking if button is already disabled
        const button = isAdd ? this.$adminAddMoneyButton : this.$adminRemoveMoneyButton;
        if (button.disabled) {
            console.log("💰 Admin modify money request already in progress, ignoring duplicate click");
            return;
        }

        const finalAmount = isAdd ? amount : -amount;

        console.log(`💰 Admin modifying money: player ${playerIndex}, amount ${finalAmount}`);

        // Send admin modify money command to server
        this.socket.send(JSON.stringify({
            action: "admin_modify_money",
            player_index: playerIndex,
            amount: finalAmount,
            hostname: this.hostName
        }));

        // Visual feedback - disable both buttons to prevent double-clicks
        const originalAddText = this.$adminAddMoneyButton.textContent;
        const originalRemoveText = this.$adminRemoveMoneyButton.textContent;
        
        this.$adminAddMoneyButton.textContent = "Adding...";
        this.$adminRemoveMoneyButton.textContent = "Removing...";
        this.$adminAddMoneyButton.disabled = true;
        this.$adminRemoveMoneyButton.disabled = true;

        // Reset button after a delay
        setTimeout(() => {
            this.$adminAddMoneyButton.textContent = originalAddText;
            this.$adminRemoveMoneyButton.textContent = originalRemoveText;
            this.$adminAddMoneyButton.disabled = false;
            this.$adminRemoveMoneyButton.disabled = false;
            this.$adminMoneyAmount.value = "";
        }, 1500);
    }

    adminRentMoney() {
        const playerIndex = parseInt(this.$adminMoneyPlayer.value);
        const amount = parseInt(this.$adminMoneyAmount.value);

        if (isNaN(playerIndex) || isNaN(amount) || amount <= 0) {
            console.log("🏠 Invalid rent parameters");
            return;
        }

        // Prevent duplicate requests by checking if button is already disabled
        if (this.$adminRentMoneyButton.disabled) {
            console.log("🏠 Admin rent request already in progress, ignoring duplicate click");
            return;
        }

        const requestId = `rent_${Date.now()}`;
        console.log(`🏠 [${requestId}] Admin rent transfer: player ${playerIndex} paying ${amount} SB to other team`);
        console.log(`🏠 [${requestId}] Current team cash before transfer:`, this.teamCash);

        // Send admin rent command to server
        this.socket.send(JSON.stringify({
            action: "admin_rent_money",
            player_index: playerIndex,
            amount: amount,
            hostname: this.hostName
        }));
        
        console.log(`🏠 [${requestId}] Rent transfer request sent to server`);

        // Visual feedback - disable all money buttons to prevent double-clicks
        const originalAddText = this.$adminAddMoneyButton.textContent;
        const originalRemoveText = this.$adminRemoveMoneyButton.textContent;
        const originalRentText = this.$adminRentMoneyButton.textContent;
        
        this.$adminAddMoneyButton.textContent = "Processing...";
        this.$adminRemoveMoneyButton.textContent = "Processing...";
        this.$adminRentMoneyButton.textContent = "Processing...";
        this.$adminAddMoneyButton.disabled = true;
        this.$adminRemoveMoneyButton.disabled = true;
        this.$adminRentMoneyButton.disabled = true;

        // Reset button after a delay
        setTimeout(() => {
            this.$adminAddMoneyButton.textContent = originalAddText;
            this.$adminRemoveMoneyButton.textContent = originalRemoveText;
            this.$adminRentMoneyButton.textContent = originalRentText;
            this.$adminAddMoneyButton.disabled = false;
            this.$adminRemoveMoneyButton.disabled = false;
            this.$adminRentMoneyButton.disabled = false;
            this.$adminMoneyAmount.value = "";
        }, 1500);
    }

    adminModifyPoints(isAdd) {
        const playerIndex = parseInt(this.$adminPointsPlayer.value);
        const amount = parseInt(this.$adminPointsAmount.value);

        if (isNaN(playerIndex) || isNaN(amount) || amount === 0) {
            return;
        }

        // Prevent duplicate requests by checking if button is already disabled
        const button = isAdd ? this.$adminAddPointsButton : this.$adminRemovePointsButton;
        if (button.disabled) {
            console.log("⭐ Admin modify points request already in progress, ignoring duplicate click");
            return;
        }

        const finalAmount = isAdd ? amount : -amount;

        console.log(`⭐ Admin modifying points: player ${playerIndex}, amount ${finalAmount}`);

        // Send admin modify points command to server
        this.socket.send(JSON.stringify({
            action: "admin_modify_points",
            player_index: playerIndex,
            amount: finalAmount,
            hostname: this.hostName
        }));

        // Visual feedback - disable both buttons to prevent double-clicks
        const originalAddText = this.$adminAddPointsButton.textContent;
        const originalRemoveText = this.$adminRemovePointsButton.textContent;
        
        this.$adminAddPointsButton.textContent = "Adding...";
        this.$adminRemovePointsButton.textContent = "Removing...";
        this.$adminAddPointsButton.disabled = true;
        this.$adminRemovePointsButton.disabled = true;

        // Reset button after a delay
        setTimeout(() => {
            this.$adminAddPointsButton.textContent = originalAddText;
            this.$adminRemovePointsButton.textContent = originalRemoveText;
            this.$adminAddPointsButton.disabled = false;
            this.$adminRemovePointsButton.disabled = false;
            this.$adminPointsAmount.value = "";
        }, 1500);
    }

    adminSetTurn() {
        const playerIndex = parseInt(this.$adminTurnPlayer.value);

        if (isNaN(playerIndex)) {
            return;
        }

        // Send admin set turn command to server
        this.socket.send(JSON.stringify({
            action: "admin_set_turn",
            player_index: playerIndex,
            hostname: this.hostName
        }));

        // Visual feedback
        this.$adminSetTurnButton.textContent = "Setting...";
        this.$adminSetTurnButton.disabled = true;

        // Reset button after a delay
        setTimeout(() => {
            this.$adminSetTurnButton.textContent = "🎯 Set Player Turn";
            this.$adminSetTurnButton.disabled = false;
        }, 2000);

        // Hide admin panel after setting turn
        this.hideAdminPanel();
    }

    adminSetTileOwnership() {
        const tileIndex = parseInt(this.$adminOwnershipTile.value);
        const ownerValue = this.$adminOwnershipPlayer.value;

        if (isNaN(tileIndex) || ownerValue === "") {
            return;
        }

        // Parse owner value
        let ownerIndex = null;
        if (ownerValue === "remove") {
            ownerIndex = null; // Remove ownership
        } else {
            ownerIndex = parseInt(ownerValue);
            if (isNaN(ownerIndex)) {
                return;
            }
        }

        // Send admin set ownership command to server
        this.socket.send(JSON.stringify({
            action: "admin_set_ownership",
            tile_index: tileIndex,
            owner_index: ownerIndex,
            hostname: this.hostName
        }));

        // Visual feedback
        this.$adminSetOwnershipButton.textContent = "Setting...";
        this.$adminSetOwnershipButton.disabled = true;

        // Reset button after a delay
        setTimeout(() => {
            this.$adminSetOwnershipButton.textContent = "🏠 Set Tile Ownership";
            this.$adminSetOwnershipButton.disabled = false;
        }, 2000);

        // Hide admin panel after setting ownership
        this.hideAdminPanel();
    }

    adminTestCard() {
        const tileId = parseInt(this.$adminTestTile.value);
        if (isNaN(tileId)) {
            return;
        }

        const playerIndex = this.$adminTestPlayer && this.$adminTestPlayer.value !== "" ? parseInt(this.$adminTestPlayer.value) : 0;

        console.log(`🧪 Admin testing tile ${tileId} (type: ${typeof tileId}) for team ${playerIndex}`);

        // Define question tiles and surprise tiles
        const questionTiles = [1, 4, 7, 8, 11, 14, 17, 19, 21, 22];
        const surpriseTiles = [2]; // Only one surprise option now

        // Visual feedback
        this.$adminTestCardButton.textContent = "Loading...";
        this.$adminTestCardButton.disabled = true;

        setTimeout(() => {
            if (questionTiles.includes(tileId)) {
                // Existing question card logic (unchanged)
                const allCardData = this.getCardData();
                const cardData = allCardData[tileId];
                if (cardData && cardData.length > 0) {
                    const questionResult = this.getRandomUnusedAdminQuestion(tileId);
                    if (questionResult) {
                        const questionIndex = questionResult.index;
                        this.socket.send(JSON.stringify({
                            action: "admin_test_card",
                            card_type: "QUESTION",
                            tile_id: tileId,
                            question_index: questionIndex,
                            player_index: playerIndex,
                            hostname: this.hostName
                        }));
                    } else {
                        alert(`All questions have been used for tile ${tileId} in admin testing. Pool will reset on next selection.`);
                    }
                } else {
                    alert(`No questions available for tile ${tileId}.`);
                }
            } else if (surpriseTiles.includes(tileId)) {
                // Surprise card testing
                let surpriseIndex;
                if (this.$adminSpecialSurprise && this.$adminSpecialSurprise.value !== "") {
                    surpriseIndex = parseInt(this.$adminSpecialSurprise.value);
                } else {
                    surpriseIndex = this.getRandomUnusedAdminSurpriseIndex();
                }
                console.log(`Admin selected surprise card ${surpriseIndex} for test (team ${playerIndex})`);
                this.socket.send(JSON.stringify({
                    action: "admin_test_card",
                    card_type: "SURPRISE",
                    tile_id: tileId,
                    surprise_index: surpriseIndex,
                    player_index: playerIndex,
                    hostname: this.hostName
                }));
            } else {
                alert(`Tile ${tileId} doesn't have a card associated with it.`);
            }

            // Reset button
            this.$adminTestCardButton.textContent = "🃏 Show Test Card";
            this.$adminTestCardButton.disabled = false;
        }, 500);
    }

    adminTileAction() {
        const playerIndex = parseInt(this.$adminActionPlayer.value);
        
        if (isNaN(playerIndex)) {
            return;
        }

        // Get the current tile for this player
        const currentTile = this.gameController.boardController.players[playerIndex].getTileId();
        const teamName = this.teamNames[playerIndex] || `Team ${playerIndex + 1}`;
        
        console.log(`⚡ Admin triggering tile action for ${teamName} on tile ${currentTile}`);

        // Define tile types and their actions
        const questionTiles = [1, 4, 7, 8, 11, 14, 17, 19, 21, 22]; // Removed 20 (Training Time)
        const surpriseTiles = [2, 10, 13, 23];
        
        // Get tile names for user feedback
        const tileNames = {
            0: "Start", 1: "Empathy Lane", 2: "Surprise Card", 3: "Moonstar Response Station",
            4: "Knowledge Knoll", 5: "Golden Chest", 6: "QA Jail", 7: "Escalation Ave",
            8: "Riddleton Place", 9: "Starlight Response Station", 10: "Surprise Card", 11: "Sale-A-Vie Blvd",
            12: "Best Agent", 13: "Surprise Card", 14: "Knowledge Square", 15: "Sunshine Response Station",
            16: "Connectivity Cost Center", 17: "Problem Plaza", 18: "Go to QA Jail", 19: "Inquiry Inspections",
            20: "Training Time", 21: "Coupon Court", 22: "Resolution Road", 23: "Surprise Card"
        };
        
        const tileName = tileNames[currentTile] || `Tile ${currentTile}`;

        // Visual feedback
        this.$adminTileActionButton.textContent = "Triggering...";
        this.$adminTileActionButton.disabled = true;

        setTimeout(() => {
            if (questionTiles.includes(currentTile)) {
                // Trigger question card for this tile
                const questionResult = this.getRandomUnusedAdminQuestion(currentTile);
                if (questionResult) {
                    const questionIndex = questionResult.index;
                    console.log(`⚡ Triggering question card for tile ${currentTile} (${tileName})`);
                    
                    // Send admin test card command to all clients
                    this.socket.send(JSON.stringify({
                        action: "admin_test_card",
                        card_type: "QUESTION",
                        tile_id: currentTile,
                        question_index: questionIndex,
                        hostname: this.hostName
                    }));
                } else {
                    console.log(`No questions available for tile ${currentTile}`);
                    alert(`No questions available for ${tileName}. Question pool may be exhausted.`);
                }
            } else if (surpriseTiles.includes(currentTile)) {
                // Trigger surprise card
                const surpriseIndex = Math.floor(Math.random() * 40); // 40 total surprise cards
                console.log(`⚡ Triggering surprise card for tile ${currentTile} (${tileName})`);
                
                // Send admin test card command to all clients
                this.socket.send(JSON.stringify({
                    action: "admin_test_card",
                    card_type: "SURPRISE",
                    tile_id: currentTile,
                    surprise_index: surpriseIndex,
                    hostname: this.hostName
                }));
            } else if ([3, 9, 15].includes(currentTile)) {
                // Response Stations - check ownership and show appropriate action
                console.log(`⚡ Triggering ${tileName} action for tile ${currentTile}`);
                
                const currentOwner = this.landOwners[currentTile];
                
                if (currentOwner === null) {
                    // Unowned station - show purchase option
                    // Calculate purchase price based on player's owned stations
                    let ownedStations = 0;
                    for (let tileId of [3, 9, 15]) {
                        if (this.landOwners[tileId] === playerIndex) {
                            ownedStations++;
                        }
                    }
                    
                    // Price increases with each station owned (5, 10, 15 SB)
                    const purchasePrice = (ownedStations + 1) * 5;
                    
                    console.log(`Station ${currentTile} is unowned. ${teamName} can buy for ${purchasePrice} SB`);
                    
                    this.socket.send(JSON.stringify({
                        action: "admin_test_card",
                        card_type: "BUY_STATION",
                        tile_id: currentTile,
                        player_index: playerIndex,
                        cost: purchasePrice,
                        hostname: this.hostName
                    }));
                    
                } else if (currentOwner === playerIndex) {
                    // Player owns this station - can use it for free (pay SB to get more SB)
                    const stationCosts = { 3: 5, 9: 10, 15: 15 };
                    const cost = stationCosts[currentTile];
                    const stationRewards = { 3: 6, 9: 12, 15: 18 }; // Rewards match rent amounts
                    const reward = stationRewards[currentTile];
                    
                    console.log(`${teamName} owns station ${currentTile}. Can use service: pay ${cost} SB → get ${reward} SB`);
                    
                    this.socket.send(JSON.stringify({
                        action: "admin_test_card",
                        card_type: "RESPONSE_STATION",
                        tile_id: currentTile,
                        player_index: playerIndex,
                        cost: cost,
                        reward: reward,
                        hostname: this.hostName
                    }));
                    
                } else {
                    // Another player owns this station - must pay rent
                    const ownerName = (currentOwner !== null && currentOwner !== undefined && Number.isInteger(currentOwner) && this.teamNames[currentOwner]) 
                        ? this.teamNames[currentOwner] 
                        : `Team ${((Number.isInteger(currentOwner) ? currentOwner : 0) + 1)}`;
                    
                    // Calculate rent based on how many stations the owner has
                    let ownerStations = 0;
                    for (let tileId of [3, 9, 15]) {
                        if (this.landOwners[tileId] === currentOwner) {
                            ownerStations++;
                        }
                    }
                    
                    // Rent increases with number of stations owned
                    let rent;
                    if (ownerStations === 1) rent = 6;
                    else if (ownerStations === 2) rent = 12; 
                    else rent = 18; // All 3 stations
                    
                    console.log(`${teamName} must pay ${rent} SB rent to ${ownerName} for station ${currentTile}`);
                    
                    this.socket.send(JSON.stringify({
                        action: "admin_test_card",
                        card_type: "PAY_RENT",
                        tile_id: currentTile,
                        player_index: playerIndex,
                        cost: rent,
                        owner_index: currentOwner,
                        hostname: this.hostName
                    }));
                }
            } else if (currentTile === 0) {
                // Start tile - collect 200 SB
                console.log(`⚡ Triggering Start tile action`);
                
                this.socket.send(JSON.stringify({
                    action: "admin_test_card", 
                    card_type: "START_BONUS",
                    tile_id: currentTile,
                    player_index: playerIndex,
                    hostname: this.hostName
                }));
            } else if (currentTile === 6) {
                // QA Jail - player is stuck for one turn
                console.log(`⚡ Player landed in QA Jail - stopped for one turn`);
                
                // Send broadcast to all clients
                this.socket.send(JSON.stringify({
                    action: "admin_test_card",
                    card_type: "JAIL_STUCK", 
                    tile_id: currentTile,
                    player_index: playerIndex,
                    hostname: this.hostName
                }));
            } else if (currentTile === 18) {
                // Go to QA Jail - move player to jail
                console.log(`⚡ Triggering Go to QA Jail action`);
                
                this.socket.send(JSON.stringify({
                    action: "admin_test_card",
                    card_type: "GO_TO_JAIL",
                    tile_id: currentTile, 
                    player_index: playerIndex,
                    hostname: this.hostName
                }));
            } else {
                // Other special tiles (Golden Chest, Best Agent, Connectivity Cost Center)
                console.log(`⚡ Triggering special tile action for ${tileName}`);
                
                this.socket.send(JSON.stringify({
                    action: "admin_test_card",
                    card_type: "SPECIAL_TILE",
                    tile_id: currentTile,
                    player_index: playerIndex,
                    tile_name: tileName,
                    hostname: this.hostName
                }));
            }

            // Reset button
            this.$adminTileActionButton.textContent = "⚡ Trigger Tile Action";
            this.$adminTileActionButton.disabled = false;
        }, 500);
    }

    /* ===== SUPPORT BUCKS SHOP SYSTEM ===== */
    
    initSupportBucksShop() {
        console.log('🛒 Initializing Support Bucks Shop...');
        
        // Initialize shop elements
        this.$shopButton = document.getElementById('support-bucks-shop-btn');
        this.$shopOverlay = document.getElementById('shop-overlay');
        this.$shopCloseBtn = document.getElementById('shop-close-btn');
        this.$inventorySidebar = document.getElementById('inventory-sidebar');
        this.$itemUsageModal = document.getElementById('item-usage-modal');
        this.$itemModalClose = document.getElementById('item-modal-close');
        
        console.log(`🛒 Admin status: ${this.isAdmin} (${this.userName} vs ${this.hostName})`);
        console.log(`🛒 Shop elements found:`, {
            button: !!this.$shopButton,
            overlay: !!this.$shopOverlay,
            closeBtn: !!this.$shopCloseBtn,
            sidebar: !!this.$inventorySidebar,
            modal: !!this.$itemUsageModal,
            modalClose: !!this.$itemModalClose
        });
        
        // Shop button event - only admins can click
        if (this.$shopButton) {
            this.$shopButton.addEventListener('click', () => {
                console.log('🛒 Shop button clicked! isAdmin:', this.isAdmin);
                if (this.isAdmin) {
                    this.openShop();
                } else {
                    console.log('🛒 Not admin, click ignored');
                }
            });
        } else {
            console.error('🛒 Shop button not found!');
        }
        
        // Shop close button - only for admin users
        if (this.$shopCloseBtn && this.isAdmin) {
            this.$shopCloseBtn.addEventListener('click', () => {
                this.closeShop();
            });
        } else if (this.$shopCloseBtn && !this.isAdmin) {
            // Hide the close button for non-admin users
            this.$shopCloseBtn.style.display = 'none';
        }
        
        // Item modal close
        if (this.$itemModalClose) {
            this.$itemModalClose.addEventListener('click', () => {
                this.closeItemModal();
            });
        }
        
        // Close shop when clicking outside - only for admin users
        if (this.$shopOverlay && this.isAdmin) {
            this.$shopOverlay.addEventListener('click', (e) => {
                if (e.target === this.$shopOverlay) {
                    this.closeShop();
                }
            });
        }
        
        // Initialize shop items
        this.initShopItems();
        
        // Update initial inventory display
        this.updateInventoryDisplay();
        
        console.log('🛒 Support Bucks Shop initialization complete');
    }
    
    initShopItems() {
        // Shop items data
        this.shopItems = [
            {
                id: 'team_hint',
                name: 'Team Hint',
                cost: 2,
                description: 'Get a clue from the host',
                icon: '💡'
            },
            {
                id: 'skip_pass',
                name: 'Skip a Pass',
                cost: 3,
                description: 'Skip a tricky question',
                icon: '🚫'
            },
            {
                id: 'double_down',
                name: 'Double Down',
                cost: 4,
                description: 'Double your next correct answer',
                icon: '⚡'
            },
            {
                id: 'time_travel',
                name: 'Time Travel',
                cost: 5,
                description: 'Roll twice in one turn',
                icon: '🕐'
            },
            {
                id: 'jail_free',
                name: 'Get out of Jail Free Card',
                cost: 10,
                description: 'Get out of Jail Free card',
                icon: '🗝️'
            }
        ];
    }
    
    openShop() {
        console.log('🛒 Opening Support Bucks Shop');
        console.log('🛒 Shop overlay element:', this.$shopOverlay);
        
        // Update team balances
        this.updateTeamBalances();
        
        // Create shop items
        this.createShopGrid();
        
        // Show the shop overlay
        if (this.$shopOverlay) {
            console.log('🛒 Removing hidden class from shop overlay');
            this.$shopOverlay.classList.remove('hidden');
        } else {
            console.error('🛒 Shop overlay not found!');
        }
        
        // Broadcast shop open to all players
        this.socket.send(JSON.stringify({
            action: "shop_opened",
            hostname: this.hostName
        }));
    }
    
    closeShop() {
        console.log('🛒 Closing Support Bucks Shop');
        
        // Hide the shop overlay
        this.$shopOverlay.classList.add('hidden');
        
        // Reset purchase selector
        this.hidePurchaseSelector();
        
        // Broadcast shop close to all players
        this.socket.send(JSON.stringify({
            action: "shop_closed",
            hostname: this.hostName
        }));
    }
    
    updateTeamBalances() {
        const balancesContainer = document.getElementById('team-balances-container');
        if (!balancesContainer) {
            console.log("🛒 Team balances container not found");
            return;
        }
        
        // Don't update if teamNames isn't initialized yet
        if (!this.teamNames || this.teamNames.length === 0) {
            console.log("🛒 Team names not initialized yet, skipping balance update");
            return;
        }
        
        console.log("🛒 Updating team balances:", this.teamNames, this.teamCash);
        balancesContainer.innerHTML = '';
        
        // Create balance display for each team
        this.teamNames.forEach((teamName, index) => {
            const teamBalance = document.createElement('div');
            teamBalance.className = 'team-balance';
            teamBalance.innerHTML = `
                <div class="team-balance-name">${teamName}</div>
                <div class="team-balance-amount">${this.teamCash[index]} SB</div>
            `;
            balancesContainer.appendChild(teamBalance);
        });
    }
    
    createShopGrid() {
        const shopGrid = document.getElementById('shop-grid');
        if (!shopGrid) {
            console.error("🛒 Shop grid element not found!");
            return;
        }
        
        console.log("🛒 Creating shop grid with", this.shopItems.length, "items");
        shopGrid.innerHTML = '';
        
        this.shopItems.forEach(item => {
            const shopItem = document.createElement('div');
            shopItem.className = 'shop-item';
            shopItem.innerHTML = `
                <div class="item-icon">${item.icon}</div>
                <div class="item-name">${item.name}</div>
                <div class="item-cost">${item.cost} Support Bucks</div>
                <div class="item-description">${item.description}</div>
                <button class="buy-btn" data-item-id="${item.id}">Buy Item</button>
            `;
            
            // Add buy button event listener
            const buyBtn = shopItem.querySelector('.buy-btn');
            if (buyBtn) {
                buyBtn.addEventListener('click', () => {
                    if (this.isAdmin) {
                        this.selectItemForPurchase(item);
                    }
                });
            }
            
            shopGrid.appendChild(shopItem);
        });
        
        console.log("🛒 Shop grid created successfully");
    }
    
    selectItemForPurchase(item) {
        console.log(`🛒 Selected item for purchase: ${item.name}`);
        
        this.selectedPurchaseItem = item;
        this.showPurchaseSelector();
    }
    
    showPurchaseSelector() {
        const purchaseSelector = document.getElementById('purchase-selector');
        if (!purchaseSelector) return;
        
        purchaseSelector.classList.remove('hidden');
        
        // Create team selector buttons
        const teamSelector = document.querySelector('.team-selector');
        if (teamSelector) {
            teamSelector.innerHTML = '';
            
            this.teamNames.forEach((teamName, index) => {
                const canAfford = this.teamCash[index] >= this.selectedPurchaseItem.cost;
                
                const teamBtn = document.createElement('button');
                teamBtn.className = 'team-select-btn';
                teamBtn.textContent = `${teamName} (${this.teamCash[index]} SB)`;
                teamBtn.disabled = !canAfford;
                
                if (canAfford) {
                    teamBtn.addEventListener('click', () => {
                        this.purchaseItem(index);
                    });
                } else {
                    teamBtn.style.opacity = '0.5';
                    teamBtn.title = 'Insufficient Support Bucks';
                }
                
                teamSelector.appendChild(teamBtn);
            });
        }
        
        // Cancel purchase button
        const cancelBtn = document.getElementById('cancel-purchase');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hidePurchaseSelector();
            });
        }
    }
    
    hidePurchaseSelector() {
        const purchaseSelector = document.getElementById('purchase-selector');
        if (purchaseSelector) {
            purchaseSelector.classList.add('hidden');
        }
        this.selectedPurchaseItem = null;
    }
    
    purchaseItem(teamIndex) {
        const item = this.selectedPurchaseItem;
        const teamName = this.teamNames[teamIndex];
        
        console.log(`🛒 Purchasing ${item.name} for ${teamName}`);
        console.log(`🛒 Team cash before purchase:`, this.teamCash);
        
        // Deduct cost from team's support bucks
        this.teamCash[teamIndex] -= item.cost;
        console.log(`🛒 Team cash after purchase:`, this.teamCash);
        
        // Add item to team inventory
        if (!this.teamInventories[teamIndex][item.id]) {
            this.teamInventories[teamIndex][item.id] = 0;
        }
        this.teamInventories[teamIndex][item.id]++;
        
        // Update displays
        this.updateTeamBalances();
        this.updateInventoryDisplay();
        this.updateTeamCashDisplay();
        
        // Show success notification
        this.showToastNotification(`${teamName} purchased ${item.name} for ${item.cost} Support Bucks! 🛒`);
        
        // Hide purchase selector
        this.hidePurchaseSelector();
        
        // Broadcast purchase to all players with updated team cash
        this.socket.send(JSON.stringify({
            action: "item_purchased",
            team_index: teamIndex,
            item: item,
            updated_team_cash: this.teamCash,
            hostname: this.hostName
        }));
    }
    
    updateInventoryDisplay() {
        const inventorySidebar = document.getElementById('inventory-sidebar');
        if (!inventorySidebar) return;
        
        // Don't update if teamNames isn't initialized yet
        if (!this.teamNames || this.teamNames.length === 0) {
            inventorySidebar.classList.add('hidden');
            return;
        }
        
        // Check if any team has items
        const hasAnyItems = this.teamNames.some((_, index) => {
            const inventory = this.teamInventories[index];
            return inventory && Object.keys(inventory).some(itemId => inventory[itemId] > 0);
        });
        
        if (!hasAnyItems) {
            inventorySidebar.classList.add('hidden');
            return;
        }
        
        inventorySidebar.classList.remove('hidden');
        
        // Update inventory content
        const inventoryContent = inventorySidebar.querySelector('.inventory-content');
        if (inventoryContent) {
            inventoryContent.innerHTML = '';
            
            this.teamNames.forEach((teamName, index) => {
                const inventory = this.teamInventories[index];
                const teamItems = Object.keys(inventory).filter(itemId => inventory[itemId] > 0);
                
                if (teamItems.length > 0) {
                    const teamInventoryDiv = document.createElement('div');
                    teamInventoryDiv.className = 'team-inventory';
                    
                    const teamHeader = document.createElement('div');
                    teamHeader.className = 'team-inventory-header';
                    teamHeader.textContent = teamName;
                    teamInventoryDiv.appendChild(teamHeader);
                    
                    teamItems.forEach(itemId => {
                        const item = this.shopItems.find(shopItem => shopItem.id === itemId);
                        const count = inventory[itemId];
                        
                        const inventoryItem = document.createElement('div');
                        inventoryItem.className = 'inventory-item';
                        inventoryItem.innerHTML = `
                            <div class="inventory-item-icon">${item.icon}</div>
                            <div class="inventory-item-name">${item.name}</div>
                            <div class="inventory-item-count">${count}</div>
                        `;
                        
                        // Add click event for item usage
                        inventoryItem.addEventListener('click', () => {
                            if (this.isAdmin) {
                                this.showItemUsageModal(item, index);
                                
                                // Broadcast to all players that admin opened item usage modal
                                this.socket.send(JSON.stringify({
                                    action: "item_usage_modal_opened",
                                    item: item,
                                    team_index: index,
                                    hostname: this.hostName
                                }));
                            }
                        });
                        
                        teamInventoryDiv.appendChild(inventoryItem);
                    });
                    
                    inventoryContent.appendChild(teamInventoryDiv);
                }
            });
        }
    }
    
    showItemUsageModal(item, teamIndex, readOnly = false) {
        console.log(`🎒 Opening item usage modal for ${item.name} (${this.teamNames[teamIndex]}) - readOnly: ${readOnly}`);
        
        const modal = document.getElementById('item-usage-modal');
        if (!modal) return;
        
        // Update modal content
        const modalIcon = document.getElementById('item-modal-icon');
        const modalDescription = document.getElementById('item-modal-description');
        const modalTeam = document.getElementById('item-modal-team');
        
        if (modalIcon) modalIcon.textContent = item.icon;
        if (modalDescription) modalDescription.textContent = item.description;
        if (modalTeam) modalTeam.textContent = `Team: ${this.teamNames[teamIndex]}`;
        
        // Use item button
        const useBtn = document.getElementById('use-item-btn');
        if (useBtn) {
            useBtn.style.display = 'block'; // Always show the button
            if (readOnly) {
                // For non-admin users: show button but disable it
                useBtn.disabled = true;
                useBtn.textContent = 'Use Item';
                useBtn.style.cursor = 'not-allowed';
                useBtn.onclick = null; // Remove any click handlers
            } else {
                // For admin users: enable the button and set up click handler
                useBtn.disabled = false;
                useBtn.textContent = 'Use Item';
                useBtn.style.cursor = 'pointer';
                useBtn.onclick = () => {
                    this.useItem(item, teamIndex);
                };
            }
        }
        
        // Close button - hide for non-admin users
        const closeBtn = document.getElementById('item-modal-close');
        if (closeBtn) {
            if (readOnly) {
                closeBtn.style.display = 'none';
            } else {
                closeBtn.style.display = 'block';
            }
        }
        
        // Show modal
        modal.classList.remove('hidden');
    }
    
    closeItemModal() {
        const modal = document.getElementById('item-usage-modal');
        if (modal) {
            modal.classList.add('hidden');
            
            // If admin closes the modal, broadcast to all players
            if (this.isAdmin) {
                this.socket.send(JSON.stringify({
                    action: "item_usage_modal_closed",
                    hostname: this.hostName
                }));
            }
        }
    }
    
    useItem(item, teamIndex) {
        console.log(`🎯 Using item: ${item.name} for ${this.teamNames[teamIndex]}`);
        
        // Decrease item count
        this.teamInventories[teamIndex][item.id]--;
        
        // Remove item if count is 0
        if (this.teamInventories[teamIndex][item.id] <= 0) {
            delete this.teamInventories[teamIndex][item.id];
        }
        
        // Update displays
        this.updateInventoryDisplay();
        
        // Show usage notification
        this.showToastNotification(`${this.teamNames[teamIndex]} used ${item.name}! ${item.icon}`);
        
        // Close modal
        this.closeItemModal();
        
        // Broadcast item usage to all players
        this.socket.send(JSON.stringify({
            action: "item_used",
            team_index: teamIndex,
            item: item,
            hostname: this.hostName
        }));
    }

    endGame() {
        this.socket.send(JSON.stringify({
            action: "end_game",
        }));
    }

    initEmergencyControls() {
        this.$resetDiceBtn = document.getElementById("reset-dice-btn");
        this.$resetGameBtn = document.getElementById("reset-game-btn");
        this.$suddenDeathBtn = document.getElementById("sudden-death-btn");

        if (this.$resetDiceBtn) {
            this.$resetDiceBtn.addEventListener("click", () => {
                this.resetDiceAndTurn();
            });
        }

        if (this.$resetGameBtn) {
            this.$resetGameBtn.addEventListener("click", () => {
                this.resetEntireGame();
            });
        }

        if (this.$suddenDeathBtn) {
            this.$suddenDeathBtn.addEventListener("click", () => {
                this.startSuddenDeathRound();
            });
        }
    }

    resetDiceAndTurn() {
        // Confirm before resetting
        if (!confirm("Reset the current turn? This will:\n• Close any open cards/modals\n• Allow the current player to roll again\n• Clear any stuck states")) {
            return;
        }

        console.log("🎲 Emergency reset: Clearing stuck states and resetting turn...");

        // Close any open modals or cards
        this.hideModal(false);
        
        // Close card overlay if open
        const cardOverlay = document.getElementById('card-overlay');
        if (cardOverlay) {
            cardOverlay.style.display = 'none';
        }

        // Clear pending next player state
        this.pendingNextPlayer = undefined;

        // Reset any button states
        const modalButtons = document.querySelectorAll("#modal-buttons-container button");
        modalButtons.forEach(button => {
            button.disabled = false;
            button.textContent = button.textContent.replace("Hold on...", "Roll");
        });

        // Uncheck dice if checked
        const diceInput = document.getElementById("roll");
        if (diceInput) {
            diceInput.checked = false;
        }

        // Show success message and then trigger dice modal
        this.showModal(null, "🎲 Turn Reset", "", "The turn has been reset. Preparing dice...", [], 1.5);
        
        // After success message, show the dice modal for current player
        setTimeout(() => {
            this.changePlayer(this.currentPlayer, this.onDiceRolled.bind(this));
        }, 2000);

        // Visual feedback on button
        this.$resetDiceBtn.textContent = "✅ Reset!";
        this.$resetDiceBtn.style.background = "linear-gradient(135deg, #2ed573, #1dd1a1)";
        
        setTimeout(() => {
            this.$resetDiceBtn.textContent = "🎲 Reset Dice";
            this.$resetDiceBtn.style.background = "linear-gradient(135deg, #ff4757, #ff3742)";
        }, 2000);
    }

    resetEntireGame() {
        // Confirm before resetting
        if (!confirm("Reset the ENTIRE game? This will:\n• Move all teams back to START\n• Reset money to 24 SB and points to 0\n• Clear all properties and buildings\n• Start fresh from Team 1\n\nThis cannot be undone!")) {
            return;
        }

        console.log("🔄 Emergency reset: Resetting entire game state...");
        console.log("Sending reset command to server with hostname:", this.hostName);

        // Send reset game command to server
        this.socket.send(JSON.stringify({
            action: "admin_reset_game",
            hostname: this.hostName
        }));

        // Visual feedback on button
        this.$resetGameBtn.textContent = "🔄 Resetting...";
        this.$resetGameBtn.disabled = true;
        
        setTimeout(() => {
            this.$resetGameBtn.textContent = "🔄 Reset Game";
            this.$resetGameBtn.disabled = false;
        }, 3000);

        // Show loading message
        this.showModal(null, "🔄 Game Reset", "", "Resetting the entire game state. Please wait...", [], 3);
    }

    startSuddenDeathRound() {
        // Confirm before starting sudden death
        if (!confirm("Start Sudden Death Round? This will:\n• Stop all regular game movement\n• Show special tie-breaker questions\n• Determine the final winner\n\nAre you ready?")) {
            return;
        }

        console.log("💀 Starting Sudden Death Round");

        // Enter sudden death mode
        this.suddenDeathMode = true;
        this.suddenDeathQuestionIndex = 0;

        // Send sudden death start command to server
        this.socket.send(JSON.stringify({
            action: "start_sudden_death",
            hostname: this.hostName
        }));

        // Visual feedback on button
        this.$suddenDeathBtn.textContent = "💀 Starting...";
        this.$suddenDeathBtn.disabled = true;

        // Admin manually shows category selection, others wait
        this.$suddenDeathBtn.textContent = "💀 Sudden Death Round";
        this.$suddenDeathBtn.disabled = false;
        
        // Show category selection automatically for admin after announcement
        setTimeout(() => {
            this.showSuddenDeathCategorySelection();
        }, 2000);
    }

    showSuddenDeathCard() {
        const suddenDeathData = this.getSuddenDeathData();
        
        if (this.suddenDeathQuestionIndex >= suddenDeathData.length) {
            // All questions exhausted
            this.showModal(null, "💀 Sudden Death Complete", "", "All tie-breaker questions have been used!", [], 3);
            return;
        }

        const cardData = suddenDeathData[this.suddenDeathQuestionIndex];
        
        // Send sudden death card to all clients
        this.socket.send(JSON.stringify({
            action: "show_sudden_death_card",
            question_index: this.suddenDeathQuestionIndex,
            hostname: this.hostName
        }));

        console.log(`💀 Showing sudden death question ${this.suddenDeathQuestionIndex + 1}/${suddenDeathData.length}`);
    }

    nextSuddenDeathCard() {
        // Show category selection instead of next card
        this.showSuddenDeathCategorySelection();
    }

    showSuddenDeathCategorySelection() {
        console.log("💀 Showing sudden death category selection");
        
        // Check if current user is admin
        const hostname = document.getElementById('hostname').value;
        const username = document.getElementById('username').value;
        const isAdmin = (username === hostname);
        
        // Everyone sees the buttons, but only admin can click them
        const buttons = [
            {
                text: "Unsubscribe?",
                callback: () => {
                    if (isAdmin) {
                        this.selectSuddenDeathCategory('unsubscribe');
                    }
                }
            },
            {
                text: "Block?", 
                callback: () => {
                    if (isAdmin) {
                        this.selectSuddenDeathCategory('block');
                    }
                }
            },
            {
                text: "Close?",
                callback: () => {
                    if (isAdmin) {
                        this.selectSuddenDeathCategory('close');
                    }
                }
            }
        ];
        
        // Show modal and then apply special styling
        this.showModal(null, "💀 Choose Category", "Sudden Death Round", "Choose a category:", buttons).then(() => {
            // Add special CSS class for category selection modal
            const modalCard = document.getElementById('modal-card');
            modalCard.classList.add('sudden-death-category');
            
            // Add special class to buttons for styling
            const modalButtons = document.querySelectorAll('#modal-buttons-container button');
            modalButtons.forEach((button, index) => {
                button.classList.add('sudden-death-category-btn');
                
                // If not admin, disable button interactions but keep them visible
                if (!isAdmin) {
                    button.style.cursor = 'not-allowed';
                    button.style.opacity = '0.7';
                }
            });
        });
    }

    selectSuddenDeathCategory(category) {
        console.log(`💀 Admin selected category: ${category}`);
        
        // Get a random unused question from the selected category
        const questionData = this.getRandomUnusedSuddenDeathQuestion(category);
        
        if (!questionData) {
            console.log(`No questions available for category: ${category}`);
            return;
        }
        
        // Clean up CSS classes before hiding modal
        const modalCard = document.getElementById('modal-card');
        modalCard.classList.remove('sudden-death-category');
        
        // Send category selection and question to all clients
        this.socket.send(JSON.stringify({
            action: "select_sudden_death_category",
            category: category,
            question_index: questionData.index,
            hostname: this.hostName
        }));
        
        // Hide the modal - category selection done
        this.hideModal(false);

        // Start blitz mode locally for admin
        this.suddenDeathBlitz = {
            active: true,
            currentTeam: this.currentPlayer, // or whichever team is up
            currentCategory: category,
            currentQuestionIndex: 0,
            score: 0,
            timerRunning: true
        };
        
        // Send blitz start message to all clients
        this.socket.send(JSON.stringify({
            action: "start_sudden_death_blitz",
            category: category,
            team_index: this.currentPlayer,
            hostname: this.hostName
        }));
        
        this.showNextSuddenDeathBlitzCard();
        this.showSuddenDeathBlitzPointsTracker();
        this.showSuddenDeathTimer();
    }

    initTimerControls() {
        // Only admin has timer controls
        if (this.userName !== this.hostName) {
            return;
        }

        this.$startTimerBtn = document.getElementById("start-timer-btn");
        if (this.$startTimerBtn) {
            this.$startTimerBtn.addEventListener("click", () => {
                this.startSuddenDeathTimer();
            });
        }
    }

    showSuddenDeathTimer() {
        const timerElement = document.getElementById("sudden-death-timer");
        if (timerElement) {
            timerElement.classList.remove("hidden");
            // Make sure timer appears on top of the card overlay (which has z-index: 10000)
            timerElement.style.zIndex = "10001"; // Higher than card overlay (10000)
            this.resetTimerDisplay();
        }
    }

    hideSuddenDeathTimer() {
        const timerElement = document.getElementById("sudden-death-timer");
        if (timerElement) {
            timerElement.classList.add("hidden");
            this.stopTimer();
            
            // Reset the timer state completely
            this.suddenDeathTimer.isRunning = false;
            this.suddenDeathTimer.timeLeft = 20;
            
            // Reset button text if admin
            const startBtn = document.getElementById("start-timer-btn");
            if (startBtn && this.userName === this.hostName) {
                startBtn.textContent = "▶️ Start Timer";
                startBtn.disabled = false;
            }
        }
    }

    resetTimerDisplay() {
        this.suddenDeathTimer.timeLeft = 20;
        this.suddenDeathTimer.isRunning = false;
        
        const timerDisplay = document.getElementById("timer-display");
        const startBtn = document.getElementById("start-timer-btn");
        
        if (timerDisplay) {
            timerDisplay.textContent = "00:20";
            timerDisplay.classList.remove("timer-times-up");
            timerDisplay.style.color = "#00ff00";
        }
        
        if (startBtn) {
            startBtn.textContent = "▶️ Start Timer";
            startBtn.disabled = false;
        }
    }

    startSuddenDeathTimer() {
        if (this.suddenDeathTimer.isRunning) {
            return;
        }

        console.log("⏱️ Admin starting sudden death timer");
        
        // Send timer start command to all clients
        this.socket.send(JSON.stringify({
            action: "start_sudden_death_timer",
            hostname: this.hostName
        }));
        
        this.startTimerCountdown();
    }

    startTimerCountdown() {
        this.suddenDeathTimer.isRunning = true;
        this.suddenDeathTimer.timeLeft = 20;
        
        const startBtn = document.getElementById("start-timer-btn");
        if (startBtn) {
            startBtn.textContent = "⏱️ Running...";
            startBtn.disabled = true;
        }
        
        // Clear any existing interval
        if (this.suddenDeathTimer.intervalId) {
            clearInterval(this.suddenDeathTimer.intervalId);
        }
        
        this.suddenDeathTimer.intervalId = setInterval(() => {
            this.updateTimerDisplay();
            
            if (this.suddenDeathTimer.timeLeft <= 0) {
                this.handleTimerEnd();
            } else {
                this.suddenDeathTimer.timeLeft--;
            }
        }, 1000);
        
        // Update display immediately
        this.updateTimerDisplay();
    }

    updateTimerDisplay() {
        const timerDisplay = document.getElementById("timer-display");
        if (!timerDisplay) return;
        
        const minutes = Math.floor(this.suddenDeathTimer.timeLeft / 60);
        const seconds = this.suddenDeathTimer.timeLeft % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        timerDisplay.textContent = formattedTime;
        
        // Change color when time is running low
        if (this.suddenDeathTimer.timeLeft <= 5) {
            timerDisplay.style.color = "#ff8800"; // Orange
        } else if (this.suddenDeathTimer.timeLeft <= 10) {
            timerDisplay.style.color = "#ffff00"; // Yellow
        } else {
            timerDisplay.style.color = "#00ff00"; // Green
        }
    }

    handleTimerEnd() {
        console.log("⏰ Timer ended!");
        
        this.stopTimer();
        
        const timerDisplay = document.getElementById("timer-display");
        if (timerDisplay) {
            timerDisplay.textContent = "TIME'S UP";
            timerDisplay.classList.add("timer-times-up");
        }
        
        const startBtn = document.getElementById("start-timer-btn");
        if (startBtn) {
            startBtn.textContent = "⏰ Reset Timer";
            startBtn.disabled = false;
            
            // Change button function to reset timer
            startBtn.onclick = () => {
                // Stop any running timer first
                this.stopTimer();
                this.resetTimerDisplay();
                
                // Send timer reset to all clients
                this.socket.send(JSON.stringify({
                    action: "reset_sudden_death_timer",
                    hostname: this.hostName
                }));
                
                // Restore start timer functionality - IMPORTANT: Don't auto-start!
                startBtn.onclick = () => {
                    this.startSuddenDeathTimer();
                };
            };
        }

        this.suddenDeathBlitz.timerRunning = false;
        
        // Clean up points tracker and next card button when timer ends
        let tracker = document.getElementById('sudden-death-points-tracker');
        if (tracker) tracker.remove();
        let nextBtn = document.getElementById('sudden-death-next-card-btn');
        if (nextBtn) nextBtn.remove();
        
        if (this.isAdmin) {
            // Show button to return to category menu
            let btn = document.getElementById('sudden-death-category-btn');
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'sudden-death-category-btn';
                btn.textContent = 'Return to Category Menu';
                btn.style.position = 'fixed';
                btn.style.left = '5vw';
                btn.style.top = '70%';
                btn.style.zIndex = '10003';
                btn.style.fontSize = '1.2rem';
                btn.style.padding = '12px 24px';
                btn.style.background = '#2196F3';
                btn.style.color = 'white';
                btn.style.border = 'none';
                btn.style.borderRadius = '8px';
                btn.onclick = () => {
                    this.socket.send(JSON.stringify({
                        action: 'sudden_death_show_category_menu'
                    }));
                };
                document.body.appendChild(btn);
            }
        }
    }

    stopTimer() {
        this.suddenDeathTimer.isRunning = false;
        
        if (this.suddenDeathTimer.intervalId) {
            clearInterval(this.suddenDeathTimer.intervalId);
            this.suddenDeathTimer.intervalId = null;
        }
    }

    // Question Card Timer Functions
    initQuestionCardTimerControls() {
        this.$startQuestionTimerBtn = document.getElementById("start-question-timer-btn");
        
        if (this.$startQuestionTimerBtn) {
            this.$startQuestionTimerBtn.addEventListener("click", () => {
                this.startQuestionCardTimer();
            });
        }
    }

    showQuestionCardTimer() {
        const timerElement = document.getElementById("question-card-timer");
        if (timerElement) {
            timerElement.classList.remove("hidden");
            // Make sure timer appears on top of the card overlay (which has z-index: 10000)
            timerElement.style.zIndex = "10001"; // Higher than card overlay (10000)
            this.resetQuestionCardTimerDisplay();
        }
    }

    hideQuestionCardTimer() {
        const timerElement = document.getElementById("question-card-timer");
        if (timerElement) {
            timerElement.classList.add("hidden");
            this.stopQuestionCardTimer();
            
            // Reset the timer state completely
            this.questionCardTimer.isRunning = false;
            this.questionCardTimer.timeLeft = 120;
            
            // Reset button text if admin
            const startBtn = document.getElementById("start-question-timer-btn");
            if (startBtn) {
                startBtn.textContent = "▶️ Start Timer";
                startBtn.disabled = false;
            }
        }
    }

    resetQuestionCardTimerDisplay() {
        this.questionCardTimer.timeLeft = 120;
        this.questionCardTimer.isRunning = false;
        
        const timerDisplay = document.getElementById("question-timer-display");
        const startBtn = document.getElementById("start-question-timer-btn");
        
        if (timerDisplay) {
            timerDisplay.textContent = "02:00";
            timerDisplay.classList.remove("timer-times-up");
            timerDisplay.style.color = "#00ff00";
        }
        
        if (startBtn) {
            startBtn.textContent = "▶️ Start Timer";
            startBtn.disabled = false;
        }
    }

    startQuestionCardTimer() {
        if (this.questionCardTimer.isRunning) {
            return;
        }

        console.log("⏱️ Admin starting question card timer");
        
        // Send timer start command to all clients
        this.socket.send(JSON.stringify({
            action: "start_question_card_timer",
            hostname: this.hostName
        }));
        
        this.startQuestionCardTimerCountdown();
    }

    startQuestionCardTimerCountdown() {
        this.questionCardTimer.isRunning = true;
        this.questionCardTimer.timeLeft = 120;
        
        const startBtn = document.getElementById("start-question-timer-btn");
        if (startBtn) {
            startBtn.textContent = "⏱️ Running...";
            startBtn.disabled = true;
        }
        
        // Clear any existing interval
        if (this.questionCardTimer.intervalId) {
            clearInterval(this.questionCardTimer.intervalId);
        }
        
        this.questionCardTimer.intervalId = setInterval(() => {
            this.updateQuestionCardTimerDisplay();
            
            if (this.questionCardTimer.timeLeft <= 0) {
                this.handleQuestionCardTimerEnd();
            } else {
                this.questionCardTimer.timeLeft--;
            }
        }, 1000);
        
        // Update display immediately
        this.updateQuestionCardTimerDisplay();
    }

    updateQuestionCardTimerDisplay() {
        const timerDisplay = document.getElementById("question-timer-display");
        if (!timerDisplay) return;
        
        const minutes = Math.floor(this.questionCardTimer.timeLeft / 60);
        const seconds = this.questionCardTimer.timeLeft % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        timerDisplay.textContent = formattedTime;
        
        // Change color when time is running low
        if (this.questionCardTimer.timeLeft <= 10) {
            timerDisplay.style.color = "#ff0000"; // Red
        } else if (this.questionCardTimer.timeLeft <= 30) {
            timerDisplay.style.color = "#ff8800"; // Orange
        } else if (this.questionCardTimer.timeLeft <= 60) {
            timerDisplay.style.color = "#ffff00"; // Yellow
        } else {
            timerDisplay.style.color = "#00ff00"; // Green
        }
    }

    handleQuestionCardTimerEnd() {
        console.log("⏰ Question card timer ended!");
        
        this.stopQuestionCardTimer();
        
        const timerDisplay = document.getElementById("question-timer-display");
        if (timerDisplay) {
            timerDisplay.textContent = "TIME'S UP!";
            timerDisplay.classList.add("timer-times-up");
        }
        
        const startBtn = document.getElementById("start-question-timer-btn");
        if (startBtn) {
            startBtn.textContent = "⏰ Reset Timer";
            startBtn.disabled = false;
            
            // Change button function to reset timer
            startBtn.onclick = () => {
                // Stop any running timer first
                this.stopQuestionCardTimer();
                this.resetQuestionCardTimerDisplay();
                
                // Send timer reset to all clients
                this.socket.send(JSON.stringify({
                    action: "reset_question_card_timer",
                    hostname: this.hostName
                }));
                
                // Restore start timer functionality - IMPORTANT: Don't auto-start!
                startBtn.onclick = () => {
                    this.startQuestionCardTimer();
                };
            };
        }
    }

    stopQuestionCardTimer() {
        this.questionCardTimer.isRunning = false;
        
        if (this.questionCardTimer.intervalId) {
            clearInterval(this.questionCardTimer.intervalId);
            this.questionCardTimer.intervalId = null;
        }
    }

    showNextSuddenDeathBlitzCard() {
        const category = this.suddenDeathBlitz.currentCategory;
        const questions = this.getSuddenDeathQuestionsByCategory(category);
        const index = this.suddenDeathBlitz.currentQuestionIndex;
        if (index >= questions.length) {
            // Optionally reshuffle or end
            this.suddenDeathBlitz.currentQuestionIndex = 0;
        }
        
        // Show card immediately without flip animation for sudden death blitz
        this.showCard('SUDDEN_DEATH', null, `Sudden Death - ${category.toUpperCase()}`, index, null, category);
        
        // For sudden death blitz, immediately show the question side (no flip needed)
        const cardFlipContainer = document.querySelector('#card-overlay .card-flip-container');
        if (cardFlipContainer) {
            cardFlipContainer.classList.remove('flipped');
        }
    }

    showSuddenDeathBlitzPointsTracker() {
        // Create or update a points tracker UI on the left of the card overlay
        let tracker = document.getElementById('sudden-death-points-tracker');
        if (!tracker) {
            tracker = document.createElement('div');
            tracker.id = 'sudden-death-points-tracker';
            tracker.style.position = 'fixed';
            tracker.style.left = '5vw';
            tracker.style.top = '50%';
            tracker.style.transform = 'translateY(-50%)';
            tracker.style.background = 'rgba(255,255,255,0.95)';
            tracker.style.borderRadius = '16px';
            tracker.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
            tracker.style.padding = '32px 24px';
            tracker.style.zIndex = '10002';
            tracker.style.display = 'flex';
            tracker.style.flexDirection = 'column';
            tracker.style.alignItems = 'center';
            tracker.style.fontSize = '2rem';
            document.body.appendChild(tracker);
        }
        
        // Show "Points" instead of team name for all users
        tracker.innerHTML = `<div style='font-size:1.2rem;margin-bottom:12px;'>Points</div>
            <div style='font-size:3rem;font-weight:bold;margin-bottom:12px;'>${this.suddenDeathBlitz.score || 0}</div>`;
        
        // Only show interactive controls for admin
        if (this.isAdmin) {
            tracker.innerHTML += `<div style='display:flex;gap:16px;'>
                <button id='sudden-death-add-point' style='font-size:2rem;'>+</button>
                <button id='sudden-death-remove-point' style='font-size:2rem;'>-</button>
            </div>`;
            setTimeout(() => {
                document.getElementById('sudden-death-add-point').onclick = () => {
                    this.suddenDeathBlitz.score++;
                    this.showSuddenDeathBlitzPointsTracker();
                    this.socket.send(JSON.stringify({
                        action: 'sudden_death_update_score',
                        team_index: this.suddenDeathBlitz.currentTeam,
                        score: this.suddenDeathBlitz.score
                    }));
                };
                document.getElementById('sudden-death-remove-point').onclick = () => {
                    if (this.suddenDeathBlitz.score > 0) this.suddenDeathBlitz.score--;
                    this.showSuddenDeathBlitzPointsTracker();
                    this.socket.send(JSON.stringify({
                        action: 'sudden_death_update_score',
                        team_index: this.suddenDeathBlitz.currentTeam,
                        score: this.suddenDeathBlitz.score
                    }));
                };
            }, 100);
        }

        // Add admin-only next card button during blitz
        if (this.isAdmin && this.suddenDeathBlitz.timerRunning) {
            let nextBtn = document.getElementById('sudden-death-next-card-btn');
            if (!nextBtn) {
                nextBtn = document.createElement('button');
                nextBtn.id = 'sudden-death-next-card-btn';
                nextBtn.textContent = 'Next Card';
                nextBtn.style.fontSize = '1.2rem';
                nextBtn.style.marginTop = '16px';
                nextBtn.style.padding = '8px 20px';
                nextBtn.style.background = '#4CAF50';
                nextBtn.style.color = 'white';
                nextBtn.style.border = 'none';
                nextBtn.style.borderRadius = '8px';
                nextBtn.onclick = () => {
                    console.log("💀 Blitz Next Card button clicked by admin");
                    
                    const cardFlipContainer = document.querySelector('#card-overlay .card-flip-container');
                    
                    if (cardFlipContainer && cardFlipContainer.classList.contains('flipped')) {
                        // Card is currently showing answer side - flip it back to question side first
                        console.log("💀 Blitz card is flipped, flipping back to question side first");
                        
                        // Add fast-flip class for instant animation
                        cardFlipContainer.classList.add('fast-flip');
                        cardFlipContainer.classList.remove('flipped');
                        
                        // Instant flip - no delay
                        console.log("💀 Instant flip, now showing next card");
                        this.suddenDeathBlitz.currentQuestionIndex++;
                        this.showNextSuddenDeathBlitzCard();
                        
                        this.socket.send(JSON.stringify({
                            action: 'sudden_death_next_card',
                            category: this.suddenDeathBlitz.currentCategory,
                            question_index: this.suddenDeathBlitz.currentQuestionIndex
                        }));
                    } else {
                        // Card is already on question side - show next card immediately
                        console.log("💀 Blitz card is already on question side, showing next card immediately");
                        this.suddenDeathBlitz.currentQuestionIndex++;
                        this.showNextSuddenDeathBlitzCard();
                        
                        this.socket.send(JSON.stringify({
                            action: 'sudden_death_next_card',
                            category: this.suddenDeathBlitz.currentCategory,
                            question_index: this.suddenDeathBlitz.currentQuestionIndex
                        }));
                    }
                };
                tracker.appendChild(nextBtn);
            }
        }
    }

    handleSuddenDeathUpdateScore(message) {
        if (this.suddenDeathBlitz.active && message.team_index == this.suddenDeathBlitz.currentTeam) {
            this.suddenDeathBlitz.score = message.score;
            this.showSuddenDeathBlitzPointsTracker();
        }
    }

    handleSuddenDeathNextCard(message) {
        console.log("💀 Received sudden death next card broadcast:", message);
        console.log("💀 Current user:", this.userName, "Current blitz state:", this.suddenDeathBlitz);
        
        // Ensure blitz is active and category matches
        if (this.suddenDeathBlitz.active && message.category === this.suddenDeathBlitz.currentCategory) {
            console.log("💀 Updating question index from", this.suddenDeathBlitz.currentQuestionIndex, "to", message.question_index);
            this.suddenDeathBlitz.currentQuestionIndex = message.question_index;
            this.showNextSuddenDeathBlitzCard();
            console.log("💀 Next card shown for user:", this.userName);
        } else {
            console.log("💀 Blitz not active or category mismatch. Attempting to reinitialize...");
            // Try to reinitialize blitz state if it got lost
            if (message.category) {
                this.suddenDeathBlitz = {
                    active: true,
                    currentTeam: 0,
                    currentCategory: message.category,
                    currentQuestionIndex: message.question_index,
                    score: 0,
                    timerRunning: true
                };
                console.log("💀 Reinitialized blitz state:", this.suddenDeathBlitz);
                this.showNextSuddenDeathBlitzCard();
                this.showSuddenDeathBlitzPointsTracker();
            }
        }
    }

    handleStartSuddenDeathBlitz(message) {
        console.log("💀 Received sudden death blitz start broadcast:", message);
        console.log("💀 Current user:", this.userName, "isAdmin:", this.isAdmin);
        
        // Initialize blitz mode for all clients
        this.suddenDeathBlitz = {
            active: true,
            currentTeam: message.team_index || 0,
            currentCategory: message.category,
            currentQuestionIndex: 0,
            score: 0,
            timerRunning: true
        };
        
        console.log("💀 Blitz state initialized:", this.suddenDeathBlitz);
        
        // Show points tracker for ALL users (not just admin)
        this.showSuddenDeathBlitzPointsTracker();
        
        console.log("💀 Points tracker shown for user:", this.userName);
    }

    handleSuddenDeathShowCategorySelection(message) {
        // Clean up blitz UI
        this.suddenDeathBlitz.active = false;
        let tracker = document.getElementById('sudden-death-points-tracker');
        if (tracker) tracker.remove();
        let nextBtn = document.getElementById('sudden-death-next-card-btn');
        if (nextBtn) nextBtn.remove();
        let catBtn = document.getElementById('sudden-death-category-btn');
        if (catBtn) catBtn.remove();
        
        // Also close any open card overlay
        const cardOverlay = document.getElementById('card-overlay');
        if (cardOverlay) {
            cardOverlay.style.display = 'none';
        }
        
        // Hide timer
        this.hideSuddenDeathTimer();
        
        this.showSuddenDeathCategorySelection();
    }

    handleSurpriseCardInventoryAdded(message) {
        console.log("🎁 Received surprise card inventory added broadcast:", message);
        
        const teamIndex = message.team_index;
        const itemId = message.item_id;
        const itemName = message.item_name;
        const icon = message.icon;
        const surpriseIndex = message.surprise_index;
        
        // Add item to team inventory
        if (!this.teamInventories[teamIndex][itemId]) {
            this.teamInventories[teamIndex][itemId] = 0;
        }
        this.teamInventories[teamIndex][itemId]++;
        
        // Update inventory display
        this.updateInventoryDisplay();
        
        // Show toast notification
        this.showToastNotification(`${this.teamNames[teamIndex]} now have a ${itemName}! 🎁`);
        
        console.log(`🎁 Added ${itemName} to ${this.teamNames[teamIndex]}'s inventory from surprise card ${surpriseIndex}`);
    }

    // async handleGameEnd() {
    //     await this.showModal(null, "Game Terminated by Host", "", "Navigating back...", [], 5);
    //     window.location = `http://${window.location.host}/monopoly/join`;
    // }

    getRandomUnusedAdminSurpriseIndex() {
        const TOTAL = 40;
        // If all cards used, reset pool
        if (this.adminUsedSurpriseIndices.length >= TOTAL) {
            console.log("🃏 All surprise cards used in admin testing – resetting pool");
            this.adminUsedSurpriseIndices = [];
        }
        let index;
        do {
            index = Math.floor(Math.random() * TOTAL);
        } while (this.adminUsedSurpriseIndices.includes(index));
        this.adminUsedSurpriseIndices.push(index);
        return index;
    }
}

window.onload = () => {
    new GameView();
};

GameView.DEFAULT_AVATAR = "/static/images/favicon.png";

GameView.PLAYERS_COLORS = ["#FFD54F", "#90CAF9", "#E0E0E0", "#B39DDB"];