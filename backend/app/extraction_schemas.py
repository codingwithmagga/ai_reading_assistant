import re
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

ParagraphReference = Annotated[
    str,
    StringConstraints(pattern=r"^p[0-9]{1,6}$", min_length=2, max_length=7),
]
NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
ExcerptText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
]


class EntityType(StrEnum):
    PERSON = "person"
    PLACE = "place"
    GROUP = "group"
    OBJECT = "object"
    CONCEPT = "concept"


class FactKind(StrEnum):
    DESCRIPTION = "description"
    RELATIONSHIP = "relationship"
    EVENT = "event"
    MOTIVATION = "motivation"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EntityExtraction(StrictModel):
    canonical_name: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    entity_type: EntityType
    first_mention_ref: ParagraphReference


class AliasExtraction(StrictModel):
    entity_name: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    alias: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    paragraph_ref: ParagraphReference


class FactExtraction(StrictModel):
    entity_name: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    text: Annotated[str, StringConstraints(min_length=1, max_length=2_000)]
    paragraph_ref: ParagraphReference
    source_excerpt: ExcerptText
    kind: FactKind


class RelationshipExtraction(StrictModel):
    entity_a_name: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    entity_b_name: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    label: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    paragraph_ref: ParagraphReference


class ChapterExtraction(StrictModel):
    entities: list[EntityExtraction] = Field(default_factory=list, max_length=500)
    aliases: list[AliasExtraction] = Field(default_factory=list, max_length=1_000)
    facts: list[FactExtraction] = Field(default_factory=list, max_length=2_000)
    relationships: list[RelationshipExtraction] = Field(default_factory=list, max_length=1_000)

    @model_validator(mode="after")
    def reject_duplicate_entity_names(self) -> "ChapterExtraction":
        names = [entity.canonical_name.casefold() for entity in self.entities]
        if len(names) != len(set(names)):
            raise ValueError(
                "Kanonische Entitätsnamen müssen innerhalb der Antwort eindeutig sein."
            )
        return self


class ChapterParagraph(StrictModel):
    reference: ParagraphReference
    text: NonEmptyText


class KnownEntity(StrictModel):
    canonical_name: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    entity_type: EntityType
    aliases: list[Annotated[str, StringConstraints(min_length=1, max_length=500)]] = Field(
        default_factory=list,
        max_length=100,
    )


def validate_chapter_references(
    result: ChapterExtraction,
    paragraphs: list[ChapterParagraph],
) -> ChapterExtraction:
    allowed_refs = {paragraph.reference for paragraph in paragraphs}
    if len(allowed_refs) != len(paragraphs):
        raise ValueError("Absatzreferenzen in der Eingabe müssen eindeutig sein.")

    paragraph_by_ref = {paragraph.reference: paragraph.text for paragraph in paragraphs}

    references = [
        *(entity.first_mention_ref for entity in result.entities),
        *(alias.paragraph_ref for alias in result.aliases),
        *(fact.paragraph_ref for fact in result.facts),
        *(relationship.paragraph_ref for relationship in result.relationships),
    ]
    unknown_refs = sorted(set(references) - allowed_refs)
    if unknown_refs:
        raise ValueError(f"Unbekannte Absatzreferenz(en): {', '.join(unknown_refs)}.")

    for fact in result.facts:
        source_text = _normalize_whitespace(paragraph_by_ref[fact.paragraph_ref]).casefold()
        excerpt = _normalize_whitespace(fact.source_excerpt).casefold()
        if excerpt not in source_text:
            raise ValueError(
                f"Quellauszug für Absatz {fact.paragraph_ref} ist im Absatztext nicht enthalten."
            )

    return result


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()
