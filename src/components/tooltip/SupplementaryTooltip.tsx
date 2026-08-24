import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  createTooltipDelayState,
  markTooltipClosed,
  markTooltipOpened,
  resolveTooltipOpenDelay,
  resolveTooltipPlacement,
  TOOLTIP_FIRST_OPEN_DELAY_MS,
  TOOLTIP_VIEWPORT_PADDING_PX,
  type TooltipDelayState,
  type TooltipPlacement,
  type TooltipSide,
} from "./tooltipAuthority";
import "./SupplementaryTooltip.css";

type TooltipOpenReason = "pointer" | "keyboard";

interface ActiveTooltip {
  readonly id: string;
  readonly instant: boolean;
}

interface PendingTooltip {
  readonly id: string;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface TooltipProviderValue {
  readonly active: ActiveTooltip | null;
  requestOpen(id: string, reason: TooltipOpenReason): void;
  close(id: string): void;
}

const TooltipProviderContext = createContext<TooltipProviderValue | null>(null);

function monotonicNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function SupplementaryTooltipProvider({ children }: { readonly children: ReactNode }) {
  const [active, setActive] = useState<ActiveTooltip | null>(null);
  const activeRef = useRef<ActiveTooltip | null>(null);
  const delayStateRef = useRef<TooltipDelayState>(createTooltipDelayState());
  const pendingRef = useRef<PendingTooltip | null>(null);

  const clearPending = useCallback((id?: string) => {
    const pending = pendingRef.current;
    if (!pending || (id !== undefined && pending.id !== id)) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
  }, []);

  const activate = useCallback((id: string, instant: boolean) => {
    clearPending();
    delayStateRef.current = markTooltipOpened(delayStateRef.current, id);
    const next = { id, instant };
    activeRef.current = next;
    setActive(next);
  }, [clearPending]);

  const requestOpen = useCallback((id: string, reason: TooltipOpenReason) => {
    if (activeRef.current?.id === id) return;
    if (pendingRef.current?.id === id) return;
    clearPending();
    if (reason === "keyboard") {
      activate(id, true);
      return;
    }
    const delay = resolveTooltipOpenDelay(delayStateRef.current, id, monotonicNow());
    const instant = delay < TOOLTIP_FIRST_OPEN_DELAY_MS;
    if (delay === 0) {
      activate(id, instant);
      return;
    }
    const timer = setTimeout(() => activate(id, instant), delay);
    pendingRef.current = { id, timer };
  }, [activate, clearPending]);

  const close = useCallback((id: string) => {
    clearPending(id);
    if (activeRef.current?.id !== id) return;
    delayStateRef.current = markTooltipClosed(delayStateRef.current, id, monotonicNow());
    activeRef.current = null;
    setActive(null);
  }, [clearPending]);

  useEffect(() => () => clearPending(), [clearPending]);

  useEffect(() => {
    if (!active) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(active.id);
    };
    document.addEventListener("keydown", dismissOnEscape, true);
    return () => document.removeEventListener("keydown", dismissOnEscape, true);
  }, [active, close]);

  const value = useMemo<TooltipProviderValue>(() => ({ active, requestOpen, close }), [active, close, requestOpen]);
  return <TooltipProviderContext.Provider value={value}>{children}</TooltipProviderContext.Provider>;
}

interface TooltipRootValue {
  readonly id: string;
  readonly contentId: string;
  readonly triggerRef: React.MutableRefObject<HTMLElement | null>;
  readonly open: boolean;
  readonly instant: boolean;
  pointerEntered(): void;
  pointerLeft(): void;
  focused(keyboardVisible: boolean): void;
  blurred(): void;
}

const TooltipRootContext = createContext<TooltipRootValue | null>(null);

function useTooltipProvider(): TooltipProviderValue {
  const value = useContext(TooltipProviderContext);
  if (!value) throw new Error("SupplementaryTooltip components require SupplementaryTooltipProvider.");
  return value;
}

function useTooltipRoot(): TooltipRootValue {
  const value = useContext(TooltipRootContext);
  if (!value) throw new Error("SupplementaryTooltipTrigger and Content require SupplementaryTooltipRoot.");
  return value;
}

