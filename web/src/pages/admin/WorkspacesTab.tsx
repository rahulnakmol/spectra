import { useState } from 'react';
import {
  Button, Spinner, MessageBar, MessageBarBody,
  Table, TableHeader, TableHeaderCell, TableRow, TableBody, TableCell, Switch,
} from '@fluentui/react-components';
import { Add24Regular } from '@fluentui/react-icons';
import { useAdminWorkspaces, useUpdateWorkspace } from '../../api/hooks';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';

export function WorkspacesTab(): JSX.Element {
  const list = useAdminWorkspaces();
  const update = useUpdateWorkspace();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button appearance="primary" icon={<Add24Regular />} onClick={() => setOpen(true)}>
          Create workspace
        </Button>
      </div>

      {list.isLoading ? <Spinner label="Loading workspaces…" /> : null}
      {list.error ? (
        <MessageBar intent="error"><MessageBarBody>Could not load workspaces.</MessageBarBody></MessageBar>
      ) : null}

      {list.data ? (
        <Table aria-label="Workspaces">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>ID</TableHeaderCell>
              <TableHeaderCell>Display name</TableHeaderCell>
              <TableHeaderCell>Template</TableHeaderCell>
              <TableHeaderCell>Archived</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data.map((w) => (
              <TableRow key={w.id}>
                <TableCell>{w.id}</TableCell>
                <TableCell>{w.displayName}</TableCell>
                <TableCell>{w.template}</TableCell>
                <TableCell>
                  <Switch
                    checked={w.archived}
                    aria-label={`${w.archived ? 'Unarchive' : 'Archive'} ${w.displayName}`}
                    onChange={(_e, data) => update.mutate({ id: w.id, patch: { archived: data.checked } })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <CreateWorkspaceDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
