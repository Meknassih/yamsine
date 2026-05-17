"use client";

import { type ReactNode } from "react";

interface Props {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function MobileScorecardDrawer({ open, onToggle, children }: Props) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onToggle}
        />
      )}

      <div
        className={[
          "fixed bottom-0 left-0 right-0 z-50 flex flex-col",
          "transition-transform duration-200 ease-out",
          open ? "translate-y-0" : "translate-y-[calc(100%-52px)]",
        ].join(" ")}
      >
        {/* Handle bar (always visible) */}
        <button
          onClick={onToggle}
          className="flex items-center justify-center gap-2 w-full bg-slate-800 border-t border-slate-700/50 px-4 py-3 rounded-t-xl active:bg-slate-700 transition-colors"
        >
          <div className="w-8 h-1 rounded-full bg-slate-600 mr-2" />
          <span className="text-slate-300 text-sm font-medium">
            {open ? "▼ Scorecard" : "▲ Scorecard"}
          </span>
        </button>

        {/* Scrollable scorecard content */}
        <div
          className="overflow-y-auto bg-slate-800 border-t border-slate-700/50 px-4 pb-6"
          style={{ maxHeight: open ? "70vh" : "0" }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
