# Phase 2 Plan: Kapitelweise Extraktions-Pipeline

## Ziel und Abgrenzung

Ein bereits geparstes Buch wird anhand seiner gespeicherten Kapitel und
Absätze sequenziell verarbeitet. Die Pipeline extrahiert Entitäten,
zeitgebundene Aliase, belegte Fakten und Beziehungen, speichert validierte
Ergebnisse und ermöglicht das Fortsetzen fehlgeschlagener Jobs.

Diese Phase implementiert **keine Lookup-/Spoilerfilter-API** (Phase 3), keinen
Reader oder Notizen-Frontend (Phasen 4–5) und keine PWA. Es werden nur die
Entitäten und Fakten dieses Buches erzeugt. Die Modellantwort ist nicht
vertrauenswürdig: Reihenfolge, Positionszuordnung, Belege und Spoilergrenze
werden serverseitig kontrolliert.

## Vorbedingungen und Abgrenzung zum Ist-Stand

- Bücher, Kapitel, Absätze und Jobs aus Phase 1 sind vorhanden; ein vollständig
  geparstes Buch hat Status `parsed`.
- Die Tabellen `entities`, `entity_aliases`, `facts` und `relationships`
  existieren noch und müssen mit einer Alembic-Migration ergänzt werden.
- Der Upload parst derzeit synchron. Die Extraktion wird zunächst als eigener,
  explizit startbarer Backend-Job umgesetzt; Upload und Extraktion dürfen
  nicht gekoppelt werden, bevor der Jobzustand Wiederaufnahme unterstützt.
- Vor einer Anfrage ans Modell muss sichergestellt sein, dass der Job nur
  Kapitel bis einschließlich des zu bearbeitenden Kapitels übergibt. Spätere
  Kapitel dürfen weder im Prompt noch in einem Hilfskontext enthalten sein.

## Umsetzungsschritte

1. **Datenmodell und Migration**
   - SQLAlchemy-Modelle und Alembic-Migration für `entities`,
     `entity_aliases`, `facts` und `relationships` ergänzen.
   - `entities`: Buch-FK, Typ (`person|place|group|object|concept`),
     kanonischer Name, erste bekannte Position.
   - `entity_aliases`: Entitäts-FK, Alias, erste bekannte Position;
     Aliasnamen sind erst ab dieser Position verwendbar.
   - `facts`: Buch- und Entitäts-FKs, Text, serverseitig berechnete Position,
     Kapitel-FK, Quellauszug (max. 200 Zeichen) und Typ
     (`description|relationship|event|motivation`).
   - `relationships`: Buch-FK, beide Entitäts-FKs, Label und Position.
   - Positionen müssen nichtnegativ sein. Eindeutige Constraints schützen
     doppelte Aliase und identische Extraktionsergebnisse; Indizes mindestens
     auf `(book_id, position)`, `(book_id, canonical_name)` sowie
     `(entity_id, first_position)` anlegen.
   - Migration und Downgrade auf SQLite testen; Fremdschlüssel müssen aktiv
     bleiben.

2. **Extraktionsschema und Prompt**
   - Pydantic-Schemas für Kapitelresultate und deren Entitäten, Aliase, Fakten
     und Beziehungen definieren. Modellfelder enthalten nur eine
     Kapitel-/Absatzreferenz, niemals eine globale Position.
   - Kapitelreferenzen und Absatz-IDs/Indizes in der Eingabe eindeutig
     nummerieren; der Server prüft jede Antwort gegen genau diese erlaubten
     Bezüge.
   - Quellauszüge müssen aus dem referenzierten Absatz stammen. Fakten ohne
     ausreichenden Beleg, mit unbekannter Referenz, leerem Inhalt oder
     Quellauszug über 200 Zeichen werden abgelehnt oder entsprechend der
     festgelegten Validierungsregel ausgelassen.
   - Prompt und JSON-Ausgabeschema in eigenen Dateien halten. Anweisung:
     ausschließlich den mitgelieferten Text verwenden, nicht raten und kein
     Buchvorwissen einbringen. Prompting ist zusätzliche Absicherung, kein
     Spoiler-Schutzmechanismus.
   - Extraktionssprache aus der vorhandenen `APP_OUTPUT_LANGUAGE`-Einstellung
     lesen.

