interface BrandProps {
  product?: string;
  merchant?: boolean;
}

function ArgusMark() {
  return (
    <span className="brand-eye" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9.5" />
        <circle cx="12" cy="12" r="5.25" />
        <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function Wordmark({ product = 'Challenge' }: BrandProps) {
  return (
    <div className="wordmark">
      <ArgusMark />
      <span>Argus {product}</span>
    </div>
  );
}

export function MerchantWordmark() {
  return (
    <div className="merchant-wordmark">
      <span className="merchant-mark" aria-hidden="true">
        M
      </span>
      <span>Demo Site</span>
      <span className="merchant-demo-badge">DEMO</span>
    </div>
  );
}
