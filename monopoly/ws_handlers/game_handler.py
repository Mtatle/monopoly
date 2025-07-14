from django.contrib.auth.models import User
from monopoly.models import Profile
from monopoly.core.game import *
from monopoly.core.land import LandType
from monopoly.ws_handlers.modal_title_enum import *
from channels import Group
import json

decisions = {}
HOTEL = 4

def ws_connect_for_game(message, rooms, games):
    username = message.user.username
    path = message.content['path']
    fields = path.split('/')
    hostname = fields[-1]
    Group(hostname).add(message.reply_channel)

    if hostname not in games:
        message.reply_channel.send({
            "text": build_add_err_msg()
        })
        return
    
    # Check if user should be allowed to rejoin
    if hostname not in rooms or username not in rooms[hostname]:
        # Check if this is a rejoin attempt
        can_rejoin = can_user_rejoin_game(username, games, rooms)
        if can_rejoin:
            print(f"Allowing {username} to rejoin game {hostname}")
            # Add them back to the room
            if hostname not in rooms:
                rooms[hostname] = set()
                rooms[hostname].add(hostname)  # Add hostname itself as tradition
            rooms[hostname].add(username)
            print(f"Re-added {username} to room {hostname}")
        else:
            print(f"User {username} cannot rejoin game {hostname}")
        message.reply_channel.send({
            "text": build_add_err_msg()
        })
        return

    game = games[hostname]

    players = game.get_players()
    profiles = rooms[hostname]

    cash_change = []
    pos_change = []
    points_change = []
    landname = None
    for player in players:
        cash_change.append(player.get_money())
        pos_change.append(player.get_position())
        points_change.append(player.get_points())

    # wait for decision
    if hostname in decisions:
        wait_decision = "true"
        decision = decisions[hostname].beautify()
        landname = decisions[hostname].get_land().get_description()
        next_player = game.get_current_player().get_index()

        title_type = ModalTitleType()
        decision_type = decisions[hostname].move_result_type
        title = title_type.get_description(decision_type)
    else:
        wait_decision = "false"
        decision = None
        next_player = game.get_current_player().get_index()
        title = None

    owners = game.get_land_owners()
    houses = []
    for i in range(len(owners)):
        houses.append(get_building_type(i, game))

    message.reply_channel.send({
        "text": build_init_msg(profiles, cash_change, pos_change, points_change, wait_decision, decision, next_player,
                               title, landname, owners, houses)
    })


def can_user_rejoin_game(username, games, rooms):
    """Check if a user can rejoin an active game"""
    try:
        # Import here to avoid circular imports
        from monopoly.consumers import player_teams
        from monopoly.core.game_state_type import GameStateType
        import re
        
        # Check if there's an active game
        if "admin" not in games:
            return False
        
        game = games["admin"]
        
        # Check if game is actually active (not ended)
        if game.get_game_status() == GameStateType.GAME_ENDED:
            return False
        
        # Check if user was in this game
        if username.lower() == 'admin':
            # Admin can always rejoin if there's an active game
            return True
        elif re.match(r'^spec\d+$', username.lower()):
            # Spectators can always rejoin if there's an active game
            return True
        else:
            # Regular players need to have been in player_teams
            if username in player_teams:
                return True
            else:
                return False
        
    except Exception as e:
        print(f"Error checking rejoin status in game_handler: {e}")
        return False


def get_building_type(tile_id, game):
    land = game.get_land(tile_id)
    if land.get_content().get_type() == LandType.CONSTRUCTION_LAND:
        building = land.get_content().get_property()
        if building == BuildingType.HOTEL:
            res = HOTEL
        elif building == BuildingType.HOUSE:
            res = land.get_content().get_property_num()
        else:
            res = 0
    else:
        res = 0
    return res


