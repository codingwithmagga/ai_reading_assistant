from collections import defaultdict
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.extraction_schemas import (
    ChapterExtraction,
    ChapterParagraph,
    EntityType,
    KnownEntity,
    validate_chapter_references,
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

    return [
        KnownEntity(
            canonical_name=entity.canonical_name,
            entity_type=EntityType(entity.type),
            aliases=aliases_by_entity[entity.id],
        )
        for entity in entities
    ]


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

    request_paragraphs = [
        ChapterParagraph(reference=f"p{index}", text=paragraph.text)
        for index, paragraph in enumerate(paragraphs)
    ]
    validate_chapter_references(extraction, request_paragraphs)
    positions = {f"p{index}": paragraph.position for index, paragraph in enumerate(paragraphs)}
    if any(
        paragraph.book_id != book.id
        or paragraph.chapter_id != chapter.id
        or not chapter.start_position <= paragraph.position <= chapter.end_position
        for paragraph in paragraphs
    ):
        raise ValueError("Ein Absatz der Extraktion liegt außerhalb des aktuellen Kapitels.")

    resolver = _EntityResolver(session, book.id)
    for item in sorted(
        extraction.entities,
        key=lambda entity: (
            positions[entity.first_mention_ref],
            normalize_entity_name(entity.canonical_name),
        ),
    ):
        position = positions[item.first_mention_ref]
        entity = resolver.find(item.canonical_name, position)
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
            first_position=position,
        )
        session.add(entity)
        session.flush()
        resolver.add_entity(entity)

    for item in sorted(
        extraction.aliases,
        key=lambda alias: (positions[alias.paragraph_ref], normalize_entity_name(alias.alias)),
    ):
        position = positions[item.paragraph_ref]
        entity = resolver.require(item.entity_name, position)
        alias_owner = resolver.find(item.alias, position)
        if alias_owner is not None and alias_owner.id != entity.id:
            raise ValueError(f"Der Alias {item.alias!r} ist an dieser Stelle mehrdeutig.")
        if normalize_entity_name(item.alias) == normalize_entity_name(entity.canonical_name):
            continue
        existing_alias = resolver.find_alias(item.alias, position)
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
                first_position=position,
            )
            session.add(stored_alias)
            session.flush()
        elif position < stored_alias.first_position:
            stored_alias.first_position = position
            session.flush()
        resolver.add_alias(entity, stored_alias)

    existing_facts = {
        (fact.entity_id, fact.position, fact.kind, fact.text)
        for fact in session.scalars(select(Fact).where(Fact.book_id == book.id))
    }
    for item in sorted(
        extraction.facts,
        key=lambda fact: (
            positions[fact.paragraph_ref],
            normalize_entity_name(fact.entity_name),
            fact.kind,
        ),
    ):
        position = positions[item.paragraph_ref]
        entity = resolver.require(item.entity_name, position)
        fact_key = (entity.id, position, item.kind.value, item.text)
        if fact_key in existing_facts:
            continue
        session.add(
            Fact(
                book_id=book.id,
                entity_id=entity.id,
                chapter_id=chapter.id,
                text=item.text,
                position=position,
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
        key=lambda relation: (
            positions[relation.paragraph_ref],
            normalize_entity_name(relation.label),
        ),
    ):
        position = positions[item.paragraph_ref]
        entity_a = resolver.require(item.entity_a_name, position)
        entity_b = resolver.require(item.entity_b_name, position)
        relationship_key = (entity_a.id, entity_b.id, item.label, position)
        if relationship_key in existing_relationships:
            continue
        session.add(
            Relationship(
                book_id=book.id,
                entity_a_id=entity_a.id,
                entity_b_id=entity_b.id,
                label=item.label,
                position=position,
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


def normalize_entity_name(value: str) -> str:
    return " ".join(value.split()).casefold()
