// COPY AND PASTE THIS ENTIRE BLOCK INTO THE BROWSER CONSOLE

// Force show the modal and dice
function forceShowDiceModal() {
    console.log("=== FORCING DICE MODAL TO SHOW ===");
    
    // Get modal elements
    const modalCard = document.getElementById("modal-card");
    const diceContainer = document.getElementById("dice-container");
    const modalTitle = document.getElementById("modal-title");
    const modalSubtitle = document.getElementById("modal-subtitle");
    const modalMessage = document.getElementById("modal-message-container");
    const modalButtons = document.getElementById("modal-buttons-container");
    
    console.log("Modal elements found:", {
        modalCard: !!modalCard,
        diceContainer: !!diceContainer,
        modalTitle: !!modalTitle,
        modalSubtitle: !!modalSubtitle,
        modalMessage: !!modalMessage,
        modalButtons: !!modalButtons
    });
    
    if (!modalCard) {
        console.error("Modal card not found!");
        return;
    }
    
    // Force modal to be visible
    modalCard.style.display = "block";
    modalCard.style.opacity = "1";
    modalCard.style.visibility = "visible";
    modalCard.style.zIndex = "9999";
    modalCard.style.position = "fixed";
    modalCard.style.top = "50%";
    modalCard.style.left = "50%";
    modalCard.style.transform = "translate(-50%, -50%)";
    modalCard.style.backgroundColor = "white";
    modalCard.style.border = "5px solid red";
    modalCard.style.padding = "20px";
    modalCard.style.width = "400px";
    modalCard.style.height = "500px";
    modalCard.classList.remove("hidden");
    modalCard.classList.remove("modal-hidden");
    
    // Set modal content
    if (modalTitle) modalTitle.innerText = "FORCED TEST MODAL";
    if (modalSubtitle) modalSubtitle.innerText = "Debug Test";
    if (modalMessage) modalMessage.innerHTML = "This modal was forced to show. Look for dice below.";
    
    // Force dice container to be visible
    if (diceContainer) {
        diceContainer.style.display = "block";
        diceContainer.style.visibility = "visible";
        diceContainer.style.width = "100%";
        diceContainer.style.height = "200px";
        diceContainer.style.backgroundColor = "lime";
        diceContainer.style.border = "3px solid green";
        diceContainer.classList.remove("hidden");
        
        // Find dice elements
        const dice1 = diceContainer.querySelector('#dice1');
        const dice2 = diceContainer.querySelector('#dice2');
        const platform = diceContainer.querySelector('#platform');
        
        console.log("Dice elements found:", {
            dice1: !!dice1,
            dice2: !!dice2,
            platform: !!platform
        });
        
        if (platform) {
            platform.style.display = "block";
            platform.style.visibility = "visible";
            platform.style.backgroundColor = "yellow";
            platform.style.border = "2px solid orange";
            platform.style.height = "150px";
            platform.style.width = "100%";
        }
        
        if (dice1) {
            dice1.style.display = "block";
            dice1.style.visibility = "visible";
            dice1.style.backgroundColor = "blue";
            dice1.style.border = "2px solid navy";
            dice1.style.width = "50px";
            dice1.style.height = "50px";
        }
        
        if (dice2) {
            dice2.style.display = "block";
            dice2.style.visibility = "visible";
            dice2.style.backgroundColor = "purple";
            dice2.style.border = "2px solid indigo";
            dice2.style.width = "50px";
            dice2.style.height = "50px";
        }
    }
    
    // Add a test button
    if (modalButtons) {
        modalButtons.innerHTML = '<button style="background: red; color: white; padding: 10px; font-size: 16px;" onclick="alert(\'Button works!\')">TEST BUTTON</button>';
    }
    
    console.log("=== MODAL SHOULD NOW BE VISIBLE ===");
    console.log("If you can't see it, check if there are other CSS rules hiding it.");
}

// Run the test
forceShowDiceModal();
