import { FormEvent, useState } from "react";
import { uploadBook } from "./api";
import { Copy, getErrorMessage } from "./i18n";
import { ErrorNotice } from "./ErrorNotice";

export function UploadSection({
  copy,
  disabled,
  onUploaded,
}: {
  copy: Copy;
  disabled: boolean;
  onUploaded: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [retryFailed, setRetryFailed] = useState(false);

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || uploading) return;
    const form = event.currentTarget;
    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);
    try {
      const uploadedBook = await uploadBook(selectedFile, retryFailed);
      if (uploadedBook.status === "error" && uploadedBook.error) {
        setUploadError(copy.previousParsingFailed);
        return;
      }
      setUploadMessage(uploadedBook.reused ? copy.duplicateSuccess : copy.uploadSuccess);
      setSelectedFile(null);
      setRetryFailed(false);
      form.reset();
      await onUploaded();
    } catch (error) {
      setUploadError(getErrorMessage(error, copy));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <form className="upload-form" onSubmit={submitUpload}>
        <label htmlFor="book-file">{copy.chooseFile}</label>
        <input
          id="book-file"
          type="file"
          accept=".epub,application/epub+zip"
          onChange={(event) => setSelectedFile(event.currentTarget.files?.[0] ?? null)}
          disabled={uploading || disabled}
        />
        <label className="retry-parsing">
          <input
            type="checkbox"
            checked={retryFailed}
            onChange={(event) => setRetryFailed(event.currentTarget.checked)}
            disabled={uploading || disabled}
          />
          {copy.retryFailedParsing}
        </label>
        <button type="submit" disabled={!selectedFile || uploading || disabled}>
          {uploading ? copy.uploading : copy.upload}
        </button>
        <span className="file-name">{selectedFile?.name ?? copy.noFile}</span>
      </form>
      {uploadError && (
        <ErrorNotice
          copy={copy}
          message={`${copy.uploadError} ${uploadError}`}
          onDismiss={() => setUploadError(null)}
        />
      )}
      {uploadMessage && <p className="message success" role="status">{uploadMessage}</p>}
    </>
  );
}
