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
        self._lands.append(Land(1, "Empathy Lane", QuestionLand()))
        self._lands.append(Land(2, "Surprise Card", SurpriseLand()))
        self._lands.append(Land(3, "Response Station", ResponseStationLand()))
        self._lands.append(Land(4, "Knowledge Knoll", QuestionLand()))
        self._lands.append(Land(5, "Golden Chest", GoldenChestLand()))
        self._lands.append(Land(6, "QA Jail", JailLand(1)))
        self._lands.append(Land(7, "Escalation Ave", QuestionLand()))
        self._lands.append(Land(8, "Riddleton Place", QuestionLand()))
        self._lands.append(Land(9, "Response Station", ResponseStationLand()))
        self._lands.append(Land(10, "Surprise Card", SurpriseLand()))
        self._lands.append(Land(11, "Sale-A-Vie Blvd", QuestionLand()))
        self._lands.append(Land(12, "Best Agent", BestAgentLand()))
        self._lands.append(Land(13, "Surprise Card", SurpriseLand()))
        self._lands.append(Land(14, "Knowledge Square", QuestionLand()))
        self._lands.append(Land(15, "Response Station", ResponseStationLand()))
        self._lands.append(Land(16, "Connectivity Cost Center", ConnectivityCostLand()))
        self._lands.append(Land(17, "Problem Plaza", QuestionLand()))
        self._lands.append(Land(18, "Go to QA Jail", GoToJailLand()))
        self._lands.append(Land(19, "Inquiry Inspections", QuestionLand()))
        self._lands.append(Land(20, "Training Time", TrainingTimeLand()))
        self._lands.append(Land(21, "Coupon Court", QuestionLand()))
        self._lands.append(Land(22, "Resolution Road", QuestionLand()))
        self._lands.append(Land(23, "Surprise Card", SurpriseLand()))

    def get_grid_num(self):
        return len(self._lands)


def test():
    b = Board()
    assert b.get_land(1).get_position() == 1
    assert b.get_land(6).get_content().get_type() == LandType.JAIL  # Updated for 7x7 board


if __name__ == "__main__":
    test()
