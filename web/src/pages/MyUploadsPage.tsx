import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner, MessageBar, MessageBarBody, Title2 } from '@fluentui/react-components';
import type { FileItem } from '@spectra/shared';
import { useFiles } from '../api/hooks';
import { FileGrid } from '../components/FileGrid';
import { PreviewPane } from '../components/PreviewPane';

export function MyUploadsPage(): JSX.Element {
  const { ws = '' } = useParams();
  const [selected, setSelected] = useState<FileItem | undefined>(undefined);
  const files = useFiles({ ws });

  return (
    <section aria-labelledby="my-title" className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr,420px]">
      <Title2 as="h1" id="my-title" className="lg:col-span-2">My uploads</Title2>
      <div aria-live="polite">
        {files.isLoading ? <Spinner label="Loading…" /> :
         files.error ? <MessageBar intent="error"><MessageBarBody>Could not load.</MessageBarBody></MessageBar> :
         <FileGrid files={files.data ?? []} {...(selected?.id !== undefined ? { selectedId: selected.id } : {})} onSelect={setSelected} />}
      </div>
      <PreviewPane file={selected} />
    </section>
  );
}
