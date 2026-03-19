// frontend/src/components/common/ProtectedRoute.jsx
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getUserRole } from "../../utils/role";

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const [status, setStatus] = useState("checking"); // "checking" | "allowed" | "denied" | "unauthenticated"

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setStatus("unauthenticated");
        return;
      }

      if (allowedRoles.length === 0) {
        // No role restriction — just needs to be logged in
        setStatus("allowed");
        return;
      }

      const role = await getUserRole(user.email);

      if (allowedRoles.includes(role)) {
        setStatus("allowed");
      } else {
        setStatus("denied");
      }
    };

    check();
  }, []);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white text-lg">
        Verifying access...
      </div>
    );
  }

  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  if (status === "denied") return <Navigate to="/" replace />;

  return children;
};

export default ProtectedRoute;