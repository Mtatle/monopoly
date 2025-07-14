from channels import Group
from django.core import serializers
from django.contrib.auth.decorators import login_required
from channels.auth import http_session_user, channel_session_user, \
    channel_session_user_from_http
from monopoly.models import Profile
from django.contrib.auth.models import User
from .core.game import *

import json
from monopoly.ws_handlers.game_handler import *
from monopoly.ws_handlers.game_change_handler import *

# Connected to websocket.connect
# @login_required

rooms = {}
games = {}
changehandlers = {}
player_teams = {}  # maps username -> team number chosen in team selection





# @login_required
@channel_session_user_from_http
def ws_add(message):
    # Accept the connection
    print('ws_add invoked')
    message.reply_channel.send({"accept": True})
    mypath = message.content['path']
    print('path is', mypath)
    if 'join' in mypath:
        ws_connect_for_join(message)
    # elif 'start' in mypath:
    #     ws_connect_for_start(message)
    elif 'game' in mypath:
        ws_connect_for_game(message, rooms, games)


@channel_session_user_from_http
def ws_connect_for_join(message):
    print('now is connecting for join')
    print('client is', message.user.username)
    path = message.content['path']
    # hostname = path[1:-2]
    print('path is: ', path)
    fields = path.split('/')

    hostname = fields[-1]
    print('hostname is', hostname)

    message.reply_channel.send({"accept": "True"})

    # Add to the chat group
    room_name = hostname
    player_name = message.user.username
    print('user is: ', message.user)
    print('player name: ', player_name)
    print('room name: ', room_name)
    if not add_player(room_name, player_name):
        message.reply_channel.send({
            "text": build_join_failed_msg()
        })
        print('failed to join')
        return

    Group(hostname).add(message.reply_channel)

    # # response_text = serializers.serialize('json', Item.objects.all())
    userlist = []
    Group(hostname).send({
        "text": build_join_reply_msg(room_name)
    })
    print('join finished')


