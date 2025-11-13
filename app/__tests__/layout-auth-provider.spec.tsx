import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));

vi.mock("@clerk/nextjs", () => {
  const { createElement, Fragment } = require("react");
  return {
    useUser: () => ({ user: null, isLoaded: true }),
    useSession: () => ({ session: null }),
    useClerk: () => ({ signOut: vi.fn() }),
    ClerkProvider: ({ children }: { children: ReactNode }) =>
      createElement(Fragment, null, children),
  };
});

function findInTree(
  node: ReactElement | ReactElement[] | undefined | null,
  predicate: (element: ReactElement) => boolean,
): ReactElement | null {
  if (!node) {
    return null;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findInTree(child, predicate);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (predicate(node)) {
    return node;
  }

  const { children } = node.props ?? {};
  if (!children) {
    return null;
  }

  return findInTree(children as ReactElement | ReactElement[], predicate);
}

describe("RootLayout auth provider integration", () => {
  it("wraps children with ClerkAuthProvider", async () => {
    const { default: RootLayout } = await import("../layout");
    const layoutTree = RootLayout({
      children: <div data-testid="child">Hello</div>,
    });

    const provider =
      findInTree(
        layoutTree as ReactElement,
        (element) =>
          typeof element.type === "function" && element.type.name === "ClerkAuthProvider",
      ) ??
      findInTree(
        (layoutTree as ReactElement)?.props?.children as ReactElement | ReactElement[],
        (element) =>
          typeof element.type === "function" && element.type.name === "ClerkAuthProvider",
      );

    expect(provider, "ClerkAuthProvider should exist within the layout tree").toBeTruthy();
  });
});
