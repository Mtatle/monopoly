from django.shortcuts import render, redirect
from django.views import View
from django.contrib.auth import login
from django.contrib.auth.models import User
from django.http import JsonResponse
import re


class LoginView(View):
    """Simple username-only login.

    If the given username does not exist a new user will be created on-the-fly.
    The special username ``admin`` will be considered the host of the game and
    will be redirected to the join room where the host can start the game. All
    other users are redirected to the team-selection screen.
    """

    template_name = 'login_view.html'

    def get(self, request, *args, **kwargs):
        # Force logout if user is already logged in (fix refresh issue)
        if request.user.is_authenticated:
            from django.contrib.auth import logout
            logout(request)
            request.session.flush()  # Clear session completely
        
        # Check for rejoin parameter
        username = request.GET.get('rejoin_as')
        show_rejoin = False
        rejoin_username = None
        
        if username:
            # Check if there's an active game and if this user was in it
            can_rejoin, game_info = self.can_user_rejoin_game(username)
            if can_rejoin:
                show_rejoin = True
                rejoin_username = username
            
        return render(request, self.template_name, {
            "active_page": "login",
            "error": None,
            "show_rejoin": show_rejoin,
            "rejoin_username": rejoin_username,
        })

    def post(self, request, *args, **kwargs):
        username = request.POST.get('username', '').strip()
        rejoin_action = request.POST.get('rejoin_action')

        if not username:
            return render(request, self.template_name, {
                "active_page": "login",
                "error": "Username is required."
            })

        # Handle rejoin action
        if rejoin_action == 'rejoin':
            return self.handle_rejoin(request, username)

        # Retrieve or create the user. We do **not** use a password – authentication
        # is purely based on the provided username for the purpose of this project.
        user, _ = User.objects.get_or_create(username=username)

        # Django needs a backend set on the user instance when logging in
        user.backend = 'django.contrib.auth.backends.ModelBackend'
        login(request, user)

        # Check if user can rejoin an active game before normal flow (but exclude admin)
        if username.lower() != 'admin':
            can_rejoin, game_info = self.can_user_rejoin_game(username)
            if can_rejoin:
                print(f"User {username} can rejoin active game")
                return redirect('/supportopoly/game/admin')

        # Host vs player vs spectator routing
        if username.lower() == 'admin':
            return redirect('/supportopoly/admin')
        elif re.match(r'^spec\d+$', username.lower()):
            # Spectator usernames: spec followed by numbers (spec1, spec2, etc.)
            return redirect('/supportopoly/spectator')
        else:
            return redirect('/supportopoly/team_select')

    def handle_rejoin(self, request, username):
        """Handle rejoining an active game"""
        can_rejoin, game_info = self.can_user_rejoin_game(username)
        
        if not can_rejoin:
            return render(request, self.template_name, {
                "active_page": "login",
                "error": "Cannot rejoin - no active game found or you weren't in the game."
            })
        
        # Create/get user and log them in
        user, _ = User.objects.get_or_create(username=username)
        user.backend = 'django.contrib.auth.backends.ModelBackend'
        login(request, user)
        
        print(f"User {username} rejoining active game")
        
        # Rejoin the appropriate room based on user type
        if username.lower() == 'admin':
            return redirect('/supportopoly/admin')
        elif re.match(r'^spec\d+$', username.lower()):
            return redirect('/supportopoly/spectator') 
        else:
            # Regular player - rejoin the game directly
            return redirect('/supportopoly/game/admin')

    def can_user_rejoin_game(self, username):
        """Check if a user can rejoin an active game"""
        try:
            # Import here to avoid circular imports
            from monopoly.consumers import games, rooms, player_teams
            from monopoly.core.game_state_type import GameStateType
            
            # Check if there's an active game
            if "admin" not in games:
                return False, "No active game"
            
            game = games["admin"]
            
            # Check if game is actually active (not ended)
            if game.get_game_status() == GameStateType.GAME_ENDED:
                return False, "Game has ended"
            
            # Check if user was in this game
            if re.match(r'^spec\d+$', username.lower()):
                # Spectators can always rejoin if there's an active game
                return True, "Spectator can rejoin"
            else:
                # Regular players need to have been in player_teams
                if username in player_teams:
                    return True, f"Player was in team {player_teams[username]}"
                else:
                    return False, "Player was not in the game"
            
        except Exception as e:
            print(f"Error checking rejoin status: {e}")
            return False, f"Error: {str(e)}"


class CheckActiveGameView(View):
    """API endpoint to check if there's an active game and return rejoinable users"""
    
    def get(self, request, *args, **kwargs):
        try:
            from monopoly.consumers import games, rooms, player_teams
            from monopoly.core.game_state_type import GameStateType
            
            # Check if there's an active game
            if "admin" not in games:
                return JsonResponse({
                    "has_active_game": False,
                    "rejoinable_users": []
                })
            
            game = games["admin"]
            
            # Check if game is actually active (not ended)
            if game.get_game_status() == GameStateType.GAME_ENDED:
                return JsonResponse({
                    "has_active_game": False,
                    "rejoinable_users": []
                })
            
            # Build list of users who can rejoin (only those who were in the game)
            rejoinable_users = []
            
            # Add all players who were in the game (excluding admin)
            for username in player_teams.keys():
                if username.lower() != "admin" and username not in rejoinable_users:
                    rejoinable_users.append(username)
            
            # Only show spectators if there are rooms with spectators
            if "admin" in rooms:
                for user in rooms["admin"]:
                    if re.match(r'^spec\d+$', user.lower()) and user not in rejoinable_users:
                        rejoinable_users.append(user)
            
            return JsonResponse({
                "has_active_game": True,
                "rejoinable_users": rejoinable_users,
                "game_status": "active",
                "current_players": len(player_teams),
                "total_room_users": len(rooms.get("admin", set())) if "admin" in rooms else 0
            })
            
        except Exception as e:
            print(f"Error in CheckActiveGameView: {e}")
            return JsonResponse({
                "has_active_game": False,
                "rejoinable_users": [],
                "error": str(e)
            })

