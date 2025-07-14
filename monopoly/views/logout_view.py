from django.shortcuts import redirect
from django.contrib.auth import logout
from django.views import View


class LogoutView(View):
    def get(self, request, *args, **kwargs):
        username = request.user.username if request.user.is_authenticated else None
        
        if username:
            # Import here to avoid circular imports
            from monopoly.consumers import games, rooms, changehandlers, player_teams
            
            print(f"User '{username}' is logging out")
            
            if username == "admin":
                print(f"Admin '{username}' is logging out - clearing all game state")
                
                # Clear all game data when admin logs out
                games.clear()
                rooms.clear() 
                changehandlers.clear()
                player_teams.clear()
                
                print("All game state cleared due to admin logout")
            else:
                print(f"Regular user '{username}' is logging out")
        
        # Always logout the user
        logout(request)
        return redirect('/supportopoly/login')
