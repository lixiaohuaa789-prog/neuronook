"use client";

import dynamic from "next/dynamic";

import type { FormulaTextProps } from "./FormulaTextClient";

const FormulaTextNoSSR = dynamic(
	() => import("./FormulaTextClient").then((mod) => mod.FormulaTextClient),
	{ ssr: false }
);

export function FormulaText(props: FormulaTextProps) {
	return <FormulaTextNoSSR {...props} />;
}

export type { FormulaTextProps } from "./FormulaTextClient";
