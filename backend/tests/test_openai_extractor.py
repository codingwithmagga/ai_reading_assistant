import json
from typing import cast

import pytest

from app.config import Settings
from app.extraction_schemas import ChapterParagraph, KnownEntity
from app.openai_extractor import (
    ExtractionConfigurationError,
    InvalidExtractionOutputError,
    OpenAIChapterExtractor,
    ResponsesAPI,
)

VALID_OUTPUT = json.dumps(
    {
        "entities": [
            {
                "canonical_name": "Marta",
                "entity_type": "person",
                "first_mention_ref": "p0",
            }
        ],
        "aliases": [],
        "facts": [],
        "relationships": [],
    }
)


class FakeResponse:
    def __init__(self, output_text: str) -> None:
        self.output_text = output_text


class FakeResponses:
    def __init__(self, outputs: list[str]) -> None:
        self.outputs = iter(outputs)
        self.requests: list[dict[str, object]] = []

    def create(self, **kwargs: object) -> FakeResponse:
        self.requests.append(kwargs)
        return FakeResponse(next(self.outputs))


def _extractor(
    responses: FakeResponses,
    *,
    max_attempts: int = 3,
) -> OpenAIChapterExtractor:
    settings = Settings(
        _env_file=None,
        openai_model="gpt-test",
        openai_max_attempts=max_attempts,
        app_output_language="de",
    )
    return OpenAIChapterExtractor(settings, client=cast(ResponsesAPI, responses))


def _extract(extractor: OpenAIChapterExtractor):
    return extractor.extract(
        chapter_title="Kapitel 1",
        paragraphs=[ChapterParagraph(reference="p0", text="Marta kommt herein.")],
        known_entities=[KnownEntity(canonical_name="Marta", entity_type="person")],
    )


def test_openai_responses_request_uses_strict_schema_and_only_supplied_text() -> None:
    responses = FakeResponses([VALID_OUTPUT])

    result = _extract(_extractor(responses))

    assert result.entities[0].canonical_name == "Marta"
    request = responses.requests[0]
    assert request["model"] == "gpt-test"
    assert request["input"][1]["content"].find("Marta kommt herein.") >= 0
    user_payload = json.loads(request["input"][1]["content"])
    assert user_payload["output_language"] == "de"
    assert user_payload["paragraphs"] == [{"reference": "p0", "text": "Marta kommt herein."}]
    text_format = request["text"]
    assert text_format["type"] == "json_schema"
    assert text_format["strict"] is True
    output_schema = text_format["schema"]
    assert output_schema["required"] == ["entities", "aliases", "facts", "relationships"]
    assert output_schema["additionalProperties"] is False
    assert output_schema["$defs"]["EntityExtraction"]["required"] == [
        "canonical_name",
        "entity_type",
        "first_mention_ref",
    ]


def test_invalid_reference_is_retried_with_validation_feedback() -> None:
    invalid_output = json.dumps(
        {
            "entities": [
                {
                    "canonical_name": "Marta",
                    "entity_type": "person",
                    "first_mention_ref": "p99",
                }
            ],
            "aliases": [],
            "facts": [],
            "relationships": [],
        }
    )
    responses = FakeResponses([invalid_output, VALID_OUTPUT])

    result = _extract(_extractor(responses))

    assert result.entities[0].first_mention_ref == "p0"
    assert len(responses.requests) == 2
    assert "Unbekannte Absatzreferenz" in responses.requests[1]["input"][2]["content"]


def test_invalid_output_fails_after_configured_attempts() -> None:
    responses = FakeResponses(["{}", "{}"])

    with pytest.raises(InvalidExtractionOutputError):
        _extract(_extractor(responses, max_attempts=2))

    assert len(responses.requests) == 2


def test_missing_api_key_is_an_explicit_configuration_error() -> None:
    extractor = OpenAIChapterExtractor(Settings(_env_file=None, openai_api_key=None))

    with pytest.raises(ExtractionConfigurationError, match="OPENAI_API_KEY"):
        _extract(extractor)


def test_configured_api_key_and_timeout_are_used_by_openai_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    responses = FakeResponses([VALID_OUTPUT])
    client_options: dict[str, object] = {}

    class FakeOpenAI:
        def __init__(self, *, api_key: str, timeout: float) -> None:
            client_options.update(api_key=api_key, timeout=timeout)
            self.responses = responses

    monkeypatch.setattr("app.openai_extractor.OpenAI", FakeOpenAI)
    settings = Settings(
        _env_file=None,
        openai_api_key="test-key",
        openai_timeout_seconds=42,
    )

    _extract(OpenAIChapterExtractor(settings))

    assert client_options == {"api_key": "test-key", "timeout": 42}
    assert responses.requests[0]["text"]["format"]["type"] == "json_schema"


def test_validation_feedback_does_not_include_invalid_input_values() -> None:
    responses = FakeResponses(
        [
            json.dumps(
                {
                    "entities": [
                        {
                            "canonical_name": "PRIVATE TEXT",
                            "entity_type": "invalid",
                            "first_mention_ref": "p0",
                        }
                    ]
                }
            ),
            VALID_OUTPUT,
        ]
    )

    _extract(_extractor(responses))

    feedback = responses.requests[1]["input"][2]["content"]
    assert "PRIVATE TEXT" not in feedback
