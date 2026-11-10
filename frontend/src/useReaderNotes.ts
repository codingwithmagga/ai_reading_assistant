import { FormEvent, useEffect, useRef, useState } from "react";
import {
  EntityListItem,
  EntityLookupResponse,
  RecapResponse,
  getBookEntities,
  getBookRecap,
  lookupBookEntity,
} from "./api";
import { Copy, getErrorMessage } from "./i18n";
import { getSelectionParagraph } from "./readerSelection";

interface UseReaderNotesOptions {
  bookId: string;
  position: number | null;
  copy: Copy;
}

export function useReaderNotes({
  bookId,
  position,
  copy,
}: UseReaderNotesOptions) {
  const [lookupTerm, setLookupTerm] = useState("");
  const [selectedTextPosition, setSelectedTextPosition] = useState<number | null>(
    null,
  );
  const [lookupResponse, setLookupResponse] =
    useState<EntityLookupResponse | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [characters, setCharacters] = useState<EntityListItem[]>([]);
  const [charactersPosition, setCharactersPosition] = useState<number | null>(
    null,
  );
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [charactersError, setCharactersError] = useState<string | null>(null);
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [recapPosition, setRecapPosition] = useState<number | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);
  const [retryNotes, setRetryNotes] = useState(0);
  const lookupRequestId = useRef(0);
  const notesRequestId = useRef(0);
  const lookupInFlight = useRef(new Map<string, Promise<EntityLookupResponse>>());
  const notesInFlight = useRef(
    new Map<
      string,
      Promise<
        [
          PromiseSettledResult<EntityListItem[]>,
          PromiseSettledResult<RecapResponse>,
        ]
      >
    >(),
  );
  const activeLookupPositionRef = useRef<number | null>(null);
  const lookupTermRef = useRef("");
  const copyRef = useRef(copy);
  const activeLookupPosition = selectedTextPosition ?? position;
  activeLookupPositionRef.current = activeLookupPosition;

  const visibleCharacters = charactersPosition === position ? characters : [];
  const visibleRecap = recapPosition === position ? recap : null;

  useEffect(() => {
    copyRef.current = copy;
  }, [copy]);

  useEffect(() => {
    lookupRequestId.current += 1;
    setLookupResponse(null);
    setLookupError(null);
    setLookupLoading(false);
  }, [position, selectedTextPosition, copy]);

  useEffect(() => {
    setSelectedTextPosition(null);
  }, [position]);

  useEffect(() => {
    let active = true;
    const requestId = ++notesRequestId.current;
    if (position === null) {
      setCharacters([]);
      setCharactersPosition(null);
      setRecap(null);
      setRecapPosition(null);
      setCharactersError(null);
      setRecapError(null);
      setCharactersLoading(false);
      setRecapLoading(false);
      return () => {
        active = false;
      };
    }

    const requestPosition = position;
    const key = `${bookId}:${requestPosition}`;
    setCharacters([]);
    setCharactersPosition(null);
    setRecap(null);
    setRecapPosition(null);
    setCharactersLoading(true);
    setRecapLoading(true);
    setCharactersError(null);
    setRecapError(null);

    const timer = window.setTimeout(() => {
      let request = notesInFlight.current.get(key);
      if (!request) {
        request = Promise.allSettled([
          getBookEntities(bookId, requestPosition, "person"),
          getBookRecap(bookId, requestPosition),
        ]);
        notesInFlight.current.set(key, request);
        void request.then(() => {
          if (notesInFlight.current.get(key) === request) {
            notesInFlight.current.delete(key);
          }
        });
      }

      void request.then(([charactersResult, recapResult]) => {
        if (!active || requestId !== notesRequestId.current) {
          return;
        }
        if (charactersResult.status === "fulfilled") {
          setCharacters(charactersResult.value);
          setCharactersPosition(requestPosition);
        } else {
          setCharactersError(
            getErrorMessage(charactersResult.reason, copyRef.current),
          );
        }
        if (recapResult.status === "fulfilled") {
          setRecap(recapResult.value);
          setRecapPosition(requestPosition);
        } else {
          setRecapError(getErrorMessage(recapResult.reason, copyRef.current));
        }
        setCharactersLoading(false);
        setRecapLoading(false);
      });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [bookId, position, retryNotes]);

  async function performLookup(query: string, requestPosition: number | null) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      lookupRequestId.current += 1;
      setLookupLoading(false);
      setLookupResponse(null);
      setLookupError(copy.emptySearchQuery);
      return;
    }
    if (requestPosition === null) {
      lookupRequestId.current += 1;
      setLookupLoading(false);
      setLookupResponse(null);
      setLookupError(copy.noLookupPosition);
      return;
    }

    const requestId = ++lookupRequestId.current;
    const key = `${bookId}:${requestPosition}:${normalizedQuery}`;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResponse(null);
    try {
      let request = lookupInFlight.current.get(key);
      if (!request) {
        request = lookupBookEntity(bookId, normalizedQuery, requestPosition);
        lookupInFlight.current.set(key, request);
      }
      const response = await request;
      if (
        requestId === lookupRequestId.current &&
        activeLookupPositionRef.current === requestPosition &&
        lookupTermRef.current.trim() === normalizedQuery
      ) {
        setLookupResponse(response);
      }
    } catch (error) {
      if (
        requestId === lookupRequestId.current &&
        activeLookupPositionRef.current === requestPosition &&
        lookupTermRef.current.trim() === normalizedQuery
      ) {
        setLookupError(getErrorMessage(error, copyRef.current));
      }
    } finally {
      if (lookupInFlight.current.get(key)) {
        lookupInFlight.current.delete(key);
      }
      if (requestId === lookupRequestId.current) {
        setLookupLoading(false);
      }
    }
  }

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void performLookup(lookupTerm, activeLookupPosition);
  }

  function changeLookupTerm(value: string) {
    lookupTermRef.current = value;
    lookupRequestId.current += 1;
    setLookupTerm(value);
    setSelectedTextPosition(null);
    setLookupResponse(null);
    setLookupError(null);
    setLookupLoading(false);
  }

  function captureSelectedText(container: HTMLElement | null) {
    const selection = window.getSelection();
    const paragraph = getSelectionParagraph(selection, container);
    const selectedText = selection?.toString().trim();

    if (!selectedText || !paragraph) {
      return;
    }

    const selectedPosition = Number(paragraph.dataset.readingPosition);
    if (!Number.isSafeInteger(selectedPosition) || selectedPosition < 0) {
      return;
    }
    lookupRequestId.current += 1;
    lookupTermRef.current = selectedText;
    setLookupTerm(selectedText);
    setSelectedTextPosition(selectedPosition);
    setLookupResponse(null);
    setLookupError(null);
    setLookupLoading(false);
  }

  function clearLookup() {
    lookupRequestId.current += 1;
    lookupTermRef.current = "";
    setLookupTerm("");
    setSelectedTextPosition(null);
    setLookupResponse(null);
    setLookupError(null);
    setLookupLoading(false);
  }

  return {
    lookupTerm,
    selectedTextPosition,
    lookupResponse,
    lookupError,
    lookupLoading,
    activeLookupPosition,
    submitLookup,
    changeLookupTerm,
    clearLookup,
    retryLookup: () => void performLookup(lookupTerm, activeLookupPosition),
    captureSelectedText,
    characters: visibleCharacters,
    charactersLoading,
    charactersError,
    retryCharacters: () => setRetryNotes((attempt) => attempt + 1),
    recap: visibleRecap,
    recapLoading,
    recapError,
    retryRecap: () => setRetryNotes((attempt) => attempt + 1),
  };
}
