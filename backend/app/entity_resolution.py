import re
from collections import defaultdict
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.extraction_schemas import (
    ChapterExtraction,
    EntityType,
    KnownEntity,
    normalize_entity_name,
)
from app.models import (
    Book,
    Chapter,
    Entity,
    EntityAlias,
    Fact,
    Paragraph,
    Relationship,
)


def known_entities_at_position(
    session: Session,
    book_id: str,
    position: int,
    *,
    block_text: str = "",
    entity_limit: int = 30,
    main_entity_limit: int = 8,
) -> list[KnownEntity]:
    entities = list(
        session.scalars(
            select(Entity)
            .where(Entity.book_id == book_id, Entity.first_position <= position)
            .order_by(Entity.first_position, Entity.canonical_name, Entity.id)
        )
    )
    if not entities:
        return []

    aliases_by_entity: dict[str, list[str]] = defaultdict(list)
    aliases = session.scalars(
        select(EntityAlias)
        .join(Entity, Entity.id == EntityAlias.entity_id)
        .where(
            Entity.book_id == book_id,
            Entity.first_position <= position,
            EntityAlias.first_position <= position,
        )
        .order_by(EntityAlias.first_position, EntityAlias.alias, EntityAlias.id)
    )
    for alias in aliases:
        aliases_by_entity[alias.entity_id].append(alias.alias)

    def aliases_for_entity(entity_id: str) -> list[str]:
        return aliases_by_entity[entity_id]
    normalized_block = " ".join(block_text.split()).casefold()

    mentioned_ids = {
        entity.id
        for entity in entities
        if _mentions(normalized_block, entity.canonical_name)
        or any(_mentions(normalized_block, alias) for alias in aliases_for_entity(entity.id))
    }

    fact_counts = dict(
        session.execute(
            select(Fact.entity_id, func.count(Fact.id))
            .where(
                Fact.book_id == book_id,
                Fact.position <= position,
            )
            .group_by(Fact.entity_id)
        ).all()
    )
    main_ids = {
        entity.id
        for entity in sorted(
            (entity for entity in entities if entity.type == "person"),
            key=lambda entity: (
                -fact_counts.get(entity.id, 0),
                entity.first_position,
                entity.canonical_name,
                entity.id,
            ),
        )[:main_entity_limit]
    }

    selected_ids = mentioned_ids | main_ids
    if len(selected_ids) < entity_limit:
        for entity in entities:
            if entity.id not in selected_ids:
                selected_ids.add(entity.id)
            if len(selected_ids) >= entity_limit:
                break
    else:
        ranked_mentioned = [
            entity for entity in entities if entity.id in mentioned_ids
        ]
        ranked_main = [
            entity for entity in entities if entity.id in main_ids
        ]
        selected_entities = {entity.id: entity for entity in ranked_mentioned + ranked_main}
        if len(selected_entities) > entity_limit:
            selected_entities = {
                entity.id: entity
                for entity in (ranked_mentioned + ranked_main)[:entity_limit]
            }
        selected_ids = set(selected_entities)

    selected_entities = [entity for entity in entities if entity.id in selected_ids]
    selected_entities.sort(
        key=lambda entity: (
            entity.first_position,
            entity.canonical_name,
            entity.id,
        )
    )
    return [
        KnownEntity(
            canonical_name=entity.canonical_name,
            entity_type=EntityType(entity.type),
            aliases=aliases_by_entity[entity.id],
        )
        for entity in selected_entities
    ]


def _mentions(block_text: str, name: str) -> bool:
    normalized_name = " ".join(name.split()).casefold()
    if not normalized_name:
        return False
    escaped_name = re.escape(normalized_name)
    return re.search(rf"(?<!\w){escaped_name}(?!\w)", block_text) is not None


