import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import heroBg from "../../assets/images/hero.jpg";
import event1 from "../../assets/images/event1.jpg";
import event2 from "../../assets/images/event2.jpg";
import event3 from "../../assets/images/event3.jpg";
import event4 from "../../assets/images/event4.png";

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

const getAccessType = (email) => {
  if (!email) return null;
  if (email.endsWith("@somaiya.edu")) return "Insider";
  if (email.endsWith("@gmail.com")) return "Outsider";
  return null;
};

const accessVals = (type) =>
  type === "Insider" ? ["Insider", "Both"] : ["Outsider", "Both"];

// ── InfoRow helper ────────────────────────────────────────────────
const InfoRow = ({ icon, label, value }) => (
  <div className="flex items-start gap-4">
    <span className="text-2xl mt-0.5">{icon}</span>
    <div>
      <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p className="text-gray-800 text-lg font-medium">{value}</p>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════
//  Main Component
// ════════════════════════════════════════════════════════════════
const Events = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const heroSlides = [heroBg, event1, event2, event3, event4];
  const [activeSlide, setActiveSlide] = useState(0);

  const [authDone, setAuthDone] = useState(false);
  const [accessType, setAccessType] = useState(null);
  const [authEmail, setAuthEmail] = useState("");

  // List state
  const [events, setEvents] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [bgError, setBgError] = useState(false);

  // Detail state
  const [detailEvent, setDetailEvent] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailGone, setDetailGone] = useState(false);
  const [detailBgError, setDetailBgError] = useState(false);
  const [detailAlreadyBooked, setDetailAlreadyBooked] = useState(false);
  const [detailBookedTitle, setDetailBookedTitle] = useState("");

  // ── Rotating background ──
  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % heroSlides.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [heroSlides.length]);

  // ── 1. Auth check ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        navigate("/login");
        return;
      }
      const at = getAccessType(user.email);
      if (!at) {
        navigate("/");
        return;
      }
      setAuthEmail(user.email || "");
      setAccessType(at);
      setAuthDone(true);
    });
  }, [navigate]);

  // ── 2. Fetch list + real-time ──
  useEffect(() => {
    if (!authDone || !accessType || id) return;

    const vals = accessVals(accessType);

    // showLoader=true only on first mount — real-time refetches update silently
    const fetchList = async (showLoader = false) => {
      if (showLoader) setListLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: evRows } = await supabase
        .from("events")
        .select("*")
        .in("access", vals)
        .eq("visibility", "Public")
        .eq("status", "Ongoing")
        .order("date", { ascending: true });

      let bookedUids = new Set();
      if (user) {
        const { data: tRows } = await supabase
          .from("tickets")
          .select("event_uid")
          .eq("email", user.email);
        bookedUids = new Set((tRows || []).map((t) => t.event_uid));
      }

      setEvents((evRows || []).filter((e) => !bookedUids.has(e.event_uid)));
      if (showLoader) setListLoading(false);
    };

    fetchList(true); // first load — show spinner

    const ch = supabase
      .channel(`events-public-list-${accessType}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => fetchList(false),
      ) // silent refetch on any event change
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tickets" },
        () => fetchList(false),
      ) // silent refetch when a ticket is booked
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [authDone, accessType, id]);

  // ── 3. Fetch detail + real-time ──
  useEffect(() => {
    if (!authDone || !accessType || !id || !authEmail) return;

    const vals = accessVals(accessType);
    setDetailLoading(true);
    setDetailGone(false);
    setDetailAlreadyBooked(false);
    setDetailBookedTitle("");

    const fetchDetail = async () => {
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("event_uid", id)
        .single();

      if (
        !data ||
        data.visibility !== "Public" ||
        data.status !== "Ongoing" ||
        !vals.includes(data.access)
      ) {
        setDetailEvent(null);
        setDetailGone(true);
      } else {
        setDetailEvent(data);
        setDetailGone(false);
      }

      const { data: existingTicket } = await supabase
        .from("tickets")
        .select("ticket_uid")
        .eq("event_uid", id)
        .eq("email", authEmail)
        .maybeSingle();

      if (existingTicket) {
        setDetailEvent(data);
        setDetailBookedTitle(data.title || "this event");
        setDetailAlreadyBooked(true);
        setDetailGone(false);
        setDetailLoading(false);
        return;
      }

      setDetailLoading(false);
    };

    fetchDetail();

    const ch = supabase
      .channel(`event-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "events" },
        (payload) => {
          const ev = payload.new;
          if (ev.event_uid !== id) return;
          if (
            ev.visibility !== "Public" ||
            ev.status !== "Ongoing" ||
            !vals.includes(ev.access)
          ) {
            setDetailEvent(null);
            setDetailGone(true);
          } else {
            setDetailEvent(ev);
            setDetailGone(false);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "events" },
        (payload) => {
          if (payload.old?.event_uid === id) {
            setDetailEvent(null);
            setDetailGone(true);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [authDone, accessType, id, authEmail]);

  // ── Auth pending ──
  if (!authDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white text-lg">
        Verifying access...
      </div>
    );
  }

  // ════ DETAIL VIEW ════
  if (id) {
    if (detailLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white text-lg">
          Loading event...
        </div>
      );
    }

    if (detailAlreadyBooked) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white gap-4 px-6 text-center">
          <span className="text-7xl">✅</span>
          <h2 className="text-3xl font-bold">Ticket already booked</h2>
          <p className="text-white/70 max-w-lg text-lg leading-relaxed">
            You have already booked a ticket for{" "}
            <strong>{detailBookedTitle}</strong>. You can check your booking
            details in My Tickets.
          </p>
          <button
            onClick={() => navigate("/my-tickets")}
            className="mt-2 px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-medium hover:scale-105 transition-all"
          >
            View My Tickets
          </button>
          <button
            onClick={() => navigate("/events")}
            className="text-white/60 hover:text-white transition"
          >
            ← Back to Events
          </button>
        </div>
      );
    }

    if (detailGone || !detailEvent) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-purple-900 via-gray-900 to-black text-white gap-4 px-6 text-center">
          <span className="text-7xl">🔍</span>
          <h2 className="text-3xl font-bold">Event not available</h2>
          <p className="text-white/50 max-w-sm">
            This event may have ended, been cancelled, or is no longer
            accessible to you.
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

    const ev = detailEvent;
    const isSoldOut = (ev.tickets_booked ?? 0) >= ev.tickets;
    const bgImage = !detailBgError && ev.image_url ? ev.image_url : heroBg;

    return (
      <div className="min-h-screen overflow-hidden">
        {/* ── Full-page background ── */}
        <div
          className="min-h-screen bg-cover bg-center bg-no-repeat relative"
          style={{ backgroundImage: `url(${bgImage})` }}
        >
          <div className="absolute inset-0 bg-black/65" />
          {ev.image_url && (
            <img
              src={ev.image_url}
              alt=""
              className="hidden"
              onError={() => setDetailBgError(true)}
            />
          )}

          <div className="relative z-10 flex flex-col items-center pt-20 md:pt-28 px-4 pb-28">
            {/* Title */}
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
              className="text-center text-white -mt-2 mb-14"
            >
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">
                {ev.title}
              </h1>
              {isSoldOut && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.4, type: "spring" }}
                  className="inline-block mt-4 px-6 py-2 bg-red-500/90 text-white rounded-full font-bold text-sm tracking-widest"
                >
                  🎫 SOLD OUT
                </motion.span>
              )}
            </motion.div>

            {/* Details Card */}
            <motion.div
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="w-full max-w-5xl -mt-4 md:-mt-8"
            >
              <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
                <div className="pl-7 pr-4 py-6 md:pl-10 md:pr-6 md:py-8 text-gray-800">
                  <div className="grid md:grid-cols-2 gap-14">
                    {/* Left: Description + Tags */}
                    <div>
                      <h2 className="text-4xl font-bold mb-6 text-gray-900">
                        Event Details
                      </h2>
                      <p className="text-gray-600 text-xl leading-relaxed mb-8">
                        {ev.description}
                      </p>

                      {ev.tags && ev.tags.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3">
                            Tags
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {ev.tags.map((tag, i) => (
                              <span
                                key={i}
                                className="flex items-center gap-1 bg-yellow-50 text-yellow-700 border border-yellow-300 px-3 py-1 rounded-full text-sm font-medium"
                              >
                                🏷 {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Info */}
                    <div className="space-y-6 text-xl text-gray-700">
                      <InfoRow
                        icon="📅"
                        label="Date"
                        value={fmtDate(ev.date)}
                      />
                      <InfoRow
                        icon="⏳"
                        label="Duration"
                        value={`${ev.duration} ${ev.duration > 1 ? "Days" : "Day"}`}
                      />
                      <InfoRow
                        icon="⏰"
                        label="Time"
                        value={fmtTime(ev.time)}
                      />
                      <InfoRow icon="📍" label="Venue" value={ev.venue} />

                      {/* Ticket Price */}
                      <div className="flex items-start gap-4">
                        <span className="text-2xl mt-0.5">🎟</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                            Ticket Price
                          </p>
                          <p
                            className={`text-2xl font-bold ${ev.free ? "text-green-600" : isSoldOut ? "text-gray-400" : "text-purple-600"}`}
                          >
                            {ev.free ? "Free 🎉" : `₹${ev.ticket_price}`}
                            {isSoldOut && (
                              <span className="ml-2 text-sm text-red-500 font-medium">
                                (Sold Out)
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Department */}
                      {ev.department && ev.department.length > 0 && (
                        <div className="flex items-start gap-4">
                          <span className="text-2xl mt-0.5">🏫</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
                              Department
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {ev.department.map((d, i) => (
                                <span
                                  key={i}
                                  className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium"
                                >
                                  {d}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Program Level */}
                      {!ev.department?.some(
                        (d) => d === "School" || d === "Sports",
                      ) &&
                        ev.program_level &&
                        ev.program_level.length > 0 && (
                          <div className="flex items-start gap-4">
                            <span className="text-2xl mt-0.5">🎓</span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                Program Level
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {ev.program_level.map((p, i) => (
                                  <span
                                    key={i}
                                    className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-sm font-medium"
                                  >
                                    {p}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Book Button */}
                  <div className="mt-16 flex justify-center">
                    <motion.button
                      onClick={() =>
                        !isSoldOut &&
                        navigate(`/events/${ev.event_uid}/details`)
                      }
                      disabled={isSoldOut}
                      whileHover={isSoldOut ? undefined : { scale: 1.02 }}
                      whileTap={isSoldOut ? undefined : { scale: 0.98 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                      className={`px-14 py-5 text-white text-xl font-semibold rounded-full shadow-lg hover:opacity-90 transition-opacity duration-150 transform-gpu will-change-transform w-full md:w-auto
                        ${
                          isSoldOut
                            ? "bg-gray-400 cursor-not-allowed"
                            : "bg-gradient-to-r from-purple-500 to-pink-500"
                        }`}
                    >
                      {isSoldOut ? "🎫 Sold Out" : "Book Ticket"}
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // ════ LIST VIEW ════
  return (
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

      <div className="relative z-20 pt-28 pb-24 px-6">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-4xl md:text-5xl font-extrabold text-center mb-2"
        >
          Upcoming Events
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-center text-white/40 mb-8 text-base"
        >
          {accessType === "Insider"
            ? "Showing events for the Somaiya community"
            : "Showing events open to guests"}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          {listLoading ? (
            <div className="flex justify-center py-24 text-white/40 text-lg">
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-white/30 gap-4">
              <span className="text-6xl">📭</span>
              <p className="text-xl font-medium">
                No upcoming events at the moment.
              </p>
              <p className="text-base opacity-70">Check back soon!</p>
            </div>
          ) : (
            <div className="max-w-7xl mx-auto -mt-3 md:-mt-4 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {events.map((ev, i) => {
                  const isSoldOut = (ev.tickets_booked ?? 0) >= ev.tickets;
                  return (
                    <motion.div
                      key={ev.id}
                      layout
                      initial={{ opacity: 0, y: 40 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.4, delay: i * 0.06 }}
                      whileHover={{ scale: 1.03 }}
                      onClick={() => navigate(`/events/${ev.event_uid}`)}
                      className="cursor-pointer bg-white rounded-2xl shadow-xl overflow-hidden"
                    >
                      {/* Banner */}
                      <div className="h-52 overflow-hidden relative">
                        {ev.image_url ? (
                          <img
                            src={ev.image_url}
                            alt={ev.title}
                            className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
                          />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center text-5xl">
                            🎉
                          </div>
                        )}
                        {isSoldOut && (
                          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                            <span className="bg-red-500 text-white px-5 py-2 rounded-full font-bold text-sm tracking-widest">
                              🎫 SOLD OUT
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-6 text-gray-800">
                        <h3 className="text-2xl font-bold mb-3 line-clamp-1">
                          {ev.title}
                        </h3>
                        <div className="space-y-2 text-base text-gray-500 mb-5">
                          <p>📅 {fmtDate(ev.date)}</p>
                          <p>
                            ⏳ {ev.duration} {ev.duration > 1 ? "days" : "day"}
                          </p>
                          <p>⏰ {fmtTime(ev.time)}</p>
                          <p>📍 {ev.venue}</p>
                        </div>

                        <div className="flex items-center justify-between">
                          <span
                            className={`font-bold text-xl ${ev.free ? "text-green-600" : "text-purple-600"}`}
                          >
                            {ev.free ? "Free 🎉" : `₹${ev.ticket_price}`}
                          </span>
                          <motion.button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/events/${ev.event_uid}`);
                            }}
                            disabled={isSoldOut}
                            whileHover={isSoldOut ? undefined : { scale: 1.02 }}
                            whileTap={isSoldOut ? undefined : { scale: 0.98 }}
                            transition={{ duration: 0.14, ease: "easeOut" }}
                            className={`px-5 py-2.5 rounded-full font-semibold text-base text-white transform-gpu will-change-transform transition-opacity duration-150
                            ${
                              isSoldOut
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                            }`}
                          >
                            {isSoldOut ? "Sold Out" : "Book Now"}
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Events;
