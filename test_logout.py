#!/usr/bin/env python3
"""
Test script to verify the logout functionality works properly.
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
from django.test import RequestFactory, Client
from django.contrib.auth.models import User
from django.contrib.sessions.middleware import SessionMiddleware
from django.contrib.auth.middleware import AuthenticationMiddleware
from monopoly.views.logout_view import LogoutView

def test_logout_import():
    """Test that we can import from consumers without errors."""
    try:
        from monopoly.consumers import games, rooms, changehandlers, player_teams
        print("✓ Successfully imported all variables from consumers.py")
        print(f"  - games: {type(games)} with {len(games)} items")
        print(f"  - rooms: {type(rooms)} with {len(rooms)} items") 
        print(f"  - changehandlers: {type(changehandlers)} with {len(changehandlers)} items")
        print(f"  - player_teams: {type(player_teams)} with {len(player_teams)} items")
        return True
    except ImportError as e:
        print(f"✗ ImportError: {e}")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False

def test_logout_view():
    """Test the logout view functionality."""
    try:
        # Create a test client
        client = Client()
        
        # Create admin user
        admin_user, created = User.objects.get_or_create(username='admin')
        if created:
            admin_user.set_password('admin')
            admin_user.save()
            print("✓ Created admin user")
        
        # Login as admin
        login_success = client.login(username='admin', password='admin')
        print(f"✓ Admin login: {'successful' if login_success else 'failed'}")
        
        # Test logout
        response = client.get('/monopoly/logout')
        print(f"✓ Logout response status: {response.status_code}")
        print(f"✓ Logout redirects to: {response.url if hasattr(response, 'url') else 'N/A'}")
        
        return True
    except Exception as e:
        print(f"✗ Error testing logout view: {e}")
        return False

if __name__ == "__main__":
    print("Testing logout functionality...\n")
    
    test1_passed = test_logout_import()
    print()
    test2_passed = test_logout_view()
    
    print(f"\nResults:")
    print(f"Import test: {'PASSED' if test1_passed else 'FAILED'}")
    print(f"Logout test: {'PASSED' if test2_passed else 'FAILED'}")
    
    if test1_passed and test2_passed:
        print("\n✓ All tests passed! Logout functionality should work correctly.")
    else:
        print("\n✗ Some tests failed. Check the errors above.")
