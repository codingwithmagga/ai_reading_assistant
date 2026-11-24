# Issue 38 Plan: Aufteilung großer Frontend-Module

## Umsetzungsstatus

Vollständig umgesetzt. Die geplanten concrete Verantwortlichkeiten liegen in
eigenen Komponenten oder Hooks; `api.ts` ist wieder eine kompatible
Barrel-Datei, während Transport, Validierung und fachliche API-Gruppen getrennt
sind.

## Auswahl

Die Aufteilung erfolgt ausschließlich entlang bereits vorhandener
Verantwortlichkeiten. Öffentliche API-Verträge, UI-Abläufe, Übersetzungen,
Spoilerfilter und Leseposition bleiben unverändert.

Die Trennung wird nur umgesetzt, wenn sie eine konkrete Größe oder Kopplung
reduziert:

1. `frontend/src/api.ts` wird in Typen, Runtime-Validierung, Transport und
   fachlich gruppierte API-Funktionen aufgeteilt.
2. `frontend/src/App.tsx` trennt Library-, Upload-, Backup- und
   Extraktions-UI von der App-weiten Sprache-, Theme- und Verbindungssteuerung.
3. `frontend/src/Reader.tsx` trennt Leseposition/Progress-Tracking von den
   bereits vorhandenen Notes-Hooks und Präsentationskomponenten.

## Vorgeschlagene Modulgrenzen

### API

- `api/types.ts`: Datenstrukturen und Antworttypen.
- `api/validation.ts`: bestehende `isRecord`-, Feld- und
  Response-Validatoren sowie gemeinsame Arrays und Enumerationsprüfungen.
- `api/request.ts`: `ApiError`, HTTP-Fehlerdetail-Mapping und gemeinsamer
  `requestJson`-Transport.
- `api/books.ts`: Library, Upload, Löschen und Backup.
- `api/extraction.ts`: Extraktionsjobs und Kapitellisten für Extraction
  Controls.
- `api/reader.ts`: Kapitelinhalt und Lesefortschritt.
- `api/notes.ts`: Entitäten, Lookup, Recap und Notes-Export.
- `api.ts`: kleine Kompatibilitätsschicht mit den bisherigen Exports.

Die Importe in `i18n.ts`, `notesExport.ts`, Tests und UI-Komponenten dürfen
über den bestehenden Barrel `api.ts` bestehen bleiben. Ein Umbenennen oder
verschärfen der Response-Typen gehört nicht zu diesem Umbau. Fehlende oder
malformed API-Antworten müssen weiterhin als `ApiError` mit einer
allgemeinen, sicheren Nachricht abgewiesen werden.

### App

- `App.tsx`: App-Shell, Sprach- und Theme-State, Online-/Update-Status,
  Auswahl zwischen Library und Reader.
- `LibraryView.tsx`: Library-Anzeige, Löschzustand und Buchkarten.
- `UploadSection.tsx`: EPUB-Auswahl, Upload und Retry-Parsing.
- `BackupSection.tsx`: Backup-Download und bestätigtes Restore.
- `ExtractionControls.tsx`: bestehende Kapitellisten-, Job- und
  Fortschrittlogik, inklusive Polling.
- optional `useThemePreference.ts`: nur extrahieren, wenn Theme und
  Systemfarben zusätzlich getestet werden sollen; kein Hook nur um
  State-Variablen zu verschieben.

Die Extraktionssteuerung wird als erstes aus `App.tsx` herausgezogen, weil sie
einen zusammenhängenden Zustandskreis bildet. Library-, Upload- und
Backup-Abschnitte werden nur extrahiert, wenn die verbleibende App-Datei
damit klar kleiner wird und die Komponenten ohne unnatürliche Callback-Typen
auskommen.

### Reader

- `Reader.tsx`: Orchestrierung der Reader-Ansicht und Übergabe an bestehende
  Präsentationskomponenten.
