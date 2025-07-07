from django.shortcuts import render, redirect
from django.views import View
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator


@method_decorator(login_required, name='dispatch')
class TeamSelectView(View):
    template_name = 'team_select_view.html'

    def get(self, request, *args, **kwargs):
        # If user is admin, redirect to admin panel
        if request.user.username == "admin":
            return redirect("/monopoly/admin")
            
        return render(request, self.template_name, {
            "user": {
                "name": request.user.username,
            }
        })
        
    def post(self, request, *args, **kwargs):
        # Handle team selection
        team = request.POST.get('team', '1')
        username = request.user.username
        
        # Store team selection in the global player_teams dict
        from monopoly.consumers import player_teams
        player_teams[username] = int(team)
        
        print(f"User {username} selected team {team}")
        print(f"Current player_teams: {player_teams}")
        
        # This will be processed by WebSocket handler
        return JsonResponse({"status": "success", "team": team})


@method_decorator(login_required, name='dispatch')
class AdminPanelView(View):
    template_name = 'admin_view.html'

    def get(self, request, *args, **kwargs):
        # Only allow admin to access this page
        if request.user.username != "admin":
            return redirect("/monopoly/team_select")
            
        # Get current player teams for display
        from monopoly.consumers import player_teams
        
        team1_players = []
        team2_players = []
        
        for player, team in player_teams.items():
            if player != "admin":
                if team == 1:
                    team1_players.append(player)
                else:
                    team2_players.append(player)
            
        return render(request, self.template_name, {
            "team1_players": team1_players,
            "team2_players": team2_players,
        })
