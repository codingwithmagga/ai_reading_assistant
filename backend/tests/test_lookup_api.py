from fastapi.testclient import TestClient

from tests.api_helpers import create_lookup_book


def test_entity_list_hides_entities_and_aliases_until_introduced(client: TestClient) -> None:
    book_id = create_lookup_book(client)
    expected_names = [
        {"Marta"},
        {"Marta", "Dorf"},
        {"Marta", "Dorf", "Lea"},
        {"Marta", "Dorf", "Lea"},
        {"Marta", "Dorf", "Lea", "Geheimnis"},
        {"Marta", "Dorf", "Lea", "Geheimnis"},
    ]

    for position, names in enumerate(expected_names):
        response = client.get(
            f"/books/{book_id}/entities",
            params={"position": position},
        )

        assert response.status_code == 200
        entities = response.json()
        assert {entity["canonical_name"] for entity in entities} == names
        assert all(entity["first_position"] <= position for entity in entities)
        for entity in entities:
            assert all(alias["first_position"] <= position for alias in entity["aliases"])

    at_position_0 = client.get(
        f"/books/{book_id}/entities",
        params={"position": 0},
    ).json()
    assert at_position_0[0]["aliases"] == []
    at_position_1 = client.get(
        f"/books/{book_id}/entities",
        params={"position": 1},
    ).json()
    marta = next(entity for entity in at_position_1 if entity["canonical_name"] == "Marta")
    assert {alias["alias"] for alias in marta["aliases"]} == {"die Wirtin"}

    all_entities = client.get(
        f"/books/{book_id}/entities",
        params={"position": 5},
    ).json()
    assert [entity["canonical_name"] for entity in all_entities] == [
        "Marta",
        "Dorf",
        "Lea",
        "Geheimnis",
    ]

    people = client.get(
        f"/books/{book_id}/entities",
        params={"position": 5, "type": "person"},
    )
    assert people.status_code == 200
    assert [entity["canonical_name"] for entity in people.json()] == ["Marta", "Lea"]

    invalid_type = client.get(
        f"/books/{book_id}/entities",
        params={"position": 5, "type": "unknown"},
    )
    assert invalid_type.status_code == 422


def test_lookup_filters_every_fact_and_relationship_by_reading_position(
    client: TestClient,
) -> None:
    book_id = create_lookup_book(client)

    for position in range(6):
        response = client.get(
            f"/books/{book_id}/lookup",
            params={"q": "Marta", "position": position},
        )

        assert response.status_code == 200
        payload = response.json()
        serialized = response.text
        assert "Marta führt den Laden." not in serialized or position >= 2
        assert "Marta kennt den geheimen Plan." not in serialized or position == 5
        assert "Geheimnis" not in serialized or position >= 4
        assert "lebt in" not in serialized or position >= 2
        assert "kennt" not in serialized or position >= 4
        matches = payload["matches"]
        if position == 0:
            assert matches[0]["facts"][0]["text"] == "Marta erscheint."
            assert matches[0]["facts"][0]["source_excerpt"] == "Marta trat ein."
            assert matches[0]["facts"][0]["chapter_index"] == 0
        for match in matches:
            assert all(fact["position"] <= position for fact in match["facts"])
            assert all(
                relationship["position"] <= position for relationship in match["relationships"]
            )
            assert all(alias["first_position"] <= position for alias in match["aliases"])
            for relationship in match["relationships"]:
                assert relationship["entity_a"]["first_position"] <= position
                assert relationship["entity_b"]["first_position"] <= position

    before_relationship = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "Marta", "position": 1},
    ).json()["matches"][0]
    assert before_relationship["relationships"] == []
    after_relationship = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "Marta", "position": 2},
    ).json()["matches"][0]
    assert [item["label"] for item in after_relationship["relationships"]] == ["lebt in"]


def test_lookup_alias_is_position_gated_and_ambiguous_alias_is_not_collapsed(
    client: TestClient,
) -> None:
    book_id = create_lookup_book(client)
    hidden_alias = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "die Fremde", "position": 2},
    )
    assert hidden_alias.status_code == 200
    assert hidden_alias.json()["matches"] == []

    introduced_alias = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "die Fremde", "position": 3},
    )
    assert introduced_alias.status_code == 200
    assert {match["entity"]["canonical_name"] for match in introduced_alias.json()["matches"]} == {
        "Marta",
        "Lea",
    }
    assert all(
        relationship["entity_a"]["first_position"] <= 3
        and relationship["entity_b"]["first_position"] <= 3
        for match in introduced_alias.json()["matches"]
        for relationship in match["relationships"]
    )

    hidden_later_alias = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "Frau Keller", "position": 3},
    )
    assert hidden_later_alias.status_code == 200
    assert hidden_later_alias.json()["matches"] == []

    partial_name = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "Mart", "position": 5},
    )
    assert partial_name.status_code == 200
    assert partial_name.json()["matches"] == []


def test_lookup_rejects_invalid_positions_and_empty_queries(client: TestClient) -> None:
    book_id = create_lookup_book(client)

    for position in (-1, 6):
        response = client.get(
            f"/books/{book_id}/lookup",
            params={"q": "Marta", "position": position},
        )
        assert response.status_code == 422

    empty_query = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "  ", "position": 0},
    )
    assert empty_query.status_code == 422


