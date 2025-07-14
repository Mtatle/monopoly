"use strict";

/**
 * Spectator View - Watches for game status and allows viewing
 */

class SpectatorView {
    constructor() {
        this.userName = document.getElementById("user-name").value;
        this.hostName = "admin"; // Default host for spectators
        this.gameStarted = false;

        this.initComponents();
        this.initWebSocket();
        this.startLoadingAnimation();
    }

    initComponents() {
        this.$waitingContainer = document.getElementById("waiting-container");
        this.$watchGameButton = document.getElementById("watch-game");
        this.$loadingDots = document.getElementById("loading-dots");
        
        this.$watchGameButton.addEventListener("click", () => {
            this.navigateToGame();
        });
    }

    initWebSocket() {
        // Connect to the admin's join room to listen for game start
        this.socket = new WebSocket(`ws://${window.location.host}/join/${this.hostName}`);

        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleStatusChange(message);
        };

        this.socket.onopen = () => {
            console.log("Spectator connected to game status updates");
        };

        this.socket.onclose = () => {
            console.log("Spectator disconnected");
            // Try to reconnect after a delay
            setTimeout(() => {
                if (!this.gameStarted) {
                    this.initWebSocket();
                }
            }, 3000);
        };
    }

    handleStatusChange(message) {
        if (message.action === "start") {
            this.gameStarted = true;
            this.enableWatching();
        } else if (message.action === "join") {
            // Update waiting message to show players are joining
            this.updateWaitingMessage(message.data);
        }
    }

    updateWaitingMessage(players) {
        const playerCount = players ? players.length : 0;
        const waitingText = document.querySelector('#waiting-container p');
        
        if (playerCount > 0) {
            waitingText.innerHTML = `
                Waiting for the game to start...<br>
                <small>${playerCount} player(s) have joined. Game will start when the admin is ready.</small>
            `;
        }
    }

    enableWatching() {
        this.stopLoadingAnimation();
        
        this.$watchGameButton.disabled = false;
        this.$watchGameButton.style.background = "#4CAF50";
        this.$watchGameButton.innerText = "🎮 Watch Game (Ready!)";
        
        const waitingText = document.querySelector('#waiting-container p');
        waitingText.innerHTML = `
            <strong style="color: #4CAF50;">Game Started! 🎉</strong><br>
            <small>Click below to start watching the game.</small>
        `;
        
        // Auto-navigate after a short delay
        setTimeout(() => {
            this.navigateToGame();
        }, 2000);
    }

    navigateToGame() {
        window.location = `http://${window.location.host}/monopoly/game/${this.hostName}?spectator=true`;
    }

    startLoadingAnimation() {
        const dots = ['⚫⚫⚫', '🔴⚫⚫', '⚫🔴⚫', '⚫⚫🔴', '⚫⚫⚫'];
        let index = 0;
        
        this.loadingInterval = setInterval(() => {
            this.$loadingDots.textContent = dots[index % dots.length];
            index++;
        }, 500);
    }

    stopLoadingAnimation() {
        if (this.loadingInterval) {
            clearInterval(this.loadingInterval);
            this.$loadingDots.textContent = "🎮";
        }
    }
}

window.onload = () => {
    new SpectatorView();
}; 