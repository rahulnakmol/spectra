import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Breadcrumbs } from './Breadcrumbs';
import { AgentFlyoutLauncher } from '../agent/AgentFlyoutLauncher';

export function AppShell(): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <nav aria-label="Breadcrumb" className="px-4 py-2">
        <Breadcrumbs />
      </nav>
      <main id="main-content" role="main" className="flex-1 p-4">
        <Outlet />
      </main>
      <AgentFlyoutLauncher />
    </div>
  );
}
