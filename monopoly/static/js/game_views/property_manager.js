"use strict";

class PropertyManager {

    constructor(options) {
        const {loadedHotelJson, loadedHouseJson, scene} = options;

        this.scene = scene;
        this.loadedHotelJson = loadedHotelJson;
        this.loadedHouseJson = loadedHouseJson;
        this.models = [];
        this.landMark = null; // Track the land mark (ownership marker)
    }

    buyLand(pos, tileId, playerIndex) {
        // Remove existing land mark if any
        this.removeLandMark();
        
        const material = new THREE.MeshBasicMaterial({
            map: new THREE.TextureLoader().load(`/static/images/player_${playerIndex}_mark.png`),
            transparent: true
        });
        let square = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);

        const side = Board.tileIdToSide(tileId);
        let x = pos[0], y = 0.01, z = pos[2];

        square.scale.set(1.5, 1.5, 1.5);
        square.position.set(x, y, z);
        square.rotation.x = -Math.PI / 2.0;
        square.rotation.z = -Math.PI / 2.0 * side;

        this.scene.add(square);
        this.landMark = square; // Track the land mark
    }

    removeLandMark() {
        if (this.landMark) {
            this.scene.remove(this.landMark);
            this.landMark = null;
        }
    }

    buildHouse(pos, tileId) {
        let loader = new THREE.ObjectLoader();
        let model = loader.parse(this.loadedHouseJson);

        const side = Board.tileIdToSide(tileId);

        model.position.set(pos[0], PropertyManager.ELEVATION[PropertyManager.PROPERTY_HOUSE], pos[2]);
        model.scale.set(...PropertyManager.SCALES[PropertyManager.PROPERTY_HOUSE]);
        model.rotation.y = -Math.PI / 2.0 * (side + 3);
        this.scene.add(model);

        this.models.push(model);
    }

    buildHotel(pos, tileId) {
        // Remove all houses first
        for (let model of this.models) {
            this.scene.remove(model);
        }

        let x = pos[0], y = PropertyManager.ELEVATION[PropertyManager.PROPERTY_HOTEL], z = pos[2];

        let loader = new THREE.ObjectLoader();
        let model = loader.parse(this.loadedHotelJson);
        model.position.set(x, y, z);
        model.scale.set(...PropertyManager.SCALES[PropertyManager.PROPERTY_HOTEL]);
        this.scene.add(model);

        this.models = [model];
    }

    getPropertyCount() {
        return this.models.length;
    }

    clearAll() {
        // Remove all houses and hotels
        for (let model of this.models) {
            this.scene.remove(model);
        }
        this.models = [];
        
        // Remove land mark (ownership marker)
        this.removeLandMark();
    }
}

PropertyManager.SCALES = [
    [0.02, 0.02, 0.02],
    [0.003, 0.003, 0.003]
];

PropertyManager.ELEVATION = [0.31, 0.0];

PropertyManager.PROPERTY_HOUSE = 0;
PropertyManager.PROPERTY_HOTEL = 1;
PropertyManager.PROPERTY_OWNER_MARK = 2;
PropertyManager.HOTEL_MARGIN = 0;
PropertyManager.MARK_MARGIN = 0;