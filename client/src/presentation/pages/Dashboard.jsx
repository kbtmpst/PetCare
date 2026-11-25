import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ClipboardCheck,
  Clock,
  PawPrint,
  Users,
  Wallet,
} from "lucide-react";
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
import AppointmentList from "../components/dashboard/AppointmentList.jsx";
import { getDashboardData } from "../../business/services/dashboardService.js";
import { formatCurrency, formatLongDate } from "../../business/utils/format.js";

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

  const {
    stats,
    schedule,
    upcoming,
    recent,
    monthlyRevenue,
    popularServices,
    hasRevenue,
    hasPopularServices,
  } = data;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={formatLongDate()} />

      {/* Stat cards: 2 columns on mobile, tablet and laptop, 3 columns on desktop (1280px+) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
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
          icon={Users}
          label="Total Customers"
          value={stats.totalCustomers}
          hint="Registered pet owners"
        />
        <StatCard
          icon={PawPrint}
          label="Total Pets"
          value={stats.totalPets}
          hint="Registered pets"
        />
        <StatCard
          icon={Wallet}
          label="Today's Revenue"
          value={formatCurrency(stats.todayRevenue)}
          hint={`${formatCurrency(stats.totalRevenue)} total paid`}
        />
      </div>

      {/* Today's schedule and popular services sit side by side from 1280px; they stack below that */}
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
            <AppointmentList
              appointments={schedule}
              emptyMessage="No appointments scheduled for today."
            />
          </Card>
        </div>

        <Card title="Popular Services (last 6 months)">
          {!hasPopularServices ? (
            <p className="py-10 text-center text-sm text-muted">
              No bookings in the last 6 months.
            </p>
          ) : (
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
          )}
        </Card>
      </div>

      {/* Upcoming (later days) and recent (earlier days) appointments */}
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-2">
        <Card title="Upcoming Appointments" bodyClassName="p-0">
          <AppointmentList
            appointments={upcoming}
            showDate
            emptyMessage="No upcoming appointments."
          />
        </Card>

        <Card title="Recent Appointments" bodyClassName="p-0">
          <AppointmentList
            appointments={recent}
            showDate
            emptyMessage="No recent appointments yet."
          />
        </Card>
      </div>

      <div className="mt-4 sm:mt-6">
        <Card title="Monthly Revenue (last 6 months)">
          {!hasRevenue ? (
            <p className="py-10 text-center text-sm text-muted">
              No paid transactions in the last 6 months.
            </p>
          ) : (
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
                    tickFormatter={(value) => formatCurrency(value)}
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
          )}
        </Card>
      </div>
    </>
  );
}
