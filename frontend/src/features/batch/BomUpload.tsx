import { useState, type DragEvent, type FormEvent } from "react";
import { PlayIcon, UploadIcon } from "../../components/Icons";

interface BomUploadProps {
  busy: boolean;
  onSubmit: (file: File) => void;
}

export function BomUpload({ busy, onSubmit }: BomUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (file) onSubmit(file);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label
        htmlFor="bomFile"
        className={`dropzone${dragOver ? " dragover" : ""}`}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          id="bomFile"
          name="bomFile"
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <UploadIcon />
        <div className="dropzone-text">
          <strong>Click to choose a file</strong> or drag a CSV here
        </div>
        <div className="dropzone-filename">{file?.name ?? ""}</div>
      </label>
      <button type="submit" className="batch-submit" disabled={busy || !file}>
        <PlayIcon />
        Upload &amp; run
      </button>
    </form>
  );
}
