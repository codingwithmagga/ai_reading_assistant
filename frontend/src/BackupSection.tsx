import { FormEvent, useState } from "react";
import { getBackup, restoreBackup } from "./api";
import { Copy, getErrorMessage } from "./i18n";
import { ErrorNotice } from "./ErrorNotice";

export function BackupSection({
  copy,
  disabled,
  onRestored,
  onBusyChange,
}: {
  copy: Copy;
  disabled: boolean;
  onRestored: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    onBusyChange(true);
    onBusyChange(true);
    setError(null);
    setMessage(null);
    try {
      const blob = await getBackup();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "reading-assistant-backup.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(`${copy.backupDownloadFailed} ${getErrorMessage(requestError, copy)}`);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!backupFile || busy || !window.confirm(copy.backupConfirm)) return;
    const form = event.currentTarget;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setMessage(null);
    try {
      await restoreBackup(backupFile);
      setBackupFile(null);
      form.reset();
      setMessage(copy.backupSuccess);
      await onRestored();
    } catch (requestError) {
      setError(`${copy.backupRestoreFailed} ${getErrorMessage(requestError, copy)}`);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <section aria-labelledby="backup-heading">
      <h3 id="backup-heading">{copy.backupTitle}</h3>
      <p>{copy.backupHelp}</p>
      <button type="button" onClick={() => void download()} disabled={busy || disabled}>
        {busy ? copy.backupWorking : copy.backupDownload}
      </button>
      <form className="upload-form" onSubmit={submit}>
        <label htmlFor="backup-file">{copy.backupFile}</label>
        <input
          id="backup-file"
          type="file"
          accept=".json,application/json"
          onChange={(event) => setBackupFile(event.currentTarget.files?.[0] ?? null)}
          disabled={busy || disabled}
        />
        <button type="submit" disabled={!backupFile || busy || disabled}>{copy.backupRestore}</button>
      </form>
      {error && <ErrorNotice copy={copy} message={error} onDismiss={() => setError(null)} />}
      {message && <p className="message success" role="status">{message}</p>}
    </section>
  );
}
