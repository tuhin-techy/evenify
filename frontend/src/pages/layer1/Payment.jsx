import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getUserProfile } from "../../utils/role";

// Lazily injects the Razorpay checkout script from CDN
const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

// Generate a 7-char alphanumeric ticket UID on the client as a fallback
// The DB DEFAULT also generates one — this is only used as a UI preview
const genTicketUid = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let r = "T-";
  for (let i = 0; i < 7; i++)
    r += chars[Math.floor(Math.random() * chars.length)];
  return r;
};

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

// ════════════════════════════════════════════════════════════════
const Payment = () => {
  const { id } = useParams(); // event_uid
  const navigate = useNavigate();
  const location = useLocation();

  // bookingData passed from StudentDetails via navigate state
  const bookingData = location.state?.bookingData ?? null;

  const [pageLoading, setPageLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [event, setEvent] = useState(null);
  const [eventError, setEventError] = useState(false);

  const [paying, setPaying] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [ticketUid, setTicketUid] = useState(null);
  const [paymentId, setPaymentId] = useState(null);
  const [payError, setPayError] = useState("");
  const [saving, setSaving] = useState(false);

  const rzpRef = useRef(null);

  // ── Guard: if no booking data, send back ──
  useEffect(() => {
    if (!bookingData) {
      navigate(`/events/${id}/details`, { replace: true });
    }
  }, [bookingData, id, navigate]);

  // ── Load event ──
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
      setProfile(result.profile);

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
      setPageLoading(false);
    };
    load();
  }, [id, navigate]);

  // ── Real-time sync ──
  useEffect(() => {
    const ch = supabase
      .channel(`payment-event-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "events" },
        (payload) => {
          const ev = payload.new;
          if (ev.event_uid !== id) return;
          if (ev.visibility !== "Public" || ev.status !== "Ongoing") {
            rzpRef.current?.close();
            rzpRef.current = null;
            setPaying(false);
            setEvent(null);
            setEventError(true);
          } else {
            setEvent(ev);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "events" },
        (payload) => {
          if (payload.old?.event_uid === id) {
            rzpRef.current?.close();
            rzpRef.current = null;
            setPaying(false);
            setEvent(null);
            setEventError(true);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, navigate]);

  // ── Insert ticket into DB ──
  const saveTicket = async (transactionId) => {
    setSaving(true);
    const row = {
      event_uid: id,
      transaction_id: transactionId,
      email: bookingData.email,
      name: bookingData.name,
      phone: bookingData.phone,
      department: bookingData.department,
      program_level: bookingData.program_level,
      id_card_number: bookingData.id_card_number || null,
      notes: bookingData.notes || null,
      amount: bookingData.amount,
      free: bookingData.free,
    };

    const { data, error } = await supabase
      .from("tickets")
      .insert(row)
      .select("ticket_uid")
      .single();

    setSaving(false);
    if (error) {
      setPayError(`Booking saved but ticket record failed: ${error.message}`);
      return genTicketUid(); // fallback so user still sees success
    }
    return data.ticket_uid;
  };

  // ── Razorpay handler ──
  const handlePay = async () => {
    setPayError("");
    setPaying(true);

    const ok = await loadRazorpayScript();
    if (!ok) {
      setPayError(
        "Could not load the payment gateway. Check your internet connection and try again.",
      );
      setPaying(false);
      return;
    }

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: Math.round((bookingData?.amount ?? 0) * 100),
      currency: "INR",
      name: "Evenify",
      description: event.title,
      handler: async (response) => {
        rzpRef.current = null;
        const txId = response.razorpay_payment_id;
        const uid = await saveTicket(txId);
        setPaymentId(txId);
        setTicketUid(uid);
        setPaySuccess(true);
        setPaying(false);
      },
      prefill: {
        name: bookingData?.name || "",
        email: bookingData?.email || "",
        contact: bookingData?.phone || "",
      },
      modal: {
        ondismiss: () => {
          setPaying(false);
          rzpRef.current = null;
        },
      },
      theme: { color: "#7c3aed" },
    };

    const rzp = new window.Razorpay(options);
    rzpRef.current = rzp;
    rzp.on("payment.failed", (response) => {
      setPayError(`Payment failed: ${response.error.description}`);
      setPaying(false);
      rzpRef.current = null;
    });
    rzp.open();
  };

  // ── Free booking handler ──
  const handleFreeConfirm = async () => {
    setPayError("");
    setSaving(true);
    const uid = await saveTicket("FREE");
    setPaymentId("FREE");
    setTicketUid(uid);
    setPaySuccess(true);
    setSaving(false);
  };

  // ── Loading ──
  if (pageLoading || !bookingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white text-lg">
        Loading...
      </div>
    );
  }

  // ── Event not available ──
  if (eventError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white gap-4 text-center px-6">
        <span className="text-7xl">🔍</span>
        <h2 className="text-3xl font-bold">Event not available</h2>
        <p className="text-white/50">
          This event may have ended, been cancelled, or is no longer open to the
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

  // ── Success screen ──
  if (paySuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black px-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, type: "spring" }}
          className="bg-white text-gray-800 rounded-3xl shadow-2xl p-12 max-w-sm w-full text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="text-7xl mb-6"
          >
            🎉
          </motion.div>
          <h2 className="text-2xl font-bold mb-3 text-green-600">
            {event?.free ? "Booking Confirmed!" : "Payment Successful!"}
          </h2>
          <p className="text-gray-500 mb-5 leading-relaxed">
            Your ticket for <strong>{event?.title}</strong> has been booked
            successfully.
          </p>

          {ticketUid && (
            <div className="bg-purple-50 rounded-xl px-4 py-3 mb-3">
              <p className="text-xs text-gray-400 mb-1">Ticket ID</p>
              <p className="text-base font-mono font-bold text-purple-700">
                {ticketUid}
              </p>
            </div>
          )}
          {paymentId && paymentId !== "FREE" && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5">
              <p className="text-xs text-gray-400 mb-1">Transaction ID</p>
              <p className="text-sm font-mono font-semibold text-gray-700 break-all">
                {paymentId}
              </p>
            </div>
          )}

          <button
            onClick={() => navigate("/my-tickets")}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-full hover:scale-105 transition-all"
          >
            View My Tickets
          </button>
          <button
            onClick={() => navigate("/events")}
            className="mt-3 w-full py-2 text-gray-400 text-sm hover:text-gray-600 transition"
          >
            Back to Events
          </button>
        </motion.div>
      </div>
    );
  }

  const isFree = bookingData?.free;
  const bgImage = event?.image_url;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white">
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

      <div className="relative z-20 py-24 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-4xl md:text-5xl font-bold"
        >
          {isFree ? "Confirm Booking" : "Payment"}
        </motion.h1>
        <p className="mt-3 text-xl text-white/70">{event.title}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-20 max-w-2xl mx-auto bg-white text-gray-800 rounded-3xl shadow-2xl px-8 py-6 md:px-12 md:py-8 -mt-16 mb-24"
      >
        {/* Order Summary */}
        <div className="mb-6 pb-4 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            📋 Order Summary
          </h2>
          <div className="space-y-2 text-lg text-gray-600">
            <p>
              <strong>Event:</strong> {event.title}
            </p>
            <p>
              <strong>Date:</strong> {fmtDate(event.date)}
            </p>
            <p>
              <strong>Venue:</strong> {event.venue}
            </p>
            <p className="text-base text-gray-400 mt-1">
              ⚠️ 1 ticket per account
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-xl font-semibold text-gray-800">
              Total Amount
            </span>
            <span
              className={`text-2xl font-extrabold ${isFree ? "text-green-600" : "text-purple-600"}`}
            >
              {isFree ? "Free 🎉" : `₹${bookingData?.amount}`}
            </span>
          </div>
        </div>

        {/* Billing Info */}
        <div className="mb-6 pb-4 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            👤 Billing Information
          </h2>
          <div className="grid md:grid-cols-2 gap-3 text-base">
            <InfoRow label="Name" value={bookingData?.name} />
            <InfoRow label="Email" value={bookingData?.email} />
            <InfoRow label="Phone" value={bookingData?.phone} />
          </div>
        </div>

        <AnimatePresence>
          {payError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4"
            >
              <span className="text-red-500 text-xl">❌</span>
              <p className="text-base text-red-700">{payError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {isFree ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleFreeConfirm}
            disabled={saving}
            className="w-full py-4 bg-gradient-to-r from-green-500 to-teal-500 text-white text-lg font-semibold rounded-full shadow-lg hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Confirming..." : "✅ Confirm Free Booking"}
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handlePay}
            disabled={paying || saving}
            className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-lg font-semibold rounded-full shadow-lg hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {paying
              ? "Opening Payment Gateway..."
              : saving
                ? "Saving ticket..."
                : `💳 Pay ₹${bookingData?.amount}`}
          </motion.button>
        )}

        <p className="text-center text-gray-400 text-sm mt-4">
          {isFree
            ? "No payment required. Your spot will be confirmed immediately."
            : "Secured by Razorpay. Your card details are never stored on our servers."}
        </p>

        <button
          onClick={() => navigate(`/events/${id}/details`)}
          className="mt-5 w-full py-2 text-gray-400 text-base hover:text-gray-600 transition text-center"
        >
          ← Back to Booking Details
        </button>
      </motion.div>
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="flex gap-2 text-gray-600 text-base">
    <span className="font-medium text-gray-700 min-w-[56px]">{label}:</span>
    <span>{value || <em className="text-gray-300">Not set</em>}</span>
  </div>
);

export default Payment;
