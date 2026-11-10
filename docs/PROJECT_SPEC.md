# Projektspezifikation: Spoilerfreier Lesebegleiter

Dieses Dokument ist die verbindliche Arbeitsgrundlage für Produktumfang,
Architektur und phasenweise Umsetzung.

## 1. Ziel

Eine Web-App (als PWA auch auf dem Handy nutzbar), in die man ein Buch als EPUB
hochlädt. Die App erzeugt aus dem Buchtext Notizen zu Figuren, Orten, Gruppen
und Begriffen. Beim Lesen kann man jederzeit nachschlagen ("Wer ist Marta?")
und bekommt **nur Informationen bis zur eigenen aktuellen Leseposition**.
Spoiler sind durch die Architektur ausgeschlossen, nicht nur durch
Prompt-Anweisungen.

Typischer Anwendungsfall: Mitten im Roman taucht eine Figur auf, die zuletzt
auf Seite 10 vorkam. Man schlägt sie kurz nach und liest weiter.

## 2. Umfang

### Im Umfang (MVP)

- Upload von DRM-freien EPUB-Dateien
- Zerlegung des Buchs in Kapitel und Absätze mit fester Positionszählung
- KI-gestützte Extraktion von Entitäten (Figuren, Orte, Gruppen, Objekte,
  Begriffe) und Fakten, jeweils mit Position getaggt
- Eingebauter Reader im Browser, der die Leseposition speichert
- Nachschlage-Ansicht, die strikt nach Leseposition filtert
- Manuelle Positionswahl (Kapitel/Absatz oder Prozent) als Alternative zum
  Reader
- Bibliothek mit mehreren Büchern
- PWA: im Browser nutzbar und aufs Handy installierbar

### Nicht im Umfang (bewusst zurückgestellt)

- Live-Mitlesen mit externen Readern (Kindle, Kobo/KOReader-Sync)
- Zugriff über den Kindle-Browser
- Go-Backend (Backend ist Python)
- Native App-Hüllen (iOS/Android), Mehrbenutzer-Konten,
  Bezahlfunktionen
- Hochladen oder Verbreiten urheberrechtlich geschützter Inhalte an Dritte
  (Nutzung nur privat mit eigener Kopie)

### Zugriff im selbst gehosteten Betrieb

- Der MVP besitzt noch keine Benutzeranmeldung oder API-Autorisierung. Die
  Compose-Portfreigabe ist nicht für einen ungeschützten Internetbetrieb
  geeignet.
- Vor einem Serverbetrieb muss der Zugriff auf den Eigentümer beschränkt
  werden. Bevorzugt wird ein privater VPN-Zugang mit Host-Firewall; bei
  öffentlichem HTTPS-Zugriff ist mindestens eine vertrauenswürdige
  Authentifizierung am Reverse Proxy und TLS erforderlich.
- Eine spätere anwendungsinterne Anmeldung muss auch API-Endpunkte und
  Buchdaten schützen, nicht nur den Frontend-Zugang.

## 3. Technologie-Stack

| Bereich | Wahl |
|---|---|
| Backend | Python 3.12+, FastAPI, Pydantic |
| Datenbank | SQLite (SQLAlchemy 2.x, Alembic für Migrationen); später Postgres möglich |
| EPUB-Verarbeitung | `ebooklib`, `beautifulsoup4` (lxml) |
| KI | OpenAI API per offiziellem Python-SDK, strukturierte JSON-Ausgabe |
| Frontend | React + TypeScript, Vite, PWA (`vite-plugin-pwa`) |
| Reader | `epub.js` oder `react-reader` |
| Tests | pytest (Backend), Vitest (Frontend) |
| Konfiguration | `.env` (API-Key, Modellname), keine Schlüssel im Repo |

Monorepo-Struktur:

```text
/backend   FastAPI-App, Pipeline, Tests
/frontend  React-App (Vite)
/docs      ROADMAP.md, Entscheidungen und Projektspezifikation
```

## 4. Kernprinzip: Spoilerfreiheit durch Architektur

1. **Jede Textstelle hat eine feste, monoton steigende Position** (siehe
   Positionsmodell).