3. **OpenAI-Client und Konfiguration**
   - Offiziellen OpenAI-Python-Client hinter einer schmalen,
     injizierbaren Schnittstelle kapseln, damit Tests ohne Netz und API-Key
     laufen.
   - API-Key bleibt optional für den App-Start, wird aber beim Start eines
     Extraktionsjobs explizit benötigt; bei fehlendem Key einen klaren
     Konfigurationsfehler liefern und den Job nicht als erfolgreich markieren.
   - Modellname, maximale Antwort-/Retry-Anzahl und gegebenenfalls Timeout
     über Konfiguration beziehen. Keine Prompts oder API-Schlüssel in Logs
     ausgeben.
   - Die OpenAI Responses API mit strukturiertem Output/JSON-Schema verwenden
     und trotzdem jede Antwort mit Pydantic validieren. Bei ungültiger Ausgabe
     begrenzte Wiederholungen mit validierungsbezogener Korrekturanweisung;
     danach Job als Fehler markieren.
   - Nur die aktuell erlaubten Kapitel-/Absatzblöcke und den zulässigen
     Entitätskontext an OpenAI übertragen; Datenübertragung transparent
     dokumentieren. Keine vollständige EPUB-Datei an den Anbieter senden.

4. **Sequenzielle Verarbeitung, Wiederaufnahme und Kosten**
   - Pro Buch höchstens einen aktiven Extraktionsjob zulassen.
   - Kapitel streng nach `chapters.index` verarbeiten. Das Modell erhält nur
     Absätze des aktuellen Kapitels und den bis zum vorherigen Kapitel
     gespeicherten Entitäts-/Aliasbestand.
   - Bei langen Kapiteln Absätze in zusammenhängenden, geordneten Blöcken
     verarbeiten; Prompt und Entitätskontext enthalten nie spätere Blöcke.
   - `jobs` um die zur Wiederaufnahme nötigen Informationen erweitern (zum
     Beispiel zuletzt abgeschlossenes Kapitel, Tokenverbrauch und
     Fehlercode). Kapitelresultat, Fortschritt und Checkpoint atomar speichern.
   - Abbruch oder Fehler darf bereits bestätigte Kapitelresultate nicht
     duplizieren. Neustart verarbeitet ab dem ersten nicht abgeschlossenen
     Kapitel beziehungsweise Block weiter.
   - Ein-/Ausgabetokens pro Modellaufruf und Gesamtsumme am Job erfassen;
     Fortschritt monoton aktualisieren. Keine Modellaufrufe parallelisieren.

5. **Entitätenabgleich und serverseitige Positionsvergabe**
   - Namen zunächst normalisiert exakt gegen kanonische Namen und bereits
     bekannte Aliase dieses Buchs abgleichen. Neue Entitäten erhalten
     deterministische IDs und `first_position` aus der ersten belegten
     Erwähnung.
   - Explizite Modellreferenz auf eine vorhandene Entität nur akzeptieren,
     wenn diese Entität im erlaubten Kontext enthalten ist. Automatische
     fuzzy-/LLM-Zusammenführung ist nicht Teil dieser Phase; mehrdeutige
     Fälle als getrennt oder ungelöst speichern und dokumentieren.
   - Globale Position ausschließlich aus dem validierten Absatz des aktuellen
     Kapitels berechnen; Position muss innerhalb des Kapitelbereichs liegen.
   - Beziehungspartner müssen zum selben Buch gehören. Fakten, Alias und
     Beziehungen nicht vor ihrer ersten belegten Position verfügbar machen.

