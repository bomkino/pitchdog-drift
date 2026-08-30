import { ArrowDownIcon as PhosphorArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowLeftIcon as PhosphorArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRightIcon as PhosphorArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowUpIcon as PhosphorArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CaretDownIcon as PhosphorCaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretRightIcon as PhosphorCaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CheckCircleIcon as PhosphorCheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { DotsSixVerticalIcon as PhosphorDotsSixVertical } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { InfoIcon as PhosphorInfo } from "@phosphor-icons/react/dist/csr/Info";
import { MagnifyingGlassIcon as PhosphorMagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MinusIcon as PhosphorMinus } from "@phosphor-icons/react/dist/csr/Minus";
import { PauseIcon as PhosphorPause } from "@phosphor-icons/react/dist/csr/Pause";
import { PlayIcon as PhosphorPlay } from "@phosphor-icons/react/dist/csr/Play";
import { PlusIcon as PhosphorPlus } from "@phosphor-icons/react/dist/csr/Plus";
import { PushPinIcon as PhosphorPushPin } from "@phosphor-icons/react/dist/csr/PushPin";
import { SkipBackIcon as PhosphorSkipBack } from "@phosphor-icons/react/dist/csr/SkipBack";
import { SkipForwardIcon as PhosphorSkipForward } from "@phosphor-icons/react/dist/csr/SkipForward";
import { TrashIcon as PhosphorTrash } from "@phosphor-icons/react/dist/csr/Trash";
import { WarningCircleIcon as PhosphorWarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { WarningIcon as PhosphorWarning } from "@phosphor-icons/react/dist/csr/Warning";
import { XCircleIcon as PhosphorXCircle } from "@phosphor-icons/react/dist/csr/XCircle";
import { XIcon as PhosphorX } from "@phosphor-icons/react/dist/csr/X";
import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react/dist/lib/types";

function decorative(IconComponent: Icon, defaultWeight: IconWeight = "regular") {
  return function DriftIcon({ weight = defaultWeight, ...props }: IconProps) {
    return <IconComponent {...props} aria-hidden="true" focusable="false" weight={weight} />;
  };
}

export const ArrowDownIcon = decorative(PhosphorArrowDown);
export const ArrowLeftIcon = decorative(PhosphorArrowLeft);
export const ArrowRightIcon = decorative(PhosphorArrowRight);
export const ArrowUpIcon = decorative(PhosphorArrowUp);
export const CaretDownIcon = decorative(PhosphorCaretDown, "bold");
export const CaretRightIcon = decorative(PhosphorCaretRight, "bold");
export const CheckCircleIcon = decorative(PhosphorCheckCircle, "fill");
export const GripIcon = decorative(PhosphorDotsSixVertical, "bold");
export const InfoIcon = decorative(PhosphorInfo, "fill");
export const MagnifyingGlassIcon = decorative(PhosphorMagnifyingGlass);
export const MinusIcon = decorative(PhosphorMinus, "bold");
export const NextFrameIcon = decorative(PhosphorSkipForward, "fill");
export const PauseIcon = decorative(PhosphorPause, "fill");
export const PinIcon = decorative(PhosphorPushPin);
export const PlayIcon = decorative(PhosphorPlay, "fill");
export const PlusIcon = decorative(PhosphorPlus, "bold");
export const PreviousFrameIcon = decorative(PhosphorSkipBack, "fill");
export const TrashIcon = decorative(PhosphorTrash);
export const WarningCircleIcon = decorative(PhosphorWarningCircle, "fill");
export const WarningIcon = decorative(PhosphorWarning, "fill");
export const XCircleIcon = decorative(PhosphorXCircle, "fill");
export const XIcon = decorative(PhosphorX, "bold");
