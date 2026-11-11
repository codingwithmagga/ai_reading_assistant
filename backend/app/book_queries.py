from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_session
from app.entity_resolution import normalize_entity_name
from app.extraction_schemas import EntityType
from app.lookup import (
    LookupPositionError,
    find_entities_by_name,
    get_entity_aliases,
    get_entity_facts,
    get_entity_relationships,
    get_facts_for_entities,
    get_relationships_for_entities,
    list_entities_at_position,
    list_recap_events,
    validate_reading_position,
)
from app.models import Book, Entity, EntityAlias
from app.schemas import (
    EntityAliasResponse,
    EntityListItemResponse,
    EntityLookupMatchResponse,
    EntityLookupResponse,
    LookupEntitySummaryResponse,
    LookupFactResponse,
    LookupRelationshipResponse,
    NotesExportEntityResponse,
    NotesExportResponse,
    RecapEventResponse,
    RecapResponse,
)

router = APIRouter(prefix="/books", tags=["books"])


@router.get(
    "/{book_id}/entities",
    response_model=list[EntityListItemResponse],
)
def list_book_entities(
    book_id: str,
    position: int = Query(),
    entity_type: EntityType | None = Query(default=None, alias="type"),
    session: Session = Depends(get_session),
) -> list[EntityListItemResponse]:
    _require_book(session, book_id)
    _validate_reading_position(session, book_id, position)
    entities = list_entities_at_position(
        session,
        book_id=book_id,
        position=position,
        entity_type=entity_type.value if entity_type is not None else None,
    )
    return [_entity_list_item(entity, aliases) for entity, aliases in entities]


@router.get(
    "/{book_id}/lookup",
    response_model=EntityLookupResponse,
)
def lookup_book_entity(
    book_id: str,
    q: str = Query(min_length=1, max_length=500),
    position: int = Query(),
    session: Session = Depends(get_session),
) -> EntityLookupResponse:
    _require_book(session, book_id)
    if not normalize_entity_name(q):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "empty_lookup_query",
                "message": "Der Suchbegriff darf nicht leer sein.",
            },
        )
    _validate_reading_position(session, book_id, position)

    entities = find_entities_by_name(
        session,
        book_id=book_id,
        query=q,
        position=position,
    )
    matches = []
    for entity in entities:
        facts = get_entity_facts(
            session,
            book_id=book_id,
            entity_id=entity.id,
            position=position,
        )
        relationships = get_entity_relationships(
            session,
            book_id=book_id,
            entity_id=entity.id,
            position=position,
        )
        matches.append(
            EntityLookupMatchResponse(
                entity=_entity_summary(entity),
                aliases=[
                    EntityAliasResponse(
                        alias=alias.alias,
                        first_position=alias.first_position,
                    )
                    for alias in get_entity_aliases(
                        session,
                        entity_id=entity.id,
                        position=position,
                    )
                ],
                facts=[
                    LookupFactResponse(
                        id=fact.id,
                        text=fact.text,
                        kind=fact.kind,
                        position=fact.position,
                        chapter_id=chapter.id,
                        chapter_index=chapter.index,
                        chapter_title=chapter.title,
                        source_excerpt=fact.source_excerpt,
                    )
                    for fact, chapter in facts
                ],
                relationships=[
                    LookupRelationshipResponse(
                        id=relationship.id,
                        entity_a=_entity_summary(entity_a),
                        entity_b=_entity_summary(entity_b),
                        label=relationship.label,
                        position=relationship.position,
                    )
                    for relationship, entity_a, entity_b in relationships
                ],
            )
        )
    return EntityLookupResponse(query=q, position=position, matches=matches)