2. **Die Extraktion läuft kapitelweise in Lesereihenfolge.** Beim Verarbeiten
   von Kapitel N sieht das Modell nur die Kapitel 1..N und den bisher bekannten
   Entitätsbestand, nie spätere Kapitel.
3. **Jeder Fakt trägt die Position, ab der er im Buch bekannt ist**
   (`position`, Quelle: Kapitel/Absatz im Text).
4. **Bei Abfragen filtert die Datenbank hart:** Es werden nur Fakten mit
   `position <= aktuelle_position` ausgeliefert. Zusammenfassungen werden zur
   Abfragezeit aus diesen Fakten gebildet oder sind selbst nach Position
   versioniert.
5. Zusätzliche Absicherung: Das Modell wird bei der Extraktion angewiesen, nur
   den gelieferten Text zu verwenden und kein Vorwissen über das Buch
   einzubringen (wichtig bei bekannten Romanen, deren Ende im Modellwissen
   steckt).

## 5. Positionsmodell

- Das Buch wird in `chapters` (Reihenfolge laut EPUB-Spine) und `paragraphs`
  zerlegt.
- Jeder Absatz erhält eine globale, fortlaufende `position` (Integer, 0..n).
  Kapitelgrenzen sind Bereiche dieser Positionen.
- Seitenzahlen sind ausgabenabhängig und werden nicht als Primärschlüssel
  verwendet. Stattdessen:
  - Reader liefert Kapitel + Absatz → Position
  - Manuelle Eingabe "Prozent des Buchs" → Position über Zeichen- oder
    Absatzanteil
  - Optionale Näherung "Seite X" → Position über Absatzanteil (als ungefähr
    kennzeichnen)
- Leseposition pro Buch wird gespeichert (`reading_progress`).

## 6. Datenmodell (SQLite)

- `books`: id, title, author, language, created_at, status
  (`uploaded|parsing|extracting|ready|error`), source_hash
- `chapters`: id, book_id, index, title, start_position, end_position
- `paragraphs`: id, book_id, chapter_id, position, text
- `entities`: id, book_id, type
  (`person|place|group|object|concept`), canonical_name, first_position
