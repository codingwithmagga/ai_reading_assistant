import { ApiError } from "./api";

export const translations = {
  de: {
    heading: "Spoilerfreier Lesebegleiter",
    description:
      "Deine Notizen bleiben auf dem Stand deiner aktuellen Leseposition.",
    language: "Sprache",
    readerContent: "Buchtext",
    library: "Bibliothek",
    upload: "EPUB hochladen",
    chooseFile: "EPUB-Datei auswählen",
    noFile: "Keine Datei ausgewählt",
    uploading: "Wird hochgeladen …",
    uploadSuccess: "Buch wurde hochgeladen.",
    duplicateSuccess: "Dieses Buch war bereits vorhanden.",
    uploadError: "Das Buch konnte nicht hochgeladen werden.",
    loadingBooks: "Bücher werden geladen …",
    retry: "Erneut versuchen",
    emptyLibrary: "Noch keine Bücher. Lade ein DRM-freies EPUB hoch.",
    openBook: "Lesen",
    author: "Autor",
    status: "Status",
    statuses: {
      uploaded: "Hochgeladen",
      parsing: "Wird verarbeitet",
      extracting: "Notizen werden erstellt",
      parsed: "Bereit zum Lesen",
      ready: "Bereit",
      error: "Fehler",
    },
    backToLibrary: "Zurück zur Bibliothek",
    loadingReader: "Leser wird geladen …",
    loadingChapter: "Kapitel wird geladen …",
    noChapters: "Dieses Buch enthält keine lesbaren Kapitel.",
    chapter: "Kapitel",
    selectChapter: "Kapitel auswählen",
    readingPosition: "Leseposition",
    positionOf: "von",
    notesPosition: "Position für Notizen",
    readerPositionActive: "Folgt der aktuellen Leseposition im Reader.",
    manualPositionActive: "Manuelle Position aktiv; der Reader-Fortschritt bleibt unverändert.",
    manualPosition: "Position manuell festlegen",
    positionMethod: "Eingabemethode",
    byChapter: "Kapitel und Absatz",
    byPercentage: "Prozent im Buch",
    positionChapter: "Kapitel für Notizen",
    paragraphInChapter: "Absatz im Kapitel",
    percentage: "Fortschritt in Prozent",
    applyPosition: "Position übernehmen",
    followReader: "Reader-Position verwenden",
    positionRangeError: "Wert muss zwischen {min} und {max} liegen.",
    invalidPositionValue: "Bitte gib eine gültige Zahl im erlaubten Bereich ein.",
    savePending: "Leseposition wird gespeichert …",
    saveFailed: "Leseposition konnte nicht gespeichert werden.",
    apiError: "Die Anfrage ist fehlgeschlagen.",
    invalidPosition: "Diese Leseposition ist für das Buch ungültig.",
    uploadTooLarge: "Die EPUB-Datei überschreitet die erlaubte Größe.",
    invalidEpub: "Die Datei ist kein gültiges, lesbares EPUB.",
    serverBookNotFound: "Das Buch wurde nicht gefunden.",
    notesPanel: "Notizen und Nachschlagen",
    emptySearchQuery: "Bitte gib einen Namen oder Begriff ein.",
    exactMatchHelp: "Suche nach einem exakten Namen oder Alias.",
    searchEntity: "Figur, Ort oder Begriff",
    search: "Suchen",
    clearSearch: "Suche leeren",
    searchLoading: "Suche läuft …",
    noSearchMatches: "Keine passenden Einträge an dieser Leseposition.",
    searchFailed: "Die Suche ist fehlgeschlagen.",
    selectionAtPosition: "Markierter Text wird an Position {position} gesucht.",
    noFacts: "Für diesen Eintrag sind hier noch keine Fakten bekannt.",
    aliases: "Bekannte Namen",
    facts: "Fakten",
    relationships: "Beziehungen",
    source: "Textbeleg",
    positionLabel: "Position",
    chapterLabel: "Kapitel",
    noLookupPosition: "Für die Suche ist keine Leseposition verfügbar.",
    knownCharacters: "Bekannte Figuren",
    noKnownCharacters: "Bis zu dieser Position sind keine Figuren bekannt.",
    loadingCharacters: "Figuren werden geladen …",
    recapTitle: "Was bisher geschah",
    noRecapEvents: "Bis zu dieser Position sind keine Ereignisse bekannt.",
    loadingRecap: "Rückblick wird geladen …",
    notesLoadFailed: "Notizen konnten nicht geladen werden.",
    entityTypes: {
      person: "Person",
      place: "Ort",
      group: "Gruppe",
      object: "Gegenstand",
      concept: "Begriff",
    },
  },
  en: {
    heading: "Spoiler-Free Reading Assistant",
    description:
      "Your notes stay up to date with your current reading position.",
    language: "Language",
    readerContent: "Book text",
    library: "Library",
    upload: "Upload EPUB",
    chooseFile: "Choose an EPUB file",
    noFile: "No file selected",
    uploading: "Uploading …",
    uploadSuccess: "Book uploaded.",
    duplicateSuccess: "This book was already in your library.",
    uploadError: "The book could not be uploaded.",
    loadingBooks: "Loading books …",
    retry: "Try again",
    emptyLibrary: "No books yet. Upload a DRM-free EPUB to get started.",
    openBook: "Read",
    author: "Author",
    status: "Status",
    statuses: {
      uploaded: "Uploaded",
      parsing: "Processing",
      extracting: "Creating notes",
      parsed: "Ready to read",
      ready: "Ready",
      error: "Error",
    },
    backToLibrary: "Back to library",
    loadingReader: "Loading reader …",
    loadingChapter: "Loading chapter …",
    noChapters: "This book has no readable chapters.",
    chapter: "Chapter",
    selectChapter: "Select chapter",
    readingPosition: "Reading position",
    positionOf: "of",
    notesPosition: "Notes position",
    readerPositionActive: "Following the current position in the reader.",
    manualPositionActive: "Manual position active; saved reader progress is unchanged.",
    manualPosition: "Set position manually",
    positionMethod: "Input method",
    byChapter: "Chapter and paragraph",
    byPercentage: "Book percentage",
    positionChapter: "Chapter for notes",
    paragraphInChapter: "Paragraph in chapter",
    percentage: "Book progress in percent",
    applyPosition: "Apply position",
    followReader: "Use reader position",
    positionRangeError: "Value must be between {min} and {max}.",
    invalidPositionValue: "Enter a valid number within the allowed range.",
    savePending: "Saving reading position …",
    saveFailed: "Could not save reading position.",
    apiError: "The request failed.",
    invalidPosition: "This reading position is invalid for the book.",
    uploadTooLarge: "The EPUB file exceeds the allowed size.",
    invalidEpub: "The file is not a valid, readable EPUB.",
    serverBookNotFound: "The book could not be found.",
    notesPanel: "Notes and lookup",
    emptySearchQuery: "Enter a name or concept to search.",
    exactMatchHelp: "Search for an exact name or alias.",
    searchEntity: "Character, place, or concept",
    search: "Search",
    clearSearch: "Clear search",
    searchLoading: "Searching …",
    noSearchMatches: "No matching entries at this reading position.",
    searchFailed: "The search failed.",
    selectionAtPosition: "Selected text will be searched at position {position}.",
    noFacts: "No facts are known for this entry at this position.",
    aliases: "Known names",
    facts: "Facts",
    relationships: "Relationships",
    source: "Source excerpt",
    positionLabel: "Position",
    chapterLabel: "Chapter",
    noLookupPosition: "No reading position is available for lookup.",
    knownCharacters: "Known characters",
    noKnownCharacters: "No characters are known up to this position.",
    loadingCharacters: "Loading characters …",
    recapTitle: "What has happened so far",
    noRecapEvents: "No events are known up to this position.",
    loadingRecap: "Loading recap …",
    notesLoadFailed: "Notes could not be loaded.",
    entityTypes: {
      person: "Person",
      place: "Place",
      group: "Group",
      object: "Object",
      concept: "Concept",
    },
  },
} as const;

export type Language = keyof typeof translations;
export type Copy = (typeof translations)[Language];

export function isLanguage(value: string): value is Language {
  return Object.prototype.hasOwnProperty.call(translations, value);
}

export function getErrorMessage(error: unknown, copy: Copy): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "invalid_reading_position":
        return copy.invalidPosition;
      case "upload_too_large":
        return copy.uploadTooLarge;
      case "invalid_epub":
        return copy.invalidEpub;
      case "book_not_found":
        return copy.serverBookNotFound;
      default:
        return error.code ? error.message || copy.apiError : copy.apiError;
    }
  }
  return copy.apiError;
}

export function getStatusLabel(status: string, copy: Copy): string {
  return (
    Object.entries(copy.statuses).find(([key]) => key === status)?.[1] ??
    status
  );
}

export function getEntityTypeLabel(type: string, copy: Copy): string {
  return type in copy.entityTypes
    ? copy.entityTypes[type as keyof Copy["entityTypes"]]
    : type;
}

export function getSavedLanguage(): Language {
  const savedLanguage = window.localStorage.getItem("ui-language");
  return savedLanguage && isLanguage(savedLanguage) ? savedLanguage : "de";
}
