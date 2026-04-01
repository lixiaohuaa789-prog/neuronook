"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

type MarkdownMathContentProps = {
	content: string;
	className?: string;
};

const markdownComponents: Components = {
	p: ({ children }) => <p className="my-2 leading-7">{children}</p>,
	ul: ({ children }) => <ul className="my-2 list-disc pl-6">{children}</ul>,
	ol: ({ children }) => <ol className="my-2 list-decimal pl-6">{children}</ol>,
	li: ({ children }) => <li className="my-1">{children}</li>,
	h1: ({ children }) => <h1 className="mt-4 mb-2 text-xl font-semibold">{children}</h1>,
	h2: ({ children }) => <h2 className="mt-4 mb-2 text-lg font-semibold">{children}</h2>,
	h3: ({ children }) => <h3 className="mt-3 mb-2 text-base font-semibold">{children}</h3>,
	blockquote: ({ children }) => (
		<blockquote className="my-3 border-l-4 border-[var(--border)]/80 pl-3 text-[var(--muted)]">
			{children}
		</blockquote>
	),
	a: ({ href, children }) => (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="underline decoration-[var(--accent)] underline-offset-2"
		>
			{children}
		</a>
	),
};

export function MarkdownMathContent({ content, className }: MarkdownMathContentProps) {
	return (
		<div className={className}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkMath]}
				rehypePlugins={[rehypeKatex]}
				components={markdownComponents}
			>
				{content || ""}
			</ReactMarkdown>
		</div>
	);
}

