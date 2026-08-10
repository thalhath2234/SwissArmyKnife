import { ToolCard } from "@/components/ToolCard";
import { categories, toolsByCategory } from "@/lib/tools/catalog";

export function ToolGrid() {
  return (
    <div className="space-y-10">
      {categories.map((category) => {
        const items = toolsByCategory(category.id).filter((tool) => tool.available);
        if (items.length === 0) return null;

        return (
          <section key={category.id} className="space-y-4">
            <div className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: category.accent }}
              />
              <h2 className="font-[family-name:var(--font-display)] text-xl text-zinc-100">
                {category.title}
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((tool) => (
                <ToolCard key={tool.slug} tool={tool} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
