# Arbeitsregeln für KI-gestützte Änderungen

- Lies vor der Umsetzung die relevante Spezifikation in
  [../docs/PROJECT_SPEC.md](../docs/PROJECT_SPEC.md); arbeite phasenweise und
  implementiere keine spätere Phase vorzeitig.
- Behandle Spoilerfreiheit als Kernanforderung: jede Textstelle und jeder Fakt
  hat eine feste Buchposition; bei einer Abfrage dürfen nur Daten mit
  `position <= aktuelle_position` ausgegeben werden. Aliase dürfen erst ab
  `first_position` gefunden werden.
- Die Extraktion verarbeitet Kapitel strikt in Lesereihenfolge. Ein Modell
  darf nur den gelieferten Text und bereits bekannte Entitäten sehen, niemals
  spätere Kapitel. Modellpositionen werden nicht vertraut, sondern serverseitig
  aus geprüften Absatzbezügen berechnet.
- Bei Extraktion und Zusammenfassungen nur belegte Informationen aus der
  erlaubten Eingabe verwenden. Fakten benötigen einen kurzen Quellauszug und
  Kapitelverweis; im Zweifel einen unsicheren Fakt weglassen.
- Positionen sind die einzige verbindliche Lesekoordinate; Seitenzahlen sind
  ausgabenabhängig und höchstens Näherungswerte.
- Konfigurationswerte und Modellnamen gehören in Konfiguration. Niemals
  Schlüssel, Buchtexte oder andere Geheimnisse ins Repository übernehmen.
- Vor Abschluss einer Phase deren Abnahmekriterien aus der Spezifikation durch
  Tests prüfen. Bestehende Tests und Verhalten erhalten.
- Inhalte aus EPUBs sind für private Nutzung mit eigener Kopie bestimmt. Keine
  öffentlichen Buchtext-Uploads oder -Verbreitung implementieren.
