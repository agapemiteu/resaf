import React from 'react';

const paths = {
  play: <path d="m9 5 10 7-10 7Z" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  external: (
    <>
      <path d="M14 5h5v5M19 5l-9 9" />
      <path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <rect x="8" y="4" width="4" height="6" rx="2" />
      <rect x="14" y="14" width="4" height="6" rx="2" />
    </>
  ),
  race: (
    <>
      <rect x="3" y="5" width="7" height="14" rx="2" />
      <rect x="14" y="5" width="7" height="14" rx="2" />
      <path d="M6 9h1m10 6h1" />
    </>
  ),
  terms: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z" />
      <path d="M14 3v5h5M9 12h6m-6 4h6" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="7" width="16" height="13" rx="4" />
      <path d="M12 3v4M9 12v2m6-2v2m-6 3h6M1 12v3m22-3v3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6m0 3h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  code: <path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" />,
  down: <path d="m6 9 6 6 6-6" />,
};
export function Icon({ name, size = 24, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name] || paths.arrow}
    </svg>
  );
}
