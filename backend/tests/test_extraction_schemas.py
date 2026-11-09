import json

import pytest
from pydantic import ValidationError

from app.extraction_prompt import build_chapter_input, load_extraction_system_prompt
from app.extraction_schemas import (
    ChapterExtraction,
    ChapterParagraph,
    EntityType,
    KnownEntity,
    validate_chapter_references,
)


def test_chapter_extraction_accepts_supported_data() -> None:
    result = ChapterExtraction.model_validate(
        {
            "entities": [
                {
                    "canonical_name": "Marta",
                    "entity_type": "person",
                    "first_mention_ref": "p0",
                }
            ],
            "aliases": [
                {
                    "entity_name": "Marta",
                    "alias": "die Wirtin",
                    "paragraph_ref": "p0",
                }
            ],
            "facts": [
                {
                    "entity_name": "Marta",
                    "text": "Marta ist Wirtin.",
                    "paragraph_ref": "p0",
                    "source_excerpt": "Marta ist Wirtin.",
                    "kind": "description",
                }
            ],
            "relationships": [],
        }
    )
    paragraphs = [ChapterParagraph(reference="p0", text="Marta ist Wirtin.")]

    assert validate_chapter_references(result, paragraphs) == result


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {
            "entities": [
                {"canonical_name": "Marta", "entity_type": "animal", "first_mention_ref": "p0"}
            ]
        },
        {"entities": [{"canonical_name": " ", "entity_type": "person", "first_mention_ref": "p0"}]},
        {
            "entities": [
                {
                    "canonical_name": "Marta",
                    "entity_type": "person",
                    "first_mention_ref": "p0",
                    "position": 42,
                }
            ]
        },
        {
            "entities": [
                {"canonical_name": "Marta", "entity_type": "person", "first_mention_ref": "p0"}
            ],
            "position": 42,
        },
        {
            "facts": [
                {
                    "entity_name": "Marta",
                    "text": "Fakt",
                    "paragraph_ref": "p0",
                    "source_excerpt": "x" * 201,
                    "kind": "description",
                }
            ]
        },
        {
            "facts": [
                {
                    "entity_name": "Marta",
                    "text": "Fakt",
                    "paragraph_ref": "p0",
                    "source_excerpt": "Beleg",
                    "kind": "unknown",
                }
            ]
        },
        {
            "entities": [
                {
                    "canonical_name": "Marta",
                    "entity_type": "person",
                    "first_mention_ref": "chapter-1",
                }
            ]
        },
    ],
)
def test_chapter_extraction_rejects_invalid_or_unexpected_fields(payload: dict) -> None:
    with pytest.raises(ValidationError):
        ChapterExtraction.model_validate(payload)


def test_chapter_extraction_rejects_duplicate_entity_names() -> None:
    with pytest.raises(ValidationError, match="eindeutig"):
        ChapterExtraction.model_validate(
            {
                "entities": [
                    {"canonical_name": "Marta", "entity_type": "person", "first_mention_ref": "p0"},
                    {"canonical_name": "marta", "entity_type": "person", "first_mention_ref": "p0"},
                ],
                "aliases": [],
                "facts": [],
                "relationships": [],
            }
        )


def test_reference_validation_rejects_unknown_reference() -> None:
    result = ChapterExtraction.model_validate(
        {
            "entities": [
                {"canonical_name": "Marta", "entity_type": "person", "first_mention_ref": "p2"}
            ],
            "aliases": [],
            "facts": [],
            "relationships": [],
        }
    )

    with pytest.raises(ValueError, match="p2"):
        validate_chapter_references(
            result,
            [ChapterParagraph(reference="p0", text="Marta kommt herein.")],
        )


def test_reference_validation_rejects_non_verbatim_excerpt() -> None:
    result = ChapterExtraction.model_validate(
        {
            "facts": [
                {
                    "entity_name": "Marta",
                    "text": "Marta ist Wirtin.",
                    "paragraph_ref": "p0",
                    "source_excerpt": "Marta ist Königin.",
                    "kind": "description",
                }
            ],
            "entities": [],
            "aliases": [],
            "relationships": [],
        }
    )

    with pytest.raises(ValueError, match="Quellauszug"):
        validate_chapter_references(
            result,
            [ChapterParagraph(reference="p0", text="Marta ist Wirtin.")],
        )


def test_reference_validation_rejects_duplicate_input_references() -> None:
    with pytest.raises(ValueError, match="eindeutig"):
        validate_chapter_references(
            ChapterExtraction(entities=[], aliases=[], facts=[], relationships=[]),
            [
                ChapterParagraph(reference="p0", text="Absatz eins."),
                ChapterParagraph(reference="p0", text="Absatz zwei."),
            ],
        )


def test_chapter_input_only_contains_local_references_and_supplied_text() -> None:
    request = build_chapter_input(
        chapter_title="Kapitel 1",
        paragraphs=[ChapterParagraph(reference="p0", text="Marta kommt herein.")],
        known_entities=[KnownEntity(canonical_name="Marta", entity_type=EntityType.PERSON)],
    )
    payload = json.loads(request)

    assert payload["paragraphs"] == [{"reference": "p0", "text": "Marta kommt herein."}]
    assert payload["known_entities"] == [
        {"canonical_name": "Marta", "entity_type": "person", "aliases": []}
    ]
    assert "position" not in request
    assert "global_position" not in request
    assert "p1" not in request


def test_system_prompt_forbids_later_chapters_and_global_positions() -> None:
    prompt = load_extraction_system_prompt()

    assert "späteren Kapiteln" in prompt
    assert "keine globalen Positionen" in prompt
