import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type CategoryChartDatum = {
  name: string;
  fullName: string;
  count: number;
  color: string;
  categoryId: number | null;
  pct: number;
};

/**
 * Bloco de gráficos do Dashboard (recharts), extraído para carregamento
 * lazy — evita colocar a biblioteca recharts no bundle inicial da rota "/".
 */
export default function DashboardCharts({
  data,
  selectedCategoryId,
  onSelectCategory,
}: {
  data: CategoryChartDatum[];
  selectedCategoryId: number | null;
  onSelectCategory: (categoryId: number) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 60, top: 0, bottom: 0 }}>
        <XAxis type="number" tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value: number, _: string, props: any) => [
            `${value.toLocaleString("pt-BR")} produtos (${props.payload?.pct ?? 0}%)`,
            props.payload?.fullName ?? "",
          ]}
          contentStyle={{ fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 2 }}
        />
        <Bar dataKey="count" radius={[0, 3, 3, 0]} onClick={(d: { categoryId?: number }) => {
          if (d.categoryId) onSelectCategory(d.categoryId);
        }}
          label={{ position: "right", fontSize: 10, fill: "#6B7280", formatter: (v: number, props: any) => `${v.toLocaleString("pt-BR")} (${props?.pct ?? ""}%)` }}
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.color}
              opacity={selectedCategoryId ? (entry.categoryId === selectedCategoryId ? 1 : 0.3) : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
