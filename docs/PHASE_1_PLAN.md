# Phase 1 Plan: EPUB-Parsing und Datenbank

## Ziel und Abgrenzung

EPUB-Dateien werden sicher angenommen, in der EPUB-Spine-Reihenfolge gelesen
und reproduzierbar in Kapitel und Absätze mit globalen Positionen zerlegt.
Bücher und Parsing-Ergebnisse werden in SQLite gespeichert und über eine
schmale API zugänglich gemacht.

Diese Phase implementiert **keine KI-Extraktion**, Spoiler-Lookup-API,
Reader-Oberfläche oder Konten. Ein erfolgreich geparstes Buch ist noch nicht
vollständig analysiert; `ready` bleibt für den Abschluss der späteren
Extraktionsphase reserviert. Für Phase 1 wird ein expliziter Status
`parsed` benötigt.

## Umsetzungsschritte

1. **Datenbank und Migrationen**
   - SQLAlchemy-Modelle und Alembic-Konfiguration in `backend/` einrichten.
   - Tabellen `books`, `chapters`, `paragraphs` und `jobs` anlegen. Entitäten,
     Fakten und Beziehungen folgen in Phase 2.
   - Fremdschlüssel, eindeutige Constraints und Indizes für Buch-/Kapitel-
     Reihenfolge und globale Absatzposition definieren.
   - SQLite-Fremdschlüsselprüfung aktivieren; Datenbankdatei im persistenten
     Compose-Volume ablegen.
   - Migration für eine leere Datenbank und Migrationstest bereitstellen.

2. **EPUB-Parser**
   - EPUB über `ebooklib` öffnen, Spine-Reihenfolge als verbindliche
     Lesereihenfolge verwenden und Metadaten wie Titel, Autor und Sprache
     übernehmen, soweit vorhanden.
   - HTML-Inhalte mit BeautifulSoup/lxml zu Text bereinigen; leere Kapitel
     überspringen, sinnvolle Absätze erhalten und Absätze deterministisch
     nummerieren.
   - Jedes gespeicherte Kapitel erhält einen fortlaufenden Kapitelindex und
     den inklusiven Positionsbereich seiner Absätze.
   - Jeder gespeicherte Absatz erhält eine buchweit eindeutige, lückenlose
     Position ab 0. Die Positionszuordnung wird ausschließlich serverseitig
     erzeugt.
   - EPUB-Parsing ohne externe Netzwerkzugriffe ausführen. Upload-Größe und
     entpackte Datenmenge begrenzen; fehlerhafte Archive, verschlüsselte/
     DRM-geschützte und nicht unterstützte EPUBs mit verständlichem Fehler
     ablehnen.

3. **Upload und Persistenz**
   - `POST /books` nimmt `multipart/form-data` mit einer EPUB-Datei an und
     vergibt eine stabile Buch-ID sowie einen SHA-256-Quellhash.
   - Parsing und Speichern erfolgen transaktional: bei einem Fehler bleiben
     keine teilweise angelegten Kapitel oder Absätze zurück und das Buch
     erhält den Status `error` mit einer sicheren, nutzerverständlichen
     Meldung.
   - Statusübergänge für diese Phase: `uploaded -> parsing -> parsed` oder
     `uploaded/parsing -> error`. Wiederholtes Hochladen derselben Datei
     erzeugt keine unbeabsichtigte Duplikatverarbeitung; die konkrete
     Duplikat-UX anhand des Quellhashs festlegen.
   - Ursprüngliche EPUB-Datei nicht dauerhaft speichern, sofern kein
     Re-Parsing- oder Download-Anwendungsfall dies erfordert; diese
     Speicherentscheidung vor Implementierung dokumentieren.

4. **Lese-API und Fehlerverhalten**
   - `GET /books` liefert die Bibliotheksmetadaten und den Verarbeitungsstatus.
   - `GET /books/{id}` liefert Metadaten und Parsing-Status.
   - `GET /books/{id}/chapters` liefert Kapitel in Lesereihenfolge samt
     Positionsbereichen.
   - `GET /books/{id}/content/{chapter_id}` liefert Absätze geordnet nach
     Position. Unbekannte IDs antworten mit konsistentem 404-Fehler.
   - OpenAPI-Schemas beschreiben Upload, Antworten und Fehler. Keine absoluten
     Serverpfade oder internen Stacktraces in API-Fehlern ausgeben.

