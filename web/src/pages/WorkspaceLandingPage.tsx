import { Title2, Card, CardHeader, Text } from '@fluentui/react-components';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function WorkspaceLandingPage(): JSX.Element {
  const { ws = '' } = useParams();
  const { user } = useAuth();
  const tiles = [
    { to: `/w/${ws}/browse`, label: 'Browse files', desc: 'View, preview, and share documents.' },
    { to: `/w/${ws}/upload`, label: 'Upload', desc: 'Add a new document to this workspace.' },
    { to: `/w/${ws}/my`, label: 'My uploads', desc: 'Files you have uploaded.' },
  ];
  if (user?.isAdmin) {
    tiles.push({ to: `/w/${ws}/admin`, label: 'Admin', desc: 'Manage workspace settings, mappings, and audit.' });
  }
  return (
    <section aria-labelledby="ws-title" className="flex flex-col gap-4">
      <Title2 as="h1" id="ws-title">{ws}</Title2>
      <ul role="list" className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 list-none p-0">
        {tiles.map((t) => (
          <li key={t.to}>
            <Link to={t.to} className="no-underline">
              <Card>
                <CardHeader header={<Text weight="semibold">{t.label}</Text>} description={t.desc} />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