def ws_message(message):
    msg = json.loads(message.content["text"])
    action = msg["action"]
    path = message.content['path']
    fields = path.split('/')
    hostname = fields[-1]
    print('action is: ', action)
    print('hostname is: ', hostname)

    if action == "start":
        handle_start(hostname)
    if action == "roll":
        handle_roll(hostname, games, changehandlers)
    if action == "confirm_decision":
        handle_confirm_decision(hostname, games)
    if action == "cancel_decision":
        handle_cancel_decision(hostname, games)
    if action == "chat":
        handle_chat(hostname, msg)
    if action == "admin_move":
        player_index = msg.get("player_index")
        tile_index = msg.get("tile_index")
        handle_admin_move(hostname, games, player_index, tile_index)
    if action == "admin_modify_money":
        player_index = msg.get("player_index")
        amount = msg.get("amount")
        handle_admin_modify_money(hostname, games, player_index, amount)
    if action == "admin_modify_points":
        player_index = msg.get("player_index")
        amount = msg.get("amount")
        handle_admin_modify_points(hostname, games, player_index, amount)
    if action == "admin_rent_money":
        player_index = msg.get("player_index")
        amount = msg.get("amount")
        handle_admin_rent_money(hostname, games, player_index, amount)
    if action == "admin_reset_game":
        handle_admin_reset_game(hostname, games, rooms)
    if action == "admin_test_card":
        card_type = msg.get("card_type")
        tile_id = msg.get("tile_id")
        question_index = msg.get("question_index")  # May be None for surprise cards
        surprise_index = msg.get("surprise_index")  # May be None for question cards
        # Additional parameters for new tile types
        player_index = msg.get("player_index")
        cost = msg.get("cost")
        reward = msg.get("reward")
        tile_name = msg.get("tile_name")
        handle_admin_test_card(hostname, card_type, tile_id, question_index, surprise_index, 
                             player_index, cost, reward, tile_name)
    if action == "admin_set_turn":
        player_index = msg.get("player_index")
        handle_admin_set_turn(hostname, games, player_index)
    if action == "admin_set_ownership":
        tile_index = msg.get("tile_index")
        owner_index = msg.get("owner_index")
        handle_admin_set_ownership(hostname, games, tile_index, owner_index)
    if action == "dice_animation_start":
        handle_dice_animation_start(hostname)
    if action == "card_flipped":
        handle_card_flipped(hostname)
    if action == "card_closed":
        handle_card_closed(hostname)
    if action == "start_sudden_death":
        handle_start_sudden_death(hostname)
    if action == "show_sudden_death_card":
        question_index = msg.get("question_index")
        handle_show_sudden_death_card(hostname, question_index)
    if action == "show_sudden_death_category_selection":
        handle_show_sudden_death_category_selection(hostname)
    if action == "select_sudden_death_category":
        category = msg.get("category")
        question_index = msg.get("question_index")
        handle_select_sudden_death_category(hostname, category, question_index)
    if action == "start_sudden_death_timer":
        handle_start_sudden_death_timer(hostname)
    if action == "reset_sudden_death_timer":
        handle_reset_sudden_death_timer(hostname)
    if action == "start_question_card_timer":
        handle_start_question_card_timer(hostname)
    if action == "reset_question_card_timer":
        handle_reset_question_card_timer(hostname)
    if action == "shop_opened":
        handle_shop_opened(hostname)
    if action == "shop_closed":
        handle_shop_closed(hostname)
    if action == "item_purchased":
        item = msg.get("item")
        team_index = msg.get("team_index")
        updated_team_cash = msg.get("updated_team_cash")
        handle_item_purchased(hostname, item, team_index, updated_team_cash)
    if action == "item_used":
        item = msg.get("item")
        team_index = msg.get("team_index")
        handle_item_used(hostname, item, team_index)
    if action == "item_usage_modal_opened":
        item = msg.get("item")
        team_index = msg.get("team_index")
        handle_item_usage_modal_opened(hostname, item, team_index)
    if action == "item_usage_modal_closed":
        handle_item_usage_modal_closed(hostname)
    if action == "surprise_card_inventory_added":
        team_index = msg.get("team_index")
        item_id = msg.get("item_id")
        item_name = msg.get("item_name")
        icon = msg.get("icon")
        surprise_index = msg.get("surprise_index")
        handle_surprise_card_inventory_added(hostname, team_index, item_id, item_name, icon, surprise_index)
    if action == "show_leaderboard":
        handle_show_leaderboard(hostname)
    if action == "close_leaderboard":
        handle_close_leaderboard(hostname)
    if action == "end_game":
        handle_end_game(hostname, games)
        if hostname in games:
            del games[hostname]
        if hostname in rooms:
            del rooms[hostname]
        if hostname in changehandlers:
            del changehandlers[hostname]
    if action == "sudden_death_update_score":
        team_index = msg.get("team_index")
        score = msg.get("score")
        handle_sudden_death_update_score(hostname, team_index, score)
    if action == "sudden_death_next_card":
        category = msg.get("category")
        question_index = msg.get("question_index")
        handle_sudden_death_next_card(hostname, category, question_index)
    if action == "sudden_death_show_category_menu":
        handle_sudden_death_show_category_menu(hostname)
    if action == "start_sudden_death_blitz":
        category = msg.get("category")
        team_index = msg.get("team_index")
        handle_start_sudden_death_blitz(hostname, category, team_index)


# @login_required
def ws_disconnect(message):
    Group('5').discard(message.reply_channel)


def ws_connect_for_start(message):
    print('now is connecting for start')


def build_start_msg():
    ret = {"action": "start"}
    print(json.dumps(ret))
    return json.dumps(ret)


