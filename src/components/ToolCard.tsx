import Link from "next/link";
import type { ToolDefinition } from "@/lib/tools/catalog";

export function ToolCard({ tool }: { tool: ToolDefinition }) {
  const content = (
    <div
      className={`group relative flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition ${
        tool.available
          ? "hover:border-white/20 hover:bg-white/[0.06]"
          : "opacity-55"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="mt-0.5 h-8 w-8 shrink-0 rounded-lg"
          style={{
            background: `linear-gradient(145deg, ${tool.accent}33, ${tool.accent}10)`,
            boxShadow: `inset 0 0 0 1px ${tool.accent}55`,
          }}
        />
        <span className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
          {tool.available ? `Phase ${tool.phase}` : `Soon · P${tool.phase}`}
        </span>
      </div>
      <div>
        <h3 className="font-medium text-zinc-100">{tool.name}</h3>
        <p className="mt-1 text-sm leading-relaxed text-zinc-500">{tool.description}</p>
      </div>
      <p className="text-[11px] uppercase tracking-wider text-zinc-600">
        {tool.mode}
      </p>
    </div>
  );

  if (!tool.available) {
    return <div aria-disabled>{content}</div>;
  }

  return <Link href={`/tools/${tool.slug}`}>{content}</Link>;
}
