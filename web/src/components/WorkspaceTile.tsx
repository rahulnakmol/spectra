import { Card, CardHeader, Text, Tooltip, Badge } from '@fluentui/react-components';
import { Link } from 'react-router-dom';
import type { WorkspaceConfig } from '@spectra/shared';

interface Props {
  workspace: WorkspaceConfig;
  hasAccess: boolean;
}

export function WorkspaceTile({ workspace, hasAccess }: Props): JSX.Element {
  const tooltip = hasAccess
    ? `Open ${workspace.displayName}`
    : 'You do not have access to this workspace. Contact your administrator.';

  const inner = (
    <Card style={{ opacity: hasAccess ? 1 : 0.5, cursor: hasAccess ? 'pointer' : 'not-allowed' }}>
      <CardHeader
        header={<Text weight="semibold">{workspace.displayName}</Text>}
        description={
          <span className="flex gap-2 items-center">
            <Badge appearance="outline">{workspace.template}</Badge>
            {workspace.archived ? <Badge color="warning">Archived</Badge> : null}
          </span>
        }
      />
    </Card>
  );

  return (
    <Tooltip content={tooltip} relationship="description">
      {hasAccess ? (
        <Link
          to={`/w/${workspace.id}/browse`}
          aria-label={tooltip}
          className="no-underline"
        >
          {inner}
        </Link>
      ) : (
        <div role="button" aria-disabled aria-label={tooltip} tabIndex={0}>
          {inner}
        </div>
      )}
    </Tooltip>
  );
}
