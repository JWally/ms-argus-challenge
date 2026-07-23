interface IconProps {
  className?: string;
}

const iconDefaults = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function CheckIcon({ className = '' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      strokeWidth="2.5"
      aria-hidden="true"
      {...iconDefaults}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function CloseIcon({ className = '' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      strokeWidth="2.5"
      aria-hidden="true"
      {...iconDefaults}
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function ShieldIcon({ className = '' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      strokeWidth="1.7"
      aria-hidden="true"
      {...iconDefaults}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
