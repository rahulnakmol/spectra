import { makeStyles, Card, CardHeader, Text, Tooltip, Badge } from '@fluentui/react-components';
import { Link } from 'react-router-dom';
import type { WorkspaceConfig } from '@spectra/shared';

interface Props {
  workspace: WorkspaceConfig;
  hasAccess: boolean;
}

const useStyles = makeStyles({
  disabledCard: {
    opacity: '0.5',
    cursor: 'not-allowed',
  },
});

export function WorkspaceTile({ workspace, hasAccess }: Props): JSX.Element {
  const styles = useStyles();
  const tooltip = hasAccess
    ? `Open ${workspace.displayName}`
    : 'You do not have access to this workspace. Contact your administrator.';

  const inner = (
    <Card className={hasAccess ? undefined : styles.disabledCard}>
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
    <Tooltip content={tooltip} relationship="label">
      {hasAccess ? (
        <Link
          to={`/w/${workspace.id}/browse`}
          className="no-underline"
        >
          {inner}
        </Link>
      ) : (
        <div aria-label={tooltip} aria-disabled="true">
          {inner}
        </div>
      )}
    </Tooltip>
  );
}
