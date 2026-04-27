import { Tree, TreeItem, TreeItemLayout } from '@fluentui/react-components';
import type { TeamMembership } from '@spectra/shared';

export interface FolderSelection {
  team?: string;
  year?: number;
  month?: number;
}

interface Props {
  teams: TeamMembership[];
  selection: FolderSelection;
  onSelect: (s: FolderSelection) => void;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;

function years(): number[] {
  const now = new Date().getUTCFullYear();
  return [now, now - 1, now - 2];
}

export function FolderTree({ teams, selection, onSelect }: Props): JSX.Element {
  return (
    <Tree
      aria-label="Folder navigation"
      defaultOpenItems={teams.map((t) => `team-${t.teamCode}`) as string[]}
    >
      {teams.map((t) => (
        <TreeItem
          key={t.teamCode}
          itemType="branch"
          value={`team-${t.teamCode}`}
        >
          <TreeItemLayout
            onClick={() => onSelect({ team: t.teamCode })}
            aria-current={selection.team === t.teamCode && !selection.year ? true : undefined}
          >
            {t.teamDisplayName}
          </TreeItemLayout>
          <Tree>
            {years().map((y) => (
              <TreeItem key={y} itemType="branch" value={`team-${t.teamCode}-${y}`}>
                <TreeItemLayout
                  onClick={() => onSelect({ team: t.teamCode, year: y })}
                  aria-current={selection.team === t.teamCode && selection.year === y && !selection.month ? true : undefined}
                >
                  {y}
                </TreeItemLayout>
                <Tree>
                  {MONTHS.map((m, idx) => (
                    <TreeItem key={m} itemType="leaf" value={`team-${t.teamCode}-${y}-${idx + 1}`}>
                      <TreeItemLayout
                        onClick={() => onSelect({ team: t.teamCode, year: y, month: idx + 1 })}
                        aria-current={selection.team === t.teamCode && selection.year === y && selection.month === idx + 1 ? true : undefined}
                      >
                        {m}
                      </TreeItemLayout>
                    </TreeItem>
                  ))}
                </Tree>
              </TreeItem>
            ))}
          </Tree>
        </TreeItem>
      ))}
    </Tree>
  );
}
