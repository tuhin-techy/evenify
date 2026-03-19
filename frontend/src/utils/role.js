// frontend/src/utils/role.js
import { supabase } from "../lib/supabaseClient";

/**
 * Determine the role of a Supabase auth user.
 * Returns: "student" | "management" | "admin" | "outsider" | null
 *
 * Logic:
 *  - @somaiya.edu → check students, management, admin tables in order
 *  - @gmail.com   → outsider
 *  - anything else → null (denied)
 */
export const getUserRole = async (email) => {
  if (!email) return null;

  if (email.endsWith("@somaiya.edu")) {
    // Check students
    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (student) return "student";

    // Check management
    const { data: mgmt } = await supabase
      .from("management")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (mgmt) return "management";

    // Check admin
    const { data: adm } = await supabase
      .from("admin")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (adm) return "admin";

    // Somaiya email but not in any table
    return "denied";
  }

  if (email.endsWith("@gmail.com")) {
    return "outsider"; // treated as student-level
  }

  return null; // unknown domain
};

/**
 * Fetch the full profile of a user from the correct table.
 * Returns { profile, role } or null.
 */
export const getUserProfile = async (email) => {
  if (!email) return null;

  if (email.endsWith("@somaiya.edu")) {
    const { data: student } = await supabase
      .from("students").select("*").eq("email", email).maybeSingle();
    if (student) return { profile: student, role: "student" };

    const { data: mgmt } = await supabase
      .from("management").select("*").eq("email", email).maybeSingle();
    if (mgmt) return { profile: mgmt, role: "management" };

    const { data: adm } = await supabase
      .from("admin").select("*").eq("email", email).maybeSingle();
    if (adm) return { profile: adm, role: "admin" };

    return { profile: null, role: "denied" };
  }

  if (email.endsWith("@gmail.com")) {
    const { data: outsider } = await supabase
      .from("outsiders").select("*").eq("email", email).maybeSingle();
    return { profile: outsider ?? null, role: "outsider" };
  }

  return null;
};