"use strict";

class Player {

    constructor(options) {
        const {index, modelUrl, scene, initPos, initTileId} = options;

        this.scene = scene;
        this.index = index;

        this.modelUrl = modelUrl;
        this.initPos = initPos;
        this.tileId = initTileId;
    }

    load() {
        return new Promise((resolve => {
            new THREE.ObjectLoader().load(
                this.modelUrl,

                (obj) => {
                    // Add the loaded object to the scene
                    this.model = obj;
                    this.model.position.set(this.initPos[0], Player.ELEVATION[this.index], this.initPos[2]);
                    this.model.scale.set(...Player.SCALES[this.index]);
                    
                    // Fix Mario texture for player 0 (Team 1)
                    if (this.index === 0) {
                        console.log("🎮 Player 0 detected - applying Mario texture fix");
                        this.fixMarioTexture();
                    } else {
                        console.log(`🎮 Player ${this.index} - no texture fix needed`);
                    }
                    
                    this.scene.add(this.model);
                },

                // onProgress callback
                (xhr) => {
                    if (xhr.loaded === xhr.total) {
                        console.log(this.modelUrl + " loaded!");
                        resolve();
                    }
                },

                // onError callback
                (err) => {
                    console.error(err);
                });
        }))
    }

    advanceTo(newTileId, newPos) {
        this.model.position.set(newPos[0], Player.ELEVATION[this.index], newPos[2]);
        this.tileId = newTileId;
    }

    getTileId() {
        return this.tileId;
    }

    fixMarioTexture() {
        // Load Mario texture and apply it to the model
        const textureLoader = new THREE.TextureLoader();
        const marioTexture = textureLoader.load(
            `${this.modelUrl.replace('model.json', 'marioD.jpg')}`,
            // onLoad callback
            (texture) => {
                console.log("🎮 Mario texture loaded successfully");
                
                // Apply Mario texture to all materials in the model
                this.model.traverse((child) => {
                    if (child.isMesh && child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(material => {
                                // Force Mario texture regardless of existing map
                                material.map = texture;
                                material.needsUpdate = true;
                            });
                        } else {
                            // Force Mario texture regardless of existing map
                            child.material.map = texture;
                            child.material.needsUpdate = true;
                        }
                    }
                });
                
                console.log("🎮 Applied Mario texture to player 0");
            },
            // onProgress callback
            (xhr) => {
                console.log("🎮 Loading Mario texture...", (xhr.loaded / xhr.total * 100) + '% loaded');
            },
            // onError callback
            (error) => {
                console.error("🎮 Error loading Mario texture:", error);
            }
        );
    }
}

Player.SCALES = [
    [0.04, 0.04, 0.04],
    [1.5, 1.5, 1.5],
    [0.03, 0.03, 0.03],
    [0.03, 0.03, 0.03]
];

Player.ELEVATION = [2.5, 2.0, 0, 0];