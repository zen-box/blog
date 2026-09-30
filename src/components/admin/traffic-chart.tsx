"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const config = {
  pv: { label: "浏览量", color: "var(--brand)" },
  uv: { label: "访客", color: "var(--ochre)" },
} satisfies ChartConfig;

export function TrafficChart({ data }: { data: { date: string; pv: number; uv: number }[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fill-pv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-pv)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-pv)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fill-uv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-uv)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-uv)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(d: string) => d.slice(5).replace("-", "/")}
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={48} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator="dot" labelFormatter={(d) => String(d)} />}
        />
        <Area
          dataKey="pv"
          type="monotone"
          fill="url(#fill-pv)"
          stroke="var(--color-pv)"
          strokeWidth={2}
          animationDuration={1100}
          animationEasing="ease-out"
        />
        <Area
          dataKey="uv"
          type="monotone"
          fill="url(#fill-uv)"
          stroke="var(--color-uv)"
          strokeWidth={2}
          animationDuration={1300}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ChartContainer>
  );
}