def test_lookup_reports_unknown_books_and_empty_extraction_as_empty_results(
    client: TestClient,
) -> None:
    missing = client.get(
        "/books/missing/lookup",
        params={"q": "Marta", "position": 0},
    )
    assert missing.status_code == 404
    missing_entities = client.get(
        "/books/missing/entities",
        params={"position": 0},
    )
    assert missing_entities.status_code == 404

    empty_book_id = create_lookup_book(client, with_extraction=False)
    entities = client.get(
        f"/books/{empty_book_id}/entities",
        params={"position": 0},
    )
    lookup = client.get(
        f"/books/{empty_book_id}/lookup",
        params={"q": "Marta", "position": 0},
    )
    assert entities.status_code == 200
    assert entities.json() == []
    assert lookup.status_code == 200
    assert lookup.json()["matches"] == []


def test_recap_returns_only_position_filtered_events_and_characters(client: TestClient) -> None:
    book_id = create_lookup_book(client)
    expected_events = [
        ["Marta erscheint."],
        ["Marta erscheint."],
        ["Marta erscheint."],
        ["Marta erscheint."],
        ["Marta erscheint."],
        ["Marta erscheint.", "Marta kennt den geheimen Plan."],
    ]

    for position, event_texts in enumerate(expected_events):
        response = client.get(
            f"/books/{book_id}/recap",
            params={"position": position},
        )

        assert response.status_code == 200
        recap = response.json()
        assert recap["position"] == position
        assert [event["text"] for event in recap["events"]] == event_texts
        assert all(event["position"] <= position for event in recap["events"])
        assert all(event["entity"]["first_position"] <= position for event in recap["events"])
        assert all(event["chapter_id"] and event["source_excerpt"] for event in recap["events"])
        assert [character["canonical_name"] for character in recap["characters"]] == (
            ["Marta"] if position < 2 else ["Marta", "Lea"]
        )
        for character in recap["characters"]:
            assert character["first_position"] <= position
            assert all(alias["first_position"] <= position for alias in character["aliases"])


def test_recap_reports_position_errors_unknown_books_and_empty_extraction(
    client: TestClient,
) -> None:
    book_id = create_lookup_book(client)
    invalid_position = client.get(
        f"/books/{book_id}/recap",
        params={"position": 6},
    )
    assert invalid_position.status_code == 422
    assert invalid_position.json()["detail"]["code"] == "invalid_reading_position"

    missing_book = client.get("/books/missing/recap", params={"position": 0})
    assert missing_book.status_code == 404

    empty_book_id = create_lookup_book(client, with_extraction=False)
    empty_recap = client.get(
        f"/books/{empty_book_id}/recap",
        params={"position": 0},
    )
    assert empty_recap.status_code == 200
    assert empty_recap.json()["events"] == []
    assert empty_recap.json()["characters"] == []


def test_notes_export_contains_only_data_known_at_each_inclusive_position(
    client: TestClient,
) -> None:
    book_id = create_lookup_book(client)

    for position in range(6):
        response = client.get(
            f"/books/{book_id}/export",
            params={"position": position},
        )

        assert response.status_code == 200
        export = response.json()
        assert export["book_id"] == book_id
        assert export["position"] == position
        assert export["title"] == "Synthetischer Roman"
        assert "Absatz " not in response.text
        assert "Geheimnis" not in response.text or position >= 4
        assert "Frau Keller" not in response.text or position >= 4
        assert "Marta kennt den geheimen Plan." not in response.text or position >= 5

        for entity in export["entities"]:
            assert entity["first_position"] <= position
            assert all(alias["first_position"] <= position for alias in entity["aliases"])
            assert all(fact["position"] <= position for fact in entity["facts"])
        for relationship in export["relationships"]:
            assert relationship["position"] <= position
            assert relationship["entity_a"]["first_position"] <= position
            assert relationship["entity_b"]["first_position"] <= position
        assert all(event["position"] <= position for event in export["events"])

    before_introduction = client.get(
        f"/books/{book_id}/export",
        params={"position": 3},
    ).json()
    assert [entity["canonical_name"] for entity in before_introduction["entities"]] == [
        "Marta",
        "Dorf",
        "Lea",
    ]
    assert [relationship["label"] for relationship in before_introduction["relationships"]] == [
        "lebt in"
    ]


def test_notes_export_validates_book_and_position_and_allows_empty_extraction(
    client: TestClient,
) -> None:
    missing = client.get("/books/missing/export", params={"position": 0})
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "book_not_found"

    book_id = create_lookup_book(client)
    invalid_position = client.get(
        f"/books/{book_id}/export",
        params={"position": 6},
    )
    assert invalid_position.status_code == 422
    assert invalid_position.json()["detail"]["code"] == "invalid_reading_position"

    empty_book_id = create_lookup_book(client, with_extraction=False)
    empty_export = client.get(
        f"/books/{empty_book_id}/export",
        params={"position": 0},
    )
    assert empty_export.status_code == 200
    assert empty_export.json()["entities"] == []
    assert empty_export.json()["relationships"] == []
    assert empty_export.json()["events"] == []
