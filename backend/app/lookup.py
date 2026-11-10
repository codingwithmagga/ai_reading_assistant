from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.entity_resolution import normalize_entity_name
from app.models import Entity, EntityAlias, Paragraph


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
