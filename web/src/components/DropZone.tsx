import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Button, Text, MessageBar, MessageBarBody } from '@fluentui/react-components';
import { ArrowUpload24Regular } from '@fluentui/react-icons';

const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/tiff'];
const ACCEPT_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'heic', 'tiff'];
const MAX_BYTES = 25 * 1024 * 1024;

interface Props {
  onFile: (file: File) => void;
}

function validate(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ACCEPT_EXT.includes(ext)) return `File type .${ext} is not allowed.`;
  if (file.type && !ACCEPT.includes(file.type)) return `MIME type ${file.type} is not allowed.`;
  if (file.size > MAX_BYTES) return `File exceeds 25 MB cap.`;
  if (file.size === 0) return `File is empty.`;
  return null;
}

export function DropZone({ onFile }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  function pickFile(file: File): void {
    const v = validate(file);
    if (v) { setError(v); return; }
    setError(null);
    onFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) pickFile(file);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) pickFile(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="region"
        aria-label="Upload file"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded"
        style={{
          borderColor: over ? 'var(--colorBrandStroke1)' : 'var(--colorNeutralStroke2)',
          background: over ? 'var(--colorNeutralBackground1Hover)' : 'transparent',
        }}
      >
        <ArrowUpload24Regular aria-hidden="true" />
        <Text>Drag a file here, or use Browse below.</Text>
        <Button
          appearance="primary"
          icon={<ArrowUpload24Regular />}
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.heic,.tiff,application/pdf,image/png,image/jpeg,image/heic,image/tiff"
          onChange={handleChange}
          className="sr-only"
          aria-label="Choose file"
        />
        <Text size={200}>Allowed: pdf, png, jpg, jpeg, heic, tiff. Max 25 MB.</Text>
      </div>
      {error ? (
        <MessageBar intent="error" aria-live="polite">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      ) : null}
    </div>
  );
}
