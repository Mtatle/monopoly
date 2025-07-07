from django.conf.urls import url
from django.contrib.auth.decorators import login_required
from django.contrib.auth import views as auth_views

from monopoly.views.game_view import GameView
from monopoly.views.join_view import JoinView
from monopoly.views.login_view import LoginView
from monopoly.views.profile_view import ProfileView
from monopoly.views.team_view import TeamSelectView, AdminPanelView

urlpatterns = [
    url(r'^$', login_required(JoinView.as_view()), name="join"),
    url(r'^game/(?P<host_name>.+)', login_required(GameView.as_view()), name='game'),
    url(r'^logout$', auth_views.logout_then_login, name='logout'),
    url(r'^login', LoginView.as_view(), name='login'),
    url(r'^profile/(?P<profile_user>.+)$', login_required(ProfileView.as_view()), name='profile'),
    url(r'^join/(?P<host_name>.*)', login_required(JoinView.as_view()), name="join"),
    # Team selection & team assignment
    url(r'^team_select$', login_required(TeamSelectView.as_view()), name='team_select'),
    url(r'^select_team$', login_required(TeamSelectView.as_view()), name='select_team'),
    # Admin panel
    url(r'^admin$', login_required(AdminPanelView.as_view()), name='admin'),
    url(r'^.*$', login_required(JoinView.as_view()), name="join"),

]