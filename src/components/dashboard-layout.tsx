"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/lib/query-client";
import { useAuth } from "../components/auth/supabase-auth-provider";
import { useAuthCacheManager } from "../hooks/use-auth-cache-manager";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./ui/optimized-exports";
import {
  Activity,
  Bot,
  Brain,
  CheckCircle,
  ChevronRight,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  User,
  Zap,
} from "./ui/optimized-icons";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();

  // Manage authentication cache clearing
  useAuthCacheManager();

  const handleSignOut = async () => {
    await signOut();
  };

  const mainNavItems = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Safety",
      href: "/safety",
      icon: Shield,
    },
    {
      title: "Monitoring",
      href: "/monitoring",
      icon: Activity,
    },
    {
      title: "Agents",
      href: "/agents",
      icon: Bot,
    },
    {
      title: "Workflows",
      href: "/workflows",
      icon: GitBranch,
    },
    {
      title: "Strategies",
      href: "/strategies",
      icon: Brain,
    },
  ];

  const secondaryNavItems = [
    {
      title: "Trading Settings",
      href: "/settings",
      icon: Settings,
    },
    {
      title: "System Check",
      href: "/config",
      icon: CheckCircle,
    },
  ];

  // Prefetch common routes to make sidebar navigation instant
  useEffect(() => {
    try {
      const routesToPrefetch = [
        "/dashboard",
        "/strategies",
        "/settings",
        "/config",
        "/monitoring",
        "/agents",
        "/workflows",
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
          queryClient.prefetchQuery({
            queryKey: queryKeys.autoSniping.status(),
            queryFn: async () => {
              const r = await fetch("/api/auto-sniping/status", { credentials: "include" });
              const j = await r.json();
              return j?.data ?? {};
            },
            staleTime: 30 * 1000,
          }).catch(() => {});
          queryClient.prefetchQuery({
            queryKey: queryKeys.autoSniping.config(),
            queryFn: async () => {
              const r = await fetch("/api/auto-sniping/config", { credentials: "include" });
              const j = await r.json();
              return j?.data ?? {};
            },
            staleTime: 30 * 60 * 1000,
          }).catch(() => {});
          queryClient.prefetchQuery({
            queryKey: queryKeys.status.unified(),
            queryFn: async () => {
              const r = await fetch("/api/mexc/unified-status", { credentials: "include" });
              const j = await r.json();
              return j?.data ?? {};
            },
            staleTime: 60 * 1000,
          }).catch(() => {});
          if (userId) {
            queryClient.prefetchQuery({
              queryKey: queryKeys.snipeTargets(userId),
              queryFn: async () => {
                const r = await fetch(`/api/snipe-targets?userId=${encodeURIComponent(userId)}`, { credentials: "include" });
                const j = await r.json();
                return j?.data ?? [];
              },
              staleTime: 10 * 1000,
            }).catch(() => {});
          }
          break;
        }
        case "/strategies": {
          queryClient.prefetchQuery({
            queryKey: ["strategies"],
            queryFn: async () => {
              const r = await fetch("/api/strategies", { credentials: "include" });
              const j = await r.json();
              return j?.data ?? {};
            },
            staleTime: 2000,
          }).catch(() => {});
          queryClient.prefetchQuery({
            queryKey: ["auto-sniping-control-status"],
            queryFn: async () => {
              const r = await fetch("/api/auto-sniping/control", { credentials: "include" });
              const j = await r.json();
              return j?.data?.status ?? {};
            },
            staleTime: 2000,
          }).catch(() => {});
          break;
        }
        case "/settings": {
          fetch("/api/user-preferences", { credentials: "include" }).catch(() => {});
          break;
        }
        case "/config": {
          fetch("/api/mexc/unified-status", { credentials: "include" }).catch(() => {});
          break;
        }
        case "/monitoring": {
          fetch("/api/dashboard/status", { credentials: "include" }).catch(() => {});
          break;
        }
        case "/agents":
        case "/workflows":
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
                      <SidebarMenuButton
                        isActive={pathname === item.href}
                        asChild
                      >
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

            <SidebarGroup className="mt-6">
              <SidebarGroupLabel>Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {secondaryNavItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={pathname === item.href}
                        asChild
                      >
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

          <SidebarFooter className="border-t p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start h-auto p-2"
                >
                  <Avatar className="h-8 w-8 mr-2">
                    <AvatarImage src={user?.user_metadata?.avatar_url} />
                    <AvatarFallback>
                      {user?.email?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-sm">
                    <span className="font-medium">
                      {user?.user_metadata?.full_name ||
                        user?.email?.split("@")[0] ||
                        "User"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {user?.email || "user@example.com"}
                    </span>
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-visible">
          <div className="h-16 border-b flex items-center px-6">
            <SidebarTrigger />
            <h1 className="ml-4 text-xl font-semibold">
              {pathname === "/dashboard" && "Dashboard"}
              {pathname === "/agents" && "Agent Management"}
              {pathname === "/workflows" && "Workflow Management"}
              {pathname === "/strategies" && "Trading Strategies"}
              {pathname === "/settings" && "Trading Settings"}
              {pathname === "/config" && "System Check"}
            </h1>
            <div className="ml-auto" />
          </div>
          <div className="p-6 h-[calc(100vh-4rem)] overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
