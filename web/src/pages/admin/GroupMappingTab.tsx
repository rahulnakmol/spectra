import { useEffect, useState } from 'react';
import {
  Button, Spinner, MessageBar, MessageBarBody, Combobox, Option,
  Table, TableHeader, TableHeaderCell, TableRow, TableBody, TableCell, Field, Input,
} from '@fluentui/react-components';
import { Delete24Regular, Save24Regular } from '@fluentui/react-icons';
import type { GroupRoleMapEntry } from '@spectra/shared';
import {
  useGroupMapping, useReplaceGroupMapping, useGroupSearch, useAdminWorkspaces,
} from '../../api/hooks';

export function GroupMappingTab(): JSX.Element {
  const list = useGroupMapping();
  const save = useReplaceGroupMapping();
  const workspaces = useAdminWorkspaces();
  const [entries, setEntries] = useState<GroupRoleMapEntry[]>([]);
  const [q, setQ] = useState('');
  const search = useGroupSearch(q);

  useEffect(() => {
    if (list.data) setEntries(list.data);
  }, [list.data]);

  function update(idx: number, patch: Partial<GroupRoleMapEntry>): void {
    setEntries((cur) => cur.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function remove(idx: number): void {
    setEntries((cur) => cur.filter((_, i) => i !== idx));
  }
  function addFrom(groupId: string, displayName: string): void {
    setEntries((cur) => [...cur, {
      entraGroupId: groupId,
      entraGroupDisplayName: displayName,
      workspaceId: workspaces.data?.[0]?.id ?? '',
      teamCode: 'TEAM',
      teamDisplayName: 'Team',
    }]);
    setQ('');
  }

  return (
    <div className="flex flex-col gap-3">
      {list.isLoading ? <Spinner label="Loading mapping…" /> : null}
      {list.error ? <MessageBar intent="error"><MessageBarBody>Could not load mapping.</MessageBarBody></MessageBar> : null}

      <Field label="Add group" hint="Type at least 2 characters to search Entra ID.">
        <Combobox
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onOptionSelect={(_e, data) => {
            const hit = (search.data ?? []).find((g) => g.id === data.optionValue);
            if (hit) addFrom(hit.id, hit.displayName);
          }}
          aria-label="Search groups"
        >
          {(search.data ?? []).map((g) => (
            <Option key={g.id} value={g.id} text={g.displayName}>{g.displayName}</Option>
          ))}
        </Combobox>
      </Field>

      <Table aria-label="Group mapping">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Group</TableHeaderCell>
            <TableHeaderCell>Workspace</TableHeaderCell>
            <TableHeaderCell>Team code</TableHeaderCell>
            <TableHeaderCell>Team display name</TableHeaderCell>
            <TableHeaderCell><span className="sr-only">Actions</span></TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e, i) => (
            <TableRow key={`${e.entraGroupId}-${i}`}>
              <TableCell>{e.entraGroupDisplayName}</TableCell>
              <TableCell>
                <Combobox
                  aria-label={`Workspace for ${e.entraGroupDisplayName}`}
                  value={e.workspaceId}
                  onOptionSelect={(_ev, data) => update(i, { workspaceId: data.optionValue ?? '' })}
                >
                  {(workspaces.data ?? []).map((w) => (
                    <Option key={w.id} value={w.id}>{w.displayName}</Option>
                  ))}
                </Combobox>
              </TableCell>
              <TableCell>
                <Input
                  aria-label={`Team code for ${e.entraGroupDisplayName}`}
                  value={e.teamCode}
                  onChange={(_ev, data) => update(i, { teamCode: data.value })}
                />
              </TableCell>
              <TableCell>
                <Input
                  aria-label={`Team display name for ${e.entraGroupDisplayName}`}
                  value={e.teamDisplayName}
                  onChange={(_ev, data) => update(i, { teamDisplayName: data.value })}
                />
              </TableCell>
              <TableCell>
                <Button
                  appearance="subtle"
                  icon={<Delete24Regular />}
                  aria-label={`Remove ${e.entraGroupDisplayName}`}
                  onClick={() => remove(i)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex justify-end gap-2">
        <Button
          appearance="primary"
          icon={<Save24Regular />}
          disabled={save.isPending}
          onClick={() => save.mutate(entries)}
        >
          {save.isPending ? 'Saving…' : 'Save mapping'}
        </Button>
      </div>
      {save.isError ? <MessageBar intent="error" aria-live="polite"><MessageBarBody>{(save.error as Error).message}</MessageBarBody></MessageBar> : null}
      {save.isSuccess ? <MessageBar intent="success" aria-live="polite"><MessageBarBody>Mapping saved.</MessageBarBody></MessageBar> : null}
    </div>
  );
}
