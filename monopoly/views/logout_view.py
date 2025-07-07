from django.shortcuts import redirect
from django.contrib.auth import logout
from django.views import View


class LogoutView(View):
    def get(self, request, *args, **kwargs):
        username = request.user.username if request.user.is_authenticated else None
        
        # Clear game state if admin is logging out
        if username == "admin":
            # Import here to avoid circular imports
            from monopoly.consumers import games, rooms, changehandlers, player_teams
            
            print(f"Admin '{username}' is logging out - clearing all game state")
            
            # Clear all game data
            games.clear()
            rooms.clear() 
            changehandlers.clear()
            player_teams.clear()
            
            print("All game state cleared due to admin logout")
        
        logout(request)
        return redirect("/monopoly/login")
