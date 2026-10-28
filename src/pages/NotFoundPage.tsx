import { useLocation } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Card';

/**
 * Any address the app does not know, rendered in place inside the app shell.
 *
 * It used to redirect to /404 outside the shell: the sidebar vanished and the
 * address bar lost what was typed, so a one-letter typo could not be seen or
 * fixed. The address now stays as typed, and "/" sends staff to My work and a
 * client to their Home (LandingRedirect), rather than everyone to /dashboard.
 */
export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <>
      <PageHeader title="Page not found" subtitle="We couldn’t find a page at this address. Check it for typos, or start again from your home page." />
      <p className="muted">
        Address: <code>{pathname}</code>
      </p>
      <div className="button-row">
        <ButtonLink to="/">Go to my home page</ButtonLink>
      </div>
    </>
  );
}
