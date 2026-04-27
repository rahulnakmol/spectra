import { Avatar, Text, Toolbar, ToolbarDivider } from '@fluentui/react-components';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAppSettings } from '../api/hooks';
import { LogoutButton } from '../auth/LogoutButton';
import { ThemeToggle } from '../theme/ThemeToggle';

export function Header(): JSX.Element {
  const { user } = useAuth();
  const settings = useAppSettings();
  const brand = settings.data?.brandName ?? 'Spectra';
  return (
    <header
      role="banner"
      className="flex items-center justify-between px-4 py-2 border-b"
      style={{ borderColor: 'var(--colorNeutralStroke2)' }}
    >
      <Link to="/w" aria-label={`${brand} home`} className="no-underline">
        <Text size={500} weight="semibold">{brand}</Text>
      </Link>
      <Toolbar aria-label="User actions">
        <ThemeToggle />
        <ToolbarDivider />
        {user ? (
          <Avatar
            name={user.displayName}
            aria-label={`Signed in as ${user.displayName}`}
            color="colorful"
          />
        ) : null}
        <LogoutButton />
      </Toolbar>
    </header>
  );
}
