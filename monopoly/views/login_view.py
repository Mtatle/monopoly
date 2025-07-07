from django.shortcuts import render, redirect
from django.views import View
from django.contrib.auth import login
from django.contrib.auth.models import User


class LoginView(View):
    """Simple username-only login.

    If the given username does not exist a new user will be created on-the-fly.
    The special username ``admin`` will be considered the host of the game and
    will be redirected to the join room where the host can start the game. All
    other users are redirected to the team-selection screen.
    """

    template_name = 'login_view.html'

    def get(self, request, *args, **kwargs):
        return render(request, self.template_name, {
            "active_page": "login",
            "error": None,
        })

    def post(self, request, *args, **kwargs):
        username = request.POST.get('username', '').strip()

        if not username:
            return render(request, self.template_name, {
                "active_page": "login",
                "error": "Username is required."
            })

        # Retrieve or create the user. We do **not** use a password – authentication
        # is purely based on the provided username for the purpose of this project.
        user, _ = User.objects.get_or_create(username=username)

        # Django needs a backend set on the user instance when logging in
        user.backend = 'django.contrib.auth.backends.ModelBackend'
        login(request, user)

        # Host vs player routing
        if username.lower() == 'admin':
            return redirect('/monopoly/admin')
        else:
            return redirect('/monopoly/team_select')

