import json
from pathlib import Path

from app.extraction_schemas import ChapterParagraph, KnownEntity

_SYSTEM_PROMPT_PATH = Path(__file__).parent / "prompts" / "extraction_system.txt"


def load_extraction_system_prompt() -> str:
    return _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()


def build_chapter_input(
    *,
    chapter_title: str | None,
    paragraphs: list[ChapterParagraph],
    known_entities: list[KnownEntity],
    output_language: str = "de",
) -> str:
    payload = {
        "task": "Extrahiere Entitäten, Aliase, Fakten und belegte Beziehungen.",
        "output_language": output_language,
        "chapter_title": chapter_title,
        "paragraphs": [
            {"reference": paragraph.reference, "text": paragraph.text} for paragraph in paragraphs
        ],
        "known_entities": [
            {
                "canonical_name": entity.canonical_name,
                "entity_type": entity.entity_type.value,
                "aliases": entity.aliases,
            }
            for entity in known_entities
        ],
        "required_output_shape": {
            "entities": [
                {
                    "canonical_name": "string",
                    "entity_type": "person|place|group|object|concept",
                    "first_mention_ref": "paragraph reference from this input",
                }
            ],
            "aliases": [
                {
                    "entity_name": "canonical name",
                    "alias": "string",
                    "paragraph_ref": "paragraph reference from this input",
                }
            ],
            "facts": [
                {
                    "entity_name": "canonical name",
                    "text": "short, supported fact",
                    "paragraph_ref": "paragraph reference from this input",
                    "source_excerpt": "verbatim excerpt of at most 200 characters",
                    "kind": "description|relationship|event|motivation",
                }
            ],
            "relationships": [
                {
                    "entity_a_name": "canonical name",
                    "entity_b_name": "canonical name",
                    "label": "supported relationship",
                    "paragraph_ref": "paragraph reference from this input",
                }
            ],
        },
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
