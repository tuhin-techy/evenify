import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getUserProfile } from "../../utils/role";

// ── Helpers ───────────────────────────────────────────────────────
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
};

// ── Profile completeness check ────────────────────────────────────
const isProfileComplete = (profile, role) => {
  if (!profile) return false;
  if (!profile.name?.trim()) return false;
  if (!profile.phone?.trim()) return false;
  if (role === "outsider") {
    if (!profile.department?.trim()) return false;
    const skipProgram =
      profile.department === "School" || profile.department === "Sports";
    if (!skipProgram && !profile.program_level?.trim()) return false;
  }
  if (role === "student") {
    if (!profile.department?.trim()) return false;
    const skipProgram =
      profile.department === "School" || profile.department === "Sports";
    if (!skipProgram && !profile.program_level?.trim()) return false;
  }
  return true;
};

// ── Eligibility check against event ──────────────────────────────
const checkEligibility = (profile, role, event) => {
  if (role === "management" || role === "admin") return { eligible: true };

  const evDepts = event.department ?? [];
  const evProgs = event.program_level ?? [];
  const evSkipProg = evDepts.some((d) => d === "School" || d === "Sports");

  const userDept = profile?.department ?? "";
  const userProg = profile?.program_level ?? "";

  if (!evDepts.includes(userDept)) {
    return {
      eligible: false,
      reason: `This event is open to: ${evDepts.join(", ")}. Your department (${userDept || "not set"}) is not listed.`,
    };
  }

  const userSkipProg = userDept === "School" || userDept === "Sports";
  if (!evSkipProg && !userSkipProg) {
    if (evProgs.length > 0 && !evProgs.includes(userProg)) {
      return {
        eligible: false,
        reason: `This event is open to: ${evProgs.join(", ")}. Your program level (${userProg || "not set"}) is not listed.`,
      };
    }
  }

  return { eligible: true };
};

