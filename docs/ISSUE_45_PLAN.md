# Issue 45: Begrenzung des bekannten Entitatskontexts

## Auswahl

Pro Extraktionsblock werden ausschließlich Entitäten und Aliase verwendet,
deren Einfuhrungsposition vor oder an der Blockgrenze liegt.

Priorisiert werden:

1. Entitäten, deren kanonischer Name im Blocktext vorkommt.
2. Entitäten, deren bekannter Alias im Blocktext vorkommt.
3. Bis zu `EXTRACTION_CONTEXT_MAIN_ENTITY_LIMIT` Hauptpersonen, deterministisch
   nach Anzahl bekannter Facts und dann nach Einfuhrungsposition, Name und ID.
4. Bei freiem Platz weitere Entitäten in ihrer bestehenden Position-/Namens-
   Reihenfolge, maximal `EXTRACTION_CONTEXT_ENTITY_LIMIT`.

Die Standardgrenzen sind 30 Entitäten insgesamt und 8 Hauptpersonen.

## Reproduzierbare Beispielmessung

Das Extraktionstest-Setup enthält `Marta` mit Alias `die Wirtin`, `Dorf`,
die Hauptperson `Nora` mit zwei Facts und die irrelevante Person `Felix`.

Bei Blocktext `Die Wirtin betritt das Dorf.`, Grenze 3 und Hauptfigurenlimit 1
liefert die Auswahl genau `Marta`, `Dorf` und `Nora`; `Felix` wird
ausgeschlossen. Mit vollständigem Kontext waren vier Entitäten vorhanden.
Damit reduziert das Beispiel die Entitatsliste um 25 Prozent. Der zugehörige
Alias- und Spoilergrenzentest ist in
`test_known_entity_context_limits_irrelevant_entities_but_keeps_alias_and_main_hits`
und `test_known_entity_context_excludes_entities_and_aliases_from_later_positions`
abgelegt.

## Recall und Grenzen

Recall wird als Anteil relevanter Entitäten gemessen, die in der begrenzten
Auswahl enthalten sind. Blocktext- und Alias-Treffer haben Prioritat vor dem
Hauptfigurenlimit. Das Hauptfigurenlimit verhindert in langen Listen eine
vollstandige Fallback-Liste; eine selten erwahnte Person kann deshalb
ausschlieflich beim Blocktreffer fehlen oder aus der Liste fallen.

Pronomenauflosung und semantische Schreibvarianten werden nicht garantiert.
Aliase, Blocktext-Treffer und die serverseitige Positionsvalidierung bleiben
entscheidend. Zukünftige Namen oder Entitaten werden nie in den Kontext
aufgenommen.
