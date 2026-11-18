import json

import pytest
from pydantic import ValidationError

from app.extraction_prompt import build_chapter_input, load_extraction_system_prompt
from app.extraction_schemas import (
    ChapterExtraction,
    ChapterParagraph,
    EntityType,
    KnownEntity,
    normalize_extraction,
    validate_chapter_references,
    validate_entity_references,
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


def test_reference_validation_repairs_wrong_fact_reference_from_source_text() -> None:
    result = ChapterExtraction.model_validate(
        {
            "entities": [],
            "aliases": [],
            "facts": [
                {
                    "entity_name": "Marta",
                    "text": "Marta hat die Wahrheit erfahren.",
                    "paragraph_ref": "p3",
                    "source_excerpt": "Marta erfuhr die Wahrheit.",
                    "kind": "event",
                }
            ],
            "relationships": [],
        }
    )
    paragraphs = [
        ChapterParagraph(reference="p3", text="Marta wartete."),
        ChapterParagraph(reference="p13", text="Marta erfuhr die Wahrheit."),
    ]

    repaired = validate_chapter_references(result, paragraphs)

    assert repaired.facts[0].paragraph_ref == "p13"


def test_reference_validation_repairs_unknown_references_within_the_block() -> None:
    result = ChapterExtraction.model_validate(
        {
            "entities": [
                {
                    "canonical_name": "Marta",
                    "entity_type": "person",
                    "first_mention_ref": "p99",
                }
            ],
            "aliases": [
                {
                    "entity_name": "Marta",
                    "alias": "die Wirtin",
                    "paragraph_ref": "p98",
                }
            ],
            "facts": [],
            "relationships": [],
        }
    )
    paragraphs = [
        ChapterParagraph(reference="p0", text="Der Raum war leer."),
        ChapterParagraph(reference="p1", text="Die Wirtin Marta trat ein."),
    ]

    repaired = validate_chapter_references(result, paragraphs)

    assert repaired.entities[0].first_mention_ref == "p1"
    assert repaired.aliases[0].paragraph_ref == "p1"


def test_reference_validation_uses_later_relationship_endpoint() -> None:
    result = ChapterExtraction.model_validate(
        {
            "entities": [],
            "aliases": [],
            "facts": [],
            "relationships": [
                {
                    "entity_a_name": "Dudley",
                    "entity_b_name": "Harry",
                    "label": "Bekannt",
                    "paragraph_ref": "p3",
                }
            ],
        }
    )
    paragraphs = [
        ChapterParagraph(reference="p3", text="Dudley spielte."),
        ChapterParagraph(reference="p12", text="Harry wurde erwähnt."),
    ]

    repaired = validate_chapter_references(result, paragraphs)

    assert repaired.relationships[0].paragraph_ref == "p12"


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


def test_reference_validation_repairs_unknown_entity_reference() -> None:
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

    repaired = validate_chapter_references(
        result,
        [ChapterParagraph(reference="p0", text="Marta kommt herein.")],
    )

    assert repaired.entities[0].first_mention_ref == "p0"


def test_reference_validation_accepts_non_verbatim_excerpt() -> None:
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

    repaired = validate_chapter_references(
        result,
        [ChapterParagraph(reference="p0", text="Marta ist Wirtin.")],
    )

    assert repaired.facts[0].source_excerpt == "Marta ist Königin."


def test_reference_validation_preserves_ellipsis_excerpt() -> None:
    result = ChapterExtraction.model_validate(
        {
            "entities": [],
            "aliases": [],
            "facts": [
                {
                    "entity_name": "Albus Dumbledore",
                    "text": "Albus Dumbledore ist am Ligusterweg erschienen.",
                    "paragraph_ref": "p18",
                    "source_excerpt": (
                        "An der Ecke erschien ein Mann, so jäh und lautlos..."
                        "Der Name dieses Mannes war Albus Dumbledore."
                    ),
                    "kind": "event",
                }
            ],
            "relationships": [],
        }
    )
    paragraphs = [
        ChapterParagraph(
            reference="p18",
            text=(
                "An der Ecke, die sie beobachtet hatte, erschien ein Mann, "
                "so jäh und lautlos, als wäre er geradewegs aus dem Boden gewachsen. "
                "Der Name dieses Mannes war Albus Dumbledore."
            ),
        )
    ]

    repaired = validate_chapter_references(result, paragraphs)

    assert repaired.facts[0].source_excerpt == (
        "An der Ecke erschien ein Mann, so jäh und lautlos..."
        "Der Name dieses Mannes war Albus Dumbledore."
    )


def test_future_relationship_reference_is_not_accepted_or_shifted() -> None:
    result = ChapterExtraction.model_validate(
        {
            "entities": [
                {
                    "canonical_name": "Harry",
                    "entity_type": "person",
                    "first_mention_ref": "p12",
                }
            ],
            "aliases": [],
            "facts": [],
            "relationships": [
                {
                    "entity_a_name": "Dudley",
                    "entity_b_name": "Harry",
                    "label": "Bekannt",
                    "paragraph_ref": "p3",
                }
            ],
        }
    )
    paragraphs = [
        ChapterParagraph(reference="p3", text="Dudley war anwesend."),
        ChapterParagraph(reference="p12", text="Harry wurde erwähnt."),
    ]

    with pytest.raises(ValueError, match=r"relationships\[0\].*not known.*do not move"):
        validate_entity_references(result, paragraphs, [])


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

    assert "later chapters" in prompt
    assert "global positions" in prompt
    assert "same or an earlier paragraph" in prompt


def test_entity_references_follow_supplied_order_and_alias_positions() -> None:
    paragraphs = [
        ChapterParagraph(reference="p10", text="Nora appears."),
        ChapterParagraph(reference="p2", text="Nora is called N."),
    ]
    result = ChapterExtraction.model_validate({
        "entities": [{
            "canonical_name": "Nora", "entity_type": "person", "first_mention_ref": "p10"
        }],
        "aliases": [{"entity_name": "Nora", "alias": "N", "paragraph_ref": "p2"}],
        "facts": [{
            "entity_name": "N", "text": "Known.", "paragraph_ref": "p2",
            "source_excerpt": "Nora", "kind": "description",
        }],
        "relationships": [],
    })
    validate_chapter_references(result, paragraphs)
    assert validate_entity_references(result, paragraphs, []) == result
    result.facts[0].paragraph_ref = "p10"
    with pytest.raises(ValueError, match=r"facts\[0\]"):
        validate_entity_references(result, paragraphs, [])


def test_known_alias_is_available_from_start_and_ambiguity_is_rejected() -> None:
    paragraphs = [ChapterParagraph(reference="p0", text="First paragraph.")]
    result = ChapterExtraction.model_validate({
        "entities": [], "aliases": [],
        "facts": [{
            "entity_name": "N", "text": "A fact", "paragraph_ref": "p0",
            "source_excerpt": "First", "kind": "description",
        }],
        "relationships": [],
    })
    known = [KnownEntity(canonical_name="Nora", entity_type="person", aliases=["N"])]
    assert validate_entity_references(result, paragraphs, known) == result
    known.append(KnownEntity(canonical_name="N", entity_type="person"))
    with pytest.raises(ValueError, match="ambiguous"):
        validate_entity_references(result, paragraphs, known)


def test_normalize_extraction_uses_known_canonical_names_and_types() -> None:
    result = ChapterExtraction.model_validate({
        "entities": [
            {
                "canonical_name": "Harry Potter",
                "entity_type": "person",
                "first_mention_ref": "p0",
            },
            {
                "canonical_name": "Rubeus Hagrid",
                "entity_type": "person",
                "first_mention_ref": "p14",
            },
        ],
        "aliases": [],
        "facts": [
            {
                "entity_name": "Harry",
                "text": "Harry lebt bei den Dursleys.",
                "paragraph_ref": "p3",
                "source_excerpt": "Harry",
                "kind": "description",
            }
        ],
        "relationships": [],
    })
    paragraphs = [
        ChapterParagraph(reference="p3", text="Harry kommt zu seiner Tante."),
        ChapterParagraph(reference="p14", text="Hagrid brachte das Kind."),
    ]
    known = [
        KnownEntity(
            canonical_name="HARRY POTTER",
            entity_type=EntityType.CONCEPT,
        ),
        KnownEntity(
            canonical_name="Rubeus Hagrid",
            entity_type=EntityType.PERSON,
        ),
    ]

    normalized = normalize_extraction(result, paragraphs, known)

    assert normalized.entities == []
    assert normalized.facts[0].entity_name == "HARRY POTTER"
    assert normalized.facts[0].paragraph_ref == "p3"


def test_normalize_extraction_drops_unresolved_relationships_and_aliases() -> None:
    result = ChapterExtraction.model_validate({
        "entities": [],
        "aliases": [
            {
                "entity_name": "Unknown Person",
                "alias": "Mystery",
                "paragraph_ref": "p0",
            }
        ],
        "facts": [],
        "relationships": [
            {
                "entity_a_name": "Unknown Person",
                "entity_b_name": "Unknown Place",
                "label": "bekannt",
                "paragraph_ref": "p0",
            }
        ],
    })
    paragraphs = [ChapterParagraph(reference="p0", text="Die Geschichte beginnt.")]

    normalized = normalize_extraction(result, paragraphs, [])

    assert normalized.aliases == []
    assert normalized.relationships == []


def test_multiple_entity_type_conflicts_are_reported_together() -> None:
    paragraphs = [ChapterParagraph(reference="p0", text="Nora and Marta appear.")]
    result = ChapterExtraction.model_validate({
        "entities": [
            {
                "canonical_name": "Nora",
                "entity_type": "place",
                "first_mention_ref": "p0",
            },
            {
                "canonical_name": "Marta",
                "entity_type": "group",
                "first_mention_ref": "p0",
            },
        ],
        "aliases": [],
        "facts": [],
        "relationships": [],
    })
    known = [
        KnownEntity(canonical_name="Nora", entity_type=EntityType.PERSON),
        KnownEntity(canonical_name="Marta", entity_type=EntityType.PERSON),
    ]

    with pytest.raises(ValueError) as caught:
        validate_entity_references(result, paragraphs, known)

    message = str(caught.value)
    assert "entities[0].entity_type" in message
    assert "existing type: person" in message
    assert "received type: place" in message
    assert "entities[1].entity_type" in message
    assert "received type: group" in message


def test_reference_validation_rejects_conflicting_alias_owner_and_type() -> None:
    paragraphs = [ChapterParagraph(reference="p0", text="Two people.")]
    known = [
        KnownEntity(canonical_name="Nora", entity_type="person"),
        KnownEntity(canonical_name="Marta", entity_type="person"),
    ]
    conflict = ChapterExtraction.model_validate({
        "entities": [], "facts": [], "relationships": [],
        "aliases": [{"entity_name": "Nora", "alias": "Marta", "paragraph_ref": "p0"}],
    })
    with pytest.raises(ValueError, match="different entity"):
        validate_entity_references(conflict, paragraphs, known)
    conflict = ChapterExtraction.model_validate({
        "entities": [{"canonical_name": "Nora", "entity_type": "place", "first_mention_ref": "p0"}],
        "aliases": [], "facts": [], "relationships": [],
    })
    with pytest.raises(ValueError, match="existing type: person"):
        validate_entity_references(conflict, paragraphs, known)
