import React from 'react';

export interface MermaidIconProps {
  size?: number;
  className?: string;
}

const baseSvgProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': true,
});

export const AlertTriangleIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

export const CheckIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const CodeIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

export const CopyIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

export const DownloadIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

export const EyeIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const FileCodeIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M10 12.5 8 15l2 2.5" />
    <path d="m14 12.5 2 2.5-2 2.5" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
  </svg>
);

export const ImageIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

export const MaximizeIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" x2="14" y1="3" y2="10" />
    <line x1="3" x2="10" y1="21" y2="14" />
  </svg>
);

export const MinimizeIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="14" x2="21" y1="10" y2="3" />
    <line x1="3" x2="10" y1="21" y2="14" />
  </svg>
);

export const RotateCcwIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

export const CloseIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const ZoomInIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" x2="16.65" y1="21" y2="16.65" />
    <line x1="11" x2="11" y1="8" y2="14" />
    <line x1="8" x2="14" y1="11" y2="11" />
  </svg>
);

export const ZoomOutIcon: React.FC<MermaidIconProps> = ({ size = 14, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" x2="16.65" y1="21" y2="16.65" />
    <line x1="8" x2="14" y1="11" y2="11" />
  </svg>
);
