import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, AlertCircle } from "lucide-react";

interface CategoryMargin {
  categoryId: number;
  name: string;
  currentMargin: number;
  suggestedMargin: number;
  volume: number;
  competitorMargin: number;
  seasonalFactor: number;
  profitHistory: number[];
}

export default function MarginOptimization() {
  const [categories, setCategories] = useState<CategoryMargin[]>([
    { categoryId: 1, name: "Hidráulica", currentMargin: 18, suggestedMargin: 24, volume: 5000, competitorMargin: 22, seasonalFactor: 1.1, profitHistory: [15, 18, 20] },
    { categoryId: 2, name: "Pneumática", currentMargin: 15, suggestedMargin: 19, volume: 3000, competitorMargin: 18, seasonalFactor: 0.9, profitHistory: [12, 14, 15] },
    { categoryId: 3, name: "Elétrica", currentMargin: 22, suggestedMargin: 25, volume: 8000, competitorMargin: 24, seasonalFactor: 1.2, profitHistory: [20, 22, 24] },
  ]);

  const calculatePotentialIncrease = (current: number, suggested: number, volume: number) => {
    const avgPrice = 500;
    const currentRevenue = (avgPrice * (1 + current / 100) * volume) / 1000;
    const suggestedRevenue = (avgPrice * (1 + suggested / 100) * volume) / 1000;
    return ((suggestedRevenue - currentRevenue) / currentRevenue * 100).toFixed(1);
  };

  const applyMargin = (categoryId: number, newMargin: number) => {
    setCategories(prev => prev.map(cat => 
      cat.categoryId === categoryId ? { ...cat, currentMargin: newMargin } : cat
    ));
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Otimização de Margens</h1>
        <div className="text-sm text-muted-foreground">
          Atualizado em tempo real com dados de concorrentes
        </div>
      </div>

      <div className="grid gap-4">
        {categories.map(cat => {
          const increase = calculatePotentialIncrease(cat.currentMargin, cat.suggestedMargin, cat.volume);
          const shouldUpdate = cat.suggestedMargin > cat.currentMargin;

          return (
            <Card key={cat.categoryId} className={shouldUpdate ? "border-amber-200 bg-amber-50" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    {cat.name}
                    {shouldUpdate && <AlertCircle className="w-5 h-5 text-amber-600" />}
                  </CardTitle>
                  <div className="text-sm font-mono">Vol: {(cat.volume / 1000).toFixed(1)}k | Concorr: {cat.competitorMargin}%</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-slate-100 rounded">
                    <div className="text-xs text-muted-foreground">Margem Atual</div>
                    <div className="text-2xl font-bold">{cat.currentMargin}%</div>
                  </div>
                  <div className="p-3 bg-blue-100 rounded">
                    <div className="text-xs text-muted-foreground">Sugerida</div>
                    <div className="text-2xl font-bold text-blue-600">{cat.suggestedMargin}%</div>
                  </div>
                  <div className="p-3 bg-green-100 rounded">
                    <div className="text-xs text-muted-foreground">Ganho Potencial</div>
                    <div className="text-2xl font-bold text-green-600">+{increase}%</div>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Fator Sazonal:</span>
                    <span className="font-mono">{cat.seasonalFactor.toFixed(2)}x</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Histórico de Lucro:</span>
                    <span className="font-mono">{cat.profitHistory.join(" → ")}%</span>
                  </div>
                </div>

                {shouldUpdate && (
                  <Button 
                    onClick={() => applyMargin(cat.categoryId, cat.suggestedMargin)}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Aplicar Margem Sugerida
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
