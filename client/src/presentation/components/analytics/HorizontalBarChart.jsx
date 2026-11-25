import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

// A horizontal bar chart: one bar per row, the name on the left. Used for popular services, appointment
// statuses and payment methods.
//   data:        [{ name, value }]
//   seriesName:  the name shown in the tooltip, for example "Bookings"
//   formatValue: how to show a value in the tooltip and axis (for example formatCurrency). Defaults to the number.
//   colors:      optional { name: "#hex" } to give each bar its own colour (used for the statuses)
export default function HorizontalBarChart({
  data,
  seriesName,
  formatValue = (value) => value,
  colors,
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
        <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
        <XAxis
          type="number"
          tick={TICK_STYLE}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          tickFormatter={formatValue}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={112}
          tick={TICK_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "#f3f6f3" }}
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => [formatValue(value), seriesName]}
        />
        <Bar
          dataKey="value"
          name={seriesName}
          fill={CHART_COLOR}
          radius={[0, 4, 4, 0]}
          barSize={18}
        >
          {colors &&
            data.map((entry) => (
              <Cell key={entry.name} fill={colors[entry.name] || CHART_COLOR} />
            ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
