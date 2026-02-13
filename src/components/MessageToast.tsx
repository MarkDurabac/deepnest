/**
 * Message toast / notification banner.
 */
import { clearMessage, toasts } from "../store/index.ts";

export function MessageToast() {
  const items = toasts.value;
  if (items.length === 0) return null;

  return (
    <div class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[360px] max-w-[92vw] flex-col gap-2">
      {items.map((toast) => (
        <div
          key={toast.id}
          class={`animate-toast-in pointer-events-auto overflow-hidden rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm
            ${
              toast.kind === "error"
                ? "border-red-400/60 bg-red-500/92 text-white"
                : "border-dn-primary/40 bg-dn-dark/92 text-white"
            }`}
        >
          <div class="flex items-start gap-3">
            <span class="mt-0.5 text-base leading-none">
              {toast.kind === "error" ? "⚠" : "✓"}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm leading-relaxed">{toast.text}</p>
            </div>
            <button
              onClick={() => clearMessage(toast.id)}
              class="cursor-pointer text-lg leading-none opacity-70 transition hover:opacity-100"
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
