import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconShell({ size = 18, children, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return <IconShell {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></IconShell>;
}

export function CheckAllIcon(props: IconProps) {
  return <IconShell {...props}><path d="m3 12 3 3 6-6" /><path d="m12 15 2 2 7-7" /></IconShell>;
}

export function TaskIcon(props: IconProps) {
  return <IconShell {...props}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></IconShell>;
}

export function PostIcon(props: IconProps) {
  return <IconShell {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10" /><path d="M7 12h7" /><path d="M7 16h5" /></IconShell>;
}

export function LeadIcon(props: IconProps) {
  return <IconShell {...props}><path d="M16 21v-2a4 4 0 0 0-8 0v2" /><circle cx="12" cy="7" r="4" /><path d="M20 8v6" /><path d="M23 11h-6" /></IconShell>;
}

export function MembersIcon(props: IconProps) {
  return <IconShell {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></IconShell>;
}

export function ReportIcon(props: IconProps) {
  return <IconShell {...props}><path d="M3 3v18h18" /><path d="M7 15v-4" /><path d="M12 15V7" /><path d="M17 15v-6" /></IconShell>;
}
