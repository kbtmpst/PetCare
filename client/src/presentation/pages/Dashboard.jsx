import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ClipboardCheck, Clock, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageHeader from "../components/ui/PageHeader.jsx";
import Card from "../components/ui/Card.jsx";
import StatCard from "../components/ui/StatCard.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import { getDashboardData } from "../../business/services/dashboardService.js";
import {
  formatCurrency,
  formatLongDate,
  formatTime,
} from "../../business/utils/format.js";

const CHART_COLOR = "#4d6a50";
const GRID_COLOR = "#e4e8e4";
const TICK_STYLE = { fontSize: 12, fill: "#6b736d" };
const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #e4e8e4",
  fontSize: 12,
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getDashboardData()
      .then(setData)
      .catch(() => setError("Could not load the dashboard. Please try again."));
  }, []);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading dashboard...</p>;

  const { stats, schedule, monthlyRevenue, popularServices } = data;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={formatLongDate()} />

      {/* Stat cards: 2 columns on mobile and tablet/laptop, 4 columns on desktop (1280px+) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon={CalendarDays}
          label="Today's Appointments"
          value={stats.todayAppointments}
          hint={
            stats.todayCancelled > 0
              ? `${stats.todayCancelled} cancelled`
              : "None cancelled"
          }
        />
        <StatCard
          icon={Clock}
          label="Pending Appointments"
          value={stats.pendingAppointments}
          hint="Waiting for confirmation"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Completed Today"
          value={stats.completedToday}
          hint={`of ${stats.todayAppointments} scheduled`}
        />
        <StatCard
          icon={Wallet}
          label="Today's Revenue"
          value={formatCurrency(stats.todayRevenue)}
          hint="From completed services"
        />
      </div>

      {/* Schedule and popular services sit side by side from 1280px; they stack below that */}
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Card
            title="Today's Schedule"
            bodyClassName="p-0"
            action={
              <Link
                to="/appointments"
                className="py-1 text-sm font-medium text-sage-700 hover:text-sage-900"
              >
                View all
              </Link>
            }
          >
            {schedule.length === 0 ? (
              <p className="p-4 text-sm text-muted sm:p-5">
                No appointments scheduled for today.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {schedule.map((appointment) => (
                  // Mobile: time and status on the first line, pet details below.
                  // Tablet and up: everything on one row.
                  <li
                    key={appointment.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:flex-nowrap sm:px-5"
                  >
                    <span className="order-1 w-20 shrink-0 text-sm font-medium">
                      {formatTime(appointment.time)}
                    </span>
                    <div className="order-3 min-w-0 basis-full sm:order-2 sm:flex-1 sm:basis-0">
                      <p className="truncate text-sm font-medium">
                        {appointment.pet}
                        <span className="font-normal text-muted">
                          {" "}
                          · {appointment.breed}
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted">
                        {appointment.customer} · {appointment.service}
                      </p>
                    </div>
                    <div className="order-2 ml-auto sm:order-3 sm:ml-0">
                      <StatusBadge status={appointment.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Popular Services">
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={popularServices}
                layout="vertical"
                margin={{ left: 0, right: 16 }}
              >
                <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                <XAxis
                  type="number"
                  tick={TICK_STYLE}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={104}
                  tick={TICK_STYLE}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "#f3f6f3" }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [value, "Bookings"]}
                />
                <Bar
                  dataKey="count"
                  fill={CHART_COLOR}
                  radius={[0, 4, 4, 0]}
                  barSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 sm:mt-6">
        <Card title="Monthly Revenue (last 6 months)">
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenue} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={TICK_STYLE}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={TICK_STYLE}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `₱${value / 1000}k`}
                />
                <Tooltip
                  cursor={{ fill: "#f3f6f3" }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [formatCurrency(value), "Revenue"]}
                />
                <Bar
                  dataKey="revenue"
                  fill={CHART_COLOR}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}
