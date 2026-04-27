import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner, MessageBar, MessageBarBody, Title2 } from '@fluentui/react-components';
import type { FileItem } from '@spectra/shared';
import { FolderTree, type FolderSelection } from '../components/FolderTree';
import { FileGrid } from '../components/FileGrid';
import { PreviewPane } from '../components/PreviewPane';
import { useTeams, useFiles } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';

export function BrowsePage(): JSX.Element {
  const { ws = '' } = useParams();
  const { user } = useAuth();
  const teams = useTeams(ws);
  const [selection, setSelection] = useState<FolderSelection>({});
  const [selected, setSelected] = useState<FileItem | undefined>(undefined);

  const filesQuery = useMemo(() => {
    if (!selection.team) return undefined;
    const q: { ws: string; team: string; year?: number; month?: number } = { ws, team: selection.team };
    if (selection.year !== undefined) q.year = selection.year;
    if (selection.month !== undefined) q.month = selection.month;
    return q;
  }, [ws, selection]);
  const files = useFiles(filesQuery);

  const myMemberships = (user?.teamMemberships ?? []).filter((t) => t.workspaceId === ws);
  const teamList = teams.data ?? myMemberships;

  return (
    <section aria-labelledby="browse-title" className="grid gap-4 grid-cols-1 lg:grid-cols-[260px,1fr,420px] min-h-[70vh]">
      <Title2 as="h1" id="browse-title" className="lg:col-span-3">{ws}</Title2>
      <div role="navigation" aria-label="Folders" className="border-r pr-2" style={{ borderColor: 'var(--colorNeutralStroke2)' }}>
        <FolderTree teams={teamList} selection={selection} onSelect={(s) => { setSelection(s); setSelected(undefined); }} />
      </div>

      <div aria-live="polite">
        {!selection.team ? (
          <MessageBar intent="info"><MessageBarBody>Select a team folder to view files.</MessageBarBody></MessageBar>
        ) : files.isLoading ? (
          <Spinner label="Loading files…" />
        ) : files.error ? (
          <MessageBar intent="error"><MessageBarBody>Could not load files.</MessageBarBody></MessageBar>
        ) : (
          <FileGrid
            files={files.data ?? []}
            {...(selected?.id !== undefined ? { selectedId: selected.id } : {})}
            onSelect={setSelected}
          />
        )}
      </div>

      <PreviewPane file={selected} />
    </section>
  );
}
