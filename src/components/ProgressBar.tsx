/**
 * Nesting progress bar.
 */
import { nestProgress } from "../store/index.ts";

export function ProgressBar() {
  const p = nestProgress.value;
  const progress = p ? p.progress : 0;
  const pct = Math.max(0, Math.min(100, Math.floor(progress * 100)));

  return (
    <div class="relative h-1.5 w-full bg-[#cdd8e0] dark:bg-[#404040]">
      <div
        class="h-full bg-gradient-to-r from-dn-primary to-[#2fe4b6] transition-[width] duration-300 ease-out"
        style={{
          width: `${pct}%`,
          transition: progress < 0.01 ? "none" : undefined,
        }}
      />
      <span class="pointer-events-none absolute right-2 -top-5 text-[11px] text-dn-text-muted dark:text-gray-300">
        {pct}%
      </span>
    </div>
  );
}