def handle_roll(hostname, games, changehandlers):
    game = games[hostname]
    players = game.get_players()
    
    # Try to roll the dice
    roll_result = game.roll()
    
    # Check if roll was successful
    if roll_result is None:
        print(f"ERROR: Roll failed for game {hostname}. Game state: {game.get_game_status()}")
        
        # Reset game state to allow rolling again
        from monopoly.core.game_state_type import GameStateType
        game._game_state = GameStateType.WAIT_FOR_ROLL
        
        # Send error message to all clients to stop dice animation
        Group(hostname).send({
            "text": json.dumps({
                "action": "roll_error",
                "message": "Roll failed - game state reset. Please try rolling again."
            })
        })
        return
    
    # Unpack the successful roll result
    steps, move_result = roll_result
    
    curr_player = game.get_current_player().get_index()
    new_pos = game.get_current_player().get_position()
    is_option = "false"
    is_cash_change = "false"
    new_event = "true"
    curr_cash = []
    next_player = None
    bypass_start = None

    change_handler = changehandlers[hostname]

    if move_result.move_result_type == MoveResultType.CONSTRUCTION_OPTION \
            or move_result.move_result_type == MoveResultType.BUY_LAND_OPTION:
        decisions[hostname] = move_result
        is_option = "true"
    elif move_result.move_result_type == MoveResultType.PAYMENT \
            or move_result.move_result_type == MoveResultType.REWARD:
        game.make_decision(move_result)
        next_player = game.get_current_player().get_index()
        is_cash_change = "true"
        for player in players:
            curr_cash.append(player.get_money())
    elif move_result.move_result_type == MoveResultType.NOTHING:
        game.make_decision(move_result)
        next_player = game.get_current_player().get_index()
        new_event = "false"
    else:
        game.make_decision(move_result)
        next_player = game.get_current_player().get_index()

    if is_option != "true" and change_handler.is_end():
        all_asset = []
        for player in players:
            all_asset.append(player.get_asset())
        Group(hostname).send({
            "text": build_game_end_msg(curr_player, all_asset)
        })
        return

    title_type = ModalTitleType()
    title = title_type.get_description(move_result.move_result_type)
    landname = move_result.get_land().get_description()

    if change_handler.bypass_start():
        bypass_start = "true"
        change_handler.set_bypass_start()
        curr_cash = []
        for player in players:
            curr_cash.append(player.get_money())

    Group(hostname).send({
        "text": build_roll_res_msg(curr_player, steps, move_result.beautify(), is_option, is_cash_change,
                                   new_event, new_pos, curr_cash, next_player, title, landname, bypass_start,
                                   move_result.go_to_jail)
    })


def handle_end_game(hostname, games):
    game = games[hostname]
    players = game.get_players()
    all_asset = []
    curr_player = game.get_current_player().get_index()
    for player in players:
        all_asset.append(player.get_asset())
    Group(hostname).send({
        "text": build_game_end_msg(curr_player, all_asset)
    })
    del decisions[hostname]


def handle_confirm_decision(hostname, games):
    game = games[hostname]
    curr_player = game.get_current_player().get_index()
    if hostname not in decisions:
        return
    decision = decisions[hostname]
    del decisions[hostname]
    decision.set_decision(True)
    confirm_result = game.make_decision(decision)
    players = game.get_players()
    curr_cash = []
    next_player = game.get_current_player().get_index()

    for player in players:
        curr_cash.append(player.get_money())

    if confirm_result.move_result_type == MoveResultType.BUY_LAND_OPTION:
        tile_id = confirm_result.get_land().get_position()
        Group(hostname).send({
            "text": build_buy_land_msg(curr_player, curr_cash, tile_id, next_player)
        })
    elif confirm_result.move_result_type == MoveResultType.CONSTRUCTION_OPTION:
        tile_id = confirm_result.get_land().get_position()
        build_type = confirm_result.get_land().get_content().get_property()
        if build_type == BuildingType.HOUSE:
            build_type = "house"
        else:
            build_type = "hotel"
        Group(hostname).send({
            "text": build_construct_msg(curr_cash, tile_id, build_type, next_player)
        })


def handle_cancel_decision(hostname, games):
    game = games[hostname]
    if hostname not in decisions:
        return
    decision = decisions[hostname]
    del decisions[hostname]
    decision.set_decision(False)
    game.make_decision(decision)
    next_player = game.get_current_player().get_index()
    Group(hostname).send({
        "text": build_cancel_decision_msg(next_player)
    })


