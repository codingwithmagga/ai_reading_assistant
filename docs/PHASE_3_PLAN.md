# Phase 3 Plan: Abfrage-API mit Spoilerfilter

## Ziel und Abgrenzung

Die API ermöglicht das Nachschlagen bereits extrahierter Entitäten und Fakten
bis zu einer vom Client übermittelten Leseposition. Die Spoilergrenze wird
ausschließlich serverseitig in Datenbankabfragen durchgesetzt. Namen, Aliase,
Fakten oder Beziehungen aus späteren Positionen dürfen weder Suchtreffer noch
indirekte Metadaten beeinflussen.

Diese Phase implementiert keine Reader-Oberfläche, keine Benutzerkonten und
keine Änderung der Extraktionspipeline. Die App hat weiterhin keine
Anmeldung; sie bleibt auf localhost beziehungsweise einen geschützten
VPN-/Reverse-Proxy-Zugang beschränkt und darf nicht ungeschützt öffentlich
betrieben werden.

## Vorbedingungen

- Phase 2 speichert Entitäten und Aliase mit `first_position`, Fakten und
  Beziehungen mit serverseitig berechneter `position` und liefert
  Jobfortschritt.
- Es gibt noch keine Zusammenfassungs- oder Recap-Daten pro Kapitel.
- Kapitel und Absätze besitzen lückenlose globale Positionen ab 0.

## Umsetzungsschritte

1. **Spoilerfilter-Tests zuerst**
   - Synthetisches Testbuch mit mehreren Entitäten, Aliassen, Fakten,
     Beziehungen und Kapitelgrenzen anlegen.
   - Für jede Testposition nachweisen, dass keine Antwort Inhalte mit
     `position` größer als der Abfrageposition enthält.
   - Vor der ersten Erwähnung darf eine Entität nicht erscheinen; ein Alias
     ist erst ab seiner `first_position` suchbar.
   - Beziehungen nur zurückgeben, wenn die Beziehung und beide Entitäten an
     der angefragten Position bekannt sind.
   - Zusätzliche Tests für gleichnamige Aliase, unbekannte Bücher, leere
     Suchanfragen, Positionsgrenzen und leere Extraktionsergebnisse schreiben;
     ohne Extraktion liefern Entitätenliste und Lookup leere Trefferlisten.

2. **Gemeinsame Positions- und Auflösungslogik**
   - Eine Position anhand des gespeicherten Buchbereichs validieren; negative
     oder größere als die letzte Absatzposition liegende Werte mit einem
     definierten 422-Fehler ablehnen, nicht stillschweigend begrenzen.
   - Kanonische Namen und bis zur Position eingeführte Aliase normalisiert
     exakt suchen; keine fuzzy- oder externe Modellauflösung hinzufügen.
   - Mehrdeutige Aliase nicht automatisch einer Entität zuordnen. Treffer
     dürfen die konkurrierenden bis dahin bekannten Entitäten ausweisen oder
     als mehrdeutig markiert sein.

3. **Entitätenliste**
   - `GET /books/{id}/entities?position=...` liefert nur Entitäten mit
     `first_position <= position`, optional nach Entitätstyp gefiltert.
   - Mitgelieferte Aliase müssen jeweils `first_position <= position`
     erfüllen.
   - Antwortfelder und Sortierung deterministisch halten; keine zukünftigen
     Faktenzahlen, Aliasnamen oder Beziehungen als Metadaten vorab verraten.

4. **Lookup**
   - `GET /books/{id}/lookup?q=...&position=...` sucht nach kanonischem Namen
     oder bis dahin eingeführtem Alias.
   - Nur passende Entitäten, Fakten und Beziehungen mit Position kleiner oder
     gleich der Abfrageposition ausliefern.
   - Jeden Fakt mit Typ, Kapitelreferenz, Quellauszug und Position ausgeben.
     Positionen dienen der Prüfung, nicht als Inhalt jenseits der Grenze.
   - Fehlerfälle mit konsistenten 404-/422-Fehlercodes beschreiben.

5. **Recap und bisher aufgetretene Figuren**
   - `GET /books/{id}/recap?position=...` darf ausschließlich bereits
     spoilergefilterte Informationen nutzen.
   - Da keine Kapitelzusammenfassungen gespeichert werden, zunächst keinen
     unbeschränkten Originaltext oder vollständige EPUB-Inhalte an ein Modell
     senden.
   - Vor der Implementierung festlegen, ob Phase 3 ein deterministisches,
     chronologisches Ereignis-Recap aus `event`-Fakten liefert oder ob ein
     optionaler OpenAI-Recap aus den bereits gefilterten Fakten gewünscht ist.
     Bei OpenAI-Recap sind Datenübertragung und Kosten transparent zu machen.
   - Bisher aufgetretene Figuren müssen denselben Alias- und
     Positionsfilter wie die Entitätenliste verwenden.

6. **Dokumentation und Abnahme**
   - OpenAPI-Schemas, Fehlerantworten, Sortierung und Positionssemantik
     dokumentieren.
   - README um Lookup-/Entitäten-/Recap-Beispiele ergänzen.
   - Phase 2 bleibt nachweislich ohne neue Abhängigkeit von der Lookup-API;
     Phase 3 wird erst nach grünen Backend-Tests und Ruff abgeschlossen.

## Geplante Tests

- Für jede Position einer synthetischen Testsequenz sind alle ausgegebenen
  Fakten und Beziehungen positionsmäßig <= Abfrageposition.
- Entity-Liste und Lookup verbergen Entitäten und Aliase vor deren erster
  Erwähnung.
- Mehrdeutige Aliase führen nie zu einer unbelegten Einzelzuordnung.
- Beziehungen werden nur ausgegeben, wenn Beziehung und beide Endpunkte
  spoilerfrei bekannt sind.
- Positionen < 0 und > letzte Absatzposition ergeben definierte 422-Antworten.
- Fremde Kapitel- oder Buch-IDs, unbekannte Bücher und fehlende Suchtreffer
  liefern definierte Fehlerantworten.
- Recap erhält ausschließlich vorgefilterte Fakten; kein Test benötigt
  Netzwerkzugriff oder einen echten OpenAI-Key.

## Noch vor Implementierung zu entscheiden

- Recap-Ausgabe in Phase 3: deterministische Liste belegter Ereignisse oder
  optionale OpenAI-Zusammenfassung ausschließlich aus gefilterten Fakten.

## Bewusst zurückgestellt

- Fuzzy-Suche und automatische Alias-/Entitätsverschmelzung.
- Öffentliche Bereitstellung ohne Anmeldung; Zugangsschutz bleibt eine eigene
  Server-/Authentifizierungsaufgabe.
- Kapitelzusammenfassungen aus nicht gefiltertem Text, Reader-Integration und
  persistierte Lesefortschritte.
