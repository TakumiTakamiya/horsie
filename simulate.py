from typing import Literal
from random import Random
from icecream import ic
from tqdm import tqdm

LENGTH_LITERAL = Literal["S", "M", "L"]
PATTERN_LITERAL = Literal["D2", "DD", "D2J", "DDJ", "D2JJ", "DDJJ"]
DECK_LITERAL = Literal["S1", "S2", "S3", "S4", "J"]
JOKERLESS_DECK_LITERAL = Literal["S1", "S2", "S3", "S4"]
RESULT_LITERAL = Literal["@@@", "@@D", "@D@", "@DD", "D@@", "D@D", "DD@"]

DD_RESULTS: list[RESULT_LITERAL] = ["DD@", "D@D", "D@@", "@DD", "@D@", "@@D"]
D2_RESULTS: list[RESULT_LITERAL] = ["D@@", "@D@", "@@D", "@@@"]


def get_length(length: LENGTH_LITERAL) -> int:
    if length == "S":
        return 4
    elif length == "M":
        return 5
    elif length == "L":
        return 6
    else:
        raise ValueError(f"Invalid length: {length}")


def generate_track(rng: Random, length: LENGTH_LITERAL) -> list[JOKERLESS_DECK_LITERAL]:
    track = ["S1"] * 13 + ["S2"] * 13 + ["S3"] * 13 + ["S4"] * 13
    rng.shuffle(track)
    return track[: get_length(length)]


def generate_deck(rng: Random, pattern: PATTERN_LITERAL) -> list[DECK_LITERAL]:
    jokers = ["J", "J"]
    if "JJ" in pattern:
        jokers = []
    elif "J" in pattern:
        jokers = ["J"]
    if "D2" in pattern:
        numbers = ["S1"] * 10 + ["S2"] * 12 + ["S3"] * 12 + ["S4"] * 12
    else:
        numbers = ["S1"] * 11 + ["S2"] * 11 + ["S3"] * 12 + ["S4"] * 12
    deck = numbers + jokers
    rng.shuffle(deck)
    return deck


def simulate_deck(
    deck: list[DECK_LITERAL],
    track: list[JOKERLESS_DECK_LITERAL],
) -> str:
    position = {"S1": -1, "S2": -1, "S3": -1, "S4": -1}
    result = ""
    slowest_position = -1

    for d in deck:
        if d in position:
            # 未ゴールのスートが出たら、進める。
            position[d] += 1
            if position[d] == len(track):
                del position[d]
                result += d
                if len(position) == 0:
                    return result
            # 初回到達したトラックがあれば開く
            if min(position.values()) > slowest_position:
                slowest_position = min(position.values())
                target = track[slowest_position]
                if target in position:
                    position[track[slowest_position]] -= 1
        elif "J" == d:
            # 最前のスート以外を後退させる
            laters = []
            for key, pos in position.items():
                if pos < max(position.values()):
                    laters.append(key)
            for key in laters:
                if position[key] >= 0:
                    position[key] -= 1
    return result


def simulate(
    pattern: PATTERN_LITERAL, length: LENGTH_LITERAL
) -> dict[RESULT_LITERAL, int]:
    if "DD" in pattern:
        result_counts = {r: 0 for r in DD_RESULTS}
    else:
        result_counts = {r: 0 for r in D2_RESULTS}

    for seed in tqdm(range(100000)):
        rng = Random(seed)
        track = generate_track(rng, length)
        deck = generate_deck(rng, pattern)
        result = simulate_deck(deck, track)
        if "DD" in pattern:
            result = (
                result.replace("S1", "D")
                .replace("S2", "D")
                .replace("S3", "@")
                .replace("S4", "@")[:3]
            )
        else:
            result = (
                result.replace("S1", "D")
                .replace("S2", "@")
                .replace("S3", "@")
                .replace("S4", "@")[:3]
            )
        if result not in result_counts:
            print(f"Unexpected result: {result} at pattern {pattern}")
        else:
            result_counts[result] += 1
    return result_counts


def simulate_all() -> dict[PATTERN_LITERAL, dict[RESULT_LITERAL, int]]:
    length_pattern = ["S", "M", "L"]
    patterns: list[PATTERN_LITERAL] = ["D2", "DD", "D2J", "DDJ", "D2JJ", "DDJJ"]
    all_results: dict[str, dict[RESULT_LITERAL, int]] = {}
    for length in length_pattern:
        for pattern in patterns:
            all_results[length + pattern] = simulate(pattern, length)
    return all_results


if __name__ == "__main__":
    ic(simulate_all())
