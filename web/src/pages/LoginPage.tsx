import { Button, Title1, Text, Spinner } from '@fluentui/react-components';
import { useAppSettings } from '../api/hooks';

const MS_LOGO = (
  <svg width="20" height="20" viewBox="0 0 23 23" aria-hidden="true">
    <rect x="1" y="1" width="10" height="10" fill="#F25022" />
    <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
    <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
    <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
  </svg>
);

export function LoginPage(): JSX.Element {
  const settings = useAppSettings();
  const brand = settings.data?.brandName ?? 'Spectra';
  const pitch = settings.data?.welcomePitch ?? 'Secure document management built on Microsoft 365.';

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <section className="max-w-md w-full flex flex-col gap-6" aria-labelledby="login-title">
        <Title1 as="h1" id="login-title">{brand}</Title1>
        {settings.isLoading ? (
          <Spinner label="Loading…" />
        ) : (
          <Text size={400}>{pitch}</Text>
        )}
        <form action="/api/auth/login" method="post">
          <Button
            type="submit"
            appearance="primary"
            size="large"
            icon={MS_LOGO}
          >
            Sign in with Microsoft
          </Button>
        </form>
      </section>
    </main>
  );
}
