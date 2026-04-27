import { useState } from 'react';
import {
  Field, Input, Button, Spinner, MessageBar, MessageBarBody,
  Table, TableHeader, TableHeaderCell, TableRow, TableBody, TableCell, Badge,
} from '@fluentui/react-components';
import { Filter24Regular } from '@fluentui/react-icons';
import { useAudit, type AuditQuery } from '../../api/hooks';

export function AuditTab(): JSX.Element {
  const [filters, setFilters] = useState<AuditQuery>({});
  const [applied, setApplied] = useState<AuditQuery>({});
  const audit = useAudit(applied);

  return (
    <div className="flex flex-col gap-3">
      <form
        className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 items-end"
        onSubmit={(e) => { e.preventDefault(); setApplied(filters); }}
      >
        <Field label="User OID">
          <Input value={filters.userOid ?? ''} onChange={(_e, d) => setFilters((f) => ({ ...f, ...(d.value ? { userOid: d.value } : {}) }))} />
        </Field>
        <Field label="Workspace">
          <Input value={filters.workspace ?? ''} onChange={(_e, d) => setFilters((f) => ({ ...f, ...(d.value ? { workspace: d.value } : {}) }))} />
        </Field>
        <Field label="Action">
          <Input value={filters.action ?? ''} onChange={(_e, d) => setFilters((f) => ({ ...f, ...(d.value ? { action: d.value } : {}) }))} />
        </Field>
        <Field label="From">
          <Input type="date" value={filters.fromIso?.slice(0, 10) ?? ''} onChange={(_e, d) => setFilters((f) => ({ ...f, ...(d.value ? { fromIso: `${d.value}T00:00:00Z` } : {}) }))} />
        </Field>
        <Field label="To">
          <Input type="date" value={filters.toIso?.slice(0, 10) ?? ''} onChange={(_e, d) => setFilters((f) => ({ ...f, ...(d.value ? { toIso: `${d.value}T23:59:59Z` } : {}) }))} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
          <Button type="submit" appearance="primary" icon={<Filter24Regular />}>Apply filters</Button>
        </div>
      </form>

      {audit.isLoading ? <Spinner label="Loading audit events…" /> : null}
      {audit.error ? <MessageBar intent="error"><MessageBarBody>Could not load audit events.</MessageBarBody></MessageBar> : null}

      {audit.data ? (
        <Table aria-label="Audit events">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Time</TableHeaderCell>
              <TableHeaderCell>User OID</TableHeaderCell>
              <TableHeaderCell>Workspace</TableHeaderCell>
              <TableHeaderCell>Action</TableHeaderCell>
              <TableHeaderCell>Resource</TableHeaderCell>
              <TableHeaderCell>Outcome</TableHeaderCell>
              <TableHeaderCell>Duration</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {audit.data.map((e, i) => (
              <TableRow key={`${e.timestamp}-${i}`}>
                <TableCell><time dateTime={e.timestamp}>{new Date(e.timestamp).toLocaleString()}</time></TableCell>
                <TableCell>{e.userOid}</TableCell>
                <TableCell>{e.workspace ?? '—'}</TableCell>
                <TableCell>{e.action}</TableCell>
                <TableCell>{e.resourceId ?? '—'}</TableCell>
                <TableCell>
                  <Badge color={e.outcome === 'success' ? 'success' : e.outcome === 'denied' ? 'warning' : 'danger'}>
                    {e.outcome}
                  </Badge>
                </TableCell>
                <TableCell>{e.durationMs} ms</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
