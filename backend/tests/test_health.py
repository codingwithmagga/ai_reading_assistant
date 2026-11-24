import asyncio

from httpx import ASGITransport, AsyncClient

from app.main import app


def test_health_endpoint() -> None:
    response = asyncio.run(_get_health())

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_and_swagger_ui_use_api_prefix() -> None:
    openapi_response = asyncio.run(_get_path("/openapi.json"))
    docs_response = asyncio.run(_get_path("/docs"))

    assert openapi_response.status_code == 200
    assert openapi_response.json()["openapi"].startswith("3.")
    assert "url: '/api/openapi.json'" in docs_response.text


async def _get_health():
    return await _get_path("/health")


async def _get_path(path: str):
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as async_client:
        return await async_client.get(path)
