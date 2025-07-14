from django.shortcuts import render
from django.views import View


class GameView(View):
    template_name = 'game_view.html'

    def get(self, request, *args, **kwargs):
        # Check if user is a spectator
        is_spectator = request.GET.get('spectator', 'false').lower() == 'true'
        
        return render(request, self.template_name, {
            "username": request.user.username,
            "hostname": kwargs.get("host_name"),
            "is_spectator": is_spectator
        })
