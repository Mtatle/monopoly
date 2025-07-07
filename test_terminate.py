#!/usr/bin/env python3
"""
Test script to verify the terminate game functionality works properly.
"""

import os
import sys
import django

# Add the project directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'webapps.settings')
django.setup()

# Now we can import Django modules
from monopoly.ws_handlers.game_handler import handle_end_game
from monopoly.consumers import games, rooms, changehandlers, player_teams
from monopoly.core.game import Game

def test_end_game_handler():
    """Test the end game handler functionality."""
    try:
        print("Testing end game handler...")
        
        # Setup test data
        hostname = "test_room"
          # Create a mock game
        test_game = Game(4)  # Create with 4 players
        games[hostname] = test_game
        rooms[hostname] = ["admin", "player1", "player2"]
        changehandlers[hostname] = {}
        player_teams[hostname] = {"admin": "red", "player1": "blue", "player2": "green"}
        
        print(f"Before end_game - games: {len(games)}, rooms: {len(rooms)}")
        print(f"Before end_game - player_teams: {len(player_teams)}, changehandlers: {len(changehandlers)}")
        
        # Call the end game handler
        result = handle_end_game(hostname, games)
        
        print(f"After end_game - games: {len(games)}, rooms: {len(rooms)}")
        print(f"After end_game - player_teams: {len(player_teams)}, changehandlers: {len(changehandlers)}")
        
        # Check if game was properly cleaned up
        game_cleaned = hostname not in games
        room_cleaned = hostname not in rooms
        
        print(f"✓ Game cleaned up: {game_cleaned}")
        print(f"✓ Room cleaned up: {room_cleaned}")
        
        return game_cleaned and room_cleaned
        
    except Exception as e:
        print(f"✗ Error testing end game handler: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_game_js_terminate_button():
    """Check if the game.js has proper terminate button setup."""
    try:
        # Read the game.js file
        game_js_path = os.path.join("monopoly", "static", "js", "views", "game.js")
        
        with open(game_js_path, 'r') as f:
            content = f.read()
        
        # Check for required components
        has_admin_check = 'this.isAdmin' in content
        has_exit_control = 'exit-control' in content
        has_end_game_function = 'endGame()' in content
        has_end_game_action = '"end_game"' in content
        has_terminate_confirm = 'terminate the game' in content
        
        print(f"✓ Admin check present: {has_admin_check}")
        print(f"✓ Exit control element: {has_exit_control}")
        print(f"✓ EndGame function: {has_end_game_function}")
        print(f"✓ End game action: {has_end_game_action}")
        print(f"✓ Terminate confirmation: {has_terminate_confirm}")
        
        return all([has_admin_check, has_exit_control, has_end_game_function, 
                   has_end_game_action, has_terminate_confirm])
        
    except Exception as e:
        print(f"✗ Error checking game.js: {e}")
        return False

def test_template_exit_button():
    """Check if the game view template has the exit button."""
    try:
        template_path = os.path.join("monopoly", "templates", "game_view.html")
        
        with open(template_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        has_exit_control = 'id="exit-control"' in content
        has_data_attribute = 'data-is-admin' in content
        
        print(f"✓ Exit control in template: {has_exit_control}")
        print(f"✓ Admin data attribute: {has_data_attribute}")
        
        return has_exit_control and has_data_attribute
        
    except Exception as e:
        print(f"✗ Error checking template: {e}")
        return False

if __name__ == "__main__":
    print("Testing terminate game functionality...\n")
    
    test1_passed = test_end_game_handler()
    print()
    test2_passed = test_game_js_terminate_button()
    print()
    test3_passed = test_template_exit_button()
    
    print(f"\nResults:")
    print(f"End game handler test: {'PASSED' if test1_passed else 'FAILED'}")
    print(f"Game.js terminate button test: {'PASSED' if test2_passed else 'FAILED'}")
    print(f"Template exit button test: {'PASSED' if test3_passed else 'FAILED'}")
    
    if test1_passed and test2_passed and test3_passed:
        print("\n✓ All tests passed! Terminate game functionality should work correctly.")
    else:
        print("\n✗ Some tests failed. Check the errors above.")
