import { useState } from 'react';
import { Card, CardHeader, Text, Button, Spinner, MessageBar, MessageBarBody, Divider } from '@fluentui/react-components';
import { Share24Regular } from '@fluentui/react-icons';
import type { FileItem } from '@spectra/shared';
import { useFilePreview } from '../api/hooks';
import { ShareDialog } from './ShareDialog';

interface Props {
  file: FileItem | undefined;
}

export function PreviewPane({ file }: Props): JSX.Element {
  const [shareOpen, setShareOpen] = useState(false);
  const preview = useFilePreview(file?.id);

  if (!file) {
    return (
      <aside aria-label="File preview" className="p-4">
        <Text>Select a file to preview.</Text>
      </aside>
    );
  }

  return (
    <aside aria-label="File preview" className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader
          header={<Text weight="semibold">{file.name}</Text>}
          description={`Uploaded by ${file.uploadedByDisplayName}`}
        />
      </Card>

      <div className="flex flex-col gap-2" aria-live="polite">
        {preview.isLoading ? <Spinner label="Loading preview…" /> : null}
        {preview.error ? (
          <MessageBar intent="warning">
            <MessageBarBody>Preview unavailable for this file type.</MessageBarBody>
          </MessageBar>
        ) : null}
        {preview.data ? (
          <iframe
            title={`Preview of ${file.name}`}
            src={preview.data.url}
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="strict-origin-when-cross-origin"
            className="w-full border"
            style={{ minHeight: '480px', borderColor: 'var(--colorNeutralStroke2)' }}
          />
        ) : null}
      </div>

      <Divider />

      <section aria-label="File metadata" className="flex flex-col gap-1">
        <Text weight="semibold">Metadata</Text>
        <dl className="grid grid-cols-[max-content,1fr] gap-x-4 gap-y-1">
          {Object.entries(file.metadata).map(([k, v]) => (
            <div key={k} className="contents">
              <dt><Text>{k}</Text></dt>
              <dd><Text>{v == null ? '—' : String(v)}</Text></dd>
            </div>
          ))}
        </dl>
      </section>

      <Button appearance="primary" icon={<Share24Regular />} onClick={() => setShareOpen(true)}>
        Share
      </Button>
      {file && <ShareDialog file={file} open={shareOpen} onClose={() => setShareOpen(false)} />}
    </aside>
  );
}
