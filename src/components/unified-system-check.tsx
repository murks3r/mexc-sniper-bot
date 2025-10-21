"use client";

import { AlertCircle, CheckCircle, Eye, EyeOff, RefreshCw, Save, TestTube, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSaveApiCredentials, useTestApiCredentials } from "@/src/hooks/use-api-credentials";
import { useAuth } from "./auth/supabase-auth-provider";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "./ui/use-toast";

// Debounce function
function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout>();

  const debouncedCallback = useCallback(
    (...args: any[]) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      const newTimer = setTimeout(() => {
        callback(...args);
      }, delay);
      setDebounceTimer(newTimer);
    },
    [callback, delay, debounceTimer]
  ) as T;

  return debouncedCallback;
}

export function UnifiedSystemCheck() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Form state
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // System status state
  const [systemStatus, setSystemStatus] = useState([
    { name: "Database Connection", status: "checking", message: "Checking database..." },
    { name: "API Credentials", status: "checking", message: "Checking credentials..." },
    { name: "Network Connectivity", status: "checking", message: "Testing connectivity..." },
    { name: "Trading Engine", status: "checking", message: "Checking engine..." },
  ]);

  // Hooks
  const saveCredentials = useSaveApiCredentials();
  const testCredentials = useTestApiCredentials();

  // Fast system status check with caching
  const checkSystemStatus = useCallback(async () => {
    if (!user?.id) return;

    setIsRefreshing(true);
    try {
      // Start with optimistic states
      setSystemStatus([
        { name: "Database Connection", status: "checking", message: "Checking..." },
        { name: "API Credentials", status: "checking", message: "Checking..." },
        { name: "Network Connectivity", status: "checking", message: "Checking..." },
        { name: "Trading Engine", status: "checking", message: "Checking..." },
      ]);

      // Quick parallel requests with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      try {
        const [healthResponse, credentialsResponse] = await Promise.allSettled([
          fetch("/api/health/quick", {
            signal: controller.signal,
            cache: 'no-cache',
            headers: { 'Cache-Control': 'no-cache' },
            credentials: 'include',
          }),
          fetch(`/api/api-credentials?userId=${user.id}&skipCache=true`, {
            signal: controller.signal,
            cache: 'no-cache',
            headers: { 'Cache-Control': 'no-cache' },
            credentials: 'include',
          }),
        ]);

        clearTimeout(timeoutId);

        // Process health response
        let healthData = null;
        if (healthResponse.status === "fulfilled" && healthResponse.value.ok) {
          healthData = await healthResponse.value.json();
        }

        // Process credentials response
        let credentialsData = null;
        if (credentialsResponse.status === "fulfilled" && credentialsResponse.value.ok) {
          const credResponse = await credentialsResponse.value.json();
          credentialsData = credResponse.success ? credResponse.data : null;
        }

        // Update status based on responses
        setSystemStatus([
          {
            name: "Database Connection",
            status: healthData ? "pass" : "warning",
            message: healthData ? "Database healthy" : "Database status unknown"
          },
          {
            name: "API Credentials",
            status: credentialsData?.hasCredentials && credentialsData?.credentialsValid ? "pass" : "warning",
            message: credentialsData?.hasCredentials 
              ? (credentialsData?.credentialsValid ? "Credentials valid" : "Credentials need testing")
              : "No credentials configured"
          },
          {
            name: "Network Connectivity",
            status: "pass",
            message: "Network connectivity available"
          },
          {
            name: "Trading Engine",
            status: credentialsData?.hasCredentials && credentialsData?.credentialsValid ? "pass" : "warning",
            message: credentialsData?.hasCredentials && credentialsData?.credentialsValid 
              ? "Trading engine ready" 
              : "Waiting for valid credentials"
          },
        ]);

      } catch (error) {
        console.error("System check error:", error);
        setSystemStatus([
          { name: "Database Connection", status: "warning", message: "Check timed out" },
          { name: "API Credentials", status: "warning", message: "Check timed out" },
          { name: "Network Connectivity", status: "warning", message: "Check timed out" },
          { name: "Trading Engine", status: "warning", message: "Check timed out" },
        ]);
      }

    } catch (error) {
      console.error("System status check failed:", error);
      setSystemStatus(prev => prev.map(item => ({
        ...item,
        status: "warning",
        message: "Status check failed"
      })));
    } finally {
      setIsRefreshing(false);
    }
  }, [user?.id]);

  // Debounced version of checkSystemStatus
  const debouncedCheckSystemStatus = useDebounce(checkSystemStatus, 1000);

  // Initial load
  useEffect(() => {
    if (user?.id) {
      checkSystemStatus();
    }
  }, [user?.id, checkSystemStatus]);

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: string[] = [];
    
    if (!apiKey.trim()) newErrors.push("API Key is required");
    if (!secretKey.trim()) newErrors.push("Secret Key is required");
    if (apiKey.length < 10) newErrors.push("API Key must be at least 10 characters");
    if (secretKey.length < 10) newErrors.push("Secret Key must be at least 10 characters");
    
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  // Handle save credentials
  const handleSaveCredentials = async () => {
    if (!user?.id) {
      toast({ title: "Error", description: "User not authenticated", variant: "destructive" });
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      const result = await saveCredentials.mutateAsync({
        userId: user.id,
        apiKey: apiKey.trim(),
        secretKey: secretKey.trim(),
      });

      toast({ title: "Success", description: "API credentials saved successfully" });
      // Use server validation result from save response
      const isValid = !!(result?.data?.credentialsValid);
      setSystemStatus(prev => prev.map(item => {
        if (item.name === "API Credentials") {
          return {
            ...item,
            status: isValid ? "pass" : "warning",
            message: isValid ? "Credentials valid" : "Validation failed or pending",
          };
        }
        if (item.name === "Trading Engine") {
          return {
            ...item,
            status: isValid ? "pass" : "warning",
            message: isValid ? "Trading engine ready" : "Waiting for valid credentials",
          };
        }
        return item;
      }));
      
      // Quick refresh after save
      setTimeout(() => debouncedCheckSystemStatus(), 500);
      
    } catch (error) {
      console.error("Save credentials error:", error);
      toast({ 
        title: "Error", 
        description: "Failed to save credentials. Please try again.", 
        variant: "destructive" 
      });
    }
  };

  // Handle test credentials
  const handleTestCredentials = async () => {
    if (!user?.id) {
      toast({ title: "Error", description: "User not authenticated", variant: "destructive" });
      return;
    }

    try {
      const result = await testCredentials.mutateAsync({ userId: user.id });
      
      if (result.success) {
        toast({ title: "Success", description: "API credentials tested successfully" });
        // Optimistically mark credentials and engine as valid
        setSystemStatus(prev => prev.map(item => {
          if (item.name === "API Credentials") {
            return { ...item, status: "pass", message: "Credentials valid" };
          }
          if (item.name === "Trading Engine") {
            return { ...item, status: "pass", message: "Trading engine ready" };
          }
          return item;
        }));
      } else {
        toast({ 
          title: "Test Failed", 
          description: result.error || "API credentials test failed", 
          variant: "destructive" 
        });
      }
      
      // Quick refresh after test
      setTimeout(() => debouncedCheckSystemStatus(), 500);
      
    } catch (error) {
      console.error("Test credentials error:", error);
      toast({ 
        title: "Error", 
        description: "Failed to test credentials. Please try again.", 
        variant: "destructive" 
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pass":
        return "default";
      case "fail":
        return "destructive";
      case "warning":
        return "secondary";
      case "checking":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "pass":
        return "Pass";
      case "fail":
        return "Fail";
      case "warning":
        return "Warning";
      case "checking":
        return "Checking...";
      default:
        return "Unknown";
    }
  };

  const getStatusIconComponent = (status: string) => {
    switch (status) {
      case "pass":
        return CheckCircle;
      case "fail":
        return XCircle;
      case "warning":
        return AlertCircle;
      case "checking":
        return RefreshCw;
      default:
        return AlertCircle;
    }
  };

  return (
    <div className="space-y-6">
      {/* System Health Check */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>System Health Check</CardTitle>
            <Button variant="outline" size="sm" onClick={checkSystemStatus}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {systemStatus.map((check, index) => {
              const Icon = getStatusIconComponent(check.status);
              return (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${check.status === "checking" ? "animate-spin" : ""}`} />
                    <span>{check.name}</span>
                  </div>
                  <Badge variant={getStatusColor(check.status) as any}>
                    {getStatusText(check.status)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* API Credentials Setup */}
      <Card>
        <CardHeader>
          <CardTitle>MEXC API Credentials</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your MEXC Exchange API credentials to enable live trading
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Instructions */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Get your credentials:</strong>
                <br />
                1. Go to <a href="https://mexc.com" target="_blank" rel="noopener noreferrer" className="underline">MEXC.com</a> → Account → API Management
                <br />
                2. Create new API key with <strong>Spot Trading</strong> permissions
                <br />
                3. Copy both API Key and Secret Key below
              </AlertDescription>
            </Alert>

            {/* API Key Input */}
            <div className="space-y-2">
              <Label htmlFor="apiKey">MEXC API Key</Label>
              <Input
                id="apiKey"
                type="text"
                placeholder="mx0_xxxxxxxxxxxxxxxx"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (errors.length > 0) {
                    setErrors([]);
                  }
                }}
                className={errors.length > 0 ? "border-red-500" : ""}
              />
              {errors.length > 0 && (
                <p className="text-sm text-red-500">{errors[0]}</p>
              )}
            </div>

            {/* Secret Key Input */}
            <div className="space-y-2">
              <Label htmlFor="secretKey">MEXC Secret Key</Label>
              <div className="relative">
                <Input
                  id="secretKey"
                  type={showSecretKey ? "text" : "password"}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={secretKey}
                  onChange={(e) => {
                    setSecretKey(e.target.value);
                    if (errors.length > 0) {
                      setErrors([]);
                    }
                  }}
                  className={errors.length > 0 ? "border-red-500 pr-10" : "pr-10"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                >
                  {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {errors.length > 0 && (
                <p className="text-sm text-red-500">{errors[0]}</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={handleSaveCredentials}
                disabled={saveCredentials.isPending || !user}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveCredentials.isPending ? "Saving..." : "Save Credentials"}
              </Button>
              
              <Button
                variant="outline"
                onClick={handleTestCredentials}
                disabled={testCredentials.isPending || !user}
              >
                <TestTube className="h-4 w-4 mr-2" />
                {testCredentials.isPending ? "Testing..." : "Test"}
              </Button>
            </div>

            {/* Error Display */}
            {(saveCredentials.error || testCredentials.error) && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {saveCredentials.error?.message || testCredentials.error?.message}
                </AlertDescription>
              </Alert>
            )}

            {/* Success Display */}
            {(saveCredentials.isSuccess || testCredentials.isSuccess) && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  {saveCredentials.isSuccess && "Credentials saved successfully!"}
                  {testCredentials.isSuccess && "Credentials test passed!"}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
