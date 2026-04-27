import { Title2, TabList, Tab, type SelectTabEvent, type SelectTabData } from '@fluentui/react-components';
import { Routes, Route, useNavigate, useLocation, Navigate, useParams } from 'react-router-dom';
import { WorkspacesTab } from './admin/WorkspacesTab';
import { GroupMappingTab } from './admin/GroupMappingTab';
import { AuditTab } from './admin/AuditTab';

const TABS = ['workspaces', 'groups', 'audit'] as const;
type TabId = typeof TABS[number];

export function AdminPage(): JSX.Element {
  const { ws = '' } = useParams();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const active: TabId = TABS.find((t) => pathname.endsWith(`/admin/${t}`)) ?? 'workspaces';

  function onTabSelect(_e: SelectTabEvent, data: SelectTabData): void {
    nav(`/w/${ws}/admin/${data.value as TabId}`);
  }

  return (
    <section aria-labelledby="admin-title" className="flex flex-col gap-4">
      <Title2 as="h1" id="admin-title">Admin · {ws}</Title2>
      <TabList selectedValue={active} onTabSelect={onTabSelect}>
        <Tab value="workspaces">Workspaces</Tab>
        <Tab value="groups">Group mapping</Tab>
        <Tab value="audit">Audit</Tab>
      </TabList>
      <Routes>
        <Route index element={<Navigate to="workspaces" replace />} />
        <Route path="workspaces" element={<WorkspacesTab />} />
        <Route path="groups" element={<GroupMappingTab />} />
        <Route path="audit" element={<AuditTab />} />
      </Routes>
    </section>
  );
}
