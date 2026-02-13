import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { commandPaletteOpen } from "../store/index.ts";

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  keywords?: string[];
  disabled?: boolean;
  run: () => void | Promise<void>;
}

interface CommandPaletteProps {
  commands: CommandItem[];
}

export function CommandPalette({ commands }: CommandPaletteProps) {
  const open = commandPaletteOpen.value;
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((cmd) => {
      if (cmd.label.toLowerCase().includes(q)) return true;
      return (cmd.keywords ?? []).some((k) => k.toLowerCase().includes(q));
    });
  }, [commands, query]);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const ctrlOrCmd = ev.ctrlKey || ev.metaKey;
      if (ctrlOrCmd && ev.key.toLowerCase() === "k") {
        ev.preventDefault();
        commandPaletteOpen.value = !commandPaletteOpen.value;
        return;
      }

      if (!commandPaletteOpen.value) return;

      if (ev.key === "Escape") {
        ev.preventDefault();
        commandPaletteOpen.value = false;
        return;
      }

      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(0, filteredCommands.length - 1)));
        return;
      }

      if (ev.key === "ArrowUp") {
        ev.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (ev.key === "Enter") {
        ev.preventDefault();
        const item = filteredCommands[selectedIndex];
        if (item && !item.disabled) {
          void item.run();
          commandPaletteOpen.value = false;
          setQuery("");
          setSelectedIndex(0);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredCommands, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, open]);

  if (!open) return null;

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/45 pt-[14vh] backdrop-blur-sm"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) {
          commandPaletteOpen.value = false;
        }
      }}
    >
      <div class="w-[680px] max-w-[94vw] overflow-hidden rounded-2xl border border-dn-border/80 bg-white/95 shadow-xl dark:border-white/10 dark:bg-[#1b242d]/95">
        <div class="border-b border-dn-border/80 p-3 dark:border-white/10">
          <input
            ref={inputRef}
            value={query}
            onInput={(ev) => setQuery((ev.target as HTMLInputElement).value)}
            placeholder="Type a command... (Import, Start Nest, Export SVG, Toggle Theme)"
            class="w-full rounded-md border border-dn-input-border bg-dn-input-bg px-3 py-2 text-sm dark:border-[#505050] dark:bg-[#3d3d3d] dark:text-white"
          />
        </div>

        <div class="max-h-[52vh] overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div class="rounded-md px-3 py-5 text-center text-sm text-dn-text-muted">
              No command found.
            </div>
          ) : (
            filteredCommands.map((cmd, i) => (
              <button
                key={cmd.id}
                disabled={cmd.disabled}
                onClick={() => {
                  if (cmd.disabled) return;
                  void cmd.run();
                  commandPaletteOpen.value = false;
                  setQuery("");
                }}
                class={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition
                  ${
                    i === selectedIndex
                      ? "bg-dn-primary text-white"
                      : cmd.disabled
                        ? "cursor-not-allowed opacity-50"
                        : "hover:bg-dn-table-hover dark:hover:bg-white/10"
                  }`}
              >
                <span>{cmd.label}</span>
                {cmd.hint && (
                  <span class={`text-xs ${i === selectedIndex ? "text-white/85" : "text-dn-text-muted"}`}>
                    {cmd.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