@router.get(
    "/{book_id}/recap",
    response_model=RecapResponse,
)
def get_book_recap(
    book_id: str,
    position: int = Query(),
    session: Session = Depends(get_session),
) -> RecapResponse:
    _require_book(session, book_id)
    _validate_reading_position(session, book_id, position)

    events = [
        RecapEventResponse(
            id=fact.id,
            text=fact.text,
            position=fact.position,
            chapter_id=chapter.id,
            chapter_index=chapter.index,
            chapter_title=chapter.title,
            source_excerpt=fact.source_excerpt,
            entity=_entity_summary(entity),
        )
        for fact, chapter, entity in list_recap_events(
            session,
            book_id=book_id,
            position=position,
        )
    ]
    characters = [
        _entity_list_item(entity, aliases)
        for entity, aliases in list_entities_at_position(
            session,
            book_id=book_id,
            position=position,
            entity_type=EntityType.PERSON.value,
        )
    ]
    return RecapResponse(position=position, events=events, characters=characters)


@router.get(
    "/{book_id}/export",
    response_model=NotesExportResponse,
)
def export_book_notes(
    book_id: str,
    position: int = Query(),
    session: Session = Depends(get_session),
) -> NotesExportResponse:
    book = _require_book(session, book_id)
    _validate_reading_position(session, book_id, position)

    entities = list_entities_at_position(
        session,
        book_id=book_id,
        position=position,
    )
    entity_ids = [entity.id for entity, _ in entities]
    facts_by_entity = get_facts_for_entities(
        session,
        book_id=book_id,
        entity_ids=entity_ids,
        position=position,
    )
    relationships = [
        LookupRelationshipResponse(
            id=relationship.id,
            entity_a=_entity_summary(entity_a),
            entity_b=_entity_summary(entity_b),
            label=relationship.label,
            position=relationship.position,
        )
        for relationship, entity_a, entity_b in get_relationships_for_entities(
            session,
            book_id=book_id,
            entity_ids=entity_ids,
            position=position,
        )
    ]

    export_entities: list[NotesExportEntityResponse] = []
    for entity, aliases in entities:
        export_entities.append(
            NotesExportEntityResponse(
                **_entity_summary(entity).model_dump(),
                aliases=[
                    EntityAliasResponse(
                        alias=alias.alias,
                        first_position=alias.first_position,
                    )
                    for alias in aliases
                ],
                facts=[
                    LookupFactResponse(
                        id=fact.id,
                        text=fact.text,
                        kind=fact.kind,
                        position=fact.position,
                        chapter_id=chapter.id,
                        chapter_index=chapter.index,
                        chapter_title=chapter.title,
                        source_excerpt=fact.source_excerpt,
                    )
                    for fact, chapter in facts_by_entity[entity.id]
                ],
            )
        )

    events = [
        RecapEventResponse(
            id=fact.id,
            text=fact.text,
            position=fact.position,
            chapter_id=chapter.id,
            chapter_index=chapter.index,
            chapter_title=chapter.title,
            source_excerpt=fact.source_excerpt,
            entity=_entity_summary(entity),
        )
        for fact, chapter, entity in list_recap_events(
            session,
            book_id=book_id,
            position=position,
        )
    ]

    return NotesExportResponse(
        book_id=book.id,
        title=book.title,
        author=book.author,
        language=book.language,
        position=position,
        entities=export_entities,
        relationships=sorted(
            relationships,
            key=lambda relationship: (
                relationship.position,
                relationship.label,
                relationship.id,
            ),
        ),
        events=events,
    )


def _validate_reading_position(session: Session, book_id: str, position: int) -> None:
    try:
        validate_reading_position(session, book_id, position)
    except LookupPositionError as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_reading_position",
                "message": str(error),
            },
        ) from error


def _require_book(session: Session, book_id: str) -> Book:
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "book_not_found", "message": "Buch nicht gefunden."},
        )
    return book


def _entity_summary(entity: Entity) -> LookupEntitySummaryResponse:
    return LookupEntitySummaryResponse(
        id=entity.id,
        type=EntityType(entity.type),
        canonical_name=entity.canonical_name,
        first_position=entity.first_position,
    )


def _entity_list_item(
    entity: Entity,
    aliases: list[EntityAlias],
) -> EntityListItemResponse:
    return EntityListItemResponse(
        id=entity.id,
        type=EntityType(entity.type),
        canonical_name=entity.canonical_name,
        first_position=entity.first_position,
        aliases=[
            EntityAliasResponse(alias=alias.alias, first_position=alias.first_position)
            for alias in aliases
        ],
    )
