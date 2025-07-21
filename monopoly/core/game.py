from .player import Player
from .game_state_type import GameStateType
from .card_deck import CardDeck
from .board import Board
from .move_result import MoveResult
from .move_result_enum import MoveResultType
from .game_change_listner import GameChangeListner
from .land import LandType
from .building import *
import uuid


class Game(object):
    _game_id = 0

    def __init__(self, player_num):
        # assert 0 < player_num <= 4
        if player_num <= 0 or player_num > 4:
            self.notify_error("In correct player number, should be 1-4 "
                              "players.")
            return
        self._players = []
        for i in range(player_num):
            self._players.append(Player(i))
        self._game_state = GameStateType.WAIT_FOR_ROLL
        self._card_deck = CardDeck()
        self._board = Board()
        self._current_player_index = 0
        self._game_id = Game._game_id
        Game._game_id += 1
        self._handlers = []
        self.add_game_change_listner(InternalLogHandler(self))
        self.notify_new_game()

        # === Ensure Surprise Cards are unique per game ===
        import random
        self._unused_surprise_cards = list(range(40))  # 40 surprise cards (0-39)
        random.shuffle(self._unused_surprise_cards)
        
        # === Ensure Mystery Mash Cards are unique per game ===
        self._unused_mystery_mash_cards = list(range(40))  # 40 mystery mash cards (0-39)
        random.shuffle(self._unused_mystery_mash_cards)

    def get_game_id(self):
        return self._game_id

    def add_game_change_listner(self, handler):
        self._handlers.append(handler)

    def remove_game_change_listner(self, to_be_deleted):
        for handler in self._handlers:
            if handler == to_be_deleted:
                self._handlers.remove(handler)
                return

    def _move(self, steps):
        cur_player = self.get_current_player()
        new_position = (cur_player.get_position() + steps) \
                       % self._board.get_grid_num()
        if new_position < cur_player.get_position():
            # Removed automatic START_REWARD - now handled by admin buttons only
            # self.get_current_player().add_money(START_REWARD)
            self.notify_pass_start()
        land_dest = self._board.get_land(new_position)
        # assert (land_dest is not None)
        if land_dest is None:
            self.notify_error("Internal error, the destination land is none. "
                              "there is no land at the new position")
            return None
        self.get_current_player().set_position(new_position)
        # print 'debug41: ', land_dest
        return land_dest

    def _is_purchase_affordable(self, land):
        return self.get_current_player().get_money() >= land.get_price()

    def _is_construction_affordable(self, land):
        return self.get_current_player().get_money() >= \
               land.get_next_construction_price()

    def _get_move_result(self, land):
        land_type = land.get_type()
        if land_type == LandType.CONSTRUCTION_LAND:
            # if land is owned
            construction_land = land.get_content()
            if construction_land.get_owner_index() is None:
                if self._is_purchase_affordable(construction_land) is False:
                    val = construction_land.get_price()
                    return MoveResult(MoveResultType.NOTHING, val, land)
                result_type = MoveResultType.BUY_LAND_OPTION
                val = construction_land.get_price()
                return MoveResult(result_type, val, land)
            elif construction_land.get_owner_index() == \
                    self._current_player_index:
                if construction_land.is_constructable() is False:
                    return MoveResult(MoveResultType.NOTHING, 0, land)
                if self._is_construction_affordable(construction_land) is False:
                    val = construction_land.get_next_construction_price()
                    return MoveResult(MoveResultType.NOTHING, val, land)
                result_type = MoveResultType.CONSTRUCTION_OPTION
                val = construction_land.get_next_construction_price()
                return MoveResult(result_type, val, land)
            else:
                result_type = MoveResultType.PAYMENT
                val = construction_land.get_rent()
                return MoveResult(result_type, val, land)
        elif land_type == LandType.INFRA:
            print("debug63")
            infra_land = land.get_content()
            if infra_land.get_owner_index() is None:
                if self._is_purchase_affordable(infra_land) is False:
                    return MoveResult(MoveResultType.NOTHING,
                                      infra_land.get_price(), land)
                result_type = MoveResultType.BUY_LAND_OPTION
                val = infra_land.get_price()
                return MoveResult(result_type, val, land)
            else:
                if infra_land.get_owner_index() == self._current_player_index:
                    result_type = MoveResultType.NOTHING
                    val = 0
                    return MoveResult(result_type, val, land)
                result_type = MoveResultType.PAYMENT
                val = infra_land.get_payment()
                return MoveResult(result_type, val, land)

        elif land_type == LandType.START:
            print("debug75")
            result_type = MoveResultType.NOTHING
            val = 0
            ret = MoveResult(result_type, val, land)
            ret.set_msg(" landed on Start!")
            return ret
        elif land_type == LandType.PARKING:
            print("debug80")
            result_type = MoveResultType.NOTHING
            val = 0
            return MoveResult(result_type, val, land)
        elif land_type == LandType.JAIL:
            print("debug85")
            # If player lands on jail directly by dice, they're just visiting (no penalty)
            # The penalty is only applied when sent here from "Go to QA Jail"
            result_type = MoveResultType.NOTHING
            val = 0
            ret = MoveResult(result_type, val, land)
            ret.set_msg(" is visiting QA Jail - no penalty or reward.")
            return ret
        elif land_type == LandType.CHANCE:
            print("debug landtype chance")
            card = self._card_deck.draw()
            if card.get_money_deduction() > 0:
                result_type = MoveResultType.PAYMENT
                val = card.get_money_deduction()
            else:
                result_type = MoveResultType.REWARD
                val = card.get_money_deduction() * -1
            ret = MoveResult(result_type, val, land)
            ret.set_msg(" Chance Card: " + str(card))
            return ret
        
        elif land_type == LandType.QUESTION:
            print("debug landtype question")
            question_land = land.get_content()
            if question_land.get_owner_index() is None:
                # Question available to answer - show question card
                result_type = MoveResultType.REWARD
                val = 0  # No money or points reward
                ret = MoveResult(result_type, val, land)
                
                # Generate random question index for synchronization across all clients
                import random
                position = land.get_position()
                # Most question tiles have 20 questions, except tile 20 which has 1
                if position == 20:
                    question_index = 0  # Only one question for Training Time
                else:
                    question_index = random.randint(0, 19)  # 0-19 for 20 questions
                
                ret.set_msg(" SHOW_QUESTION_CARD:" + str(position) + ":" + str(question_index))
                # Set ownership (if you want to track who landed here)
                question_land.set_owner(self._current_player_index)
                return ret
            else:
                # Already owned - check if current player has steal card and tile is owned by opposing team
                if question_land.get_owner_index() != self._current_player_index:
                    # Check if current player has steal card (this will be handled client-side)
                    # For now, just show the question card with steal option
                    result_type = MoveResultType.REWARD
                    val = 0
                    ret = MoveResult(result_type, val, land)
                    
                    # Generate random question index for synchronization across all clients
                    import random
                    position = land.get_position()
                    # Most question tiles have 20 questions, except tile 20 which has 1
                    if position == 20:
                        question_index = 0  # Only one question for Training Time
                    else:
                        question_index = random.randint(0, 19)  # 0-19 for 20 questions
                    
                    ret.set_msg(" SHOW_QUESTION_CARD_STEAL:" + str(position) + ":" + str(question_index))
                    return ret
                else:
                    # Own this question tile - pay maintenance fees based on total owned stations
                    current_player = self.get_current_player()
                    owned_stations = sum(1 for prop in current_player.get_properties() 
                                       if hasattr(prop, 'get_type') and prop.get_type() == LandType.RESPONSE_STATION)
                    
                    result_type = MoveResultType.NOTHING
                    val = 0
                    ret = MoveResult(result_type, val, land)
                    position = land.get_position()
                    ret.set_msg(f" SHOW_MAINTENANCE_FEE:{position}:{owned_stations}")
                    return ret
        
        elif land_type == LandType.SURPRISE:
            print("debug landtype surprise")
            position = land.get_position()
            
            # Check if this is a Mystery Mash tile (positions 4, 10, 13, 23)
            if position in [4, 10, 13, 23]:
                # Use Mystery Mash deck
                import random
                if len(self._unused_mystery_mash_cards) == 0:
                    # All cards exhausted – reshuffle the full deck
                    self._unused_mystery_mash_cards = list(range(40))
                    random.shuffle(self._unused_mystery_mash_cards)
                    print("Mystery Mash card deck exhausted – reshuffled for new cycle")
                card_index = self._unused_mystery_mash_cards.pop()
                print(f"Selected Mystery Mash card index (unique): {card_index}")
            else:
                # Use regular surprise deck
                import random
                if len(self._unused_surprise_cards) == 0:
                    # All cards exhausted – reshuffle the full deck
                    self._unused_surprise_cards = list(range(40))
                    random.shuffle(self._unused_surprise_cards)
                    print("Surprise card deck exhausted – reshuffled for new cycle")
                card_index = self._unused_surprise_cards.pop()
                print(f"Selected surprise card index (unique): {card_index}")
            
            # All surprise cards show the same card to all clients
            result_type = MoveResultType.NOTHING
            val = 0
            ret = MoveResult(result_type, val, land)
            # Include tile position for client-side image selection
            ret.set_msg(f" SHOW_SURPRISE_CARD:{card_index}:{position}")
            
            return ret
        
        elif land_type == LandType.RESPONSE_STATION:
            print("debug landtype response_station")
            response_station = land.get_content()
            if response_station.get_owner_index() is None:
                # Calculate price based on current player's owned stations
                current_player = self.get_current_player()
                owned_stations = sum(1 for prop in current_player.get_properties() 
                                   if hasattr(prop, 'get_type') and prop.get_type() == LandType.RESPONSE_STATION)
                
                # Price: 5 SB for first station, 7 SB for second, 10 SB for third, 13 SB for fourth
                if owned_stations == 0:
                    price = 5
                elif owned_stations == 1:
                    price = 7
                elif owned_stations == 2:
                    price = 10
                elif owned_stations == 3:
                    price = 13
                else:
                    # Can't buy more than 4 stations
                    price = 13  # Default price for display (shouldn't reach here)
                
                if current_player.get_money() < price:
                    result_type = MoveResultType.NOTHING
                    val = price
                    return MoveResult(result_type, val, land)
                result_type = MoveResultType.BUY_LAND_OPTION
                val = price
                return MoveResult(result_type, val, land)
            elif response_station.get_owner_index() == self._current_player_index:
                # Own this station - no automatic payment/reward
                result_type = MoveResultType.NOTHING
                val = 0
                ret = MoveResult(result_type, val, land)
                ret.set_msg(" landed on their own Response Station!")
                return ret
            else:
                # Another player owns this station - calculate rent based on owner's station count
                owner_player = self.get_player(response_station.get_owner_index())
                owned_stations = sum(1 for prop in owner_player.get_properties() 
                                   if hasattr(prop, 'get_type') and prop.get_type() == LandType.RESPONSE_STATION)
                
                # Base rent is 5 SB, doubles with 2 stations, triples with 3, quadruples with 4
                base_rent = 5
                if owned_stations == 1:
                    rent = base_rent  # 5 SB
                elif owned_stations == 2:
                    rent = base_rent * 2  # 10 SB
                elif owned_stations == 3:
                    rent = base_rent * 3  # 15 SB
                elif owned_stations >= 4:
                    rent = base_rent * 4  # 20 SB
                else:
                    rent = base_rent  # Fallback
                
                result_type = MoveResultType.NOTHING
                val = 0
                ret = MoveResult(result_type, val, land)
                ret.set_msg(f" landed on Response Station! Pay {rent} SB to the owner (owns {owned_stations} station{'s' if owned_stations != 1 else ''}).")
                return ret
        
        elif land_type == LandType.GOLDEN_CHEST:
            print("debug landtype golden_chest")
            result_type = MoveResultType.NOTHING
            val = 0
            ret = MoveResult(result_type, val, land)
            ret.set_msg(" Found Golden Chest! Earned 10 SB.")
            return ret
        
        elif land_type == LandType.BEST_AGENT:
            print("debug landtype best_agent")
            result_type = MoveResultType.NOTHING
            val = 0
            ret = MoveResult(result_type, val, land)
            ret.set_msg(" Best Agent! Gained 5 points.")
            return ret
        
        elif land_type == LandType.CONNECTIVITY_COST:
            print("debug landtype connectivity_cost")
            result_type = MoveResultType.NOTHING
            val = 0
            ret = MoveResult(result_type, val, land)
            ret.set_msg(" Connectivity Cost! Pay 5 SB.")
            # Deduct 5 SB from the player
            self.get_current_player().deduct_money(5)
            return ret
        
        elif land_type == LandType.GO_TO_JAIL:
            print("debug landtype go_to_jail")
            result_type = MoveResultType.STOP_ROUND
            val = 1
            ret = MoveResult(result_type, val, land)
            ret.set_msg(" Go to QA Jail!")
            # Set a special flag to move to jail AFTER the visual animation shows landing on this tile
            ret.go_to_jail = True
            return ret
        
        elif land_type == LandType.TRAINING_TIME:
            print("debug landtype training_time")
            result_type = MoveResultType.NOTHING
            val = 0
            ret = MoveResult(result_type, val, land)
            ret.set_msg(" is in training! Take a break.")
            return ret
        
        elif land_type == LandType.FLASH_ROUND:
            print("debug landtype flash_round")
            result_type = MoveResultType.NOTHING
            val = 0
            ret = MoveResult(result_type, val, land)
            position = land.get_position()
            ret.set_msg(f" SHOW_FLASH_ROUND_INTRO:{position}")
            return ret
        
        elif land_type == LandType.DOUBLE_OR_NOTHING:
            print("debug landtype double_or_nothing")
            result_type = MoveResultType.NOTHING
            val = 0
            ret = MoveResult(result_type, val, land)
            ret.set_msg(" Double or Nothing! You risk your points - 50% chance to double them for the next round if you answer correctly, OR 50% chance to lose half if you answer incorrectly.")
            return ret
        
        else:
            print("Error, the land is", land_type)
            self.notify_error("Internal error, unknow land type")
            return None

    def _has_enough_money(self, construction_land):
        print('price1:', self.get_current_player().get_money())
        print('construciton price:', construction_land.get_price())
        return self.get_current_player().get_money() > \
               construction_land.get_price()

    def _apply_result(self, move_result):
        # print 'debug95, move result is', move_result
        move_result_type = move_result.get_move_result_type()
        val = move_result.get_value()
        result = True
        if move_result_type == MoveResultType.BUY_LAND_OPTION:
            print('debug99')
            purchasable_land = move_result.get_land().get_content()
            if move_result.yes is True:
                # Use the price from the move result (for response stations, this is dynamic)
                price = val
                if self.get_current_player().get_money() < price:
                    # return handled
                    self.notify_error("No enough money to buy the property.")
                    result = False
                purchasable_land.set_owner(self._current_player_index)
                self.get_current_player().add_properties(purchasable_land)
                self.get_current_player().deduct_money(price)
            else:
                result = True

        elif move_result_type == MoveResultType.CONSTRUCTION_OPTION:
            construction_land = move_result.get_land().get_content()
            # assert construction_land.get_owner_index() == self._current_player_index
            if construction_land.get_owner_index() != \
                    self._current_player_index:
                # return handled
                self.notify_error("Error! this land is not owned by the "
                                  "current player, so cannot make construciton")
                result = False
            if move_result.yes is True:
                self.get_current_player().deduct_money(
                    construction_land.get_next_construction_price())
                if construction_land.add_properties() is False:
                    # return handled
                    self.notify_error("Add property fail. ")
                    result = False

        else:
            if move_result_type == MoveResultType.PAYMENT:
                # print 'debug129'
                self.get_current_player().deduct_money(val)
                if self.get_current_player().get_money() < 0:
                    self.notify_game_ended()
                    self._game_state = GameStateType.GAME_ENDED
                land = move_result.get_land().get_content()
                if land.get_type() == LandType.CONSTRUCTION_LAND or \
                        land.get_type() == LandType.INFRA or \
                        land.get_type() == LandType.RESPONSE_STATION:
                    # this is the payment to the player
                    # assert land.get_owner_index() is not None
                    if land.get_owner_index() is None:
                        self.notify_error("Error: The land has no owner. why "
                                          "the current player need to make "
                                          "payment")
                        result = False
                    print(('owner index is: ', land.get_owner_index()))
                    rewarded_player = self.get_player(land.get_owner_index())
                    rewarded_player.add_money(val)

            elif move_result_type == MoveResultType.REWARD:
                self.get_current_player().add_money(val)

            elif move_result_type == MoveResultType.STOP_ROUND:
                self.get_current_player().add_one_stop()
                # If this is a "Go to QA Jail" result, move the player to jail position 6
                if hasattr(move_result, 'go_to_jail') and move_result.go_to_jail:
                    print(f"Moving player {self._current_player_index} to jail (position 6)")
                    self.get_current_player().set_position(6)
            else:
                # move result option
                # should never reach here
                result = True
            self.notify_result_applied()

        return result

    def _change_player(self):
        self._current_player_index = self._change_player_on(
            self._current_player_index)
        self.notify_player_changed()

    def _change_player_on(self, cur):
        new_user_index = (cur + 1) % (len(
            self._players))
        # print 'debug157', new_user_index
        new_user = self._players[new_user_index]
        if new_user.get_stop_num() > 0:

            new_user.deduct_stop_num()
            return self._change_player_on(new_user_index)
        else:
            return new_user_index

    def _roll_to_next_game_state(self):
        self._game_state = 1 - self._game_state

    def roll(self, steps=None):
        if self.get_game_status() == GameStateType.GAME_ENDED:
            self.notify_error("Internal error: the game has ended")
            return None
        # assert self.get_game_status() == GameStateType.WAIT_FOR_ROLL
        if self.get_game_status() != GameStateType.WAIT_FOR_ROLL:
            self.notify_error("Internal error: the game state must be "
                              "'waiting for roll' when you roll")
            return None
        self.notify_rolled()

        if steps is None:
            import random
            steps1 = random.randint(1, 6)
            steps2 = random.randint(1, 6)
            steps = steps1 + steps2
        land_dest = self._move(steps)
        if land_dest is None:
            # print 'debug262, the move result is None'
            return None
        print("debug116", land_dest)
        self._roll_to_next_game_state()
        move_result = self._get_move_result(land_dest)
        return steps, move_result

    # if the result type is option, you must set the decision before calling
    # this
    def make_decision(self, decision):
        if self.get_game_status() == GameStateType.GAME_ENDED:
            self.notify_error("Internal error: the game has ended")
            return None
        # assert self.get_game_status() == GameStateType.WAIT_FOR_DECISION
        if self.get_game_status() != GameStateType.WAIT_FOR_DECISION:
            self.notify_error("Internal error: the game state must be "
                              "'waiting for decision when you make decision'")
            return None
        self.notify_decision_made()
        ret = decision
        if decision.move_result_type != MoveResultType.BUY_LAND_OPTION and \
                decision.move_result_type != MoveResultType.CONSTRUCTION_OPTION:
            # print 'debug227, not a decision'
            make_decision_success = self._apply_result(decision)
        else:
            # print 'debug188'
            # assert decision.yes is not None
            if decision.yes is None:
                print('error')
                self.notify_error("Error: You must make a decision when you "
                                  "need to make a decsion")
                return None
            make_decision_success = self._apply_result(decision)
            print(('debgu237: ', make_decision_success))
            ret = MoveResult(decision.get_move_result_type(),
                             decision.get_value(), decision.get_land())
        if make_decision_success:
            print('decision made success')
            self._change_player()
            self._roll_to_next_game_state()
            return ret
        else:
            return None

    # getters
    def get_player(self, index):
        return self._players[index]

    # this will return a 40 num array, each indicate the owner of each land
    def get_land_owners(self):
        ret = []
        for i in range(self._board.get_grid_num()):
            land = self._board.get_land(i)
            owner = land.get_content().get_owner_index()
            ret.append(owner)
        return ret

    def get_current_player(self):
        return self._players[self._current_player_index]

    def get_land(self, index):
        return self._board.get_land(index)

    def get_players(self):
        return self._players

    def set_current_player_index(self, index):
        """Set the current player index"""
        if 0 <= index < len(self._players):
            self._current_player_index = index
    
    def admin_set_current_player_index(self, intended_index):
        """Set the current player index for admin use - directly sets who should roll next"""
        if 0 <= intended_index < len(self._players):
            # Directly set the current player - they will be the one to roll
            self._current_player_index = intended_index
            print(f"Admin set turn: current player is now {intended_index}")
            return intended_index
        return None

    def get_game_status(self):
        return self._game_state

    # get the total status of the current game
    # return: return a 4 element tuple:
    # (players, board, current_player_index,game_state)
    def get_status(self):
        return (self.get_players(), self._board,
                self._current_player_index, self.get_game_status())

    # notifications
    def notify_new_game(self):
        for handler in self._handlers:
            handler.on_new_game()

    def notify_game_ended(self):
        for handler in self._handlers:
            handler.on_game_ended()

    def notify_rolled(self):
        for handler in self._handlers:
            handler.on_rolled()

    def notify_player_changed(self):
        for handler in self._handlers:
            handler.on_player_changed()

    def notify_decision_made(self):
        for handler in self._handlers:
            handler.on_decision_made()

    def notify_result_applied(self):
        for handler in self._handlers:
            handler.on_result_applied()

    def notify_error(self, err_msg):
        for handler in self._handlers:
            handler.on_error(err_msg)

    def notify_pass_start(self):
        for handler in self._handlers:
            handler.on_pass_start()