def handle_admin_move(hostname, games, player_index, tile_index):
    """Handle admin move - teleport a player to any tile"""
    print(f"Admin move requested: hostname={hostname}, player={player_index}, tile={tile_index}")
    
    if hostname not in games:
        print(f"No game found for hostname: {hostname}")
        return
    
    game = games[hostname]
    players = game.get_players()
    
    # Validate player index
    if player_index < 0 or player_index >= len(players):
        print(f"Invalid player index: {player_index}, available players: {len(players)}")
        return
    
    # Validate tile index
    if tile_index < 0 or tile_index >= game._board.get_grid_num():
        print(f"Invalid tile index: {tile_index}, max tiles: {game._board.get_grid_num()}")
        return
    
    # Get the player and move them
    player = players[player_index]
    old_position = player.get_position()
    
    print(f"Moving player {player_index} from tile {old_position} to tile {tile_index}")
    
    # Set player's new position directly
    player.set_position(tile_index)
    
    # Get current cash and next player
    curr_cash = []
    for p in players:
        curr_cash.append(p.get_money())
    
    next_player = game.get_current_player().get_index()
    
    print(f"Admin move successful, broadcasting to clients")
    
    # Broadcast the admin move to all clients
    Group(hostname).send({
        "text": build_admin_move_msg(player_index, old_position, tile_index, curr_cash, next_player)
    })


def handle_admin_modify_money(hostname, games, player_index, amount):
    """Handle admin money modification - add or remove money from a player"""
    print(f"💰 Admin modify money requested: hostname={hostname}, player={player_index}, amount={amount}")
    
    if hostname not in games:
        print(f"❌ No game found for hostname: {hostname}")
        return
    
    game = games[hostname]
    players = game.get_players()
    
    # Validate player index
    if player_index < 0 or player_index >= len(players):
        print(f"❌ Invalid player index: {player_index}, available players: {len(players)}")
        return
    
    # Get the player and modify money
    player = players[player_index]
    current_money = player.get_money()
    
    # Validate the amount to prevent any potential issues
    if not isinstance(amount, (int, float)):
        print(f"❌ Invalid amount type: {type(amount)}, value: {amount}")
        return
    
    new_money = max(0, current_money + amount)  # Don't allow negative money
    
    print(f"💰 Player {player_index} money: {current_money} + {amount} = {new_money}")
    
    # Double-check the math
    if new_money != max(0, current_money + amount):
        print(f"❌ Math error: {current_money} + {amount} should equal {new_money}")
        return
    
    player.set_money(new_money)
    
    print(f"✅ Modified player {player_index} money from {current_money} to {new_money} (change: {amount})")
    
    # Get current cash for all players
    curr_cash = []
    for p in players:
        curr_cash.append(p.get_money())
    
    print(f"💰 Final cash amounts: {curr_cash}")
    
    # Check for bankruptcy
    bankrupt_player = None
    if new_money <= 0:
        bankrupt_player = player_index
        print(f"💸 Player {player_index} is bankrupt with {new_money} SB!")
    
    print(f"✅ Admin money modification successful, broadcasting to clients")
    
    # Broadcast the admin money modification to all clients
    Group(hostname).send({
        "text": build_admin_modify_money_msg(player_index, amount, curr_cash, bankrupt_player)
    })