def persist_block_extraction(
    session: Session,
    *,
    book: Book,
    chapter: Chapter,
    paragraphs: list[Paragraph],
    extraction: ChapterExtraction,
) -> None:
    if not paragraphs:
        raise ValueError("Eine Extraktion benötigt mindestens einen Absatz.")
    if chapter.book_id != book.id:
        raise ValueError("Das Kapitel gehört nicht zum Buch der Extraktion.")

    if any(
        paragraph.book_id != book.id
        or paragraph.chapter_id != chapter.id
        or not chapter.start_position <= paragraph.position <= chapter.end_position
        for paragraph in paragraphs
    ):
        raise ValueError("Ein Absatz der Extraktion liegt außerhalb des aktuellen Kapitels.")

    resolver = _EntityResolver(session, book.id)
    def reference_position(reference: str) -> int | None:
        for index, paragraph in enumerate(paragraphs):
            if reference == f"p{index}":
                return paragraph.position
        return None

    def paragraph_evidence(reference: str, evidence_items: tuple[str, ...]) -> bool:
        position = reference_position(reference)
        if position is None:
            return False
        paragraph = next(
            (item for item in paragraphs if item.position == position),
            None,
        )
        if paragraph is None:
            return False
        normalized_text = " ".join(paragraph.text.split()).casefold()
        for evidence in evidence_items:
            normalized_evidence = " ".join(evidence.split()).casefold()
            if not normalized_evidence:
                continue
            matches = sum(
                1
                for item in paragraphs
                if normalized_evidence in " ".join(item.text.split()).casefold()
            )
            if matches == 1 and normalized_evidence in normalized_text:
                return True
        return False

    def omit_or_position(reference: str, evidence_items: tuple[str, ...]) -> int | None:
        if not paragraph_evidence(reference, evidence_items):
            return None
        position = reference_position(reference)
        if position is None:
            return None
        return position

    def first_evidence_position(evidence: str) -> int | None:
        normalized_evidence = " ".join(evidence.split()).casefold()
        for paragraph in paragraphs:
            if normalized_evidence in " ".join(paragraph.text.split()).casefold():
                return paragraph.position
        return None

    def relationship_position(entity_a_name: str, entity_b_name: str) -> int | None:
        positions = [
            position
            for name in (entity_a_name, entity_b_name)
            if (position := first_evidence_position(name)) is not None
        ]
        if len(positions) != 2:
            return None
        return max(positions)

    for item in sorted(
        extraction.entities,
        key=lambda entity: normalize_entity_name(entity.canonical_name),
    ):
        entity_position = first_evidence_position(item.canonical_name)
        if entity_position is None:
            continue
        entity = resolver.find(item.canonical_name, entity_position)
        if entity is not None:
            if entity.type != item.entity_type.value:
                raise ValueError(
                    f"Der Typ der bekannten Entität {item.canonical_name!r} stimmt nicht überein."
                )
            continue

        normalized_name = normalize_entity_name(item.canonical_name)
        entity = Entity(
            id=str(
                uuid5(
                    NAMESPACE_URL,
                    f"ai-reading-assistant:{book.id}:entity:{item.entity_type.value}:{normalized_name}",
                )
            ),
            book_id=book.id,
            type=item.entity_type.value,
            canonical_name=item.canonical_name,
            first_position=entity_position,
        )
        session.add(entity)
        session.flush()
        resolver.add_entity(entity)

    for item in sorted(
        extraction.aliases,
        key=lambda alias: normalize_entity_name(alias.alias),
    ):
        alias_position = first_evidence_position(item.alias)
        if alias_position is None:
            alias_position = first_evidence_position(item.entity_name)
        if alias_position is None:
            continue
        entity = resolver.find(item.entity_name, alias_position)
        if entity is None:
            continue
        alias_owner = resolver.find(item.alias, alias_position)
        if alias_owner is not None and alias_owner.id != entity.id:
            continue
        if normalize_entity_name(item.alias) == normalize_entity_name(entity.canonical_name):
            continue
        existing_alias = resolver.find_alias(item.alias, alias_position)
        if existing_alias is not None and existing_alias.entity_id != entity.id:
            raise ValueError(f"Der Alias {item.alias!r} ist an dieser Stelle mehrdeutig.")

        stored_alias = next(
            (
                alias
                for alias in session.scalars(
                    select(EntityAlias).where(EntityAlias.entity_id == entity.id)
                )
                if normalize_entity_name(alias.alias) == normalize_entity_name(item.alias)
            ),
            None,
        )
        if stored_alias is None:
            stored_alias = EntityAlias(
                entity_id=entity.id,
                alias=item.alias,
                first_position=alias_position,
            )
            session.add(stored_alias)
            session.flush()
        elif alias_position < stored_alias.first_position:
            stored_alias.first_position = alias_position
            session.flush()
        resolver.add_alias(entity, stored_alias)

    existing_facts = {
        (fact.entity_id, fact.position, fact.kind, fact.text)
        for fact in session.scalars(select(Fact).where(Fact.book_id == book.id))
    }
    for item in sorted(
        extraction.facts,
        key=lambda fact: (normalize_entity_name(fact.entity_name), fact.kind),
    ):
        fact_position = omit_or_position(
            item.paragraph_ref,
            (item.source_excerpt, item.text, item.entity_name),
        )
        if fact_position is None:
            continue
        entity = resolver.find(item.entity_name, fact_position)
        if entity is None:
            continue
        fact_key = (entity.id, fact_position, item.kind.value, item.text)
        if fact_key in existing_facts:
            continue
        session.add(
            Fact(
                book_id=book.id,
                entity_id=entity.id,
                chapter_id=chapter.id,
                text=item.text,
                position=fact_position,
                source_excerpt=item.source_excerpt,
                kind=item.kind.value,
            )
        )
        existing_facts.add(fact_key)

    existing_relationships = {
        (relation.entity_a_id, relation.entity_b_id, relation.label, relation.position)
        for relation in session.scalars(select(Relationship).where(Relationship.book_id == book.id))
    }
    for item in sorted(
        extraction.relationships,
        key=lambda relation: normalize_entity_name(relation.label),
    ):
        resolved_relationship_position = relationship_position(
            item.entity_a_name,
            item.entity_b_name,
        )
        relationship_position = resolved_relationship_position
        if relationship_position is None:
            continue
        entity_a = resolver.find(item.entity_a_name, relationship_position)
        entity_b = resolver.find(item.entity_b_name, relationship_position)
        if entity_a is None or entity_b is None:
            continue
        relationship_key = (
            entity_a.id,
            entity_b.id,
            item.label,
            relationship_position,
        )
        if relationship_key in existing_relationships:
            continue
        session.add(
            Relationship(
                book_id=book.id,
                entity_a_id=entity_a.id,
                entity_b_id=entity_b.id,
                label=item.label,
                position=relationship_position,
            )
        )
        existing_relationships.add(relationship_key)

    session.flush()


