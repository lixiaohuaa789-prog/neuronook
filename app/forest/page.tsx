import Link from "next/link";
import { ArrowRight, FolderTree, Network, NotebookPen } from "lucide-react";

const modules = [
  {
    href: "/folders",
    title: "文件夹",
    desc: "先搭课程树干，按章节与专题建立知识骨架。",
    icon: FolderTree,
    badge: "Step 1",
  },
  {
    href: "/notes",
    title: "知识点",
    desc: "把关键概念沉淀为可回忆的问答卡片，长出树叶。",
    icon: NotebookPen,
    badge: "Step 2",
  },
  {
    href: "/galaxy",
    title: "知识星图",
    desc: "查看连接关系与记忆亮度，发现孤岛并持续连线。",
    icon: Network,
    badge: "Step 3",
  },
] as const;

export default function ForestPage() {
  return (
    <>
      <section className="page-hero mb-6">
        <span className="page-kicker">Knowledge Forest</span>
        <h1 className="page-title">知识森林 🌳</h1>
        <p className="page-desc">
          大纲先行，先建树干再长树叶。这里整合了文件夹、知识点与知识星图，帮助你从结构化输入走向可复用输出。
        </p>
      </section>

      <section className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-sm">
        <p className="text-sm font-semibold text-[var(--text)]">学习流</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          建框架 → 填内容 → 看连接。每次新增知识点后，回到星图检查是否形成网络，而不是孤立记忆。
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4 lg:gap-5">
        {modules.map(({ href, title, desc, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
            className="group relative min-h-[176px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-all duration-200 no-underline hover:shadow-lg active:scale-[0.99] md:hover:scale-[1.015]"
          >
            <div className="mb-4 flex items-start justify-between gap-3 md:mb-5">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--accent)]">
                <Icon size={19} strokeWidth={2.2} />
              </span>
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
                {badge}
              </span>
            </div>

            <h2 className="text-base font-semibold leading-tight tracking-tight text-[var(--text)] md:text-lg">
              {title}
            </h2>
            <p className="mt-3 pr-8 text-sm leading-relaxed text-[var(--muted)] md:text-[0.94rem]">
              {desc}
            </p>

            <span className="absolute bottom-3 right-4 text-lg text-[var(--muted)] opacity-70 transition-all duration-200 group-hover:text-[var(--accent)] group-hover:opacity-100 md:bottom-4 md:right-5" aria-hidden>
              <ArrowRight size={16} />
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}
