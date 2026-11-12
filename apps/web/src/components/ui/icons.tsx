import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...rest}
        >
            {children}
        </svg>
    );
}

export const PlayIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
    </Icon>
);

export const PauseIcon = (p: IconProps) => (
    <Icon {...p}>
        <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
        <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
    </Icon>
);

export const PrevIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M18 5v14L8 12z" fill="currentColor" />
        <path d="M6 5v14" />
    </Icon>
);

export const NextIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M6 5v14l10-7z" fill="currentColor" />
        <path d="M18 5v14" />
    </Icon>
);

export const FileIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3" />
    </Icon>
);

export const GearIcon = (p: IconProps) => (
    <Icon {...p}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
);

export const PlusIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M12 5v14M5 12h14" />
    </Icon>
);

export const MinusIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M5 12h14" />
    </Icon>
);

export const EyeIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
    </Icon>
);

export const EyeOffIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M2 2l20 20" />
    </Icon>
);

export const XIcon = (p: IconProps) => (
    <Icon {...p}>
        <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
);
