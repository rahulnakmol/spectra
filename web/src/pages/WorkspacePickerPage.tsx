import { Title2, Spinner, MessageBar, MessageBarBody, Text } from '@fluentui/react-components';
import { useWorkspaces } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { WorkspaceTile } from '../components/WorkspaceTile';

export function WorkspacePickerPage(): JSX.Element {
  const { user } = useAuth();
  const ws = useWorkspaces();

  if (ws.isLoading) {
    return <Spinner label="Loading workspaces…" aria-live="polite" />;
  }
  if (ws.error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>Could not load workspaces. Try refreshing.</MessageBarBody>
      </MessageBar>
    );
  }

  const memberships = new Set((user?.teamMemberships ?? []).map((t) => t.workspaceId));
  const workspaces = ws.data ?? [];

  return (
    <section aria-labelledby="workspaces-title" className="flex flex-col gap-4">
      <Title2 as="h1" id="workspaces-title">Workspaces</Title2>
      {workspaces.length === 0 ? (
        <Text>No workspaces are configured yet.</Text>
      ) : (
        <ul
          role="list"
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
          aria-label="Available workspaces"
        >
          {workspaces.map((w) => (
            <li key={w.id}>
              <WorkspaceTile workspace={w} hasAccess={user?.isAdmin === true || memberships.has(w.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
