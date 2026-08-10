"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wrench } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.12),_transparent_45%),radial-gradient(ellipse_at_bottom_right,_rgba(96,165,250,0.1),_transparent_40%),linear-gradient(160deg,#0b0f14_0%,#111827_45%,#0a0a0b_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,0.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:48px_48px]" />

      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-400/15 text-teal-300 ring-1 ring-teal-300/30 transition group-hover:bg-teal-400/25">
              <Wrench className="h-4 w-4" />
            </span>
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg tracking-tight text-zinc-50">
                Swiss Army Knife
              </p>
              <p className="text-xs text-zinc-500">Personal desktop toolkit</p>
            </div>
          </Link>
          {!isHome && (
            <Link
              href="/"
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400 transition hover:border-teal-300/40 hover:text-teal-200"
            >
              All tools
            </Link>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