def handle_admin_modify_points(hostname, games, player_index, amount):
    """Handle admin points modification - add or remove points from a player"""
    print(f"⭐ Admin modify points requested: hostname={hostname}, player={player_index}, amount={amount}")
    
    if hostname not in games:
        print(f"❌ No game found for hostname: {hostname}")
        return
    
    game = games[hostname]
    players = game.get_players()
    
    # Validate player index
    if player_index < 0 or player_index >= len(players):
        print(f"❌ Invalid player index: {player_index}, available players: {len(players)}")
        return
    
    # Get the player and modify points
    player = players[player_index]
    current_points = player.get_points()
    
    # Validate the amount to prevent any potential issues
    if not isinstance(amount, (int, float)):
        print(f"❌ Invalid amount type: {type(amount)}, value: {amount}")
        return
    
    new_points = max(0, current_points + amount)  # Don't allow negative points
    
    print(f"⭐ Player {player_index} points: {current_points} + {amount} = {new_points}")
    
    # Double-check the math
    if new_points != max(0, current_points + amount):
        print(f"❌ Math error: {current_points} + {amount} should equal {new_points}")
        return
    
    player.set_points(new_points)
    
    print(f"✅ Modified player {player_index} points from {current_points} to {new_points} (change: {amount})")
    
    # Get current points for all players
    curr_points = []
    for p in players:
        curr_points.append(p.get_points())
    
    print(f"⭐ Final points amounts: {curr_points}")
    print(f"✅ Admin points modification successful, broadcasting to clients")
    
    # Broadcast the admin points modification to all clients
    Group(hostname).send({
        "text": build_admin_modify_points_msg(player_index, amount, curr_points)
    })


def handle_admin_rent_money(hostname, games, player_index, amount):
    """Handle admin rent money transfer - transfer money from one player to another"""
    import time
    request_id = f"rent_{int(time.time() * 1000)}"
    print(f"🏠 [{request_id}] Admin rent money requested: hostname={hostname}, player={player_index}, amount={amount}")
    
    if hostname not in games:
        print(f"❌ No game found for hostname: {hostname}")
        return
    
    game = games[hostname]
    players = game.get_players()
    
    # Validate player index
    if player_index < 0 or player_index >= len(players):
        print(f"❌ Invalid player index: {player_index}, available players: {len(players)}")
        return
    
    # Validate the amount to prevent any potential issues
    if not isinstance(amount, (int, float)) or amount <= 0:
        print(f"❌ Invalid amount: {amount}, must be positive number")
        return
    
    # Get the paying player and receiving player
    paying_player = players[player_index]
    receiving_player = players[1 - player_index]  # Other player (0->1, 1->0)
    
    paying_current_money = paying_player.get_money()
    receiving_current_money = receiving_player.get_money()
    
    print(f"🏠 [{request_id}] Initial state - Player {player_index}: {paying_current_money} SB, Player {1-player_index}: {receiving_current_money} SB")
    
    # Check if paying player has enough money
    if paying_current_money < amount:
        print(f"❌ [{request_id}] Player {player_index} doesn't have enough money: {paying_current_money} < {amount}")
        return
    
    # Transfer the money
    paying_new_money = paying_current_money - amount
    receiving_new_money = receiving_current_money + amount
    
    print(f"🏠 [{request_id}] Rent transfer calculation: Player {player_index} ({paying_current_money} - {amount} = {paying_new_money}) -> Player {1-player_index} ({receiving_current_money} + {amount} = {receiving_new_money})")
    
    # Apply the changes
    paying_player.set_money(paying_new_money)
    receiving_player.set_money(receiving_new_money)
    
    # Verify the changes were applied correctly
    actual_paying_money = paying_player.get_money()
    actual_receiving_money = receiving_player.get_money()
    print(f"🏠 [{request_id}] Verification - Player {player_index}: {actual_paying_money} SB, Player {1-player_index}: {actual_receiving_money} SB")
    
    if actual_paying_money != paying_new_money or actual_receiving_money != receiving_new_money:
        print(f"❌ [{request_id}] ERROR: Money transfer verification failed!")
        print(f"Expected: Player {player_index}={paying_new_money}, Player {1-player_index}={receiving_new_money}")
        print(f"Actual: Player {player_index}={actual_paying_money}, Player {1-player_index}={actual_receiving_money}")
        return
    
    print(f"✅ [{request_id}] Rent transfer successful: Player {player_index} paid {amount} SB to Player {1-player_index}")
    
    # Get current cash for all players
    curr_cash = []
    for p in players:
        curr_cash.append(p.get_money())
    
    print(f"💰 [{request_id}] Final cash amounts: {curr_cash}")
    
    # Check for bankruptcy
    bankrupt_player = None
    if paying_new_money <= 0:
        bankrupt_player = player_index
        print(f"💸 [{request_id}] Player {player_index} is bankrupt with {paying_new_money} SB!")
    
    print(f"✅ [{request_id}] Admin rent transfer successful, broadcasting to clients")
    
    # Broadcast the admin rent transfer to all clients
    Group(hostname).send({
        "text": build_admin_rent_money_msg(player_index, amount, curr_cash, bankrupt_player)
    })