6. **Jobsteuerung und API**
   - Einen expliziten Start-Endpunkt für Extraktion eines geparsten Buchs
     ergänzen, etwa `POST /books/{id}/extraction-jobs`; laufenden Job
     wiederverwenden oder mit konsistentem Konfliktstatus antworten.
   - `GET /books/{id}/jobs` liefert Jobtyp, Status, Prozentfortschritt,
     letztes abgeschlossenes Kapitel, sichere Fehlermeldung und Tokenzähler.
   - Erfolgreiche Extraktion setzt den Buchstatus auf `ready`; Fehler erhalten
     `error` und einen wiederaufnehmbaren Jobzustand. `parsed` bleibt der
     Zustand vor erfolgreicher Extraktion.
   - Einen einzelnen Job ohne OpenAI-Zugriff lokal über Test-Doubles
     ausführen können; keine neue öffentliche Lookup-Route hinzufügen.

## Geplante Tests

- Migration legt alle vier Tabellen, Fremdschlüssel, eindeutige Constraints
  und Indizes an; Alembic erkennt danach keine Modelldifferenz.
- Pydantic verwirft ungültige Entitätstypen, Faktenarten, fehlende Felder,
  ungültige Absatzreferenzen und zu lange Quellauszüge.
- Prompt-Input für Kapitel N enthält keine Absätze aus N+1 und keine
  zukünftigen Entitäten oder Aliase.
- Für Modellantworten mit gültigem Absatzbezug berechnet der Server exakt die
  globale Datenbankposition. Modellpositionen werden weder entgegengenommen
  noch vertraut.
- Kein Fakt, Alias oder Beziehungseintrag kann auf einen Absatz außerhalb des
  aktuellen Kapitels verweisen. Jeder Quellauszug ist im referenzierten
  Absatztext enthalten.
- Sequenzielle Mock-Ausführung prüft Kapitelreihenfolge und begrenzte
  Blockreihenfolge. Der OpenAI-Client wird mit geprüftem Prompt und
  JSON-Schema aufgerufen.
- Fehler bei Modelltransport, ungültigem JSON, Validierung oder fehlendem
  API-Key werden sichtbar als Jobfehler festgehalten; kein Fehler wird als
  Erfolg kaschiert.
- Abbruch nach Kapitel/Block und anschließende Wiederaufnahme verarbeitet nur
  offene Arbeit und erzeugt keine doppelten Fakten/Entitäten.
- Jobfortschritt bleibt monoton; Tokenzähler summieren gemeldete Nutzung.
- Kein Test benötigt einen echten OpenAI-Key oder Netzwerkzugriff.

## Abnahmekriterien

- Migration ist auf leerer SQLite-Datenbank erfolgreich und entspricht den
  Modellen.
- Ein synthetisches Mehrkapitel-Testbuch erzeugt mit Mock-Modell Entitäten,
  Aliase, Fakten und Beziehungen an korrekten globalen Positionen.
- Bei Verarbeitung eines Kapitels ist nachweislich kein späterer Buchtext im
  Modellinput vorhanden.
- Sämtliche gespeicherten Fakten und Beziehungen haben einen gültigen
  Absatzbezug und Position im Buchbereich; Quellauszüge sind nachprüfbar und
  höchstens 200 Zeichen lang.
- Jobfortschritt, Tokenverbrauch, Fehlerzustand und Wiederaufnahme sind durch
  automatisierte Tests abgedeckt.
- Backend-Tests und Ruff laufen lokal und in der Pull-Request-CI erfolgreich.
- Die Phase endet vor Implementierung der Lookup-/Recap-API aus Phase 3.

## Bewusst zurückgestellt

- Automatische fuzzy- oder LLM-gestützte Zusammenführung mehrdeutiger
  Entitäten; zunächst keine riskante automatische Verschmelzung.
- Lookup, Recap und Spoilerfilter-API; diese bekommen eigene Phase-3-Tests.
- UI zur manuellen Korrektur oder Zusammenführung von Entitäten.
- Batch-/Parallelverarbeitung mehrerer Kapitel, Hintergrund-Queue außerhalb
  des vorhandenen Jobmodells und automatisches Re-Parsing.