export function SupplementaryTooltipRoot({
  children,
  disabled = false,
}: {
  readonly children: ReactNode;
  readonly disabled?: boolean;
}) {
  const provider = useTooltipProvider();
  const active = provider.active;
  const requestOpen = provider.requestOpen;
  const close = provider.close;
  const reactId = useId();
  const id = `drift-tooltip-${reactId}`;
  const contentId = `${id}-content`;
  const triggerRef = useRef<HTMLElement | null>(null);
  const hoveredRef = useRef(false);
  const keyboardFocusedRef = useRef(false);
  const open = !disabled && active?.id === id;

  const pointerEntered = useCallback(() => {
    if (disabled) return;
    hoveredRef.current = true;
    requestOpen(id, "pointer");
  }, [disabled, id, requestOpen]);
  const pointerLeft = useCallback(() => {
    hoveredRef.current = false;
    if (!keyboardFocusedRef.current) close(id);
  }, [close, id]);
  const focused = useCallback((keyboardVisible: boolean) => {
    if (disabled) return;
    keyboardFocusedRef.current = keyboardVisible;
    if (keyboardVisible) requestOpen(id, "keyboard");
  }, [disabled, id, requestOpen]);
  const blurred = useCallback(() => {
    keyboardFocusedRef.current = false;
    if (!hoveredRef.current) close(id);
  }, [close, id]);

  useEffect(() => () => close(id), [close, id]);
  useEffect(() => {
    if (disabled) close(id);
  }, [close, disabled, id]);

  const value = useMemo<TooltipRootValue>(() => ({
    id,
    contentId,
    triggerRef,
    open,
    instant: active?.instant ?? false,
    pointerEntered,
    pointerLeft,
    focused,
    blurred,
  }), [active?.instant, blurred, contentId, focused, id, open, pointerEntered, pointerLeft]);
  return <TooltipRootContext.Provider value={value}>{children}</TooltipRootContext.Provider>;
}

