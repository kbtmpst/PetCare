import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLOR = "#4d6a50";
const GRID_COLOR = "#e4e8e4";
const TICK_STYLE = { fontSize: 12, fill: "#6b736d" };
const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #e4e8e4",
  fontSize: 12,
};

// One chart over time: an area chart (for revenue) or a bar chart (for appointment counts).
//   data:        [{ label, tooltipLabel, value }]  one entry per day / week / month
//   kind:        "area" | "bar"
//   seriesName:  the name shown in the tooltip, for example "Revenue"
//   formatValue: how to show a value in the tooltip (for example formatCurrency)
//   formatTick:  how to show a value on the vertical axis
export default function TrendChart({
  data,
  kind = "bar",
  seriesName,
  formatValue,
  formatTick,
}) {
  // The tooltip shows the full date ("Week of Nov 24, 2026") instead of the short axis label.
  const labelFormatter = (label, payload) =>
    payload && payload[0] ? payload[0].payload.tooltipLabel : label;
  const tooltipFormatter = (value) => [formatValue(value), seriesName];

  const axes = (
    <>
      <CartesianGrid stroke={GRID_COLOR} vertical={false} />
      <XAxis
        dataKey="label"
        tick={TICK_STYLE}
        axisLine={false}
        tickLine={false}
        minTickGap={16}
      />
      <YAxis
        tick={TICK_STYLE}
        axisLine={false}
        tickLine={false}
        width={48}
        allowDecimals={false}
        tickFormatter={formatTick}
      />
      <Tooltip
        cursor={{ fill: "#f3f6f3" }}
        contentStyle={TOOLTIP_STYLE}
        labelFormatter={labelFormatter}
        formatter={tooltipFormatter}
      />
    </>
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      {kind === "area" ? (
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 4 }}>
          {axes}
          <Area
            type="monotone"
            dataKey="value"
            name={seriesName}
            stroke={CHART_COLOR}
            strokeWidth={2}
            fill={CHART_COLOR}
            fillOpacity={0.15}
            dot={data.length <= 31 ? { r: 3, fill: CHART_COLOR } : false}
          />
        </AreaChart>
      ) : (
        <BarChart data={data} margin={{ left: 0, right: 8, top: 4 }}>
          {axes}
          <Bar
            dataKey="value"
            name={seriesName}
            fill={CHART_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
