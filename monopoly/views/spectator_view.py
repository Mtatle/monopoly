from django.shortcuts import render
from django.views import View
from monopoly.models import Profile


class SpectatorView(View):
    template_name = 'spectator_view.html'

    def get(self, request, *args, **kwargs):
        user = request.user
        
        try:
            profile = Profile.objects.get(user=user)
        except Exception:
            profile = None

        return render(request, self.template_name, {
            "user": {
                "name": user.username,
                "avatar": profile.avatar.url if profile else ""
            },
            "active_page": "spectator"
        }) 