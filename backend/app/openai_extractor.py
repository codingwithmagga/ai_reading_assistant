from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from openai import OpenAI
from openai.types.responses import ResponseFormatTextJSONSchemaConfigParam, ResponseInputParam
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.extraction_prompt import (
    build_chapter_input,
    load_extraction_system_prompt,
)
from app.extraction_schemas import (
    ChapterExtraction,
    ChapterParagraph,
    KnownEntity,
    validate_chapter_references,
)


class ExtractionConfigurationError(RuntimeError):
    pass


class InvalidExtractionOutputError(ValueError):
    def __init__(
        self,
        message: str,
        *,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> None:
        super().__init__(message)
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


@dataclass(frozen=True)
class ExtractionResponse:
    extraction: ChapterExtraction
    input_tokens: int
    output_tokens: int


class ResponseUsage(Protocol):
    input_tokens: int
    output_tokens: int


class ResponseWithText(Protocol):
    output_text: str
    usage: ResponseUsage | None


class ResponsesAPI(Protocol):
    def create(
        self,
        *,
        model: str,
        input: ResponseInputParam,
        text: ResponseFormatTextJSONSchemaConfigParam,
    ) -> ResponseWithText: ...


class _OpenAIResponsesAdapter:
    def __init__(self, api_key: str, timeout_seconds: float) -> None:
        self._client = OpenAI(api_key=api_key, timeout=timeout_seconds)

    def create(
        self,
        *,
        model: str,
        input: ResponseInputParam,
        text: ResponseFormatTextJSONSchemaConfigParam,
    ) -> ResponseWithText:
        return self._client.responses.create(model=model, input=input, text={"format": text})


class OpenAIChapterExtractor:
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        client: ResponsesAPI | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._client = client

    def extract(
        self,
        *,
        chapter_title: str | None,
        paragraphs: list[ChapterParagraph],
        known_entities: list[KnownEntity],
    ) -> ChapterExtraction:
        return self.extract_with_usage(
            chapter_title=chapter_title,
            paragraphs=paragraphs,
            known_entities=known_entities,
        ).extraction

    def extract_with_usage(
        self,
        *,
        chapter_title: str | None,
        paragraphs: list[ChapterParagraph],
        known_entities: list[KnownEntity],
    ) -> ExtractionResponse:
        user_input = build_chapter_input(
            chapter_title=chapter_title,
            paragraphs=paragraphs,
            known_entities=known_entities,
            output_language=self._settings.app_output_language,
        )
        base_input: ResponseInputParam = [
            {"role": "system", "content": load_extraction_system_prompt()},
            {"role": "user", "content": user_input},
        ]
        schema = _strict_json_schema(ChapterExtraction.model_json_schema())
        text_format: ResponseFormatTextJSONSchemaConfigParam = {
            "type": "json_schema",
            "name": "chapter_extraction",
            "strict": True,
            "schema": schema,
        }

        validation_feedback: str | None = None
        last_error: ValidationError | ValueError | None = None
        input_tokens = 0
        output_tokens = 0
        for _ in range(self._settings.openai_max_attempts):
            response_input = list(base_input)
            if validation_feedback is not None:
                response_input.append(
                    {
                        "role": "user",
                        "content": (
                            "Deine vorherige Ausgabe war ungültig. Korrigiere sie anhand "
                            "dieser Validierungsfehler und gib ausschließlich das verlangte "
                            f"JSON zurück:\n{validation_feedback}"
                        ),
                    }
                )

            response = self._get_client().create(
                model=self._settings.openai_model,
                input=response_input,
                text=text_format,
            )
            usage = response.usage
            if usage is not None:
                input_tokens += usage.input_tokens
                output_tokens += usage.output_tokens
            try:
                result = ChapterExtraction.model_validate_json(response.output_text)
                result = validate_chapter_references(result, paragraphs)
                return ExtractionResponse(
                    extraction=result,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
            except ValidationError as error:
                last_error = error
                validation_feedback = _validation_feedback(error)
            except ValueError as error:
                last_error = error
                validation_feedback = str(error)

        raise InvalidExtractionOutputError(
            "OpenAI lieferte nach den erlaubten Versuchen keine gültige Kapitel-Extraktion.",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        ) from last_error

    def _get_client(self) -> ResponsesAPI:
        if self._client is not None:
            return self._client

        api_key = self._settings.openai_api_key
        if api_key is None or not api_key.get_secret_value().strip():
            raise ExtractionConfigurationError(
                "OPENAI_API_KEY muss für die Kapitel-Extraktion konfiguriert sein."
            )

        self._client = _OpenAIResponsesAdapter(
            api_key=api_key.get_secret_value(),
            timeout_seconds=self._settings.openai_timeout_seconds,
        )
        return self._client


def _validation_feedback(error: ValidationError) -> str:
    issues = []
    for issue in error.errors(include_input=False, include_context=False):
        location = ".".join(str(part) for part in issue["loc"]) or "Ausgabe"
        issues.append(f"{location}: {issue['msg']}")
    return "\n".join(issues)


def _strict_json_schema(schema: Mapping[str, object]) -> dict[str, object]:
    normalized = {key: value for key, value in schema.items() if key != "default"}
    properties = normalized.get("properties")
    if normalized.get("type") == "object" and isinstance(properties, dict):
        normalized["required"] = list(properties)
    for key, value in tuple(normalized.items()):
        if isinstance(value, dict):
            normalized[key] = _strict_json_schema(value)
        elif isinstance(value, list):
            normalized[key] = [
                _strict_json_schema(item) if isinstance(item, dict) else item for item in value
            ]
    return normalized
