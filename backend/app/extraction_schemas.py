import re
from collections import defaultdict
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
    first_mention_ref: ParagraphReference = "p0"


class AliasExtraction(StrictModel):
    entity_name: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    alias: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    paragraph_ref: ParagraphReference = "p0"


class FactExtraction(StrictModel):
    entity_name: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    text: Annotated[str, StringConstraints(min_length=1, max_length=2_000)]
    paragraph_ref: ParagraphReference = "p0"
    source_excerpt: ExcerptText
    kind: FactKind


class RelationshipExtraction(StrictModel):
    entity_a_name: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    entity_b_name: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    label: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    paragraph_ref: ParagraphReference = "p0"


class ChapterExtraction(StrictModel):
    entities: list[EntityExtraction] = Field(max_length=500)
    aliases: list[AliasExtraction] = Field(max_length=1_000)
    facts: list[FactExtraction] = Field(max_length=2_000)
    relationships: list[RelationshipExtraction] = Field(max_length=1_000)

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


def normalize_extraction(
    result: ChapterExtraction,
    paragraphs: list[ChapterParagraph],
    known_entities: list[KnownEntity],
) -> ChapterExtraction:
    normalized = result.model_copy(deep=True)
    candidates: dict[str, tuple[str, EntityType]] = {}

    for known in known_entities:
        canonical = known.canonical_name
        candidates[normalize_entity_name(canonical)] = (canonical, known.entity_type)
        for alias in known.aliases:
            candidates[normalize_entity_name(alias)] = (canonical, known.entity_type)

    kept_entities = []
    for entity in normalized.entities:
        known_match = _resolve_known_name(entity.canonical_name, candidates)
        if known_match is not None:
            canonical, entity_type = known_match
            entity.canonical_name = canonical
            entity.entity_type = entity_type
            continue
        kept_entities.append(entity)
    normalized.entities = kept_entities

    for entity in normalized.entities:
        candidates[normalize_entity_name(entity.canonical_name)] = (
            entity.canonical_name,
            entity.entity_type,
        )

    def resolve_name(name: str) -> tuple[str, EntityType] | None:
        known_match = _resolve_known_name(name, candidates)
        if known_match is not None:
            return known_match
        normalized_name = normalize_entity_name(name)
        for entity in normalized.entities:
            if normalize_entity_name(entity.canonical_name) == normalized_name:
                return entity.canonical_name, entity.entity_type
        return None

    for alias in normalized.aliases:
        owner = resolve_name(alias.entity_name)
        if owner is None:
            continue
        alias.entity_name = owner[0]
        alias_owner = resolve_name(alias.alias)
        if alias_owner is not None and alias_owner[0] != owner[0]:
            continue
    normalized.aliases = [
        alias
        for alias in normalized.aliases
        if resolve_name(alias.entity_name) is not None
        and (
            (alias_owner := resolve_name(alias.alias)) is None
            or alias_owner[0] == resolve_name(alias.entity_name)[0]
        )
    ]
    for fact in normalized.facts:
        owner = resolve_name(fact.entity_name)
        if owner is not None:
            fact.entity_name = owner[0]
    normalized.facts = [
        fact
        for fact in normalized.facts
        if resolve_name(fact.entity_name) is not None
    ]
    for relationship in normalized.relationships:
        entity_a = resolve_name(relationship.entity_a_name)
        entity_b = resolve_name(relationship.entity_b_name)
        if entity_a is not None:
            relationship.entity_a_name = entity_a[0]
        if entity_b is not None:
            relationship.entity_b_name = entity_b[0]
    normalized.relationships = [
        relationship
        for relationship in normalized.relationships
        if resolve_name(relationship.entity_a_name) is not None
        and resolve_name(relationship.entity_b_name) is not None
    ]

    return normalized


def _resolve_known_name(
    name: str,
    candidates: dict[str, tuple[str, EntityType]],
) -> tuple[str, EntityType] | None:
    normalized_name = normalize_entity_name(name)
    exact = candidates.get(normalized_name)
    if exact is not None:
        return exact

    words = normalized_name.split()
    if not words:
        return None
    matches: dict[str, tuple[str, EntityType]] = {}
    for candidate_name, value in candidates.items():
        candidate_words = candidate_name.split()
        if any(
            word == candidate_word
            for word in words
            for candidate_word in candidate_words
        ):
            matches[normalize_entity_name(value[0])] = value
    if len(matches) == 1:
        return next(iter(matches.values()))
    return None


