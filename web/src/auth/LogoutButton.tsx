import { Button } from '@fluentui/react-components';
import { SignOut24Regular } from '@fluentui/react-icons';

export function LogoutButton(): JSX.Element {
  return (
    <form action="/api/auth/logout" method="post" className="inline-block">
      <Button type="submit" appearance="subtle" icon={<SignOut24Regular />} aria-label="Sign out">
        Sign out
      </Button>
    </form>
  );
}
