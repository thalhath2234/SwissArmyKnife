import { notFound } from "next/navigation";
import { AnnotateWorkspace } from "@/components/AnnotateWorkspace";
import { EditWorkspace } from "@/components/EditWorkspace";
import { FillWorkspace } from "@/components/FillWorkspace";
import { OcrWorkspace } from "@/components/OcrWorkspace";
import { OrganizeWorkspace } from "@/components/OrganizeWorkspace";
import { ProtectWorkspace } from "@/components/ProtectWorkspace";
import { SignWorkspace } from "@/components/SignWorkspace";
import { SplitWorkspace } from "@/components/SplitWorkspace";
import { ToolWorkspace } from "@/components/ToolWorkspace";
import { getTool, tools } from "@/lib/tools/catalog";

const organizeSlugs = new Set(["organize-pdf", "delete-pages", "rotate-pdf"]);
const splitSlugs = new Set(["split-pdf", "extract-pages"]);

export function generateStaticParams() {
  return tools.filter((tool) => tool.available).map((tool) => ({ slug: tool.slug }));
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getTool(slug);

  if (!tool || !tool.available) {
    notFound();
  }

  if (splitSlugs.has(tool.slug)) {
    return (
      <SplitWorkspace
        tool={tool}
        initialMode={tool.slug === "extract-pages" ? "extract" : "split"}
      />
    );
  }

  if (organizeSlugs.has(tool.slug)) {
    return <OrganizeWorkspace tool={tool} />;
  }

  if (tool.slug === "sign-pdf") {
    return <SignWorkspace tool={tool} />;
  }

  if (tool.slug === "protect-pdf") {
    return <ProtectWorkspace tool={tool} />;
  }

  if (tool.slug === "annotate-pdf") {
    return <AnnotateWorkspace tool={tool} />;
  }

  if (tool.slug === "fill-pdf") {
    return <FillWorkspace tool={tool} />;
  }

  if (tool.slug === "ocr-pdf") {
    return <OcrWorkspace tool={tool} />;
  }

  if (tool.slug === "edit-pdf") {
    return <EditWorkspace tool={tool} />;
  }

  return <ToolWorkspace tool={tool} />;
}
