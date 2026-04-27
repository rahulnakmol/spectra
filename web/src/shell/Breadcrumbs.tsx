import { Breadcrumb, BreadcrumbItem, BreadcrumbButton, BreadcrumbDivider } from '@fluentui/react-components';
import { Link, useLocation, useParams } from 'react-router-dom';

export function Breadcrumbs(): JSX.Element | null {
  const { pathname } = useLocation();
  const params = useParams<{ ws?: string }>();
  if (pathname === '/login' || pathname === '/') return null;

  const segments: Array<{ label: string; to?: string }> = [{ label: 'Workspaces', to: '/w' }];
  if (params.ws) {
    segments.push({ label: params.ws, to: `/w/${params.ws}` });
    if (pathname.endsWith('/browse')) segments.push({ label: 'Browse' });
    if (pathname.endsWith('/upload')) segments.push({ label: 'Upload' });
    if (pathname.endsWith('/admin')) segments.push({ label: 'Admin' });
    if (pathname.endsWith('/my')) segments.push({ label: 'My uploads' });
  }

  return (
    <Breadcrumb aria-label="Breadcrumb">
      {segments.map((s, i) => (
        <span key={`${s.label}-${i}`} className="inline-flex items-center">
          <BreadcrumbItem>
            {s.to && i < segments.length - 1 ? (
              <Link to={s.to} style={{ textDecoration: 'none' }}>
                <BreadcrumbButton>{s.label}</BreadcrumbButton>
              </Link>
            ) : (
              <BreadcrumbButton current>{s.label}</BreadcrumbButton>
            )}
          </BreadcrumbItem>
          {i < segments.length - 1 ? <BreadcrumbDivider /> : null}
        </span>
      ))}
    </Breadcrumb>
  );
}
