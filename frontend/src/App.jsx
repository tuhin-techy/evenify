import { Routes, Route } from "react-router-dom";

import Home from "./pages/layer1/Home";
import Events from "./pages/layer1/Events";
import StudentDetails from "./pages/layer1/StudentDetails";
import Payment from "./pages/layer1/Payment";
import MyTickets from "./pages/layer1/MyTickets";
import Login from "./pages/layer1/Login";
import Support from "./pages/layer1/Support";
import Profile from "./pages/layer1/Profile";

import Dashboard from "./pages/layer3/Dashboard";
import Students from "./pages/layer3/Students";
import Guests from "./pages/layer3/Guests";
import Managements from "./pages/layer3/Managements";
import Creator from "./pages/layer2/Creator";
import SuccessfulEvents from "./pages/layer2/SuccessfulEvents";
import CancelledEvents from "./pages/layer2/CancelledEvents";
import Statistics from "./pages/layer2/Statistics";

import ProtectedRoute from "./components/common/ProtectedRoute";
import Navbar from "./components/common/Navbar";
import Footer from "./components/common/Footer";

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        {/* ── PUBLIC ── */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/support" element={<Support />} />

        {/* ── EVENTS ── */}
        <Route
          path="/events"
          element={
            <ProtectedRoute>
              <Events />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:id"
          element={
            <ProtectedRoute>
              <Events />
            </ProtectedRoute>
          }
        />

        {/* ── LAYER 1 PROTECTED ── */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:id/details"
          element={
            <ProtectedRoute>
              <StudentDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:id/payment"
          element={
            <ProtectedRoute>
              <Payment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-tickets"
          element={
            <ProtectedRoute>
              <MyTickets />
            </ProtectedRoute>
          }
        />

        {/* ── LAYER 2 PROTECTED ── */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/students"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Students />
            </ProtectedRoute>
          }
        />
        <Route
          path="/guests"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Guests />
            </ProtectedRoute>
          }
        />
        <Route
          path="/managements"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Managements />
            </ProtectedRoute>
          }
        />
        <Route
          path="/creator"
          element={
            <ProtectedRoute allowedRoles={["management"]}>
              <Creator />
            </ProtectedRoute>
          }
        />
        <Route
          path="/successful"
          element={
            <ProtectedRoute allowedRoles={["management"]}>
              <SuccessfulEvents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cancelled"
          element={
            <ProtectedRoute allowedRoles={["management"]}>
              <CancelledEvents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/statistics/:eventUid"
          element={
            <ProtectedRoute allowedRoles={["management"]}>
              <Statistics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/statistics"
          element={
            <ProtectedRoute allowedRoles={["management"]}>
              <Statistics />
            </ProtectedRoute>
          }
        />
      </Routes>

      <Footer />
    </>
  );
}

export default App;