def build_join_failed_msg():
    ret = {"action": "fail_join",
    }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_join_reply_msg(room_name):
    players = rooms[room_name]
    print('players: ', players)
    data = []
    for player in players:
        print('player is: ', player)
        profile_user = User.objects.get(username=player)
        print('profile user: ', profile_user.username)
        try:
            profile = Profile.objects.get(user=profile_user)
        except Exception:
            profile = None
        avatar = profile.avatar.url if profile else ""
        data.append({"id": profile_user.id, "name": player, "avatar": avatar})

    ret = {"action": "join",
           "data": data
           }
    print(json.dumps(ret))
    return json.dumps(ret)


def add_player(room_name, player_name):
    if room_name not in rooms:
        rooms[room_name] = set()
        rooms[room_name].add(room_name)

    # No hard cap on the number of players anymore.

    rooms[room_name].add(player_name)
    return True


def is_spectator(username):
    """Check if a username is a spectator (spec1, spec2, etc.)"""
    import re
    return re.match(r'^spec\d+$', username.lower()) is not None


def handle_start(hostname):
    print(f"handle_start called with hostname: {hostname}")
    
    # ALWAYS START FRESH - Clear any existing game state
    if hostname in games:
        print("Clearing existing game state for fresh start")
        del games[hostname]
    if hostname in changehandlers:
        print("Clearing existing change handlers for fresh start")
        del changehandlers[hostname]
    
    # Always create a 2-team game (Team 1 and Team 2)
    all_users = rooms[hostname] if hostname in rooms else {hostname}
    non_spectators = [user for user in all_users if not is_spectator(user)]
    player_num = 2  # Always 2 teams regardless of how many people join
    
    print(f"Total users in room: {len(all_users)}")
    print(f"Non-spectator users: {len(non_spectators)}")
    print(f"Creating 2-team game: Team 1 (Mario) and Team 2 (Penguin)")
    
    try:
        game = Game(player_num)
        games[hostname] = game
        print("NEW Game object created successfully")

        change_handler = ChangeHandler(game, hostname)
        game.add_game_change_listner(change_handler)
        changehandlers[hostname] = change_handler
        print("Change handler added successfully")
    except Exception as e:
        print(f"Error creating game: {e}")
        import traceback
        traceback.print_exc()
        return

    Group(hostname).send({
        "text": build_start_msg()
    })
    print(len(games))
    print("start finish")


def handle_card_flipped(hostname):
    """Handle card flip synchronization across all clients"""
    print(f"Card flipped in room {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "card_flipped"
        })
    })


def handle_card_closed(hostname):
    """Handle card close synchronization across all clients"""
    print(f"Card closed in room {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "card_closed"
        })
    })


def handle_admin_test_card(hostname, card_type, tile_id, question_index, surprise_index, 
                         player_index=None, cost=None, reward=None, tile_name=None):
    """Handle admin card testing and tile actions - broadcast to all clients"""
    print(f"Admin testing card in room {hostname}: {card_type} tile {tile_id} question_index {question_index} surprise_index {surprise_index}")
    if player_index is not None:
        print(f"Additional params: player_index {player_index}, cost {cost}, reward {reward}, tile_name {tile_name}")
    
    message = {
        "action": "admin_test_card",
        "card_type": card_type,
        "tile_id": tile_id
    }
    
    # Add question_index only if it's provided (for question cards)
    if question_index is not None:
        message["question_index"] = question_index
    
    # Add surprise_index only if it's provided (for surprise cards)
    if surprise_index is not None:
        message["surprise_index"] = surprise_index
    
    # Add additional parameters for new tile types
    if player_index is not None:
        message["player_index"] = player_index
    if cost is not None:
        message["cost"] = cost
    if reward is not None:
        message["reward"] = reward
    if tile_name is not None:
        message["tile_name"] = tile_name
    
    Group(hostname).send({
        "text": json.dumps(message)
    })


def handle_admin_set_turn(hostname, games, player_index):
    """Handle admin setting whose turn it is"""
    print(f"Admin setting turn to player {player_index} in room {hostname}")
    
    if hostname in games:
        game = games[hostname]
        # Update the game's current player using the admin-specific method
        # that accounts for natural turn progression
        adjusted_index = game.admin_set_current_player_index(player_index)
        print(f"Game current player adjusted to: {adjusted_index} (intended: {player_index})")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "admin_set_turn",
            "player_index": player_index
        })
    })