interface TriggerElementProps {
  readonly ref?: Ref<HTMLElement>;
  readonly "aria-describedby"?: string;
  readonly onPointerEnter?: PointerEventHandler<HTMLElement>;
  readonly onPointerLeave?: PointerEventHandler<HTMLElement>;
  readonly onPointerDown?: PointerEventHandler<HTMLElement>;
  readonly onClick?: MouseEventHandler<HTMLElement>;
  readonly onFocus?: FocusEventHandler<HTMLElement>;
  readonly onBlur?: FocusEventHandler<HTMLElement>;
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function composeEventHandlers<E extends SyntheticEvent>(
  original: ((event: E) => void) | undefined,
  supplementary: (event: E) => void,
): (event: E) => void {
  return (event) => {
    original?.(event);
    if (!event.defaultPrevented) supplementary(event);
  };
}

/** Clones one existing labelled target; it adds no wrapper and cannot shrink its hit area. */
export function SupplementaryTooltipTrigger({ children }: { readonly children: ReactElement }) {
  const tooltip = useTooltipRoot();
  const onlyChild = Children.only(children);
  if (!isValidElement<TriggerElementProps>(onlyChild)) {
    throw new TypeError("SupplementaryTooltipTrigger requires one ref-forwarding element.");
  }
  const describedBy = [onlyChild.props["aria-describedby"], tooltip.open ? tooltip.contentId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return cloneElement(onlyChild, {
    ref: (node: HTMLElement | null) => {
      tooltip.triggerRef.current = node;
      setRef(onlyChild.props.ref, node);
    },
    "aria-describedby": describedBy,
    onPointerEnter: composeEventHandlers(onlyChild.props.onPointerEnter, (event) => {
      if (event.pointerType !== "touch") tooltip.pointerEntered();
    }),
    onPointerLeave: composeEventHandlers(onlyChild.props.onPointerLeave, (event) => {
      if (event.pointerType !== "touch") tooltip.pointerLeft();
    }),
    // A tooltip may explain a target while the pointer rests on it, but it
    // must get out of the way the instant that target is used. Pointer-down
    // also cancels a pending delayed open, so workspace changes never summon
    // an explanation over the newly selected controls.
    onPointerDown: composeEventHandlers(onlyChild.props.onPointerDown, (event) => {
      if (event.pointerType !== "touch") tooltip.pointerLeft();
    }),
    // Keyboard activation dispatches click without pointer-down. Dismiss here
    // too, then keep the tooltip quiet until focus genuinely leaves and returns.
    onClick: composeEventHandlers(onlyChild.props.onClick, () => tooltip.pointerLeft()),
    onFocus: composeEventHandlers(onlyChild.props.onFocus, (event) => {
      tooltip.focused(event.currentTarget.matches(":focus-visible"));
    }),
    onBlur: composeEventHandlers(onlyChild.props.onBlur, () => tooltip.blurred()),
  });
}

function placementEquals(left: TooltipPlacement | null, right: TooltipPlacement | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.side === right.side
    && left.x === right.x
    && left.y === right.y
    && left.arrowX === right.arrowX
    && left.arrowY === right.arrowY
    && left.constrainedWidth === right.constrainedWidth
    && left.constrainedHeight === right.constrainedHeight;
}

export interface SupplementaryTooltipContentProps {
  readonly children: ReactNode;
  readonly preferredSide?: TooltipSide;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** Supplementary explanation only: the trigger's visible label remains authoritative. */
export function SupplementaryTooltipContent({
  children,
  preferredSide = "top",
  className,
  style,
}: SupplementaryTooltipContentProps) {
  const tooltip = useTooltipRoot();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);

  useLayoutEffect(() => {
    if (!tooltip.open) {
      setPlacement(null);
      return;
    }
    const trigger = tooltip.triggerRef.current;
    const content = contentRef.current;
    if (!trigger || !content) return;
    let animationFrame = 0;
    const recompute = () => {
      animationFrame = 0;
      const triggerRect = trigger.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const next = resolveTooltipPlacement({
        trigger: triggerRect,
        content: contentRect,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        preferredSide,
      });
      setPlacement((current) => placementEquals(current, next) ? current : next);
    };
    const scheduleRecompute = () => {
      if (animationFrame !== 0) return;
      animationFrame = requestAnimationFrame(recompute);
    };

    recompute();
    window.addEventListener("resize", scheduleRecompute);
    window.addEventListener("scroll", scheduleRecompute, { capture: true, passive: true });
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleRecompute);
    resizeObserver?.observe(trigger);
    resizeObserver?.observe(content);
    return () => {
      window.removeEventListener("resize", scheduleRecompute);
      window.removeEventListener("scroll", scheduleRecompute, true);
      resizeObserver?.disconnect();
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame);
    };
  }, [preferredSide, tooltip.open, tooltip.triggerRef]);

  if (!tooltip.open || typeof document === "undefined") return null;
  const classes = ["drift-supplementary-tooltip", className].filter(Boolean).join(" ");
  const contentStyle: CSSProperties = {
    ...style,
    left: placement?.x ?? 0,
    top: placement?.y ?? 0,
    maxHeight: `calc(100vh - ${TOOLTIP_VIEWPORT_PADDING_PX * 2}px)`,
    transformOrigin: placement?.transformOrigin,
    visibility: placement ? "visible" : "hidden",
  };
  const arrowStyle: CSSProperties = {
    left: placement?.arrowX ?? 0,
    top: placement?.arrowY ?? 0,
  };

  return createPortal(
    <div
      ref={contentRef}
      id={tooltip.contentId}
      role="tooltip"
      className={classes}
      data-side={placement?.side ?? preferredSide}
      data-instant={tooltip.instant ? "true" : "false"}
      style={contentStyle}
    >
      <div className="drift-supplementary-tooltip-body">{children}</div>
      <span className="drift-supplementary-tooltip-arrow" aria-hidden="true" style={arrowStyle} />
    </div>,
    document.body,
  );
}

export const SupplementaryTooltip = {
  Provider: SupplementaryTooltipProvider,
  Root: SupplementaryTooltipRoot,
  Trigger: SupplementaryTooltipTrigger,
  Content: SupplementaryTooltipContent,
} as const;
