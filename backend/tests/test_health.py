import asyncio

from httpx import ASGITransport, AsyncClient

from app.main import app


def test_health_endpoint() -> None:
    response = asyncio.run(_get_health())

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def _get_health():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as async_client:
        return await async_client.get("/health")
