import { ApiError } from "./api";

export const translations = {
  de: {
    heading: "Spoilerfreier Lesebegleiter",
    description:
      "Deine Notizen bleiben auf dem Stand deiner aktuellen Leseposition.",
    offlineNotice:
      "Du bist offline. Die App-Oberfläche ist verfügbar; Bibliothek und Buchdaten benötigen eine Verbindung zum Server.",
    updateAvailable: "Ein App-Update ist verfügbar.",
    updateNow: "Jetzt aktualisieren",
    theme: "Darstellung",
    themeSystem: "System",
    themeLight: "Hell",
    themeDark: "Dunkel",
    language: "Sprache",
    readerContent: "Buchtext",
    library: "Bibliothek",
    backupTitle: "Bibliothek sichern und wiederherstellen",
    backupHelp: "Das Backup enthält alle Notizen und kurze Textbelege, auch spätere Spoiler, aber keine EPUB-Dateien oder vollständigen Buchtexte. Bewahre es privat auf und importiere nur vertrauenswürdige Backups. Lade vor der Wiederherstellung alle ursprünglichen EPUB-Dateien erneut hoch.",
    backupDownload: "Backup herunterladen",
    backupFile: "Backup-Datei auswählen",
    backupRestore: "Backup wiederherstellen",
    backupWorking: "Backup wird verarbeitet …",
    backupConfirm: "Vorhandene Notizen, Extraktionen und Lesepositionen der Bücher im Backup werden ersetzt. Fortfahren?",
    backupSuccess: "Backup wurde wiederhergestellt.",
    backupDownloadFailed: "Backup konnte nicht erstellt werden.",
    backupRestoreFailed: "Backup konnte nicht wiederhergestellt werden.",
    backupJobsActive: "Warte, bis alle laufenden Verarbeitungen abgeschlossen sind.",
    backupBookMissing: "Lade zuerst für alle Bücher im Backup dieselben EPUB-Dateien hoch.",
    backupLayoutMismatch: "Die Absatzstruktur des hochgeladenen EPUBs stimmt nicht mit dem Backup überein.",
    backupInvalid: "Die Backup-Datei ist ungültig oder wird nicht unterstützt.",
    backupTooLarge: "Das Backup überschreitet die erlaubte Größe.",
    backupUnsupported: "Backups werden mit dieser Datenbank nicht unterstützt.",
    backupCheckpointIncompatible: "Die Extraktionseinstellungen passen nicht zum gespeicherten Fortschritt.",
    backupInconsistent: "Eines der Bücher im Backup hat Extraktionen oder Lesepositionen, aber keinen vollständig verarbeiteten Text. Lade das EPUB erneut hoch oder entferne das Buch über den Server.",
    backupUnrestorable: "Ein Buch ohne lesbaren Inhalt kann nicht gesichert oder wiederhergestellt werden.",
    upload: "EPUB hochladen",
    chooseFile: "EPUB-Datei auswählen",
    noFile: "Keine Datei ausgewählt",
    uploading: "Wird hochgeladen …",
    uploadSuccess: "Buch wurde hochgeladen.",
    duplicateSuccess: "Dieses Buch war bereits vorhanden.",
    uploadError: "Das Buch konnte nicht hochgeladen werden.",
    loadingBooks: "Bücher werden geladen …",
    refreshingBooks: "Bibliothek wird aktualisiert …",
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
    exportNotes: "Notizen exportieren",
    exportingNotes: "Export wird erstellt …",
    exportJson: "JSON herunterladen",
    exportMarkdown: "Markdown herunterladen",
    exportPosition: "Enthält Wissen bis einschließlich Position",
    exportFailed: "Notizen konnten nicht exportiert werden.",
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
    knownEntities: "Bekannte Einträge",
    noKnownEntities: "Bis zu dieser Position sind keine Einträge bekannt.",
    noKnownRelationships: "Bis zu dieser Position sind keine Beziehungen bekannt.",
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
    offlineNotice:
      "You are offline. The app shell is available; your library and book data require a connection to the server.",
    updateAvailable: "An app update is available.",
    updateNow: "Update now",
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    language: "Language",
    readerContent: "Book text",
    library: "Library",
    backupTitle: "Back up and restore library",
    backupHelp: "The backup contains all notes and short source excerpts, including future spoilers, but no EPUB files or complete book text. Keep it private and only restore trusted backups. Upload all original EPUB files again before restoring.",
    backupDownload: "Download backup",
    backupFile: "Choose a backup file",
    backupRestore: "Restore backup",
    backupWorking: "Processing backup …",
    backupConfirm: "Existing notes, extractions and reading positions for books in the backup will be replaced. Continue?",
    backupSuccess: "Backup restored.",
    backupDownloadFailed: "Could not create backup.",
    backupRestoreFailed: "Could not restore backup.",
    backupJobsActive: "Wait until all active processing jobs have finished.",
    backupBookMissing: "First upload the same EPUB files for all books in the backup.",
    backupLayoutMismatch: "The uploaded EPUB's paragraph structure does not match the backup.",
    backupInvalid: "The backup file is invalid or unsupported.",
    backupTooLarge: "The backup exceeds the allowed size.",
    backupUnsupported: "Backups are not supported with this database.",
    backupCheckpointIncompatible: "The extraction settings do not match the saved progress.",
    backupInconsistent: "One of the books in the backup has notes or reading progress but no fully parsed text. Re-upload the EPUB or remove the book via the server.",
    backupUnrestorable: "A book without readable content cannot be backed up or restored.",
    upload: "Upload EPUB",
    chooseFile: "Choose an EPUB file",
    noFile: "No file selected",
    uploading: "Uploading …",
    uploadSuccess: "Book uploaded.",
    duplicateSuccess: "This book was already in your library.",
    uploadError: "The book could not be uploaded.",
    loadingBooks: "Loading books …",
    refreshingBooks: "Refreshing library …",
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
    exportNotes: "Export notes",
    exportingNotes: "Preparing export …",
    exportJson: "Download JSON",
    exportMarkdown: "Download Markdown",
    exportPosition: "Includes knowledge through position",
    exportFailed: "Notes could not be exported.",
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
    knownEntities: "Known entries",
    noKnownEntities: "No entries are known up to this position.",
    noKnownRelationships: "No relationships are known up to this position.",
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
      case "backup_jobs_active":
        return copy.backupJobsActive;
      case "backup_book_missing":
        return copy.backupBookMissing;
      case "backup_layout_mismatch":
        return copy.backupLayoutMismatch;
      case "invalid_backup":
        return copy.backupInvalid;
      case "backup_too_large":
        return copy.backupTooLarge;
      case "backup_unsupported_database":
        return copy.backupUnsupported;
      case "backup_checkpoint_incompatible":
        return copy.backupCheckpointIncompatible;
      case "backup_inconsistent_data":
        return copy.backupInconsistent;
      case "backup_unrestorable_book":
        return copy.backupUnrestorable;
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
