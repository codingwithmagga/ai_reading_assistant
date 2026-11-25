import re
from collections import defaultdict
from collections.abc import Callable
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
    candidates: dict[str, list[tuple[str, EntityType]]] = {}
    known_names = set()

    def add_candidate(name: str, candidate: tuple[str, EntityType]) -> None:
        key = normalize_entity_name(name)
        if candidate not in candidates.setdefault(key, []):
            candidates[key].append(candidate)

    for known in known_entities:
        canonical = known.canonical_name
        known_names.add(normalize_entity_name(canonical))
        add_candidate(canonical, (canonical, known.entity_type))
        for alias in known.aliases:
            known_names.add(normalize_entity_name(alias))
            add_candidate(alias, (canonical, known.entity_type))

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
        add_candidate(
            entity.canonical_name,
            (entity.canonical_name, entity.entity_type),
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

    merge_targets: dict[str, tuple[str, EntityType]] = {}
    kept_aliases = []
    for alias in normalized.aliases:
        owner = resolve_name(alias.entity_name)
        target = resolve_name(alias.alias)
        if owner is None:
            continue
        if target is None or owner[0] == target[0]:
            kept_aliases.append(alias)
            continue
        if owner[1] != target[1]:
            continue
        owner_known = normalize_entity_name(owner[0]) in known_names
        target_known = normalize_entity_name(target[0]) in known_names
        if target_known and not owner_known:
            canonical = target
            alternate_name = owner
            alias.entity_name = canonical[0]
            alias.alias = alternate_name[0]
        else:
            canonical = owner
            alternate_name = target
            alias.entity_name = canonical[0]
        owner_name = canonical[0]
        owner_type = canonical[1]
        target_name = alternate_name[0]
        merge_targets[normalize_entity_name(target_name)] = (owner_name, owner_type)
        candidates[normalize_entity_name(target_name)] = [(owner_name, owner_type)]
        kept_aliases.append(alias)

    normalized.aliases = kept_aliases

    if merge_targets:
        normalized.entities = [
            entity
            for entity in normalized.entities
            if normalize_entity_name(entity.canonical_name) not in merge_targets
        ]

    for alias in normalized.aliases:
        owner = resolve_name(alias.entity_name)
        if owner is None:
            continue
        alias.entity_name = owner[0]
    normalized.aliases = [
        alias
        for alias in normalized.aliases
        if resolve_name(alias.entity_name) is not None
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
    candidates: dict[str, list[tuple[str, EntityType]]],
) -> tuple[str, EntityType] | None:
    normalized_name = normalize_entity_name(name)
    matches = candidates.get(normalized_name, [])
    if len(matches) == 1:
        return matches[0]
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
    repaired.entities = _resolve_unique_items(
        repaired.entities,
        allowed_refs,
        paragraphs,
        lambda item: item.canonical_name,
        "first_mention_ref",
    )
    kept_aliases = []
    for alias in repaired.aliases:
        alias_match = _find_unique_evidence(alias.alias, paragraphs)
        owner_match = _find_unique_evidence(alias.entity_name, paragraphs)
        if alias_match is not None:
            alias.paragraph_ref = alias_match.reference
            kept_aliases.append(alias)
        elif owner_match is not None:
            alias.paragraph_ref = owner_match.reference
            kept_aliases.append(alias)
        elif alias.paragraph_ref in allowed_refs:
            current = next(
                paragraph
                for paragraph in paragraphs
                if paragraph.reference == alias.paragraph_ref
            )
            if (
                _normalized_text(alias.alias) in _normalized_text(current.text)
                or _normalized_text(alias.entity_name) in _normalized_text(current.text)
            ):
                kept_aliases.append(alias)
    repaired.aliases = kept_aliases

    kept_facts = []
    for fact in repaired.facts:
        resolved = _resolve_fact_reference(fact, allowed_refs, paragraphs)
        if resolved is not None:
            kept_facts.append(resolved)
    repaired.facts = kept_facts

    kept_relationships = []
    for relationship in repaired.relationships:
        resolved = _resolve_relationship_reference(
            relationship,
            allowed_refs,
            paragraphs,
        )
        if resolved is not None:
            kept_relationships.append(resolved)
    repaired.relationships = kept_relationships
    return repaired


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _normalized_text(value: str) -> str:
    return _normalize_whitespace(value).casefold()


def _find_unique_evidence(
    evidence: str,
    paragraphs: list[ChapterParagraph],
) -> ChapterParagraph | None:
    needle = _normalized_text(evidence)
    if not needle:
        return None
    matches = [
        paragraph
        for paragraph in paragraphs
        if needle in _normalized_text(paragraph.text)
    ]
    return matches[0] if len(matches) == 1 else None


def _resolve_unique_items(
    items: list,
    allowed_refs: set[str],
    paragraphs: list[ChapterParagraph],
    evidence_for: Callable[[object], str],
    reference_field: str,
) -> list:
    kept = []
    for item in items:
        evidence = evidence_for(item)
        current_ref = getattr(item, reference_field)
        matched = _find_unique_evidence(evidence, paragraphs)
        if matched is not None:
            setattr(item, reference_field, matched.reference)
            kept.append(item)
        elif current_ref in allowed_refs:
            current_paragraph = next(
                paragraph
                for paragraph in paragraphs
                if paragraph.reference == current_ref
            )
            if (
                paragraphs[0].reference == current_ref
                and _normalized_text(evidence) in _normalized_text(current_paragraph.text)
            ):
                kept.append(item)
    return kept


def _resolve_fact_reference(
    fact: FactExtraction,
    allowed_refs: set[str],
    paragraphs: list[ChapterParagraph],
) -> FactExtraction | None:
    source_match = _find_unique_evidence(fact.source_excerpt, paragraphs)
    if source_match is not None:
        fact.paragraph_ref = source_match.reference
        return fact
    if "..." in fact.source_excerpt:
        segments = [
            segment.strip()
            for segment in fact.source_excerpt.split("...")
            if segment.strip()
        ]
        matches: list[ChapterParagraph] = []
        for segment in segments:
            segment_match = _find_unique_evidence(segment, paragraphs)
            if segment_match is not None:
                matches.append(segment_match)
        if len({paragraph.reference for paragraph in matches}) == 1:
            fact.paragraph_ref = matches[0].reference
            return fact
    text_match = _find_unique_evidence(fact.text, paragraphs)
    if text_match is not None:
        fact.paragraph_ref = text_match.reference
        return fact
    return None


def _resolve_relationship_reference(
    relationship: RelationshipExtraction,
    allowed_refs: set[str],
    paragraphs: list[ChapterParagraph],
) -> RelationshipExtraction | None:
    matched_positions: list[int] = []
    for paragraph in paragraphs:
        text = _normalized_text(paragraph.text)
        for index, evidence in enumerate(
            (relationship.entity_a_name, relationship.entity_b_name)
        ):
            if _normalized_text(evidence) in text:
                matched_positions.append(paragraphs.index(paragraph))
    if matched_positions:
        relationship.paragraph_ref = paragraphs[max(matched_positions)].reference
        return relationship
    if relationship.paragraph_ref not in allowed_refs:
        return None
    current = next(
        (
            paragraph
            for paragraph in paragraphs
            if paragraph.reference == relationship.paragraph_ref
        ),
        None,
    )
    if current is None:
        return None
    text = _normalized_text(current.text)
    if (
        _normalized_text(relationship.entity_a_name) in text
        and _normalized_text(relationship.entity_b_name) in text
    ):
        return relationship
    return None


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
