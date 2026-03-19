import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "../../lib/supabaseClient";
import heroBg from "../../assets/images/hero.jpg";
import event1 from "../../assets/images/event1.jpg";
import event2 from "../../assets/images/event2.jpg";
import event3 from "../../assets/images/event3.jpg";
import event4 from "../../assets/images/event4.png";

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

const fmtTime = (t) => {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
};

// Map event status → display status
const mapStatus = (evStatus) => {
  if (evStatus === "Ongoing")
    return { label: "Active", cls: "bg-green-100 text-green-700" };
  if (evStatus === "Successful")
    return { label: "Completed", cls: "bg-blue-100 text-blue-700" };
  if (evStatus === "Cancelled")
    return { label: "Cancelled", cls: "bg-red-100 text-red-700" };
  return { label: evStatus || "Unknown", cls: "bg-gray-100 text-gray-600" };
};

// ════════════════════════════════════════════════════════════════
const MyTickets = () => {
  const navigate = useNavigate();

  const heroSlides = [heroBg, event1, event2, event3, event4];
  const [activeSlide, setActiveSlide] = useState(0);

  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState(null);
  const [tickets, setTickets] = useState([]); // merged ticket+event rows
  const [selected, setSelected] = useState(null); // ticket open in modal
  const [bgError, setBgError] = useState(false);
  const modalPanelRef = useRef(null);

  // ── Rotating background ──
  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % heroSlides.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [heroSlides.length]);

  // ── Fetch tickets + join event data ──
  const fetchTickets = useCallback(async (email) => {
    // Fetch all tickets for this user
    const { data: tRows } = await supabase
      .from("tickets")
      .select("*")
      .eq("email", email)
      .order("booked_at", { ascending: false });

    if (!tRows || tRows.length === 0) {
      setTickets([]);
      return;
    }

    // Fetch corresponding events in one query
    const eventUids = [...new Set(tRows.map((t) => t.event_uid))];
    const { data: eRows } = await supabase
      .from("events")
      .select(
        "event_uid, title, image_url, date, time, duration, venue, status",
      )
      .in("event_uid", eventUids);

    const evMap = Object.fromEntries(
      (eRows || []).map((e) => [e.event_uid, e]),
    );

    setTickets(tRows.map((t) => ({ ...t, event: evMap[t.event_uid] ?? null })));
  }, []);

  // ── Auth + initial load ──
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }
      setAuthEmail(user.email);
      await fetchTickets(user.email);
      setLoading(false);
    };
    load();
  }, [navigate, fetchTickets]);

  // ── Real-time: tickets table (new booking) ──
  useEffect(() => {
    if (!authEmail) return;
    const ch = supabase
      .channel("my-tickets-stream")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tickets",
          filter: `email=eq.${authEmail}`,
        },
        () => fetchTickets(authEmail),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [authEmail, fetchTickets]);

  // ── Real-time: events table (title/date/venue/status changes) ──
  useEffect(() => {
    if (!authEmail) return;
    const ch = supabase
      .channel("my-tickets-events-stream")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "events" },
        (payload) => {
          const updated = payload.new;
          setTickets((prev) =>
            prev.map((t) =>
              t.event_uid === updated.event_uid
                ? { ...t, event: { ...t.event, ...updated } }
                : t,
            ),
          );
          // Keep the modal in sync too
          setSelected((prev) =>
            prev && prev.event_uid === updated.event_uid
              ? { ...prev, event: { ...prev.event, ...updated } }
              : prev,
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [authEmail]);

  // Lock background page scroll while modal is open.
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyPosition = document.body.style.position;
    const prevBodyTop = document.body.style.top;
    const prevBodyWidth = document.body.style.width;
    const prevBodyLeft = document.body.style.left;
    const prevBodyRight = document.body.style.right;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const scrollY = window.scrollY;

    if (selected) {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.documentElement.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.position = prevBodyPosition;
      document.body.style.top = prevBodyTop;
      document.body.style.width = prevBodyWidth;
      document.body.style.left = prevBodyLeft;
      document.body.style.right = prevBodyRight;
      document.documentElement.style.overflow = prevHtmlOverflow;
      if (selected) {
        window.scrollTo(0, scrollY);
      }
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) return;

    const lockBackgroundScroll = (e) => {
      if (modalPanelRef.current?.contains(e.target)) return;
      e.preventDefault();
    };

    window.addEventListener("wheel", lockBackgroundScroll, {
      passive: false,
    });
    window.addEventListener("touchmove", lockBackgroundScroll, {
      passive: false,
    });

    return () => {
      window.removeEventListener("wheel", lockBackgroundScroll);
      window.removeEventListener("touchmove", lockBackgroundScroll);
    };
  }, [selected]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white text-lg">
        Loading your tickets...
      </div>
    );
  }

  return (
    <>
      <div className="relative min-h-screen w-full overflow-hidden text-white">
        {/* Background */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {heroSlides.map((slide, index) => (
            <div
              key={slide}
              className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 ease-linear ${
                index === activeSlide ? "opacity-100" : "opacity-0"
              }`}
              style={{ backgroundImage: `url(${slide})` }}
            />
          ))}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
        </div>

        {/* Title */}
        <div className="relative z-20 pt-28 pb-16 text-center px-4">
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-5xl md:text-6xl font-extrabold"
          >
            My Tickets
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="mt-2 text-lg text-gray-300"
          >
            All your booked events in one place
          </motion.p>
        </div>

        {/* Ticket cards */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-20 max-w-5xl mx-auto px-4 pb-24 -mt-4 md:-mt-5"
        >
          {tickets.length === 0 ? (
            <div className="p-10 text-center text-white">
              <div className="text-6xl mb-4 opacity-40">🎫</div>
              <p className="text-2xl font-medium text-white/40">
                You haven't booked any tickets yet.
              </p>
              <button
                onClick={() => navigate("/events")}
                className="mt-10 px-10 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-lg hover:opacity-90 font-semibold hover:scale-105 transition-all"
              >
                Explore Events
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {tickets.map((ticket) => {
                const ev = ticket.event;
                const { label, cls } = mapStatus(ev?.status);
                return (
                  <motion.div
                    key={ticket.id}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => setSelected(ticket)}
                    className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/30 cursor-pointer
                               flex flex-col md:flex-row md:items-center gap-4 p-6 md:p-8 text-gray-900 hover:shadow-purple-400/20 transition-all"
                  >
                    {/* Event image thumbnail */}
                    {ev?.image_url && (
                      <img
                        src={ev.image_url}
                        alt={ev.title}
                        className="w-full md:w-28 h-24 md:h-20 object-cover rounded-2xl flex-shrink-0"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-bold truncate">
                        {ev?.title || "Event"}
                      </h2>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                        <span>📅 {fmtDate(ev?.date)}</span>
                        <span>⏰ {fmtTime(ev?.time)}</span>
                        <span>
                          ⏳ {ev?.duration} {ev?.duration > 1 ? "Days" : "Day"}
                        </span>
                        <span>📍 {ev?.venue}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span
                        className={`px-4 py-1.5 rounded-full font-semibold text-sm ${cls}`}
                      >
                        {label}
                      </span>
                      <span className="text-gray-400 text-xl">›</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Ticket Detail Modal ── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden overscroll-none touch-none"
            onClick={() => setSelected(null)}
          >
            <motion.div
              ref={modalPanelRef}
              initial={{ scale: 0.9, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 40 }}
              transition={{ type: "spring", duration: 0.4 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white text-gray-800 rounded-3xl shadow-2xl max-w-lg w-full max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {/* Event banner */}
              {selected.event?.image_url && (
                <div className="relative h-48 w-full">
                  <img
                    src={selected.event.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <h2 className="absolute bottom-4 left-5 right-5 text-white text-2xl font-bold leading-tight">
                    {selected.event?.title}
                  </h2>
                </div>
              )}

              <div className="p-6 space-y-5">
                {/* Ticket UID badge */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                    Ticket ID
                  </span>
                  <span className="font-mono font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-full text-base">
                    {selected.ticket_uid}
                  </span>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center gap-2 py-4 bg-gray-50 rounded-2xl">
                  <QRCodeCanvas
                    value={selected.ticket_uid}
                    size={180}
                    bgColor="#ffffff"
                    fgColor="#4f46e5"
                    level="H"
                    includeMargin
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Scan at entry gate
                  </p>
                </div>

                {/* Status badge */}
                {(() => {
                  const { label, cls } = mapStatus(selected.event?.status);
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-500">
                        Status
                      </span>
                      <span
                        className={`px-4 py-1.5 rounded-full font-semibold text-sm ${cls}`}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })()}

                <hr className="border-gray-100" />

                {/* Event details */}
                <Section title="📅 Event Details">
                  <Row label="Date" value={fmtDate(selected.event?.date)} />
                  <Row label="Time" value={fmtTime(selected.event?.time)} />
                  <Row
                    label="Duration"
                    value={`${selected.event?.duration} ${selected.event?.duration > 1 ? "Days" : "Day"}`}
                  />
                  <Row label="Venue" value={selected.event?.venue} />
                </Section>

                <hr className="border-gray-100" />

                {/* Student details */}
                <Section title="👤 Your Details">
                  <Row label="Name" value={selected.name} />
                  <Row label="Email" value={selected.email} />
                  <Row label="Phone" value={selected.phone} />
                  {selected.id_card_number && (
                    <Row label="ID Card" value={selected.id_card_number} />
                  )}
                  {selected.department && (
                    <Row label="Department" value={selected.department} />
                  )}
                  {selected.program_level && (
                    <Row label="Program Level" value={selected.program_level} />
                  )}
                  {selected.notes && (
                    <Row label="Notes" value={selected.notes} />
                  )}
                </Section>

                <hr className="border-gray-100" />

                {/* Payment info */}
                <Section title="💳 Payment">
                  <Row
                    label="Amount"
                    value={selected.free ? "Free" : `₹${selected.amount}`}
                  />
                  <Row
                    label="Transaction ID"
                    value={
                      selected.transaction_id === "FREE"
                        ? "N/A (Free Event)"
                        : selected.transaction_id
                    }
                  />
                  <Row
                    label="Booked At"
                    value={new Date(selected.booked_at).toLocaleString("en-IN")}
                  />
                </Section>

                <button
                  onClick={() => setSelected(null)}
                  className="w-full py-3 mt-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-full hover:scale-105 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// ── Sub-components ────────────────────────────────────────────────
const Section = ({ title, children }) => (
  <div>
    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
      {title}
    </h3>
    <div className="space-y-2">{children}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-2 text-sm">
    <span className="text-gray-500 flex-shrink-0">{label}</span>
    <span className="text-gray-800 font-medium text-right break-all">
      {value || "—"}
    </span>
  </div>
);

export default MyTickets;