def handle_admin_reset_game(hostname, games, rooms):
    """Handle admin game reset - reset the entire game to initial state"""
    print(f"Admin reset game requested: hostname={hostname}")
    
    if hostname not in games:
        print(f"No game found for hostname: {hostname}")
        return
    
    if hostname not in rooms:
        print(f"No room found for hostname: {hostname}")
        return
    
    game = games[hostname]
    players = game.get_players()
    profiles = rooms[hostname]
    
    print(f"Resetting game for {len(players)} players")
    
    # Reset all players to start position (0) and initial money/points
    for player in players:
        player.set_position(0)  # Move to START tile
        player.set_money(24)    # Reset to initial money
        player.set_points(0)    # Reset to initial points
    
    # Clear the board of all properties
    # Reset each land's ownership and buildings
    for tile_id in range(game._board.get_grid_num()):
        land = game.get_land(tile_id)
        land_content = land.get_content()
        
        # Reset ownership based on land type
        if land_content.get_type() == LandType.CONSTRUCTION_LAND:
            land_content.set_owner(None)  # Reset ownership
            land_content.clear_properties()  # Reset buildings
        elif land_content.get_type() == LandType.QUESTION:
            land_content.set_owner(None)  # Reset question ownership
        elif land_content.get_type() == LandType.RESPONSE_STATION:
            land_content.set_owner(None)  # Reset response station ownership
        elif land_content.get_type() == LandType.INFRA:
            land_content.set_owner(None)  # Reset infrastructure ownership
    
    # Clear any pending decisions
    if hostname in decisions:
        del decisions[hostname]
    
    # Reset current player to player 0
    game.set_current_player_index(0)
    
    print(f"Game reset successful, all players at START with 24 SB and 0 points")
    
    # Prepare game state data
    cash_change = []
    pos_change = []
    points_change = []
    
    for player in players:
        cash_change.append(player.get_money())
        pos_change.append(player.get_position()) 
        points_change.append(player.get_points())
    
    print(f"Reset data - Cash: {cash_change}, Positions: {pos_change}, Points: {points_change}")
    
    # Broadcast the reset to all clients
    Group(hostname).send({
        "text": build_admin_reset_game_msg(profiles, cash_change, pos_change, points_change)
    })
    
    print(f"Admin reset game message sent to group: {hostname}")


def handle_chat(hostname, msg):
    sender = msg["from"]
    content = msg["content"]
    Group(hostname).send({
        "text": build_chat_msg(sender, content)
    })


