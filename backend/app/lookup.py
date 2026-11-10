from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.entity_resolution import normalize_entity_name
from app.models import Chapter, Entity, EntityAlias, Fact, Paragraph, Relationship


class LookupPositionError(ValueError):
    pass


def validate_reading_position(session: Session, book_id: str, position: int) -> int:
    bounds = session.execute(
        select(func.min(Paragraph.position), func.max(Paragraph.position)).where(
            Paragraph.book_id == book_id
        )
    ).one()
    first_position, last_position = bounds
    if first_position is None or last_position is None:
        raise LookupPositionError("Das Buch enthält keine lesbaren Absätze.")
    if position < first_position or position > last_position:
        raise LookupPositionError(
            f"Die Leseposition muss zwischen {first_position} und {last_position} liegen."
        )
    return position


def find_entities_by_name(
    session: Session,
    *,
    book_id: str,
    query: str,
    position: int,
) -> list[Entity]:
    normalized_query = normalize_entity_name(query)
    if not normalized_query:
        return []

    entities = list(
        session.scalars(
            select(Entity)
            .where(Entity.book_id == book_id, Entity.first_position <= position)
            .order_by(Entity.first_position, Entity.canonical_name, Entity.id)
        )
    )
    matches = {
        entity.id
        for entity in entities
        if normalize_entity_name(entity.canonical_name) == normalized_query
    }

    aliases = session.execute(
        select(EntityAlias, Entity)
        .join(Entity, Entity.id == EntityAlias.entity_id)
        .where(
            Entity.book_id == book_id,
            Entity.first_position <= position,
            EntityAlias.first_position <= position,
        )
        .order_by(Entity.first_position, Entity.canonical_name, Entity.id)
    )
    matches.update(
        entity.id
        for alias, entity in aliases
        if normalize_entity_name(alias.alias) == normalized_query
    )
    return [entity for entity in entities if entity.id in matches]


def list_entities_at_position(
    session: Session,
    *,
    book_id: str,
    position: int,
    entity_type: str | None = None,
) -> list[tuple[Entity, list[EntityAlias]]]:
    entity_statement = (
        select(Entity)
        .where(Entity.book_id == book_id, Entity.first_position <= position)
        .order_by(Entity.first_position, Entity.canonical_name, Entity.id)
    )
    if entity_type is not None:
        entity_statement = entity_statement.where(Entity.type == entity_type)
    entities = list(session.scalars(entity_statement))
    if not entities:
        return []

    aliases_by_entity: dict[str, list[EntityAlias]] = {entity.id: [] for entity in entities}
    aliases = session.scalars(
        select(EntityAlias)
        .join(Entity, Entity.id == EntityAlias.entity_id)
        .where(
            Entity.book_id == book_id,
            Entity.id.in_(aliases_by_entity),
            Entity.first_position <= position,
            EntityAlias.first_position <= position,
        )
        .order_by(EntityAlias.first_position, EntityAlias.alias, EntityAlias.id)
    )
    for alias in aliases:
        aliases_by_entity[alias.entity_id].append(alias)

    return [(entity, aliases_by_entity[entity.id]) for entity in entities]


def get_entity_aliases(
    session: Session,
    *,
    entity_id: str,
    position: int,
) -> list[EntityAlias]:
    return list(
        session.scalars(
            select(EntityAlias)
            .where(
                EntityAlias.entity_id == entity_id,
                EntityAlias.first_position <= position,
            )
            .order_by(EntityAlias.first_position, EntityAlias.alias, EntityAlias.id)
        )
    )


def get_entity_facts(
    session: Session,
    *,
    book_id: str,
    entity_id: str,
    position: int,
) -> list[tuple[Fact, Chapter]]:
    return list(
        session.execute(
            select(Fact, Chapter)
            .join(Chapter, Chapter.id == Fact.chapter_id)
            .where(
                Fact.book_id == book_id,
                Fact.entity_id == entity_id,
                Fact.position <= position,
            )
            .order_by(Fact.position, Fact.kind, Fact.id)
        )
    )


def get_entity_relationships(
    session: Session,
    *,
    book_id: str,
    entity_id: str,
    position: int,
) -> list[tuple[Relationship, Entity, Entity]]:
    entity_a = aliased(Entity)
    entity_b = aliased(Entity)
    return list(
        session.execute(
            select(Relationship, entity_a, entity_b)
            .join(entity_a, entity_a.id == Relationship.entity_a_id)
            .join(entity_b, entity_b.id == Relationship.entity_b_id)
            .where(
                Relationship.book_id == book_id,
                Relationship.position <= position,
                or_(
                    Relationship.entity_a_id == entity_id,
                    Relationship.entity_b_id == entity_id,
                ),
                entity_a.first_position <= position,
                entity_b.first_position <= position,
            )
            .order_by(Relationship.position, Relationship.label, Relationship.id)
        )
    )