# example of the event handler
class MonopolyHandler(object):
    def on_error(self, err_msg):
        pass

    def on_new_game(self):
        pass

    def on_game_ended(self):
        pass

    def on_rolled(self):
        pass

    def on_player_changed(self):
        pass

    def on_decdision_made(self):
        pass

    def on_result_applied(self):
        pass

    def on_pass_start(self):
        pass


class InternalLogHandler(MonopolyHandler):

    def __init__(self, g):
        self.game = g

    def on_error(self, err_msg):
        print(('[Error] [Game ID: {0}]'.format(self.game.get_game_id()) + err_msg))

    def on_rolled(self):
        print(('[Info] [Game ID: {0}]current player {1} is rolling'.format(
            self.game.get_game_id(), self.game.get_current_player().get_index())))

    def on_decision_made(self):
        print(('[Info] [Game ID: {0} ]Decision is made'.format(
            self.game.get_game_id())))

    def on_new_game(self):
        print(('[Info] [Game ID: {0}] '.format(self.game.get_game_id()) + \
              "Game Started"))

    def on_game_ended(self):
        print(('[Info] [Game ID: {0}] '.format(self.game.get_game_id()) + \
              "Game Ended"))
        print(('[Info] The player {0} has go bankruptcy'.format(
            self.game.get_current_player().get_index())))

    def on_player_changed(self):
        print(('[Info] [Game Id: {0}] '.format(self.game.get_game_id()) + \
              "Player changed to : {0}".format(
                  self.game.get_current_player().get_index())))

    def on_result_applied(self):
        pass

    def on_pass_start(self):
        print(('[Info] [Game ID: {0}] '.format(self.game.get_game_id()) + \
              "Player {0} just passed the start point".format(
                  self.game.get_current_player().get_index())))
