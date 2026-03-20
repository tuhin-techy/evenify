import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getUserProfile } from "../../utils/role";
import heroBg from "../../assets/images/hero.jpg";

// ── Options ──────────────────────────────────────────────────────
const OUTSIDER_DEPARTMENTS = [
  "School",
  "Science",
  "Commerce",
  "Arts",
  "Sports",
];
const OUTSIDER_PROGRAM_LEVELS = [
  "11th",
  "12th",
  "Undergraduate (UG)",
  "Postgraduate (PG)",
  "Diploma",
  "Postgraduate Diploma (PGD)",
  "Doctor of Philosophy (PhD)",
];

// ── Normalize Google photo URL (handles partial CDN paths) ────────
const normalizePhotoUrl = (url) => {
  const raw = (url || "").trim();
  if (!raw) return null;

  const absolute =
    raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `https://lh3.googleusercontent.com/a/${raw}`;

  // Request a higher resolution variant when Google size params are present.
  let upgraded = absolute.replace(/=s\d+(-c)?/gi, "=s2048");
  upgraded = upgraded.replace(/[?&]sz=\d+/gi, "?sz=2048");

  return upgraded;
};

// ── Table name from role ─────────────────────────────────────────
const tableFor = (role) =>
  ({
    student: "students",
    outsider: "outsiders",
    management: "management",
    admin: "admin",
  })[role] ?? null;

// ── Role badge config ────────────────────────────────────────────
const ROLE_BADGE = {
  student: {
    label: "Student",
    cls: "bg-green-500/20 text-green-700 border-green-300",
  },
  outsider: {
    label: "Guest",
    cls: "bg-blue-500/20  text-blue-700  border-blue-300",
  },
  management: {
    label: "Management",
    cls: "bg-purple-500/20 text-purple-700 border-purple-300",
  },
  admin: {
    label: "Admin",
    cls: "bg-amber-500/20 text-amber-700 border-amber-300",
  },
};

