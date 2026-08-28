import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function StrokeIcon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" focusable="false" viewBox="0 0 24 24" {...props}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {children}
      </g>
    </svg>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" fill="currentColor" focusable="false" viewBox="0 0 24 24" {...props}>
      {[8, 16].flatMap((x) => [6, 12, 18].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.35" />))}
    </svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return <StrokeIcon {...props}><path d="M12 19V5m-5 5 5-5 5 5" /></StrokeIcon>;
}

export function ArrowDownIcon(props: IconProps) {
  return <StrokeIcon {...props}><path d="M12 5v14m-5-5 5 5 5-5" /></StrokeIcon>;
}

export function PinIcon(props: IconProps) {
  return <StrokeIcon {...props}><path d="M9 3h6l-1 5 3 3v2H7v-2l3-3-1-5Zm3 10v8" /></StrokeIcon>;
}

export function TrashIcon(props: IconProps) {
  return <StrokeIcon {...props}><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></StrokeIcon>;
}

export function PreviousFrameIcon(props: IconProps) {
  return <StrokeIcon {...props}><path d="M6 5v14m11-13-7 6 7 6V6Z" /></StrokeIcon>;
}

export function NextFrameIcon(props: IconProps) {
  return <StrokeIcon {...props}><path d="M18 5v14M7 6l7 6-7 6V6Z" /></StrokeIcon>;
}

export function PlayIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" fill="currentColor" focusable="false" viewBox="0 0 24 24" {...props}>
      <path d="M8.25 5.55a1 1 0 0 1 1.53-.84l9 6.45a1 1 0 0 1 0 1.68l-9 6.45a1 1 0 0 1-1.53-.84V5.55Z" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return <StrokeIcon {...props}><path d="M9 6v12m6-12v12" strokeWidth="2.4" /></StrokeIcon>;
}
