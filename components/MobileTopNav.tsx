"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AppNav } from "./AppNav";
import avatarImage from "../icon/yjtp.png";

export function MobileTopNav() {
  const DRAWER_ANIMATION_MS = 220;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const brandBlock = (
    <>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/90 shadow-sm ring-1 ring-gray-200/80">
        <Image
          src={avatarImage}
          alt="头像"
          className="h-full w-full object-cover"
          priority
        />
      </span>
      <span className="flex min-w-0 flex-col leading-tight text-gray-800">
        <span className="break-words text-[0.95rem] font-bold tracking-tight">NeuroNook</span>
        <small className="whitespace-normal break-words text-[0.68rem] font-medium leading-snug text-gray-500">
          It&apos;s Okay to not to be Okay🤍
        </small>
      </span>
    </>
  );

  const openDrawer = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setMounted(true);
    window.requestAnimationFrame(() => setOpen(true));
  };

  const closeDrawer = () => {
    setOpen(false);
    closeTimerRef.current = window.setTimeout(() => {
      setMounted(false);
      closeTimerRef.current = null;
    }, DRAWER_ANIMATION_MS);
  };

  useEffect(() => {
    if (!mounted) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };

    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !open || !drawerRef.current) return;
    const activeItem = drawerRef.current.querySelector('[data-active="true"]') as HTMLElement | null;
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [mounted, open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-gray-50/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <Link
            href="/"
            className="group flex min-w-0 items-center gap-3 rounded-xl text-gray-800 no-underline"
          >
            {brandBlock}
          </Link>
          <button
            type="button"
            onClick={openDrawer}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200/80 bg-white/80 text-gray-700 transition-all duration-200 active:scale-95"
            aria-label="打开导航菜单"
            aria-expanded={open && mounted}
            aria-controls="mobile-nav-drawer"
          >
            <span aria-hidden className="text-lg leading-none">☰</span>
          </button>
        </div>
      </header>

      {mounted && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            className={`absolute inset-0 transition-opacity duration-200 ${open ? "bg-black/35 opacity-100" : "bg-black/0 opacity-0"}`}
            aria-label="关闭菜单"
            onClick={closeDrawer}
          />
          <aside
            id="mobile-nav-drawer"
            ref={drawerRef}
            className={`absolute right-0 top-0 h-full w-[82vw] max-w-[340px] overflow-y-auto border-l border-gray-200/70 bg-gray-50/95 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-transform duration-200 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
          >
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-gray-200/70 pb-3">
              <Link
                href="/"
                className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl text-gray-800 no-underline"
                onClick={closeDrawer}
              >
                {brandBlock}
              </Link>
              <button
                type="button"
                onClick={closeDrawer}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200/80 bg-white/80 text-gray-500"
                aria-label="关闭导航菜单"
              >
                ×
              </button>
            </div>
            <AppNav className="flex flex-col gap-1.5" onNavigate={closeDrawer} />
          </aside>
        </div>
      )}
    </>
  );
}
