"use client";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { queryKeys } from "@/src/lib/query-client";
import { useAuth } from "../components/auth/supabase-auth-provider";
import { useAuthCacheManager } from "../hooks/use-auth-cache-manager";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./ui/optimized-exports";
import { LayoutDashboard, Zap } from "./ui/optimized-icons";
import { UserMenu } from "./user-menu";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Manage authentication cache clearing
  useAuthCacheManager();

  const mainNavItems = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    // Removed: Safety, Monitoring, Agents, Workflows, Strategies pages - simplified to trading focus
  ];

  const _secondaryNavItems = [
    // Removed: Settings and Config pages - merged into dashboard
  ];

  // Prefetch common routes to make sidebar navigation instant
  useEffect(() => {
    try {
      const routesToPrefetch = [
        "/dashboard",
        // Removed: other routes - pages removed
      ];
      routesToPrefetch.forEach((href) => {
        try {
          router.prefetch(href);
        } catch {}
      });
    } catch {}
  }, [router]);

  // Best-effort: prefetch critical data for routes on hover/focus
  const prefetchForRoute = (href: string) => {
    try {
      const userId = user?.id || "";
      switch (href) {
        case "/dashboard": {
          // React Query prefetch to hydrate cache
          queryClient
            .prefetchQuery({
              queryKey: queryKeys.autoSniping.status(),
              queryFn: async () => {
                const r = await fetch("/api/auto-sniping/status", { credentials: "include" });
                const j = await r.json();
                return j?.data ?? {};
              },
              staleTime: 30 * 1000,
            })
            .catch(() => {});
          queryClient
            .prefetchQuery({
              queryKey: queryKeys.autoSniping.config(),
              queryFn: async () => {
                const r = await fetch("/api/auto-sniping/config", { credentials: "include" });
                const j = await r.json();
                return j?.data ?? {};
              },
              staleTime: 30 * 60 * 1000,
            })
            .catch(() => {});
          queryClient
            .prefetchQuery({
              queryKey: queryKeys.status.unified(),
              queryFn: async () => {
                const r = await fetch("/api/mexc/unified-status", { credentials: "include" });
                const j = await r.json();
                return j?.data ?? {};
              },
              staleTime: 60 * 1000,
            })
            .catch(() => {});
          if (userId) {
            queryClient
              .prefetchQuery({
                queryKey: queryKeys.snipeTargets(userId),
                queryFn: async () => {
                  const r = await fetch(`/api/snipe-targets?userId=${encodeURIComponent(userId)}`, {
                    credentials: "include",
                  });
                  const j = await r.json();
                  return j?.data ?? [];
                },
                staleTime: 10 * 1000,
              })
              .catch(() => {});
          }
          break;
        }
        default:
          break;
      }
    } catch {}
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <Sidebar className="border-r">
          <SidebarHeader className="h-16 flex items-center px-6 border-b">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg">MEXC Sniper</span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainNavItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton isActive={pathname === item.href} asChild>
                        <Link
                          href={item.href}
                          prefetch
                          onMouseEnter={() => {
                            try {
                              router.prefetch(item.href);
                              prefetchForRoute(item.href);
                            } catch {}
                          }}
                          onFocus={() => {
                            try {
                              router.prefetch(item.href);
                              prefetchForRoute(item.href);
                            } catch {}
                          }}
                        >
                          <item.icon className="mr-2 h-4 w-4" />
                          {item.title}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t p-4 flex items-center justify-center">
            <UserMenu />
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-visible">
          <div className="h-16 border-b flex items-center px-6">
            <SidebarTrigger />
            <h1 className="ml-4 text-xl font-semibold">
              {pathname === "/dashboard" && "Dashboard"}
            </h1>
            <div className="ml-auto" />
          </div>
          <div className="p-6 h-[calc(100vh-4rem)] overflow-auto">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
