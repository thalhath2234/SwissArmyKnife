import { ToolGrid } from "@/components/ToolGrid";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="max-w-2xl space-y-3">
        <p className="text-xs uppercase tracking-[0.25em] text-teal-300/80">
          PDF Tool · Phase 1–4 · Local
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-zinc-50 sm:text-5xl">
          Swiss Army Knife
        </h1>
        <p className="text-base leading-relaxed text-zinc-400">
          Personal PDF toolkit — fully local. Drag file cards to set merge order. OCR
          and interactive edit run on your machine.
        </p>
      </section>
      <ToolGrid />
    </div>
  );
}
