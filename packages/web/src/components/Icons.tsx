interface IconProps {
  size?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export function SealLogo({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path
        fill="currentColor"
        d="M16 1.5 20 4l4.6-.6 1.4 4.4 3.6 3-2.2 4.1.8 4.6-4.3 1.8-2.6 3.8-4.4-.9-4.4.9-2.6-3.8-4.3-1.8.8-4.6L2.4 10.8l3.6-3L7.4 3.4 12 4z"
      />
      <circle cx="16" cy="13.5" r="5.6" fill="none" stroke="var(--surface)" strokeWidth="1.4" />
      <path
        fill="currentColor"
        d="m11.4 23.8 1.2 6.7L16 28.4l3.4 2.1 1.2-6.7-2.2 1-2.4.5-2.4-.5z"
      />
    </svg>
  );
}

export function SignatureIcon({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M1.5 11.5c2-.4 3-2.2 3.4-4.2.3-1.7.1-3.3-.6-3.3-.8 0-1 1.8-.5 3.8.6 2.3 1.7 3.7 2.7 3.7.9 0 1.3-1 1.8-1 .6 0 .7 1 1.6 1 .8 0 1.2-1 1.8-1 .5 0 .7 1 1.7 1" />
      <path d="M1.5 14.5h13" opacity=".45" />
    </svg>
  );
}

export function InitialsIcon({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M2 11.5 4.8 4l2.8 7.5M3 9.4h3.6M13.9 4v7.5" />
      <path d="M10 4h3.9" />
      <path d="M1.5 14.5h13" opacity=".45" />
    </svg>
  );
}

export function DateIcon({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="2" y="3" width="12" height="11" rx="1.6" />
      <path d="M2 6.6h12M5.4 1.8v2.2M10.6 1.8v2.2" />
    </svg>
  );
}

export function TextIcon({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 4V2.8h10V4M8 2.8v10.4M6 13.2h4" />
    </svg>
  );
}

export function CheckIcon({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m3 8.4 3.2 3.2L13 4.8" />
    </svg>
  );
}

export function ShieldIcon({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 1.6 2.8 3.8v4c0 3.2 2.1 5.5 5.2 6.6 3.1-1.1 5.2-3.4 5.2-6.6v-4z" />
      <path d="m5.9 7.9 1.6 1.6 2.8-3" />
    </svg>
  );
}

export function CloseIcon({ size = 11 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.8}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function DownloadIcon({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 2v8M4.6 7l3.4 3.4L11.4 7M2.5 13.5h11" />
    </svg>
  );
}

export function PlusIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

export function MinusIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3.5 8h9" />
    </svg>
  );
}
