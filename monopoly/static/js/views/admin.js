"use strict";

class AdminView {
    constructor() {
        this.initWebSocket();
    }

    initWebSocket() {
        const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
        this.socket = new WebSocket(
            wsScheme + "://" + window.location.host + "/monopoly/join/admin"
        );
        
        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log("Received message:", data);
        };
        
        this.socket.onclose = (event) => {
            console.log("WebSocket connection closed");
            // Reconnect after a delay
            setTimeout(() => this.initWebSocket(), 2000);
        };
    }

    startGame() {
        this.socket.send(JSON.stringify({
            action: "start"
        }));
    }
}

// Initialize when the page is loaded
document.addEventListener("DOMContentLoaded", () => {
    window.adminView = new AdminView();
});
