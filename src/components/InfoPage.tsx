/**
 * Info page — About / credits.
 */
export function InfoPage() {
  return (
    <div class="flex h-full flex-col overflow-y-auto p-8">
      <div class="mx-auto max-w-[600px]">
        <h1 class="mb-2 text-2xl font-light text-dn-text-muted dark:text-gray-400">
          deepnest
        </h1>
        <p class="mb-6 text-sm text-dn-text-muted">
          Open-source industrial nesting, modernized for fast shop-floor workflows.
        </p>

        <div class="space-y-4 text-sm leading-relaxed text-dn-text dark:text-gray-300">
          <section class="rounded-xl border border-dn-border/80 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-black/20">
            <h2 class="mb-1 font-bold text-dn-text-muted dark:text-gray-400">
              What is nesting?
            </h2>
            <p>
              Nesting is the process of optimally placing irregular shapes onto
              a sheet of material to minimise waste. This is critical in
              manufacturing processes like laser cutting, CNC routing, and
              waterjet cutting.
            </p>
          </section>

          <section class="rounded-xl border border-dn-border/80 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-black/20">
            <h2 class="mb-1 font-bold text-dn-text-muted dark:text-gray-400">
              How it works
            </h2>
            <p>
              Deepnest uses a genetic algorithm to evolve nest configurations
              over time. Each generation tests multiple random permutations of
              part order and rotation, keeping the best solutions. The algorithm
              uses the No-Fit-Polygon (NFP) technique to calculate valid
              placements.
            </p>
          </section>

          <section class="rounded-xl border border-dn-border/80 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-black/20">
            <h2 class="mb-1 font-bold text-dn-text-muted dark:text-gray-400">
              License
            </h2>
            <p>
              Licensed under the{" "}
              <a
                href="https://github.com/nickedwards109/deepnest/blob/master/LICENSE"
                class="text-dn-primary hover:underline"
              >
                MIT License
              </a>
              .
            </p>
          </section>

          <section class="rounded-xl border border-dn-border/80 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-black/20">
            <h2 class="mb-1 font-bold text-dn-text-muted dark:text-gray-400">
              Links
            </h2>
            <ul class="list-inside list-disc space-y-1">
              <li>
                <a
                  href="https://github.com/nickedwards109/deepnest"
                  class="text-dn-primary hover:underline"
                >
                  GitHub Repository
                </a>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