def validate_chapter_references(
    result: ChapterExtraction,
    paragraphs: list[ChapterParagraph],
) -> ChapterExtraction:
    allowed_refs = {paragraph.reference for paragraph in paragraphs}
    issues: list[str] = []
    if len(allowed_refs) != len(paragraphs):
        issues.append("Absatzreferenzen in der Eingabe müssen eindeutig sein.")
    if issues:
        raise ValueError("\n".join(issues))

    repaired = result.model_copy(deep=True)
    fallback_ref = paragraphs[0].reference if paragraphs else None

    for entity in repaired.entities:
        if entity.first_mention_ref not in allowed_refs:
            entity.first_mention_ref = _resolve_reference(
                current_ref=entity.first_mention_ref,
                evidence=[entity.canonical_name],
                paragraphs=paragraphs,
                fallback_ref=fallback_ref,
            )

    for alias in repaired.aliases:
        if alias.paragraph_ref not in allowed_refs:
            alias.paragraph_ref = _resolve_reference(
                current_ref=alias.paragraph_ref,
                evidence=[alias.alias],
                paragraphs=paragraphs,
                fallback_ref=fallback_ref,
            )

    for fact in repaired.facts:
        fact.paragraph_ref = _resolve_reference(
            current_ref=fact.paragraph_ref,
            evidence=[fact.source_excerpt, fact.text, fact.entity_name],
            paragraphs=paragraphs,
            fallback_ref=fallback_ref,
        )

    for relationship in repaired.relationships:
        relationship.paragraph_ref = _resolve_later_relationship_reference(
            current_ref=relationship.paragraph_ref,
            evidence=[relationship.entity_a_name, relationship.entity_b_name],
            paragraphs=paragraphs,
            fallback_ref=fallback_ref,
        )

    return repaired


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _resolve_reference(
    *,
    current_ref: str,
    evidence: list[str],
    paragraphs: list[ChapterParagraph],
    fallback_ref: str | None,
) -> str:
    for item in evidence:
        if not item:
            continue
        normalized_item = _normalize_whitespace(item).casefold()
        for paragraph in paragraphs:
            paragraph_text = _normalize_whitespace(paragraph.text).casefold()
            if normalized_item in paragraph_text:
                return paragraph.reference
    if any(paragraph.reference == current_ref for paragraph in paragraphs):
        return current_ref
    return fallback_ref or current_ref


def _resolve_later_relationship_reference(
    *,
    current_ref: str,
    evidence: list[str],
    paragraphs: list[ChapterParagraph],
    fallback_ref: str | None,
) -> str:
    matched_positions: list[int] = []
    for item in evidence:
        normalized_item = _normalize_whitespace(item).casefold()
        for index, paragraph in enumerate(paragraphs):
            paragraph_text = _normalize_whitespace(paragraph.text).casefold()
            if normalized_item and normalized_item in paragraph_text:
                matched_positions.append(index)
                break
    if matched_positions:
        return paragraphs[max(matched_positions)].reference
    if any(paragraph.reference == current_ref for paragraph in paragraphs):
        return current_ref
    return fallback_ref or current_ref

def normalize_entity_name(value: str) -> str:
    return " ".join(value.split()).casefold()


def validate_entity_references(
    result: ChapterExtraction,
    paragraphs: list[ChapterParagraph],
    known_entities: list[KnownEntity],
) -> ChapterExtraction:
    order = {paragraph.reference: index for index, paragraph in enumerate(paragraphs)}
    names: dict[str, list[tuple[int, int]]] = defaultdict(list)
    entity_types: dict[int, EntityType] = {}
    next_id = 0
    issues: list[str] = []

    def add_name(name: str, entity_id: int, position: int) -> None:
        names[normalize_entity_name(name)].append((position, entity_id))

    def resolve(name: str, position: int, context: str) -> int | None:
        matches = {
            entity_id
            for first_position, entity_id in names.get(normalize_entity_name(name), [])
            if first_position <= position
        }
        if len(matches) > 1:
            issues.append(f"{context}: entity reference is ambiguous at this paragraph.")
        return next(iter(matches), None)

    def require(name: str, position: int, context: str) -> int:
        entity_id = resolve(name, position, context)
        if entity_id is None:
            issues.append(
                f"{context}: entity is not known at this paragraph. "
                "Only reference entities introduced at this paragraph or earlier; "
                "do not move or infer a paragraph reference."
            )
        return entity_id

    for known in known_entities:
        entity_id = next_id
        next_id += 1
        entity_types[entity_id] = known.entity_type
        add_name(known.canonical_name, entity_id, -1)
        for alias in known.aliases:
            add_name(alias, entity_id, -1)

    for index, entity in sorted(
        enumerate(result.entities),
        key=lambda item: (
            order.get(item[1].first_mention_ref, len(order)),
            normalize_entity_name(item[1].canonical_name),
        ),
    ):
        position = order.get(entity.first_mention_ref)
        if position is None:
            continue
        context = f"entities[{index}]"
        entity_id = resolve(entity.canonical_name, position, context)
        if entity_id is None:
            entity_id = next_id
            next_id += 1
            entity_types[entity_id] = entity.entity_type
            add_name(entity.canonical_name, entity_id, position)
        elif entity_types[entity_id] != entity.entity_type:
            issues.append(
                f"{context}.entity_type: entity type conflict; "
                f"existing type: {entity_types[entity_id].value}; "
                f"received type: {entity.entity_type.value}. "
                "Use the existing type for this canonical entity."
            )

    for index, alias in sorted(
        enumerate(result.aliases),
        key=lambda item: (
            order.get(item[1].paragraph_ref, len(order)),
            normalize_entity_name(item[1].alias),
        ),
    ):
        position = order.get(alias.paragraph_ref)
        if position is None:
            continue
        context = f"aliases[{index}]"
        entity_id = require(alias.entity_name, position, context)
        owner = resolve(alias.alias, position, context)
        if owner is not None and owner != entity_id:
            issues.append(f"{context}: alias belongs to a different entity at this paragraph.")
        elif entity_id is not None:
            add_name(alias.alias, entity_id, position)

    for index, fact in enumerate(result.facts):
        position = order.get(fact.paragraph_ref)
        if position is not None:
            require(fact.entity_name, position, f"facts[{index}]")
    for index, relationship in enumerate(result.relationships):
        position = order.get(relationship.paragraph_ref)
        if position is not None:
            require(
                relationship.entity_a_name,
                position,
                f"relationships[{index}].entity_a_name",
            )
            require(
                relationship.entity_b_name,
                position,
                f"relationships[{index}].entity_b_name",
            )
    if issues:
        raise ValueError("\n".join(dict.fromkeys(issues)))
    return result