def build_init_msg(players, cash_change, pos_change, points_change, wait_decision, decision, next_player,
                   title, landname, owners, houses):
    players_list = []
    for player in players:
        profile_user = User.objects.get(username=player)
        try:
            profile = Profile.objects.get(user=profile_user)
        except Exception:
            profile = None
        avatar = profile.avatar.url if profile else ""
        players_list.append({"fullName": profile_user.first_name,
                     "userName": profile_user.username, "avatar": avatar})

    ret = {"action": "init",
           "players": players_list,
           "changeCash": cash_change,
           "posChange": pos_change,
           "changePoints": points_change,
           "waitDecision": wait_decision,
           "decision": decision,
           "nextPlayer": next_player,
           "title": title,
           "landname": landname,
           "owners": owners,
           "houses": houses,
           }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_add_err_msg():
    ret = {"action": "add_err",
           }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_roll_res_msg(curr_player, steps, result, is_option, is_cash_change, new_event,
                       new_pos, curr_cash, next_player, title, landname, bypass_start, go_to_jail=False):
    ret = {"action": "roll_res",
           "curr_player": curr_player,
           "steps": steps,
           "result": result,
           "is_option": is_option,
           "is_cash_change": is_cash_change,
           "new_event": new_event,
           "new_pos": new_pos,
           "curr_cash": curr_cash,
           "next_player": next_player,
           "title": title,
           "landname": landname,
           "bypass_start": bypass_start,
           "go_to_jail": go_to_jail,
            }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_game_end_msg(curr_player, all_asset):
    ret = {"action": "game_end",
           "loser": curr_player,
           "all_asset": all_asset,
    }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_buy_land_msg(curr_player, curr_cash, tile_id, next_player):
    ret = {"action": "buy_land",
           "curr_player": curr_player,
           "curr_cash": curr_cash,
           "tile_id": tile_id,
           "next_player": next_player,
    }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_construct_msg(curr_cash, tile_id, build_type, next_player):
    ret = {"action": "construct",
           "curr_cash": curr_cash,
           "tile_id": tile_id,
           "build_type": build_type,
           "next_player": next_player,
           }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_cancel_decision_msg(next_player):
    ret = {"action": "cancel_decision",
           "next_player": next_player,
    }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_pass_start_msg(curr_player):
    ret = {"action": "pass_start",
           "curr_player": curr_player,
          }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_chat_msg(sender, content):
    ret = {"action": "chat",
           "sender": sender,
           "content": content,
    }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_admin_move_msg(player_index, old_position, new_position, curr_cash, next_player):
    ret = {"action": "admin_move",
           "player_index": player_index,
           "old_position": old_position,
           "new_position": new_position,
           "curr_cash": curr_cash,
           "next_player": next_player,
    }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_admin_modify_money_msg(player_index, amount, curr_cash, bankrupt_player=None):
    # Create notification message
    team_name = f"Team {player_index + 1}"
    if amount > 0:
        notification_msg = f"💰 {team_name} received {amount} SB"
    else:
        notification_msg = f"💸 {team_name} lost {abs(amount)} SB"
    
    ret = {"action": "admin_modify_money",
           "player_index": player_index,
           "amount": amount,
           "curr_cash": curr_cash,
           "notification_message": notification_msg,
           "bankrupt_player": bankrupt_player,
    }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_admin_modify_points_msg(player_index, amount, curr_points):
    # Create notification message
    team_name = f"Team {player_index + 1}"
    if amount > 0:
        notification_msg = f"⭐ {team_name} received {amount} P"
    else:
        notification_msg = f"📉 {team_name} lost {abs(amount)} P"
    
    ret = {"action": "admin_modify_points",
           "player_index": player_index,
           "amount": amount,
           "curr_points": curr_points,
           "notification_message": notification_msg,
    }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_admin_rent_money_msg(player_index, amount, curr_cash, bankrupt_player=None):
    # Create notification message
    paying_team = f"Team {player_index + 1}"
    receiving_team = f"Team {2 - player_index}"  # 0->2, 1->1
    notification_msg = f"🏠 {paying_team} paid {receiving_team} {amount} SB for rent"
    
    ret = {"action": "admin_rent_money",
           "player_index": player_index,
           "amount": amount,
           "curr_cash": curr_cash,
           "notification_message": notification_msg,
           "bankrupt_player": bankrupt_player,
    }
    print(json.dumps(ret))
    return json.dumps(ret)


def build_admin_reset_game_msg(players, cash_change, pos_change, points_change):
    """Build message for admin game reset - similar to init but for reset action"""
    players_list = []
    for player in players:
        profile_user = User.objects.get(username=player)
        try:
            profile = Profile.objects.get(user=profile_user)
        except Exception:
            profile = None
        avatar = profile.avatar.url if profile else ""
        players_list.append({"fullName": profile_user.first_name,
                     "userName": profile_user.username, "avatar": avatar})

    ret = {"action": "admin_reset_game",
           "players": players_list,
           "changeCash": cash_change,
           "posChange": pos_change,
           "changePoints": points_change,
    }
    print(json.dumps(ret))
    return json.dumps(ret)
