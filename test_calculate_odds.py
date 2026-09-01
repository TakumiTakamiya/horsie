import unittest

from calculate_odds import calculate_scenario, parse_scenario


def rows_by_key(rows):
    return {(row["wagerType"], row["selection"]): row for row in rows}


class CalculateOddsTests(unittest.TestCase):
    def test_d2_prefix_aggregation_and_equivalent_tickets(self):
        rows = rows_by_key(
            calculate_scenario(
                "SD2", {"D@@": 20, "@D@": 20, "@@D": 20, "@@@": 40}
            )
        )

        self.assertEqual(rows[("Win", "D")]["equivalentTickets"], 1)
        self.assertAlmostEqual(rows[("Win", "D")]["probabilityPercent"], 20)
        self.assertAlmostEqual(rows[("Win", "D")]["decimalOdds"], 5)
        self.assertEqual(rows[("Exacta", "@@")]["equivalentTickets"], 6)
        self.assertAlmostEqual(rows[("Exacta", "@@")]["probabilityPercent"], 10)
        self.assertAlmostEqual(rows[("Trifecta", "D@@")]["decimalOdds"], 30)

    def test_dd_equivalent_tickets(self):
        rows = rows_by_key(
            calculate_scenario(
                "MDD",
                {
                    "DD@": 10,
                    "D@D": 10,
                    "D@@": 10,
                    "@DD": 10,
                    "@D@": 10,
                    "@@D": 10,
                },
            )
        )

        self.assertEqual(rows[("Win", "D")]["equivalentTickets"], 2)
        self.assertAlmostEqual(rows[("Win", "D")]["probabilityPercent"], 25)
        self.assertEqual(rows[("Exacta", "DD")]["equivalentTickets"], 2)
        self.assertEqual(rows[("Exacta", "D@")]["equivalentTickets"], 4)
        self.assertEqual(rows[("Trifecta", "DD@")]["equivalentTickets"], 4)

    def test_each_wager_market_sums_to_one_hundred_percent(self):
        rows = calculate_scenario(
            "LDD", {"DD@": 2, "D@D": 3, "D@@": 5, "@DD": 7, "@D@": 11, "@@D": 13}
        )
        for wager_type in ("Win", "Exacta", "Trifecta"):
            market_total = sum(
                row["probabilityPercent"] * row["equivalentTickets"]
                for row in rows
                if row["wagerType"] == wager_type
            )
            self.assertAlmostEqual(market_total, 100)

    def test_recorded_total_is_the_denominator(self):
        rows = rows_by_key(
            calculate_scenario(
                "LD2", {"D@@": 9, "@D@": 18, "@@D": 27, "@@@": 36}
            )
        )
        self.assertAlmostEqual(rows[("Win", "D")]["probabilityPercent"], 10)

    def test_rows_are_sorted_by_wager_and_descending_odds(self):
        rows = calculate_scenario(
            "SD2", {"D@@": 20, "@D@": 20, "@@D": 20, "@@@": 40}
        )
        wager_order = ["Trifecta", "Exacta", "Win"]
        self.assertEqual(
            list(dict.fromkeys(row["wagerType"] for row in rows)), wager_order
        )
        for wager_type in wager_order:
            odds = [
                row["decimalOdds"]
                for row in rows
                if row["wagerType"] == wager_type
            ]
            self.assertEqual(odds, sorted(odds, reverse=True))

    def test_rejects_invalid_input(self):
        with self.assertRaisesRegex(ValueError, "Unsupported scenario"):
            parse_scenario("XD2")
        with self.assertRaisesRegex(ValueError, "nonnegative integer"):
            calculate_scenario("SD2", {"D@@": -1})
        with self.assertRaisesRegex(ValueError, "no valid trials"):
            calculate_scenario(
                "SD2", {"D@@": 0, "@D@": 0, "@@D": 0, "@@@": 0}
            )


if __name__ == "__main__":
    unittest.main()