// ════════════════════════════════════════════════════════════════
//  Main Component
// ════════════════════════════════════════════════════════════════
const StudentDetails = () => {
  const { id } = useParams(); // event_uid
  const navigate = useNavigate();

  const [pageLoading, setPageLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [event, setEvent] = useState(null);
  const [eventError, setEventError] = useState(false);

  // Modals / gates
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [ineligibleMsg, setIneligibleMsg] = useState("");

  // Form
  const [notes, setNotes] = useState("");
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // ── Load auth + profile + event on mount ──
  useEffect(() => {
    setPageLoading(true);
    setEventError(false);
    setShowIncomplete(false);
    setIneligibleMsg("");
    setShowDisclaimer(false);

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
      setProfile(result.profile);
      setRole(result.role);

      // Fetch event — only if Public + Ongoing (private → null → eventError)
      const { data: ev } = await supabase
        .from("events")
        .select("*")
        .eq("event_uid", id)
        .eq("visibility", "Public")
        .eq("status", "Ongoing")
        .single();

      if (!ev) {
        setEventError(true);
        setPageLoading(false);
        return;
      }
      setEvent(ev);

      if (!isProfileComplete(result.profile, result.role)) {
        setShowIncomplete(true);
        setPageLoading(false);
        return;
      }

      const elig = checkEligibility(result.profile, result.role, ev);
      if (!elig.eligible) {
        setIneligibleMsg(elig.reason);
        setPageLoading(false);
        return;
      }

      setPageLoading(false);
    };
    load();
  }, [id, navigate, retryCount]);

  // ── Real-time sync — same logic as Events.jsx detail channel ──
  useEffect(() => {
    const ch = supabase
      .channel(`booking-event-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "events" },
        (payload) => {
          const ev = payload.new;
          if (ev.event_uid !== id) return;
          // If event becomes private or cancelled → show "not available"
          if (ev.visibility !== "Public" || ev.status !== "Ongoing") {
            setEvent(null);
            setEventError(true);
          } else {
            // Event came back public — re-run full load to revalidate everything
            setRetryCount((prev) => prev + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "events" },
        (payload) => {
          if (payload.old?.event_uid === id) {
            setEvent(null);
            setEventError(true);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [id]);

  // ── Proceed button click ──
  const handleProceed = () => {
    if (!showDisclaimer) {
      setShowDisclaimer(true);
      return;
    }
    // Pass booking snapshot to Payment page via router state
    navigate(`/events/${id}/payment`, {
      state: {
        bookingData: {
          name: profile?.name || "",
          email: authUser?.email || "",
          phone: profile?.phone || "",
          department: profile?.department || "",
          program_level: profile?.program_level || "",
          id_card_number: profile?.id_card_number || "",
          notes,
          amount: event?.free ? 0 : (event?.ticket_price ?? 0),
          free: !!event?.free,
          role,
        },
      },
    });
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white text-lg">
        Loading...
      </div>
    );
  }

  if (eventError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white gap-4 text-center px-6">
        <span className="text-7xl">🔍</span>
        <h2 className="text-3xl font-bold">Event not available</h2>
        <p className="text-white/50">
          This event may have ended, been cancelled, or is not open to the
          public.
        </p>
        <button
          onClick={() => navigate("/events")}
          className="mt-4 px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-medium hover:scale-105 transition-all"
        >
          ← Back to Events
        </button>
      </div>
    );
  }

  const bgImage = event?.image_url;
  const isFree = event?.free;
  const skipProgram =
    profile?.department === "School" || profile?.department === "Sports";

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white">
      {/* ── Background ── */}
      {bgImage ? (
        <div
          className="absolute inset-0 bg-cover bg-center z-0"
          style={{ backgroundImage: `url(${bgImage})` }}
        >
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
        </div>
      ) : (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute w-[600px] h-[600px] bg-purple-600/30 rounded-full blur-[140px] animate-pulse top-[-200px] left-[-200px]" />
          <div className="absolute w-[500px] h-[500px] bg-pink-500/30 rounded-full blur-[140px] animate-pulse bottom-[-200px] right-[-200px]" />
        </div>
      )}

      {/* ── Profile Incomplete Modal ── */}
      <AnimatePresence>
        {showIncomplete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="bg-white text-gray-800 rounded-3xl shadow-2xl p-10 max-w-sm w-full text-center"
            >
              <div className="text-5xl mb-4">📋</div>
              <h3 className="text-2xl font-bold mb-3">Profile Incomplete</h3>
              <p className="text-gray-500 leading-relaxed mb-8">
                Please complete your profile before booking a ticket. Some
                required details are missing.
              </p>
              <button
                onClick={() => navigate("/profile")}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-full hover:scale-105 transition-all"
              >
                Complete My Profile →
              </button>
              <button
                onClick={() => navigate("/events")}
                className="mt-3 w-full py-3 text-gray-400 text-sm hover:text-gray-600 transition"
              >
                Back to Events
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ineligible Banner ── */}
      {ineligibleMsg && !showIncomplete && (
        <div className="relative z-20 flex flex-col items-center justify-center min-h-screen gap-6 px-6 text-center">
          <div className="text-6xl">🚫</div>
          <h2 className="text-3xl font-bold">
            You're not eligible for this event
          </h2>
          <p className="text-white/60 max-w-lg text-lg leading-relaxed">
            {ineligibleMsg}
          </p>
          <button
            onClick={() => navigate("/events")}
            className="mt-2 px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-medium hover:scale-105 transition-all"
          >
            ← Back to Events
          </button>
        </div>
      )}

      {/* ── Main Content ── */}
      {!showIncomplete && !ineligibleMsg && event && profile && (
        <>
          <div className="relative z-20 py-24 text-center">
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-4xl md:text-5xl font-bold"
            >
              Book Your Ticket
            </motion.h1>
            <p className="mt-3 text-xl text-white/70">{event.title}</p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="relative z-20 max-w-4xl mx-auto bg-white text-gray-800 rounded-3xl shadow-2xl p-8 md:p-12 -mt-16 mb-24"
          >
            {/* ── Ticket Summary ── */}
            <div className="mb-8 pb-8 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-5">
                🎟 Ticket Summary
              </h2>
              <div className="grid md:grid-cols-2 gap-4 text-base text-gray-600">
                <p>
                  <strong>📅 Date:</strong> {fmtDate(event.date)}
                </p>
                <p>
                  <strong>⏰ Time:</strong> {fmtTime(event.time)}
                </p>
                <p>
                  <strong>📍 Venue:</strong> {event.venue}
                </p>
                <p>
                  <strong>⏳ Duration:</strong> {event.duration}{" "}
                  {event.duration > 1 ? "Days" : "Day"}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between bg-purple-50 border border-purple-100 rounded-2xl px-5 py-4">
                <div>
                  <p className="text-sm text-gray-500 font-medium">
                    Number of Tickets
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    ⚠️ Only <strong>1 ticket</strong> per account is allowed
                  </p>
                </div>
                <span className="text-3xl font-extrabold text-purple-600">
                  1
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-lg font-semibold text-gray-800">
                <span>Total Amount</span>
                <span
                  className={
                    isFree
                      ? "text-green-600 text-xl"
                      : "text-purple-600 text-xl"
                  }
                >
                  {isFree ? "Free 🎉" : `₹${event.ticket_price}`}
                </span>
              </div>
            </div>

            {/* ── Your Details ── */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                👤 Your Details
              </h2>
              <p className="text-sm text-gray-400 mb-5">
                Auto-filled from your profile. Update your profile if anything
                is incorrect.
              </p>

              <div className="grid md:grid-cols-2 gap-5">
                <ROField label="Full Name" value={profile.name} />
                <ROField label="Email Address" value={authUser?.email} />

                {(role === "student" || role === "management") && (
                  <ROField
                    label="ID Card Number"
                    value={profile.id_card_number}
                  />
                )}

                <ROField label="Department" value={profile.department} />

                {!skipProgram && (
                  <ROField
                    label="Program Level"
                    value={profile.program_level}
                  />
                )}

                <ROField label="Phone Number" value={profile.phone} />

                <div className="md:col-span-2">
                  <label className="block mb-2 font-medium text-gray-700">
                    Additional Notes{" "}
                    <span className="text-gray-400 font-normal">
                      (Optional)
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special requirements, accessibility needs, or requests..."
                    className="w-full border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none text-gray-700"
                  />
                </div>
              </div>
            </div>

            {/* ── Disclaimer ── */}
            <AnimatePresence>
              {showDisclaimer && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4"
                >
                  <span className="text-amber-500 text-xl mt-0.5">⚠️</span>
                  <p className="text-sm text-amber-800 leading-relaxed">
                    <strong>Please note:</strong> The details shown above will
                    be verified at the event entry. Ensure your name, ID card,
                    and contact details in your profile are accurate. Mismatched
                    or incorrect details may result in denial of entry. By
                    proceeding, you confirm that all information is correct.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Proceed Button ── */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleProceed}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-lg font-semibold rounded-full shadow-lg hover:opacity-90 transition"
            >
              {!showDisclaimer
                ? isFree
                  ? "🎟 Book Ticket"
                  : "💳 Proceed to Payment"
                : isFree
                  ? "✅ Confirm Booking"
                  : "✅ Confirm & Pay"}
            </motion.button>

            {!showDisclaimer && (
              <p className="text-center text-gray-400 text-sm mt-3">
                Review your details before confirming
              </p>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
};

// ── Read-only display field ───────────────────────────────────────
const ROField = ({ label, value }) => (
  <div>
    <label className="block mb-1.5 font-medium text-gray-700">{label}</label>
    <div className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 text-gray-600 text-base">
      {value || <span className="text-gray-300 italic">Not set</span>}
    </div>
  </div>
);

export default StudentDetails;