5. **Konfiguration und Betrieb**
   - Datenbank-URL und EPUB-Limits aus zentralen Einstellungen beziehen;
     Compose muss persistente Daten über Neustarts behalten.
   - Upload-Limit (Standard 50 MB, erlaubter Bereich 1–500 MB), entpackte
     Datenmenge (Standard 250 MB, Bereich 1–2000 MB) und Archiveinträge
     (Standard 5000, Bereich 1–50000) konfigurierbar machen.
   - Temporäres Verzeichnis für Multipart-Uploads über `UPLOAD_TEMP_DIR`
     konfigurierbar machen; Upload-Spooldateien werden nach dem Request
     verworfen.
   - README um benötigte Umgebungswerte, Migrationen und Parsergrenzen
     ergänzen. Parser-Timeout ist noch nicht konfigurierbar.

## Geplante Tests

- **Positionsinvarianten:** Positionen beginnen bei 0, sind global eindeutig,
  lückenlos und strikt steigend; Kapitelbereiche stimmen exakt mit ihren
  Absätzen überein.
- **Spine-Reihenfolge:** Ein kleines selbst erstelltes Test-EPUB mit mehreren
  XHTML-Dateien in absichtlich abweichender Dateisystemreihenfolge ergibt
  Kapitel in Spine-Reihenfolge.
- **Textbereinigung:** Überschriften, Absätze, Entities und leere
  HTML-Elemente werden erwartungsgemäß behandelt; leere Kapitel führen nicht
  zu falschen Positionslücken.
- **Fehlerfälle:** beschädigtes/nicht-EPUB-Archiv, fehlendes Container- oder
  OPF-Dokument, verschlüsselter Inhalt und Überschreitung der konfigurierten
  Limits liefern verständliche 4xx-Fehler und hinterlassen keine Teildaten.
- **Datenbank:** Migration auf leerer SQLite-Datei funktioniert; Constraints
  und Fremdschlüssel werden geprüft.
- **API:** Upload und anschließendes Abrufen von Buch, Kapiteln und Inhalt;
  unbekannte Buch-/Kapitel-IDs und ungültige Uploads ergeben definierte
  Fehlerantworten.
- **Persistenz:** Gespeicherte Daten sind nach Schließen und erneutem Öffnen
  der Datenbank vorhanden.

Testdateien sollen synthetisch oder gemeinfrei und klein sein; keine
urheberrechtlich geschützten Buchtexte einchecken.

## Abnahmekriterien

- Upload eines gültigen Test-EPUBs wird in korrekter Spine-Reihenfolge
  geparst und mit Status `parsed` gespeichert.
- Absatzpositionen bilden exakt eine lückenlose, monoton steigende Sequenz
  ab 0; Kapitelgrenzen decken die zugehörigen Absätze korrekt ab.
- Ungültige, DRM-geschützte oder zu große Uploads werden mit klarer
  Fehlermeldung abgelehnt und erzeugen keine unvollständigen Parserdaten.
- Migrationen funktionieren auf einer leeren Datenbank und gespeicherte Daten
  überleben einen Backend-Neustart.
- Backend-Tests und Ruff laufen lokal und in der Pull-Request-CI erfolgreich.
- Die Phase endet vor Implementierung von KI-Extraktion oder Frontend-Reader.

## Vor Implementierung zu entscheiden

- Identische Uploads werden anhand des SHA-256-Hashes idempotent behandelt und
  geben den vorhandenen Bucheintrag zurück.
- Maximale Upload- und entpackte EPUB-Größe sowie Parser-Timeout.
- Die EPUB-Quelldatei wird nicht dauerhaft abgelegt; gespeichert werden die
  extrahierten Kapitel und Absätze. Ein späterer Re-Parsing-Anwendungsfall
  müsste einen erneuten Upload verlangen.