def handle_admin_set_ownership(hostname, games, tile_index, owner_index):
    """Handle admin tile ownership setting"""
    print(f"Admin setting tile {tile_index} ownership to {owner_index} in room {hostname}")
    
    if hostname not in games:
        print(f"No game found for hostname {hostname}")
        return
    
    game = games[hostname]
    
    # Map tile indices to names
    tile_names = {
        1: "Empathy Lane",
        4: "Knowledge Knoll", 
        7: "Escalation Ave",
        8: "Riddleton Place",
        11: "Sale-A-Vie Blvd",
        14: "Knowledge Square",
        17: "Problem Plaza",
        19: "Inquiry Inspections",
        20: "Training Time",
        21: "Coupon Court",
        22: "Resolution Road"
    }
    
    tile_name = tile_names.get(tile_index, f"Tile {tile_index}")
    
    # Generate notification message
    if owner_index is not None:
        team_name = f"Team {owner_index + 1}"
        notification_message = f"{team_name} now owns {tile_name}!"
    else:
        notification_message = f"Ownership removed from {tile_name}"
    
    # Update the game state if needed (for now just broadcast)
    # In a full implementation, you might want to update game.board.lands[tile_index].owner
    
    # Send the ownership change response to ALL clients
    Group(hostname).send({
        "text": json.dumps({
            "action": "admin_set_ownership",
            "tile_index": tile_index,
            "owner_index": owner_index,
            "notification_message": notification_message
        })
    })
    
    print(f"Ownership change sent to room {hostname}: {notification_message}")





def handle_dice_animation_start(hostname):
    """Handle dice animation synchronization across all clients"""
    print(f"Dice animation started in room {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "dice_animation_start"
        })
    })


def handle_start_sudden_death(hostname):
    """Handle sudden death round start - broadcast to all clients"""
    print(f"Sudden death round started in room {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "start_sudden_death"
        })
    })


def handle_show_sudden_death_card(hostname, question_index):
    """Handle showing sudden death card - broadcast to all clients"""
    print(f"Showing sudden death card {question_index} in room {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "show_sudden_death_card",
            "question_index": question_index
        })
    })


def handle_show_sudden_death_category_selection(hostname):
    """Handle showing sudden death category selection - broadcast to all clients"""
    print(f"Showing sudden death category selection in room {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "show_sudden_death_category_selection"
        })
    })


def handle_select_sudden_death_category(hostname, category, question_index):
    """Handle admin selecting a sudden death category and broadcast the question to all clients."""
    print(f"💀 Admin selected category: {category}, question index: {question_index}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "show_sudden_death_card",
            "category": category,
            "question_index": question_index
        })
    })
    
    # Also broadcast the start of blitz mode to all clients
    Group(hostname).send({
        "text": json.dumps({
            "action": "start_sudden_death_blitz",
            "category": category,
            "team_index": 0  # Default to team 0, can be updated later
        })
    })


def handle_start_sudden_death_timer(hostname):
    """Handle admin starting the sudden death timer and broadcast to all clients."""
    print(f"⏱️ Admin started sudden death timer for room: {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "start_sudden_death_timer"
        })
    })


def handle_reset_sudden_death_timer(hostname):
    """Handle admin resetting the sudden death timer and broadcast to all clients."""
    print(f"⏰ Admin reset sudden death timer for room: {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "reset_sudden_death_timer"
        })
    })


def handle_start_question_card_timer(hostname):
    """Handle admin starting the question card timer and broadcast to all clients."""
    print(f"⏱️ Admin started question card timer for room: {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "start_question_card_timer"
        })
    })


def handle_reset_question_card_timer(hostname):
    """Handle admin resetting the question card timer and broadcast to all clients."""
    print(f"⏰ Admin reset question card timer for room: {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "reset_question_card_timer"
        })
    })


