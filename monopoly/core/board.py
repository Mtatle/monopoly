from .land import *


class Board(object):

    def __init__(self):
        self._lands = []
        self.generate_lands()

    def get_lands(self):
        return self._lands

    def get_land(self, index):
        return self._lands[index]

    def generate_lands(self):
        # 7x7 Board with 24 tiles (0-23) - Custom Support Service Board Game
        self._lands.append(Land(0, "Start", StartLand(START_REWARD)))
        self._lands.append(Land(1, "Riddle me this", QuestionLand()))
        self._lands.append(Land(2, "Flash round", FlashRoundLand()))
        self._lands.append(Land(3, "Moonstar response station", ResponseStationLand()))
        self._lands.append(Land(4, "Mystery Mash", SurpriseLand()))
        self._lands.append(Land(5, "Golden chest", GoldenChestLand()))
        self._lands.append(Land(6, "QA Jail", JailLand(1)))
        self._lands.append(Land(7, "Double or nothing", DoubleOrNothingLand()))
        self._lands.append(Land(8, "Riddleton place", QuestionLand()))
        self._lands.append(Land(9, "Starlight response station", ResponseStationLand()))
        self._lands.append(Land(10, "Mystery Mash", SurpriseLand()))
        self._lands.append(Land(11, "Flash round", FlashRoundLand()))
        self._lands.append(Land(12, "Best Agent", BestAgentLand()))
        self._lands.append(Land(13, "Mystery Mash", SurpriseLand()))
        self._lands.append(Land(14, "Flash round", FlashRoundLand()))
        self._lands.append(Land(15, "Sunshine Response station", ResponseStationLand()))
        self._lands.append(Land(16, "Connectivity cost center", ConnectivityCostLand()))
        self._lands.append(Land(17, "Problem Plaza", QuestionLand()))
        self._lands.append(Land(18, "Go to QA Jail", GoToJailLand()))
        self._lands.append(Land(19, "Flash round", FlashRoundLand()))
        self._lands.append(Land(20, "Training Time", TrainingTimeLand()))
        self._lands.append(Land(21, "Moonlight response station", ResponseStationLand()))
        self._lands.append(Land(22, "Coupon Court", QuestionLand()))
        self._lands.append(Land(23, "Mystery Mash", SurpriseLand()))

    def get_grid_num(self):
        return len(self._lands)


def test():
    b = Board()
    assert b.get_land(1).get_position() == 1
    assert b.get_land(6).get_content().get_type() == LandType.JAIL  # Updated for 7x7 board


if __name__ == "__main__":
    test()