// ════════════════════════════════════════════════════════════════
//  Main Component
// ════════════════════════════════════════════════════════════════
const Profile = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bgError, setBgError] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [photoImgErr, setPhotoImgErr] = useState(false);

  // Auth + profile state
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);

  // Editable fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [programLevel, setProgramLevel] = useState("");

  // Field errors
  const [nameErr, setNameErr] = useState("");
  const [phoneErr, setPhoneErr] = useState("");
  const [deptErr, setDeptErr] = useState("");
  const [progErr, setProgErr] = useState("");

  // ── Load profile on mount ──
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }

      setAuthUser(user);
      const result = await getUserProfile(user.email);

      if (!result || result.role === "denied") {
        navigate("/");
        return;
      }

      setRole(result.role);
      setProfile(result.profile);
      setName(result.profile?.name || "");
      setPhone(result.profile?.phone || "");
      setDepartment(result.profile?.department || "");
      setProgramLevel(result.profile?.program_level || "");
      setLoading(false);
    };
    load();
  }, [navigate]);

  // ── Name real-time validation ──
  const validateName = (val) => {
    if (!val.trim()) {
      setNameErr("Name is required");
      return false;
    }
    setNameErr("");
    return true;
  };

  // ── Phone real-time validation ──
  const validatePhone = (val) => {
    if (!val) {
      setPhoneErr("Phone number is required");
      return false;
    }
    if (!/^[0-9]{10}$/.test(val)) {
      setPhoneErr("Enter a valid 10-digit phone number");
      return false;
    }
    setPhoneErr("");
    return true;
  };

  const validatePhoneDuplicate = async (val) => {
    const normalized = (val || "").trim();
    const table = tableFor(role);

    if (!table || !authUser?.email) return false;
    if (!/^[0-9]{10}$/.test(normalized)) return false;

    const { data, error } = await supabase
      .from(table)
      .select("email")
      .eq("phone", normalized)
      .neq("email", authUser.email)
      .limit(1);

    if (error) return false;

    if (data && data.length > 0) {
      setPhoneErr(
        "This phone number is already registered. Use a different number.",
      );
      return true;
    }

    return false;
  };

  // ── Save / Update ──
  const handleUpdate = async () => {
    setSuccessMsg("");
    let hasError = false;

    if (isManualLogin && !validateName(name)) hasError = true;
    if (!validatePhone(phone)) hasError = true;

    if (role === "outsider") {
      if (!department) {
        setDeptErr("Please select your department");
        hasError = true;
      } else setDeptErr("");
      if (!programLevel) {
        setProgErr("Please select your program level");
        hasError = true;
      } else setProgErr("");
    }

    if (!hasError) {
      const isDuplicatePhone = await validatePhoneDuplicate(phone);
      if (isDuplicatePhone) hasError = true;
    }

    if (hasError) return;

    setSaving(true);
    const table = tableFor(role);
    const updates = { phone };
    if (isManualLogin) updates.name = name.trim();
    if (role === "outsider") {
      updates.department = department;
      updates.program_level = programLevel;
    }

    const { error } = await supabase
      .from(table)
      .update(updates)
      .eq("email", authUser.email);

    if (error) {
      setSaving(false);
      if (error.code === "23505") {
        setPhoneErr(
          "This phone number is already registered. Use a different number.",
        );
      } else {
        setPhoneErr(error.message);
      }
      return;
    }

    // Sync name into Supabase Auth metadata so Navbar picks it up immediately
    if (isManualLogin) {
      await supabase.auth.updateUser({ data: { name: name.trim() } });
    }

    setSaving(false);
    setProfile((prev) => ({ ...prev, ...updates }));
    setSuccessMsg("Profile updated successfully!");
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  // ── Loading screen ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white text-lg">
        Loading profile...
      </div>
    );
  }

  // ── Derived values ──
  const isManualLogin = authUser?.app_metadata?.provider === "email";
  const displayName =
    profile?.name ||
    authUser?.user_metadata?.name ||
    authUser?.user_metadata?.full_name ||
    "—";
  const displayEmail = authUser?.email || "—";
  const displayIdCard = profile?.id_card_number || "—";
  const displayDept = profile?.department || "—";
  const displayProg = profile?.program_level || "—";
  const badge = ROLE_BADGE[role] || ROLE_BADGE.outsider;

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      {/* ── Background ── */}
      {!bgError ? (
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroBg})` }}
          />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <img
            src={heroBg}
            alt=""
            className="hidden"
            onError={() => setBgError(true)}
          />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900 via-gray-900 to-black z-0" />
      )}

      {/* ── Glow ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute w-[600px] h-[600px] bg-purple-600/30 rounded-full blur-[140px] animate-pulse top-[-200px] left-[-200px]" />
        <div className="absolute w-[500px] h-[500px] bg-pink-500/30 rounded-full blur-[140px] animate-pulse bottom-[-200px] right-[-200px]" />
      </div>

      {/* ── Header ── */}
      <div className="relative z-20 py-28 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-5xl md:text-6xl font-extrabold"
        >
          My Profile
        </motion.h1>
      </div>

      {/* ── Profile Card ── */}
      <div className="relative z-20 max-w-5xl mx-auto px-6 -mt-20 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-10 border border-white/30 text-gray-900"
        >
          {/* Role badge */}
          <div className="flex justify-end mb-4">
            <span
              className={`text-sm font-semibold px-4 py-1.5 rounded-full border ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            {/* ── LEFT: fields ── */}
            <div className="order-2 md:order-1 md:col-span-2 space-y-5">
              {/* Name — editable only for manual (email/password) login */}
              {isManualLogin ? (
                <div>
                  <label className="block mb-2 font-semibold text-gray-700">
                    Name *
                  </label>
                  <input
                    type="text"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      validateName(e.target.value);
                    }}
                    className={`w-full border rounded-lg p-3 focus:outline-none focus:ring-2 transition
                      ${
                        nameErr
                          ? "border-red-400 focus:ring-red-300"
                          : "border-gray-300 focus:ring-purple-500"
                      }`}
                  />
                  {nameErr && (
                    <p className="text-red-500 text-sm mt-1">{nameErr}</p>
                  )}
                </div>
              ) : (
                <ROField label="Name" value={displayName} />
              )}

              {/* ID Card Number — student + management only */}
              {(role === "student" || role === "management") && (
                <ROField label="ID Card Number" value={displayIdCard} />
              )}

              {/* Email — all roles, always readonly */}
              <ROField label="Email Address" value={displayEmail} />

              {/* Department */}
              {role === "student" && (
                <ROField label="Department" value={displayDept} />
              )}
              {role === "outsider" && (
                <DropField
                  label="Department *"
                  value={department}
                  options={OUTSIDER_DEPARTMENTS}
                  error={deptErr}
                  onChange={(v) => {
                    setDepartment(v);
                    setDeptErr("");
                  }}
                />
              )}

              {/* Program Level */}
              {role === "student" && (
                <ROField label="Program Level" value={displayProg} />
              )}
              {role === "outsider" && (
                <DropField
                  label="Program Level *"
                  value={programLevel}
                  options={OUTSIDER_PROGRAM_LEVELS}
                  error={progErr}
                  onChange={(v) => {
                    setProgramLevel(v);
                    setProgErr("");
                  }}
                />
              )}

              {/* Phone — editable for all roles */}
              <div>
                <label className="block mb-2 font-semibold text-gray-700">
                  Phone Number
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setPhone(val);
                    validatePhone(val);
                  }}
                  onBlur={async () => {
                    if (validatePhone(phone)) {
                      await validatePhoneDuplicate(phone);
                    }
                  }}
                  className={`w-full border rounded-lg p-3 focus:outline-none focus:ring-2 transition
                    ${
                      phoneErr
                        ? "border-red-400 focus:ring-red-300"
                        : "border-gray-300 focus:ring-purple-500"
                    }`}
                />
                {phoneErr && (
                  <p className="text-red-500 text-sm mt-1">{phoneErr}</p>
                )}
              </div>
            </div>

            {/* ── RIGHT: photo (read-only, from Google account) ── */}
            <div className="order-1 md:order-2 flex flex-col items-center gap-4">
              {normalizePhotoUrl(
                profile?.photo_url ||
                  authUser?.user_metadata?.avatar_url ||
                  authUser?.user_metadata?.picture,
              ) && !photoImgErr ? (
                <img
                  src={normalizePhotoUrl(
                    profile?.photo_url ||
                      authUser?.user_metadata?.avatar_url ||
                      authUser?.user_metadata?.picture,
                  )}
                  alt="Profile"
                  referrerPolicy="no-referrer"
                  decoding="async"
                  loading="eager"
                  className="w-40 h-40 rounded-full object-cover border-4 border-purple-500 shadow-xl"
                  onError={() => setPhotoImgErr(true)}
                />
              ) : (
                <div className="w-40 h-40 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white text-5xl font-bold border-4 border-purple-500 shadow-xl">
                  {(isManualLogin ? name : displayName)[0]?.toUpperCase() ||
                    "?"}
                </div>
              )}
            </div>
          </div>

          {/* ── Success message ── */}
          <AnimatePresence>
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-6 text-center text-green-700 font-semibold bg-green-50 border border-green-200 rounded-xl py-3 px-6"
              >
                ✅ {successMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Save button ── */}
          <div className="mt-10 flex gap-6 flex-wrap">
            <motion.button
              whileHover={{ scale: saving ? 1 : 1.03 }}
              whileTap={{ scale: saving ? 1 : 0.97 }}
              onClick={handleUpdate}
              disabled={saving}
              className={`px-10 py-4 rounded-full text-lg font-semibold shadow-2xl text-white transition
                ${
                  saving
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                }`}
            >
              {saving ? "Saving..." : "Update Profile"}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/");
              }}
              className="px-10 py-4 rounded-full text-lg font-semibold shadow-lg text-white bg-gray-800 hover:bg-gray-700 transition"
            >
              Logout
            </motion.button>
          </div>

          {/* ── Disclaimer ── */}
          <div className="mt-10 text-sm text-gray-500 leading-relaxed border-t pt-6">
            <strong>Note:</strong>{" "}
            {role === "outsider" &&
              (isManualLogin
                ? "Name, Department, Program Level, and Phone number can be updated anytime from this page. Email cannot be changed here."
                : "Name and Email are linked to your Google account and cannot be edited here. Department, Program Level, and Phone number can be updated anytime from this page.")}
            {role === "student" &&
              "Name, Email, ID Card Number, Department, and Program Level are fetched directly from the university system and cannot be modified here. Only Phone number can be updated. For any corrections to other details, please contact support."}
            {role === "management" &&
              "Name, Email, and ID Card Number are fetched from the university system and cannot be modified here. Only Phone number can be updated. For corrections, contact the system administrator."}
            {role === "admin" &&
              "Name and Email are fetched from the university system and cannot be modified here. Only Phone number can be updated."}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────

const ROField = ({ label, value }) => (
  <div>
    <label className="block mb-2 font-semibold text-gray-700">{label}</label>
    <input
      type="text"
      value={value || "—"}
      disabled
      className="w-full border border-gray-200 rounded-lg p-3 bg-gray-100 text-gray-500 cursor-not-allowed"
    />
  </div>
);

const DropField = ({ label, value, options, error, onChange }) => (
  <div>
    <label className="block mb-2 font-semibold text-gray-700">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full border rounded-lg p-3 bg-white focus:outline-none focus:ring-2 transition
        ${error ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-purple-500"}`}
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
    {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
  </div>
);

export default Profile;
