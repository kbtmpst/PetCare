import { useEffect, useState } from "react";
import { CalendarDays, ClipboardCheck, Users, Wallet } from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import StatCard from "../components/ui/StatCard.jsx";
import DateRangeFilter from "../components/analytics/DateRangeFilter.jsx";
import ChartCard from "../components/analytics/ChartCard.jsx";
import TrendChart from "../components/analytics/TrendChart.jsx";
import HorizontalBarChart from "../components/analytics/HorizontalBarChart.jsx";
import {
  DATE_RANGE_PRESETS,
  DEFAULT_DATE_FILTER,
  getAnalytics,
  resolveDateRange,
} from "../../business/services/analyticsService.js";
import { formatCurrency, pluralize } from "../../business/utils/format.js";

// The same colours as the status badges used on the Appointments page.
const STATUS_COLORS = {
  Pending: "#d97706",
  Confirmed: "#0284c7",
  "In Progress": "#7c3aed",
  Completed: "#059669",
  Cancelled: "#78716c",
};

// Axis text for money: 1500 -> "₱1.5k", 450 -> "₱450"
function formatMoneyTick(value) {
  return value >= 1000 ? `₱${value / 1000}k` : `₱${value}`;
}

export default function Analytics() {
  // ---- STATE: everything this page needs to remember --------------------------------------------
  const [filter, setFilter] = useState(DEFAULT_DATE_FILTER); // { preset, start, end }
  const [data, setData] = useState(null); // the analytics for the last valid range
  const [loadError, setLoadError] = useState("");

  // Is the chosen range valid? (Only a half-filled or backwards custom range is not.)
  const resolved = resolveDateRange(filter);
  const filterError = resolved.ok ? "" : resolved.error;

  // ---- Load the analytics again every time the date range changes -------------------------------
  useEffect(() => {
    const check = resolveDateRange(filter);
    if (!check.ok) return; // invalid dates: keep showing the last valid range and show the message

    let cancelled = false; // ignore an old answer if the user already picked another range
    getAnalytics(check.range)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadError("");
      })
      .catch(() => {
        if (!cancelled)
          setLoadError("Could not load analytics. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  // ---- Filter actions ---------------------------------------------------------------------------
  function handlePresetChange(preset) {
    if (preset === "custom" && data) {
      // Start the custom range from the range that is on screen, so the charts keep working right away.
      setFilter({ preset, start: data.range.start, end: data.range.end });
    } else {
      setFilter({ ...filter, preset });
    }
  }

  function handleDateChange(field, value) {
    setFilter({ ...filter, [field]: value });
  }

  // ---- Loading and error screens ----------------------------------------------------------------
  if (loadError) return <p className="text-sm text-red-700">{loadError}</p>;
  if (!data) return <p className="text-sm text-muted">Loading analytics...</p>;

  const { stats, has } = data;
  const trendPeriod = { day: "day", week: "week", month: "month" }[
    data.granularity
  ];

  // The payment chart shows how many payments each bar stands for: "Cash · 2 payments".
  const paymentBars = data.paymentBreakdown.map((entry) => ({
    name: `${entry.name} · ${pluralize(entry.count, "payment")}`,
    value: entry.value,
  }));

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Appointment trends, revenue, popular services and customer activity."
      />

      <DateRangeFilter
        filter={filter}
        presets={DATE_RANGE_PRESETS}
        rangeLabel={data.range.label}
        error={filterError}
        onPresetChange={handlePresetChange}
        onDateChange={handleDateChange}
      />

      {/* Summary cards: 2 columns on phones, tablets and laptops, 4 columns on desktop. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          hint={
            stats.paidCount > 0
              ? `${pluralize(stats.paidCount, "paid transaction")} · avg ${formatCurrency(stats.averageTransaction)}`
              : "No paid transactions"
          }
        />
        <StatCard
          icon={CalendarDays}
          label="Total Appointments"
          value={stats.totalAppointments}
          hint="In the selected range"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Completed Appointments"
          value={stats.completedAppointments}
          hint={
            stats.totalAppointments > 0
              ? `${stats.completionRate}% of appointments`
              : "No appointments"
          }
        />
        <StatCard
          icon={Users}
          label="Total Customers"
          value={stats.totalCustomers}
          hint={`${stats.newCustomers} new in this range`}
        />
      </div>

      {/* Charts: one column on phones and tablets, two columns on desktop. */}
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-2">
        <ChartCard
          title="Revenue Trend"
          description={`Paid transactions by ${trendPeriod}, counted on the day they were paid.`}
          isEmpty={!has.revenue}
          emptyMessage="No paid transactions in this date range."
        >
          <TrendChart
            kind="area"
            data={data.revenueTrend}
            seriesName="Revenue"
            formatValue={formatCurrency}
            formatTick={formatMoneyTick}
          />
        </ChartCard>

        <ChartCard
          title="Appointment Trend"
          description={`Appointments by ${trendPeriod}.`}
          isEmpty={!has.appointments}
          emptyMessage="No appointments in this date range."
        >
          <TrendChart
            kind="bar"
            data={data.appointmentTrend}
            seriesName="Appointments"
            formatValue={(value) => value}
          />
        </ChartCard>

        <ChartCard
          title="Popular Services"
          description="Most booked services. Cancelled appointments are not counted."
          isEmpty={!has.popularServices}
          emptyMessage="No bookings in this date range."
        >
          <HorizontalBarChart
            data={data.popularServices}
            seriesName="Bookings"
          />
        </ChartCard>

        <ChartCard
          title="Appointment Status"
          description="All appointments in the range, by status."
          isEmpty={!has.appointments}
          emptyMessage="No appointments in this date range."
        >
          <HorizontalBarChart
            data={data.statusBreakdown}
            seriesName="Appointments"
            colors={STATUS_COLORS}
          />
        </ChartCard>

        <ChartCard
          title="Payment Breakdown"
          description="Paid transactions by payment method."
          isEmpty={!has.payments}
          emptyMessage="No paid transactions in this date range."
          heightClass="h-44 sm:h-52"
          className="xl:col-span-2"
        >
          <HorizontalBarChart
            data={paymentBars}
            seriesName="Paid"
            formatValue={formatCurrency}
          />
        </ChartCard>
      </div>
    </>
  );
}
