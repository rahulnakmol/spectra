import { useMemo, useState } from 'react';
import {
  Table, TableHeader, TableHeaderCell, TableRow, TableBody, TableCell,
  Text, Badge,
} from '@fluentui/react-components';
import { Document24Regular } from '@fluentui/react-icons';
import type { FileItem } from '@spectra/shared';

type SortKey = 'name' | 'uploadedAt' | 'uploadedByDisplayName' | 'sizeBytes';
type SortDir = 'asc' | 'desc';

interface Props {
  files: FileItem[];
  hiddenByPolicy?: number;
  selectedId?: string;
  onSelect: (file: FileItem) => void;
}

function compare(a: FileItem, b: FileItem, key: SortKey, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  const av = a[key] ?? '';
  const bv = b[key] ?? '';
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign;
  return String(av).localeCompare(String(bv)) * sign;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FileGrid({ files, hiddenByPolicy, selectedId, onSelect }: Props): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('uploadedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(
    () => [...files].sort((a, b) => compare(a, b, sortKey, sortDir)),
    [files, sortKey, sortDir],
  );

  function toggle(key: SortKey): void {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function sortProps(key: SortKey): { sortDirection: 'ascending' | 'descending' } | Record<string, never> {
    if (sortKey !== key) return {};
    return { sortDirection: sortDir === 'asc' ? 'ascending' : 'descending' };
  }

  return (
    <Table aria-label="Files" sortable>
      <TableHeader>
        <TableRow>
          <TableHeaderCell {...sortProps('name')} onClick={() => toggle('name')}>
            Name
          </TableHeaderCell>
          <TableHeaderCell {...sortProps('uploadedByDisplayName')} onClick={() => toggle('uploadedByDisplayName')}>
            Uploaded by
          </TableHeaderCell>
          <TableHeaderCell {...sortProps('uploadedAt')} onClick={() => toggle('uploadedAt')}>
            Uploaded at
          </TableHeaderCell>
          <TableHeaderCell {...sortProps('sizeBytes')} onClick={() => toggle('sizeBytes')}>
            Size
          </TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((f) => (
          <TableRow
            key={f.id}
            aria-selected={selectedId === f.id}
            onClick={() => onSelect(f)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(f); } }}
            tabIndex={0}
            className="cursor-pointer"
          >
            <TableCell>
              <span className="inline-flex items-center gap-2">
                <Document24Regular aria-hidden="true" />
                <Text>{f.name}</Text>
              </span>
            </TableCell>
            <TableCell>{f.uploadedByDisplayName}</TableCell>
            <TableCell>
              <time dateTime={f.uploadedAt}>{new Date(f.uploadedAt).toLocaleString()}</time>
            </TableCell>
            <TableCell>{formatBytes(f.sizeBytes)}</TableCell>
          </TableRow>
        ))}
        {hiddenByPolicy != null && hiddenByPolicy > 0 ? (
          <TableRow aria-hidden="false" className="opacity-50">
            <TableCell>
              <Badge color="informative" appearance="outline">
                {hiddenByPolicy} file{hiddenByPolicy === 1 ? '' : 's'} hidden by only-own policy
              </Badge>
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
