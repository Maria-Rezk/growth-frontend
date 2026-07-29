import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconShell({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
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

export function OverviewIcon(props: IconProps) {
  return <IconShell {...props}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></IconShell>;
}

export function BrandIcon(props: IconProps) {
  return <IconShell {...props}><path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z" /><path d="m9 12 2 2 4-4" /></IconShell>;
}

export function PlanIcon(props: IconProps) {
  return <IconShell {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M3 11h18" /></IconShell>;
}

export function SparkIcon(props: IconProps) {
  return <IconShell {...props}><path d="M12 3v4" /><path d="M12 17v4" /><path d="m5.6 5.6 2.8 2.8" /><path d="m15.6 15.6 2.8 2.8" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="m5.6 18.4 2.8-2.8" /><path d="m15.6 8.4 2.8-2.8" /></IconShell>;
}

export function CampaignIcon(props: IconProps) {
  return <IconShell {...props}><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M17 9a4 4 0 0 1 0 6" /><path d="M20 6.5a8 8 0 0 1 0 11" /></IconShell>;
}

export function MatrixIcon(props: IconProps) {
  return <IconShell {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 9v12" /><path d="M3 15h18" /></IconShell>;
}

export function SunIcon(props: IconProps) {
  return <IconShell {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.9 4.9 1.4 1.4" /><path d="m17.7 17.7 1.4 1.4" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.3 17.7-1.4 1.4" /><path d="m19.1 4.9-1.4 1.4" /></IconShell>;
}

export function MoonIcon(props: IconProps) {
  return <IconShell {...props}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8" /></IconShell>;
}

export function MonitorIcon(props: IconProps) {
  return <IconShell {...props}><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></IconShell>;
}

export function CheckIcon(props: IconProps) {
  return <IconShell {...props}><path d="M20 6 9 17l-5-5" /></IconShell>;
}

export function RefreshIcon(props: IconProps) {
  return <IconShell {...props}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v5h-5" /></IconShell>;
}

export function MessageIcon(props: IconProps) {
  return <IconShell {...props}><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" /></IconShell>;
}

export function ArrowUpRightIcon(props: IconProps) {
  return <IconShell {...props}><path d="M7 17 17 7" /><path d="M8 7h9v9" /></IconShell>;
}

export function AlertIcon(props: IconProps) {
  return <IconShell {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" /></IconShell>;
}

export function GlobeIcon(props: IconProps) {
  return <IconShell {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" /></IconShell>;
}

export function TrendUpIcon(props: IconProps) {
  return <IconShell {...props}><path d="m3 17 6-6 4 4 8-8" /><path d="M14 7h7v7" /></IconShell>;
}

export function PlusIcon(props: IconProps) {
  return <IconShell {...props}><path d="M12 5v14" /><path d="M5 12h14" /></IconShell>;
}

export function ClockIcon(props: IconProps) {
  return <IconShell {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></IconShell>;
}

export function DotIcon(props: IconProps) {
  return <IconShell {...props}><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /></IconShell>;
}

export function CloseIcon(props: IconProps) {
  return <IconShell {...props}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></IconShell>;
}

export function MenuIcon(props: IconProps) {
  return <IconShell {...props}><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></IconShell>;
}

export function LogoutIcon(props: IconProps) {
  return <IconShell {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></IconShell>;
}
