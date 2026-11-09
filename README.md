# Spoilerfreier Lesebegleiter

Eine lokale Web-App als Lesebegleiter für DRM-freie EPUBs. Sie erstellt
KI-gestützte Notizen zu Figuren, Orten, Gruppen, Objekten und Begriffen und
zeigt beim Nachschlagen ausschließlich Wissen bis zur aktuellen Leseposition.
Die Spoilerfreiheit wird durch positionsgebundene Daten und serverseitige
Filterung gewährleistet.

## Projektstand

Das Repository ist ein Monorepo mit Python-Backend und React-Frontend. Die
vollständige Produktbeschreibung, Architektur, Datenmodelle, API, Risiken und
Phasen-Abnahmekriterien stehen in [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md).
Arbeitsregeln für KI-gestützte Änderungen sind in
[.github/copilot-instructions.md](.github/copilot-instructions.md) festgehalten.

## Voraussetzungen

- Python 3.12+
- Node.js 22+ und npm

## Lokal starten

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
cp ../.env.example ../.env
uvicorn app.main:app --reload
```

Das Backend läuft unter <http://127.0.0.1:8000>. Der Health-Endpoint ist
<http://127.0.0.1:8000/health>, die OpenAPI-Dokumentation
<http://127.0.0.1:8000/docs>.

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Vite zeigt die lokale URL nach dem Start an. Der Entwicklungsserver leitet
`/api`-Anfragen an das Backend weiter.

## Qualitätsprüfungen

```bash
cd backend
python -m pytest
python -m ruff check .
```

```bash
cd frontend
npm test
npm run lint
npm run build
```

## Konfiguration und Datenschutz

Lege lokale Einstellungen in `.env` an; `.env` wird nicht versioniert.
`.env.example` enthält ausschließlich nicht geheime Beispielwerte. Bücher
und daraus extrahierte Inhalte sind für private Nutzung mit einer eigenen
Kopie vorgesehen und sollen nicht öffentlich bereitgestellt werden.
