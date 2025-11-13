"use client";

import { UserButton } from "@clerk/nextjs";
import { memo } from "react";

export const UserMenu = memo(function UserMenu() {
  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: "h-8 w-8",
          userButtonPopoverCard: "bg-slate-800 border-slate-700",
          userButtonPopoverActions: "bg-slate-800",
          userButtonPopoverActionButton: "text-slate-300 hover:bg-slate-700",
          userButtonPopoverActionButtonText: "text-slate-300",
          userButtonPopoverActionButtonIcon: "text-slate-400",
          userButtonPopoverFooter: "hidden",
        },
      }}
      afterSignOutUrl="/sign-in"
    />
  );
});