- `entity_aliases`: id, entity_id, alias, first_position (Aliase wie "die
  Wirtin", "Frau Keller" gelten erst ab ihrer Einführung)
- `facts`: id, book_id, entity_id, text, position, chapter_id, source_excerpt
  (kurze Textstelle zum Nachprüfen, max. ca. 200 Zeichen), kind
  (`description|relationship|event|motivation`)
- `relationships`: id, book_id, entity_a_id, entity_b_id, label, position
- `reading_progress`: id, book_id, position, updated_at
- `jobs`: id, book_id, type, status, progress, error, created_at
  (Hintergrundverarbeitung)

Wichtige Indizes: `(book_id, position)` auf `facts`, `paragraphs`,
`relationships`; `(book_id, canonical_name)` auf `entities`; Volltextsuche
(FTS5) auf Aliasen und Fakten.

## 7. Verarbeitungs-Pipeline

1. **Upload und Parsing:** EPUB entpacken, Spine lesen, HTML zu Text bereinigen,
   Kapitel und Absätze mit Positionen speichern. Fehlerhafte oder
   DRM-geschützte Dateien mit klarer Meldung ablehnen.
2. **Extraktion pro Kapitel (sequenziell):**
   - Eingabe ans Modell: Kapiteltext (bei Bedarf in Blöcke geteilt,
     Blockreihenfolge beibehalten) + kompakte Liste der bisher bekannten
     Entitäten samt Aliasen.
   - Ausgabe als validiertes JSON (Pydantic-Schema): neue Entitäten, neue
     Aliase, neue Fakten (mit Absatzbezug und kurzem Quellauszug), Beziehungen.
   - Entitäten-Abgleich: Neue Namen werden gegen vorhandene Entitäten und
     Aliase gematcht (exakt, normalisiert, dann per Modell-Entscheidung), um
     Duplikate zu vermeiden.
   - Positionen der Fakten werden serverseitig aus dem Absatzbezug berechnet,
     nicht vom Modell erfunden. Ungültige Bezüge werden verworfen oder der
     Kapitelposition zugeordnet.
3. **Fortschritt und Wiederaufnahme:** Jobstatus pro Kapitel speichern, damit
   abgebrochene Läufe fortgesetzt werden können.
4. **Qualitätsprüfungen:** Schema-Validierung, Retry bei ungültigem JSON,
   Kostenzähler (Tokens pro Buch).

Prompt-Regeln für die Extraktion (sinngemäß): Nur den gelieferten Text
verwenden. Keine Vermutungen über spätere Handlung. Keine Wertungen. Fakten
knapp und belegbar halten. Ausgabesprache ist konfigurierbar (Standard:
Deutsch).

## 7a. Abfrage

- `GET /books/{id}/lookup?q=Marta&position=1234`: findet Entität per
  Name/Alias (nur Aliase mit `first_position <= position`), liefert Kurzprofil,
  Fakten und Beziehungen mit `position <= position`, jeweils mit
  Kapitelverweis und Quellauszug.
- Optional: Kurzfassung der gefilterten Fakten per Modell. Das Modell erhält
  ausschließlich die bereits gefilterten Fakten.
- Zusätzlich: "Bisher passiert" als chronologische Liste der belegten
  `event`-Fakten bis zur Position, jeweils mit Kapitel und Quellauszug, plus
  spoilergefilterte Personenliste "bisher aufgetreten". Das MVP verwendet dafür
  kein zusätzliches Modell und sendet keinen weiteren Buchtext an OpenAI.

## 8. API-Übersicht (FastAPI)

- `POST /books` (EPUB-Upload) → startet Parsing und Extraktion als
  Hintergrundjob
- `GET /books`, `GET /books/{id}`, `DELETE /books/{id}`
- `GET /books/{id}/jobs` (Verarbeitungsfortschritt)
- `GET /books/{id}/chapters`
- `GET /books/{id}/content/{chapter_id}` (Text/HTML für den Reader)
- `GET/PUT /books/{id}/progress`
- `GET /books/{id}/entities?position=` (gefilterte Liste, Filter nach Typ)
- `GET /books/{id}/lookup?q=&position=`
- `GET /books/{id}/recap?position=` (chronologische Ereignisfakten und bisher
  aufgetretene Figuren, strikt positionsgefiltert)
- Fehlerformat einheitlich, OpenAPI-Doku automatisch

## 9. Frontend

Ansichten:

1. **Bibliothek:** Bücher, Upload, Verarbeitungsstatus.
2. **Reader:** Buchtext mit epub.js, speichert Position automatisch, zeigt
   Fortschritt.
3. **Notizen-Panel** (Seitenleiste bzw. Bottom Sheet am Handy): Suchfeld, Liste
   der bisher aufgetretenen Figuren/Orte, Detailansicht mit Fakten,
   Beziehungen und Kapitelverweisen. Markierter Text im Reader lässt sich
   direkt nachschlagen.
4. **Positionswahl-Fallback:** Kapitel-/Prozent-Auswahl, falls man den Text
   woanders liest.

Anforderungen: responsiv (Handy zuerst), PWA-Manifest, Service Worker für die
App-Hülle, Dark Mode, UI-Sprache Deutsch (i18n-fähig).

## 10. Roadmap

### Phase 0: Setup

- Monorepo, Tooling (ruff, mypy optional, pytest, ESLint, Vitest), `.env.example`,
  README
- Abnahme: Backend und Frontend starten lokal, Health-Endpoint erreichbar, CI
  läuft Tests

### Phase 1: EPUB-Parsing und Datenbank

- Upload-Endpoint, Parsing in Kapitel/Absätze, Positionsvergabe, Migrationen
- Abnahme: Test-EPUB (gemeinfreies Buch) wird korrekt zerlegt; Positionen sind
  lückenlos und monoton; Kapitelreihenfolge stimmt

### Phase 2: Extraktions-Pipeline

- Prompting, JSON-Schema, kapitelweise Verarbeitung, Entitäten-Abgleich,
  Job-Fortschritt, Kostenzähler
- Abnahme: Für ein Testbuch entstehen Entitäten und Fakten mit gültigen
  Positionen; Abbruch und Fortsetzung funktionieren; Duplikatrate bei Figuren
  akzeptabel (manuelle Stichprobe)

### Phase 3: Abfrage-API mit Spoilerfilter

- Lookup, Entitätenliste, Recap, Alias-Suche
- Abnahme (automatisierter Test): Für jede Testposition enthält keine Antwort
  einen Fakt mit `position` größer als die Abfrageposition; Aliase vor ihrer
  Einführung werden nicht gefunden

### Phase 4: Frontend Grundgerüst

- Bibliothek, Upload mit Statusanzeige, Reader mit Positionsspeicherung
- Abnahme: Buch hochladen, lesen, Position bleibt nach Neuladen erhalten

### Phase 5: Notizen-Panel

- Suche, Detailansicht, Nachschlagen markierter Wörter, manuelle Positionswahl
- Abnahme: Nachschlagen im Reader zeigt nur Wissen bis zur aktuellen Position;
  Positionswechsel nach vorn und zurück ändert die Ergebnisse entsprechend

### Phase 6: PWA und Feinschliff

- Installierbar, Offline-Hülle, Fehlerzustände, Ladeanzeigen, Dark Mode,
  Datenexport (JSON/Markdown der Notizen bis Position X)
- Abnahme: Installation auf dem Handy funktioniert, Bedienung auf kleinem
  Display ohne Probleme

### Phase 7: Qualität und Bewertung

- Kleines Prüfset: 1-2 Bücher mit manuell gepflegten Referenznotizen, Messung
  von Spoilerfreiheit (Pflicht: 0 Verstöße), Figurenabdeckung und Fehlerrate
- Dokumentation: Setup, Kosten pro Buch, bekannte Grenzen

## 11. Risiken und Gegenmaßnahmen

- **Modellwissen über bekannte Romane:** kann Spoiler in Fakten bringen.
  Gegenmaßnahme: strenger Prompt, Quellauszug pflichtig, Stichproben mit
  bekannten Büchern, im Zweifel Fakt verwerfen.
- **Externer KI-Dienst:** Für die Extraktion werden die jeweils freigegebenen
  Kapitel-/Textblöcke an die OpenAI API übertragen. Keine EPUB-Dateien oder
  Geheimnisse ins Repository übernehmen; API-Key ausschließlich über `.env`.
- **Figurenverwechslung und Duplikate:** Alias-Verwaltung, Abgleichsschritt,
  Möglichkeit zum manuellen Zusammenführen in der UI (späterer Ausbau).
- **Kosten:** lange Bücher bedeuten viele Tokens. Gegenmaßnahme: Kapitelweise
  Verarbeitung, Caching, Kostenzähler, Modellwahl konfigurierbar.
- **EPUB-Vielfalt:** Uneinheitliche Struktur (fehlende Kapitel, Fußnoten,
  Bilder). Gegenmaßnahme: robuste Bereinigung, Tests mit mehreren EPUBs.
- **Urheberrecht:** Nur private Nutzung mit eigener Kopie, keine öffentliche
  Bereitstellung der Buchtexte.
- **Halluzinationen:** Quellauszug und Kapitelverweis an jedem Fakt, damit man
  nachprüfen kann; Hinweis in der UI, dass Einträge KI-generiert sind.

## 12. Hinweise für die Umsetzung

- Arbeite phasenweise; schließe jede Phase mit den genannten Abnahmetests ab,
  bevor du die nächste beginnst.
- Schreibe zuerst Tests für den Spoilerfilter (Phase 3), sie sind das zentrale
  Qualitätsmerkmal.
- Verwende keine Annahmen über Seitenzahlen; Position ist die einzige Wahrheit.
- Halte Prompts, Schemas und Modellnamen in Konfiguration bzw. eigenen Dateien,
  nicht verstreut im Code.
- Keine Geheimnisse ins Repo; API-Schlüssel nur über `.env`.
- Dokumentiere Entscheidungen kurz in `/docs`.