class _EntityResolver:
    def __init__(self, session: Session, book_id: str) -> None:
        self._canonical: dict[str, list[Entity]] = defaultdict(list)
        self._aliases: dict[str, list[tuple[EntityAlias, Entity]]] = defaultdict(list)

        entities = list(
            session.scalars(
                select(Entity).where(Entity.book_id == book_id).order_by(Entity.first_position)
            )
        )
        for entity in entities:
            self.add_entity(entity)
        for alias, entity in session.execute(
            select(EntityAlias, Entity)
            .join(Entity, Entity.id == EntityAlias.entity_id)
            .where(Entity.book_id == book_id)
        ):
            self.add_alias(entity, alias)

    def add_entity(self, entity: Entity) -> None:
        candidates = self._canonical[normalize_entity_name(entity.canonical_name)]
        if all(candidate.id != entity.id for candidate in candidates):
            candidates.append(entity)

    def add_alias(self, entity: Entity, alias: EntityAlias) -> None:
        candidates = self._aliases[normalize_entity_name(alias.alias)]
        if all(candidate[0].id != alias.id for candidate in candidates):
            candidates.append((alias, entity))

    def find(self, name: str, position: int) -> Entity | None:
        normalized = normalize_entity_name(name)
        candidates = {
            entity.id: entity
            for entity in self._canonical.get(normalized, [])
            if entity.first_position <= position
        }
        for alias, entity in self._aliases.get(normalized, []):
            if alias.first_position <= position and entity.first_position <= position:
                candidates[entity.id] = entity
        if len(candidates) > 1:
            raise ValueError(f"Die Entitätsreferenz {name!r} ist an dieser Stelle mehrdeutig.")
        return next(iter(candidates.values()), None)

    def find_alias(self, alias_text: str, position: int) -> EntityAlias | None:
        normalized = normalize_entity_name(alias_text)
        candidates = [
            alias
            for alias, entity in self._aliases.get(normalized, [])
            if alias.first_position <= position and entity.first_position <= position
        ]
        entity_ids = {alias.entity_id for alias in candidates}
        entity_ids.update(
            entity.id
            for entity in self._canonical.get(normalized, [])
            if entity.first_position <= position
        )
        if len(entity_ids) > 1:
            raise ValueError(f"Der Alias {alias_text!r} ist an dieser Stelle mehrdeutig.")
        return candidates[0] if candidates else None

    def require(self, name: str, position: int) -> Entity:
        entity = self.find(name, position)
        if entity is None:
            raise ValueError(
                f"Die Entitätsreferenz {name!r} ist an dieser Stelle nicht im erlaubten Kontext."
            )
        return entity