- `useReaderPosition.ts`: Kapitelinitialisierung, Saved Progress, Kapitelwechsel,
  manueller Chapter-/Percentage-Position, Restore-Scroll und
  gültige Positionsberechnung.
- `useReadingProgress.ts`: `IntersectionObserver`, aktuelle Position,
  Queue, Debounce, Save-Retry und zugehörige Fehlermeldung.
- `readerSelection.ts` und `useReaderNotes.ts` bleiben unverändert.
- `ReaderComponents.tsx` behält konkrete Position-Controls, Reader-Content und
  Notes-Panel.
- `notesExport.ts` bleibt unverändert.

Der Reader darf die Position nur aus Kapitel-/Paragraphdaten berechnen und
weitergeben. Keine neue Frontend-Spoilerfilterung oder Positionsermittlung aus
zukünftigen oder nicht validierten Daten wird eingeführt.

## Umsetzungsschritte

1. **Charakterisierung**
   - Bestehenden App-, API- und Reader-Testbestand vor dem Umbau ausführen.
   - Öffentliche sichtbare Abläufe für Upload, Library, Extraction, Reader,
     Manual Position, Export und Theme unverändert als Testgrundlage halten.
2. **API-Aufteilung**
   - Zuerst Typen und Validatoren in `api/` verschieben.
   - Danach gemeinsamer Transport und fachliche Request-Gruppen extrahieren.
   - `api.ts` als Barrel erhalten und die bestehenden Importe in einem Schritt
     auf die stabilen Exports testen.
   - Eine geänderte Response darf nicht aus Versehen weniger geprüft werden.
3. **ExtractionControls**
   - Bestehende Komponente aus `App.tsx` in ein eigenes Modul verschieben.
   - Keine JSX- oder Zustandsänderungen außer notwendigem Import/Pfad.
4. **App-Ansichtsteile**
   - Upload, Backup und Library erst danach extrahieren, jeweils mit dem
     vorhandenen Zustand, den passenden Props und sichtbarem Verhalten.
   - App-weite Theme-, Sprach-, Offline- und Update-Logik in `App.tsx`
     belassen, bis ein konkreter eigener Hook die Übersicht verbessert.
5. **Reader-Hooks**
   - Positionsinitialisierung und -wechsel extrahieren.
   - Progress-Saving einschließlich Queue und Retry in einen eigenen Hook
     extrahieren.
   - `useReaderNotes.ts` nicht weiter aufteilen, solange sein Zustandskreis
     zusammenhängend bleibt.
6. **Abschluss**
   - Interne Modulgrenzen in der Architecture-Übersicht aktualisieren.
   - Keine neue Public-Contract- oder Browser-Speicherabstraktion einführen.

Jeder Schritt soll als eigenständiger Commit oder kleinem PR-Schritt
abschließbar sein. API- und Hook-Umzüge dürfen keine UI- oder
Spoilergrenzenänderung enthalten.

## Verifikation

Für jeden Umbauschritt:

- `npm test`
- `npm run lint`
- `npm run build`

Vor Abschluss gezielt bestehende Tests für folgende Verhaltensweisen behalten
oder ergänzen:

- Upload, Reuse und Failed-Parsing-Retry;
- Extraction-Range, Polling und Error Status;
- Delete-/Backup-Bestätigungen;
- Theme-/Language-Persistenz und Offline-/Update-Hinweise;
- Kapitelwechsel und wiederhergestellter Lesefortschritt;
- Manual Chapter und Percentage Position;
- Lookup, Selected Text, Recap und Export am aktiven Position.
- Malformed successful API responses werden im API-Client abgewiesen.

Das vollständige Splitting ist nicht erfolgreich, wenn bestehende
öffentliche Namen intern nur weitergereicht werden, neue Hooks keinen Zustand
oder Datenfluss vereinfachen, oder die Aufteilung zusätzliche Prop- oder
Zirkular-abhängigkeiten erzeugt.