def handle_shop_opened(hostname):
    """Handle shop opening and broadcast to all clients."""
    print(f"🛒 Shop opened in room: {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "shop_opened",
            "hostname": hostname
        })
    })


def handle_shop_closed(hostname):
    """Handle shop closing and broadcast to all clients."""
    print(f"🛒 Shop closed in room: {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "shop_closed",
            "hostname": hostname
        })
    })


def handle_item_purchased(hostname, item, team_index, updated_team_cash=None):
    """Handle item purchase and broadcast to all clients."""
    print(f"🛒 Item purchased in room {hostname}: {item['name']} by team {team_index}")
    if updated_team_cash:
        print(f"🛒 Updated team cash: {updated_team_cash}")
    
    message_data = {
        "action": "item_purchased",
        "hostname": hostname,
        "item": item,
        "team_index": team_index
    }
    
    if updated_team_cash:
        message_data["updated_team_cash"] = updated_team_cash
    
    Group(hostname).send({
        "text": json.dumps(message_data)
    })


def handle_item_used(hostname, item, team_index):
    """Handle item usage and broadcast to all clients."""
    print(f"🛒 Item used in room {hostname}: {item['name']} by team {team_index}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "item_used",
            "hostname": hostname,
            "item": item,
            "team_index": team_index
        })
    })


def handle_item_usage_modal_opened(hostname, item, team_index):
    """Handle item usage modal opening and broadcast to all clients."""
    print(f"🎒 Item usage modal opened in room {hostname}: {item['name']} for team {team_index}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "item_usage_modal_opened",
            "hostname": hostname,
            "item": item,
            "team_index": team_index
        })
    })


def handle_item_usage_modal_closed(hostname):
    """Handle item usage modal closing and broadcast to all clients."""
    print(f"🎒 Item usage modal closed in room {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "item_usage_modal_closed",
            "hostname": hostname
        })
    })


def handle_surprise_card_inventory_added(hostname, team_index, item_id, item_name, icon, surprise_index):
    """Handle surprise card inventory addition - broadcast to all clients"""
    print(f"🎁 Surprise card inventory added in room {hostname}: team {team_index}, item {item_name}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "surprise_card_inventory_added",
            "team_index": team_index,
            "item_id": item_id,
            "item_name": item_name,
            "icon": icon,
            "surprise_index": surprise_index
        })
    })


def handle_show_leaderboard(hostname):
    """Handle admin showing leaderboard and broadcast to all clients."""
    print(f"🏆 Admin showed leaderboard in room {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "show_leaderboard",
            "hostname": hostname
        })
    })


def handle_close_leaderboard(hostname):
    """Handle admin closing leaderboard and broadcast to all clients."""
    print(f"🏆 Admin closed leaderboard in room {hostname}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "close_leaderboard",
            "hostname": hostname
        })
    })


def handle_sudden_death_update_score(hostname, team_index, score):
    print(f"Sudden death update score: team {team_index}, score {score}")
    Group(hostname).send({
        "text": json.dumps({
            "action": "sudden_death_update_score",
            "team_index": team_index,
            "score": score
        })
    })

def handle_sudden_death_next_card(hostname, category, question_index):
    print(f"Sudden death next card: category {category}, question_index {question_index}")
    Group(hostname).send({
        "text": json.dumps({
            "action": "sudden_death_next_card",
            "category": category,
            "question_index": question_index
        })
    })


def handle_start_sudden_death_blitz(hostname, category, team_index):
    """Handle starting sudden death blitz mode - broadcast to all clients"""
    print(f"💀 Starting sudden death blitz: category {category}, team {team_index}")
    
    Group(hostname).send({
        "text": json.dumps({
            "action": "start_sudden_death_blitz",
            "category": category,
            "team_index": team_index
        })
    })

def handle_sudden_death_show_category_menu(hostname):
    print(f"Sudden death show category menu")
    Group(hostname).send({
        "text": json.dumps({
            "action": "show_sudden_death_category_selection"
        })
    })