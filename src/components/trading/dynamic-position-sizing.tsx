/**
 * Dynamic Position Sizing Component
 *
 * Provides UI for calculating and managing dynamic position sizes
 * based on user balance and risk management.
 */

import React, { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Slider } from "@/src/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { useDynamicPositionSizing } from "@/src/hooks/use-dynamic-position-sizing";
import type { PositionSizingConfig } from "@/src/services/trading/dynamic-position-sizing";

export function DynamicPositionSizing() {
  const { calculatePositionSize, updatePositionSize, isLoading, error, lastCalculation } =
    useDynamicPositionSizing();

  const [customConfig, setCustomConfig] = useState<Partial<PositionSizingConfig>>({
    maxRiskPerTrade: 2.0,
    minPositionSize: 10,
    maxPositionSize: 1000,
    reserveRatio: 0.2,
  });

  const [manualPositionSize, setManualPositionSize] = useState<string>("100");

  // Calculate on mount and when config changes
  useEffect(() => {
    calculatePositionSize(customConfig);
  }, []); // Only on mount

  const handleRecalculate = async () => {
    await calculatePositionSize(customConfig);
  };

  const handleUpdatePositionSize = async () => {
    const size = parseFloat(manualPositionSize);
    if (size >= 10 && size <= 10000) {
      const success = await updatePositionSize(size);
      if (success) {
        await handleRecalculate(); // Refresh calculation
      }
    }
  };

  const getRiskLevelColor = (riskPercent: number) => {
    if (riskPercent <= 2) return "text-green-600";
    if (riskPercent <= 5) return "text-yellow-600";
    return "text-red-600";
  };

  const getRiskLevelBadge = (riskPercent: number) => {
    if (riskPercent <= 2) return "Low Risk";
    if (riskPercent <= 5) return "Medium Risk";
    return "High Risk";
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dynamic Position Sizing</CardTitle>
          <CardDescription>
            Calculate optimal position sizes based on your balance and risk management rules
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className="mb-4 border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="calculate" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="calculate">Calculate</TabsTrigger>
              <TabsTrigger value="manual">Manual Set</TabsTrigger>
            </TabsList>

            <TabsContent value="calculate" className="space-y-6">
              {/* Configuration Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="maxRiskPerTrade">
                      Max Risk per Trade: {customConfig.maxRiskPerTrade}%
                    </Label>
                    <Slider
                      id="maxRiskPerTrade"
                      min={0.5}
                      max={10}
                      step={0.5}
                      value={[customConfig.maxRiskPerTrade || 2]}
                      onValueChange={([value]) =>
                        setCustomConfig((prev) => ({ ...prev, maxRiskPerTrade: value }))
                      }
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="minPositionSize">
                      Min Position Size: ${customConfig.minPositionSize}
                    </Label>
                    <Slider
                      id="minPositionSize"
                      min={5}
                      max={100}
                      step={5}
                      value={[customConfig.minPositionSize || 10]}
                      onValueChange={([value]) =>
                        setCustomConfig((prev) => ({ ...prev, minPositionSize: value }))
                      }
                      className="mt-2"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="maxPositionSize">
                      Max Position Size: ${customConfig.maxPositionSize}
                    </Label>
                    <Slider
                      id="maxPositionSize"
                      min={100}
                      max={5000}
                      step={100}
                      value={[customConfig.maxPositionSize || 1000]}
                      onValueChange={([value]) =>
                        setCustomConfig((prev) => ({ ...prev, maxPositionSize: value }))
                      }
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="reserveRatio">
                      Reserve Ratio: {((customConfig.reserveRatio || 0.2) * 100).toFixed(0)}%
                    </Label>
                    <Slider
                      id="reserveRatio"
                      min={0.1}
                      max={0.5}
                      step={0.05}
                      value={[customConfig.reserveRatio || 0.2]}
                      onValueChange={([value]) =>
                        setCustomConfig((prev) => ({ ...prev, reserveRatio: value }))
                      }
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleRecalculate} disabled={isLoading} className="w-full">
                {isLoading ? "Calculating..." : "Recalculate Position Size"}
              </Button>

              {/* Results */}
              {lastCalculation && (
                <div className="space-y-4">
                  <Card className="border-blue-200 bg-blue-50">
                    <CardHeader>
                      <CardTitle className="text-lg">Recommended Position Size</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-blue-800 mb-4">
                        ${lastCalculation.recommendedSize.toFixed(2)} USDT
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Available Balance:</span>
                          <div className="font-semibold">
                            ${lastCalculation.availableBalance.toFixed(2)} USDT
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-600">Risk Amount:</span>
                          <div className="font-semibold">
                            ${lastCalculation.riskAmount.toFixed(2)} USDT
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-600">Risk Percentage:</span>
                          <div
                            className={`font-semibold ${getRiskLevelColor(lastCalculation.riskPercent)}`}
                          >
                            {lastCalculation.riskPercent.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-600">Risk Level:</span>
                          <div>
                            <Badge
                              variant={
                                lastCalculation.riskPercent <= 2
                                  ? "default"
                                  : lastCalculation.riskPercent <= 5
                                    ? "secondary"
                                    : "destructive"
                              }
                            >
                              {getRiskLevelBadge(lastCalculation.riskPercent)}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 p-3 bg-blue-100 rounded text-sm text-blue-800">
                        <strong>Calculation:</strong> {lastCalculation.reasoning}
                      </div>

                      {lastCalculation.warnings.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {lastCalculation.warnings.map((warning, index) => (
                            <Alert key={index} className="border-yellow-200 bg-yellow-50">
                              <AlertDescription className="text-yellow-800">
                                ⚠️ {warning}
                              </AlertDescription>
                            </Alert>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual" className="space-y-4">
              <div>
                <Label htmlFor="manualPositionSize">Default Position Size (USDT)</Label>
                <Input
                  id="manualPositionSize"
                  type="number"
                  min="10"
                  max="10000"
                  step="10"
                  value={manualPositionSize}
                  onChange={(e) => setManualPositionSize(e.target.value)}
                  className="mt-2"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Set your default position size for all trades (min: $10, max: $10,000)
                </p>
              </div>

              <Button onClick={handleUpdatePositionSize} disabled={isLoading} className="w-full">
                {isLoading ? "Updating..." : "Update Default Position Size"}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
