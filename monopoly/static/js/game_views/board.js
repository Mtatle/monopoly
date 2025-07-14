"use strict";

class Board {

    constructor() {
        this.initBoard();
    }

    initBoard() {
        this.board = [];
        for (let row = 0; row < Board.SIZE; row++) {
            let boardRow = [];
            for (let col = 0; col < Board.SIZE; col++) {
                boardRow.push({
                    players: [false, false, false, false],
                    propertyManager: null
                })
            }
            this.board.push(boardRow);
        }
    }

    updateTileInfo(tileId, tileInfo) {
        const pos = Board.tileIdToPos(tileId);
        const {type, action, playerIndex, options} = tileInfo;
        switch (type) {
            case BoardController.MODEL_PLAYER:
                this.board[pos[0]][pos[1]].players[playerIndex] = (action === "add");
                break;
            case BoardController.MODEL_PROPERTY:
                this.board[pos[0]][pos[1]].propertyManager = new PropertyManager(options);
                break;
        }
    }

    getTileInfo(tileId) {
        const pos = Board.tileIdToPos(tileId);
        return this.board[pos[0]][pos[1]];
    }

    static tileIdToPos(tileId) {
        if (tileId < 7) {
            return [6, 6 - tileId];  // Bottom row: right to left (0=bottom-right)
        } else if (tileId < 12) {
            return [12 - tileId, 0]; // Left column: bottom to top (7-11)
        } else if (tileId < 18) {
            return [0, tileId - 12]; // Top row: left to right (12-17)
        } else {
            return [tileId - 18, 6]; // Right column: top to bottom (18-23)
        }
    }

    static posToTileId(row, col) {
        if (row === 6) {
            return 6 - col;   // Bottom row: right to left (0-6)
        } else if (row === 0) {
            return 12 + col;  // Top row: left to right (12-17)
        } else if (col === 0) {
            return 12 - row;  // Left column: bottom to top (7-11)
        } else if (col === 6) {
            return 18 + row;  // Right column: top to bottom (18-23)
        } else {
            return -1;        // Interior tiles (not playable)
        }
    }

    static tileIdToSide(tileId) {
        if (tileId < 7) {
            return Board.SIDE_BOTTOM;  // Tiles 0-6: bottom row
        } else if (tileId < 12) {
            return Board.SIDE_LEFT;    // Tiles 7-11: left column
        } else if (tileId < 18) {
            return Board.SIDE_TOP;     // Tiles 12-17: top row
        } else {
            return Board.SIDE_RIGHT;   // Tiles 18-23: right column
        }
    }
}

Board.SIZE = 7;

Board.SIDE_TOP = 2;
Board.SIDE_LEFT = 1;
Board.SIDE_RIGHT = 3;
Board.SIDE_BOTTOM = 0;