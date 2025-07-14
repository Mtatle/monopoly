"use strict";

class GameController {

    constructor(options) {
        this.initGame(options);
    }

    initGame(options) {
        const {containerEl, assetsUrl, onBoardPainted} = options;

        this.boardController = new BoardController({
            containerEl: containerEl,
            assetsUrl: assetsUrl
        });

        this.boardController.drawBoard(onBoardPainted);
    }

    addPlayer(count, initPos) {
        return this.boardController.drawPlayers(count, initPos);
    }

    movePlayer(playerIndex, newTileId) {
        // TODO: change viewport
        this.boardController.movePlayer(playerIndex, newTileId);
    }

    addProperty(type, tileId, playerIndex) {
        if (type === PropertyManager.PROPERTY_OWNER_MARK) {
            this.boardController.addLandMark(playerIndex, tileId);
        } else {
            this.boardController.addProperty(type, tileId);
        }
    }

    removeProperty(type, tileId) {
        if (type === PropertyManager.PROPERTY_OWNER_MARK) {
            this.boardController.removeLandMark(tileId);
        }
        // Note: Houses/hotels are removed via PropertyManager.clearAll() during board reset
    }

    resizeBoard() {
        this.boardController.resize();
    }

    clearAllProperties() {
        this.boardController.clearAllProperties();
    }
}
