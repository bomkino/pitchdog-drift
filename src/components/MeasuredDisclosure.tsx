import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DISCLOSURE_DURATION_MS = 200;
const DISCLOSURE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

type DisclosureMotionState = "closed" | "closing" | "opening" | "open";

interface MeasuredDisclosureProps {
  className: string;
  triggerClassName: string;
  contentClassName: string;
  viewportClassName?: string;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
}

/**
 * A measured, interruptible disclosure for inspector content. The viewport
 * always animates between numeric heights; it never asks CSS to interpolate
 * `auto`. ResizeObserver retargets an open disclosure when its body changes.
 */
export function MeasuredDisclosure({
  className,
  triggerClassName,
  contentClassName,
  viewportClassName = "",
  expanded: controlledExpanded,
  defaultExpanded = false,
  onExpandedChange,
  trigger,
  children,
}: MeasuredDisclosureProps) {
  const contentId = useId();
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const expanded = controlledExpanded ?? uncontrolledExpanded;
  const [motionState, setMotionState] = useState<DisclosureMotionState>(expanded ? "open" : "closed");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const heightAnimationRef = useRef<Animation | null>(null);
  const contentAnimationRef = useRef<Animation | null>(null);
  const targetHeightRef = useRef<number | null>(null);
  const targetExpandedRef = useRef(expanded);
  const transitionIdRef = useRef(0);
  const initializedRef = useRef(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const settle = (nextExpanded: boolean, measuredHeight?: number) => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    heightAnimationRef.current?.cancel();
    contentAnimationRef.current?.cancel();
    heightAnimationRef.current = null;
    contentAnimationRef.current = null;
    targetHeightRef.current = null;
    targetExpandedRef.current = nextExpanded;
    const targetHeight = nextExpanded ? (measuredHeight ?? content.scrollHeight) : 0;
    viewport.style.height = `${targetHeight}px`;
    viewport.style.visibility = nextExpanded ? "visible" : "hidden";
    content.style.opacity = nextExpanded ? "1" : "0";
    content.style.transform = nextExpanded ? "translateY(0px)" : "translateY(-4px)";
    setMotionState(nextExpanded ? "open" : "closed");
  };

  const animateTo = (nextExpanded: boolean) => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const targetHeight = nextExpanded ? content.scrollHeight : 0;
    if (
      heightAnimationRef.current?.playState === "running"
      && targetExpandedRef.current === nextExpanded
      && targetHeightRef.current !== null
      && Math.abs(targetHeightRef.current - targetHeight) < 0.5
    ) return;

    const transitionId = ++transitionIdRef.current;
    const currentHeight = viewport.getBoundingClientRect().height;
    const currentContentStyle = getComputedStyle(content);
    const currentOpacity = currentContentStyle.opacity;
    const currentTransform = currentContentStyle.transform === "none"
      ? "translateY(0px)"
      : currentContentStyle.transform;

    heightAnimationRef.current?.cancel();
    contentAnimationRef.current?.cancel();
    viewport.style.height = `${currentHeight}px`;
    viewport.style.visibility = "visible";
    content.style.opacity = currentOpacity;
    content.style.transform = currentTransform;

    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || Math.abs(targetHeight - currentHeight) < 0.5) {
      settle(nextExpanded, targetHeight);
      return;
    }

    setMotionState(nextExpanded ? "opening" : "closing");
    targetHeightRef.current = targetHeight;
    targetExpandedRef.current = nextExpanded;
    heightAnimationRef.current = viewport.animate(
      [
        { height: `${currentHeight}px` },
        { height: `${targetHeight}px` },
      ],
      {
        duration: DISCLOSURE_DURATION_MS,
        easing: DISCLOSURE_EASING,
        fill: "forwards",
      },
    );
    contentAnimationRef.current = content.animate(
      [
        { opacity: currentOpacity, transform: currentTransform },
        {
          opacity: nextExpanded ? "1" : "0",
          transform: nextExpanded ? "translateY(0px)" : "translateY(-4px)",
        },
      ],
      {
        duration: DISCLOSURE_DURATION_MS,
        easing: DISCLOSURE_EASING,
        fill: "forwards",
      },
    );
    const timelineTime = document.timeline.currentTime;
    if (timelineTime !== null) {
      heightAnimationRef.current.startTime = timelineTime;
      contentAnimationRef.current.startTime = timelineTime;
    }

    heightAnimationRef.current.onfinish = () => {
      if (transitionIdRef.current !== transitionId || expandedRef.current !== nextExpanded) return;
      settle(nextExpanded, targetHeight);
    };
  };

  useLayoutEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      settle(expanded);
      return;
    }

    if (!expanded && contentRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    animateTo(expanded);
  }, [expanded]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return undefined;

    let previousHeight = content.scrollHeight;
    const observer = new ResizeObserver(() => {
      const nextHeight = content.scrollHeight;
      if (Math.abs(nextHeight - previousHeight) < 0.5) return;
      previousHeight = nextHeight;
      if (initializedRef.current && expandedRef.current) animateTo(true);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => () => {
    transitionIdRef.current += 1;
    heightAnimationRef.current?.cancel();
    contentAnimationRef.current?.cancel();
  }, []);

  const toggle = () => {
    const nextExpanded = !expanded;
    if (!nextExpanded && contentRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    if (controlledExpanded === undefined) setUncontrolledExpanded(nextExpanded);
    onExpandedChange?.(nextExpanded);
  };

  return (
    <div
      className={className}
      data-disclosure="true"
      data-disclosure-state={motionState}
      data-expanded={expanded}
    >
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={toggle}
      >
        {trigger}
      </button>
      <div
        ref={viewportRef}
        className={`measured-disclosure-viewport ${viewportClassName}`.trim()}
        data-disclosure-viewport="true"
      >
        <div
          ref={contentRef}
          id={contentId}
          className={contentClassName}
          aria-hidden={!expanded}
          inert={!expanded}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
