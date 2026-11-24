import { Book } from "./api";
import { Copy, getStatusLabel } from "./i18n";
import { ExtractionControls } from "./ExtractionControls";
import { ErrorNotice } from "./ErrorNotice";

export function LibraryView({
  copy,
  books,
  loading,
  error,
  deletingBookId,
  deleteError,
  deleteMessage,
  backupBusy,
  uploading,
  onRetry,
  onDismissError,
  onOpen,
  onDelete,
}: {
  copy: Copy;
  books: Book[];
  loading: boolean;
  error: string | null;
  deletingBookId: string | null;
  deleteError: string | null;
  deleteMessage: string | null;
  backupBusy: boolean;
  uploading: boolean;
  onRetry: () => void;
  onDismissError: () => void;
  onOpen: (book: Book) => void;
  onDelete: (book: Book) => void;
}) {
  return (
    <>
      {deleteError && (
        <ErrorNotice copy={copy} message={deleteError} onDismiss={() => onDismissError()} />
      )}
      {deleteMessage && <p className="message success" role="status">{deleteMessage}</p>}
      {loading && (
        <p role="status" aria-live="polite">
          {books.length > 0 ? copy.refreshingBooks : copy.loadingBooks}
        </p>
      )}
      {error && (
        <ErrorNotice copy={copy} message={error} onDismiss={onDismissError}>
          <button type="button" onClick={onRetry} disabled={loading}>{copy.retry}</button>
        </ErrorNotice>
      )}
      {!loading && !error && books.length === 0 ? (
        <p className="empty-state">{copy.emptyLibrary}</p>
      ) : books.length > 0 ? (
        <ul className="book-list" aria-busy={loading}>
          {books.map((book) => (
            <li className="book-card" key={book.id}>
              <div className="book-card-copy">
                <h3>{book.title}</h3>
                {book.author && <p>{copy.author}: {book.author}</p>}
                <p>{copy.status}: {getStatusLabel(book.status, copy)}</p>
              </div>
              {["parsed", "extracting", "error", "ready"].includes(book.status) &&
                <ExtractionControls book={book} copy={copy} />}
              <button
                type="button"
                onClick={() => onOpen(book)}
                disabled={book.status === "error" || backupBusy}
              >
                {copy.openBook}
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => onDelete(book)}
                disabled={deletingBookId !== null || backupBusy || uploading}
              >
                {deletingBookId === book.id ? copy.deletingBook : copy.deleteBook}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
