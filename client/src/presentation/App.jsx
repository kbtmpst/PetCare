import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/layout/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Appointments from "./pages/Appointments.jsx";
import Pets from "./pages/Pets.jsx";
import Customers from "./pages/Customers.jsx";
import Services from "./pages/Services.jsx";
import Transactions from "./pages/Transactions.jsx";
import ComingSoon from "./pages/ComingSoon.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />

        {/* These pages are built one at a time. Each ComingSoon line gets replaced by the real page. */}
        <Route path="appointments" element={<Appointments />} />
        <Route path="pets" element={<Pets />} />
        <Route path="customers" element={<Customers />} />
        <Route path="services" element={<Services />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="analytics" element={<ComingSoon title="Analytics" />} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
