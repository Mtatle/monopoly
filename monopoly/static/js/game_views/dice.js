"use strict";

class Dice {
    constructor(options) {
        // Don't try to get elements immediately as they might be in a hidden modal
        this.initialized = false;
    }

    initElements() {
        if (!this.initialized) {
            this.platform = document.getElementById('platform');
            this.dice = [document.getElementById('dice1'), document.getElementById('dice2')];
            this.initialized = true;
        }
    }

    roll(callback) {
        this.initElements();
        
        if (!this.platform || !this.dice[0] || !this.dice[1]) {
            console.error("Dice elements not found!");
            // Fallback: just call callback with random dice
            if (callback) {
                const roll1 = Math.floor(Math.random() * 6) + 1;
                const roll2 = Math.floor(Math.random() * 6) + 1;
                callback([roll1, roll2]);
            }
            return;
        }

        this.platform.classList.add('rolling');

        setTimeout(() => {
            this.platform.classList.remove('rolling');

            const roll1 = Math.floor(Math.random() * 6) + 1;
            const roll2 = Math.floor(Math.random() * 6) + 1;

            this.setDiceFace(0, roll1);
            this.setDiceFace(1, roll2);

            if (callback) {
                callback([roll1, roll2]);
            }
        }, 2000);
    }    startAnimation() {
        this.initElements();
        if (this.platform) {
            this.platform.classList.add('rolling');
        }
    }

    stopAnimation() {
        this.initElements();
        if (this.platform) {
            this.platform.classList.remove('rolling');
        }
    }

    setValue(dice) {
        return new Promise(resolve => {
            this.initElements();
            
            if (this.dice[0] && this.dice[1]) {
                this.setDiceFace(0, dice[0]);
                this.setDiceFace(1, dice[1]);
            }
            resolve();
        });
    }

    setDiceFace(diceIndex, face) {
        const diceElement = this.dice[diceIndex];
        if (!diceElement) return;
        
        let x, y;

        switch (face) {
            case 1:
                x = 0;
                y = 0;
                break;
            case 2:
                x = -90;
                y = 0;
                break;
            case 3:
                x = 0;
                y = 90;
                break;
            case 4:
                x = 0;
                y = -90;
                break;
            case 5:
                x = 90;
                y = 0;
                break;
            case 6:
                x = 180;
                y = 0;
                break;
        }

        diceElement.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
    }
}
