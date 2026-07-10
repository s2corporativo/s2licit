import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PriceHighlight } from "@/hooks/usePriceHighlight";

interface PriceCellProps {
  price: number;
  highlight?: PriceHighlight;
  highlightClass?: string;
  changeText?: string;
  tooltipText?: string;
  showChange?: boolean;
  animate?: boolean;
}

/**
 * Component for displaying price cells with optional highlighting
 */
export function PriceCell({
  price,
  highlight,
  highlightClass = "",
  changeText = "",
  tooltipText = "",
  showChange = true,
  animate = false,
}: PriceCellProps) {
  const hasHighlight = highlight !== undefined;
  const baseClass = "px-3 py-2 text-right font-mono";
  const animationClass = animate && hasHighlight ? "animate-pulse" : "";

  const cellContent = (
    <div className={`${baseClass} ${highlightClass} ${animationClass}`}>
      <div className="font-semibold">R$ {price.toFixed(2)}</div>
      {showChange && changeText && (
        <div className="text-xs mt-1 font-medium">{changeText}</div>
      )}
      {highlight && highlight.oldPrice !== null && (
        <div className="text-xs text-gray-600 mt-0.5">
          (era: R$ {highlight.oldPrice.toFixed(2)})
        </div>
      )}
    </div>
  );

  if (!tooltipText) {
    return cellContent;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{cellContent}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <pre className="text-xs whitespace-pre-wrap font-mono">
            {tooltipText}
          </pre>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Props for PriceChangeIndicator
 */
interface PriceChangeIndicatorProps {
  highlight: PriceHighlight;
}

/**
 * Component for displaying price change indicator
 */
export function PriceChangeIndicator({ highlight }: PriceChangeIndicatorProps) {
  if (!highlight.changePercent) return null;

  const isIncrease = highlight.changePercent > 0;
  const color = isIncrease ? "text-red-600" : "text-green-600";
  const bgColor = isIncrease ? "bg-red-100" : "bg-green-100";
  const arrow = isIncrease ? "↑" : "↓";

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${color} ${bgColor}`}
    >
      <span>{arrow}</span>
      <span>{Math.abs(highlight.changePercent).toFixed(2)}%</span>
    </div>
  );
}

/**
 * Props for PriceSummaryBadge
 */
interface PriceSummaryBadgeProps {
  count: number;
  type: "increase" | "decrease" | "total";
}

/**
 * Component for displaying price change summary badge
 */
export function PriceSummaryBadge({ count, type }: PriceSummaryBadgeProps) {
  const config = {
    increase: {
      bg: "bg-red-100",
      text: "text-red-700",
      label: "Aumentos",
    },
    decrease: {
      bg: "bg-green-100",
      text: "text-green-700",
      label: "Reduções",
    },
    total: {
      bg: "bg-blue-100",
      text: "text-blue-700",
      label: "Total",
    },
  };

  const { bg, text, label } = config[type];

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${bg} ${text} text-sm font-medium`}>
      <span>{label}:</span>
      <span className="font-bold">{count}</span>
    </div>
  );
}
