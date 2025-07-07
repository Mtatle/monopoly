#!/usr/bin/env python3
"""
Test script to verify dice modal functionality.

This script will help debug the dice modal visibility issue.
"""

import time
import webbrowser
import sys
import os

# Add the Django project to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def main():
    print("=== DICE MODAL DEBUG TEST ===")
    print()
    print("This test will help you debug the dice modal visibility issue.")
    print()
    print("STEPS TO TEST:")
    print("1. Make sure the Django server is running (python manage.py runserver)")
    print("2. Open the game in your browser")
    print("3. Start a game as admin")
    print("4. Open the browser console (F12)")
    print("5. Type: testDiceModal()")
    print("6. Press Enter")
    print()
    print("WHAT YOU SHOULD SEE:")
    print("- A modal with title 'TEST DICE MODAL'")
    print("- Green border around dice container")
    print("- Red border around platform")
    print("- Blue border around dice elements")
    print("- A 'Test Roll' button")
    print()
    print("IF YOU DON'T SEE THE MODAL:")
    print("- Check browser console for errors")
    print("- Make sure debug_dice.css is loaded")
    print("- Try refreshing the page")
    print()
    print("DEBUGGING CSS:")
    print("The debug_dice.css file forces all elements to be visible with:")
    print("- display: block !important")
    print("- visibility: visible !important")
    print("- Bright colored borders for identification")
    print()
    
    # Ask if user wants to open browser
    response = input("Do you want me to open the game URL in your browser? (y/n): ").lower()
    if response == 'y':
        url = "http://localhost:8000/monopoly/join"
        print(f"Opening {url}...")
        webbrowser.open(url)
        print("Browser opened. Follow the steps above to test the dice modal.")
    else:
        print("Please manually navigate to: http://localhost:8000/monopoly/join")
    
    print()
    print("=== TEST COMPLETE ===")

if __name__ == "__main__":
    main()
