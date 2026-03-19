import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";

const formatDurationLabel = (duration) => {
  const days = Number(duration || 0);
  return `${days} Day${days === 1 ? "" : "s"}`;
};

const SummaryField = ({ label, value }) => (
  <div className="space-y-1">
    <p className="text-sm font-semibold uppercase tracking-widest text-white/40">
      {label}
    </p>
    <p className="text-base text-white bg-white/5 border border-white/10 rounded-xl px-4 py-3 min-h-[48px]">
      {value || <span className="text-white/30 italic">—</span>}
    </p>
  </div>
);

const SummaryBadges = ({ label, items, color = "purple" }) => {
  const colorMap = {
    purple: "bg-purple-500/30 border-purple-500/50 text-purple-200",
    pink: "bg-pink-500/30 border-pink-500/50 text-pink-200",
    teal: "bg-teal-500/30 border-teal-500/50 text-teal-200",
  };
  return (
    <div className="space-y-1">
      {label && (
        <p className="text-sm font-semibold uppercase tracking-widest text-white/40">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {items && items.length > 0 ? (
          items.map((item, i) => (
            <span
              key={i}
              className={`px-3 py-1 rounded-full border text-base font-medium ${colorMap[color]}`}
            >
              {item}
            </span>
          ))
        ) : (
          <span className="text-white/30 italic text-sm">—</span>
        )}
      </div>
    </div>
  );
};

const DetailModal = ({ event, onClose }) => {
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm uppercase tracking-widest text-white/40 mb-1">
              Full event information
            </p>
            <h2 className="text-2xl font-semibold">Event Details</h2>
          </div>
          <span className="text-4xl">📄</span>
        </div>

        {/* Event UID */}
        <div className="flex items-center gap-3 mb-8 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <span className="text-white/40 text-sm font-semibold uppercase tracking-widest">
            Event UID
          </span>
          <span className="font-mono text-lg font-bold text-green-300 tracking-widest">
            {event.event_uid}
          </span>
        </div>

        <div className="mb-8 rounded-2xl overflow-hidden border border-white/10 h-64 w-full bg-black/40">
          {event.image_url ? (
            <img
              src={event.image_url}
              className="w-full h-full object-contain"
              alt="Banner"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-white/20 gap-2">
              <span className="text-4xl">🖼</span>
              <span className="text-sm">No banner</span>
            </div>
          )}
        </div>

        <div className="mb-6">
          <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-3 border-b border-white/10">
            Basic Details
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <SummaryField label="Event Title" value={event.title} />
            </div>
            <SummaryField label="Date" value={fmtDate(event.date)} />
            <SummaryField
              label="Duration"
              value={event.duration ? formatDurationLabel(event.duration) : ""}
            />
            <SummaryField label="Time" value={fmtTime(event.time)} />
            <SummaryField label="Venue" value={event.venue} />
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-3 border-b border-white/10">
            Audience
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <SummaryBadges
              label="Department"
              items={event.department}
              color="purple"
            />
            <SummaryBadges
              label="Program Level"
              items={
                event.department.some((d) => d === "School" || d === "Sports")
                  ? ["Not Applicable"]
                  : event.program_level
              }
              color="pink"
            />
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-3 border-b border-white/10">
            Ticketing & Access
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <SummaryField
              label="Ticket Price"
              value={event.free ? "Free 🎉" : `₹${event.ticket_price}`}
            />
            <SummaryField label="Total Tickets" value={event.tickets} />
            <SummaryField label="Access" value={event.access} />
          </div>
        </div>

        {event.tags.length > 0 && (
          <div className="mb-6">
            <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-3 border-b border-white/10">
              Tags
            </p>
            <div className="flex flex-wrap gap-2">
              {event.tags.map((tag, i) => (
                <span
                  key={i}
                  className="bg-teal-500/30 border border-teal-500/50 text-teal-200 px-3 py-1 rounded-full text-base font-medium flex items-center gap-1"
                >
                  🏷 {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mb-8">
          <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-3 border-b border-white/10">
            Description
          </p>
          <div className="text-base text-white/90 bg-white/5 border border-white/10 rounded-xl px-4 py-3 leading-relaxed">
            {event.description}
          </div>
        </div>

        <button
          onClick={onClose}
          className="px-6 py-3 bg-red-500/30 border border-red-500/30 rounded-full hover:bg-red-500/50 hover:scale-105 transition-all text-red-300"
        >
          ✕ Close
        </button>
      </motion.div>
    </motion.div>
  );
};

const EventCard = ({ event, onDetails, onStats }) => {
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden flex flex-col"
    >
      <div className="h-52 w-full overflow-hidden relative">
        {event.image_url ? (
          <img
            src={event.image_url}
            className="w-full h-full object-cover"
            alt=""
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-4xl">
            🖼
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-500/80 text-white">
            ✅ Successful
          </span>
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1 gap-3">
        <h3 className="text-xl font-bold leading-snug">{event.title}</h3>
        <div className="space-y-1 text-base text-white/70">
          <p>📅 {fmtDate(event.date)}</p>
          <p>⏳ {formatDurationLabel(event.duration)}</p>
          <p>⏰ {fmtTime(event.time)}</p>
          <p>📍 {event.venue}</p>
          <p>🎟 {event.free ? "Free🎉" : `₹${event.ticket_price}`}</p>
        </div>
        <div className="flex gap-2 mt-auto pt-2">
          <button
            onClick={() => onDetails(event)}
            className="flex-1 py-2 text-sm font-medium bg-white/10 border border-white/20 rounded-xl hover:bg-white/20 transition-colors"
          >
            📄 Details
          </button>
          <button
            onClick={() => onStats(event)}
            className="flex-1 py-2 text-sm font-medium bg-purple-500/20 border border-purple-500/30 rounded-xl hover:bg-purple-500/40 transition-colors text-purple-300"
          >
            📊 Stats
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const SuccessfulEvents = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailEvent, setDetailEvent] = useState(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("created_by", user.email)
        .eq("status", "Successful")
        .order("created_at", { ascending: false });
      if (!error && data) setEvents(data);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 bg-gradient-to-br from-green-900 via-black to-teal-900 text-white">
      <div className="max-w-7xl mx-auto mb-10 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-5xl md:text-6xl font-extrabold tracking-tight"
        >
          Successful Events
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-white/40 mt-3 text-lg"
        >
          Events that have been completed successfully
        </motion.p>
      </div>

      {loading ? (
        <div className="text-center text-white/40 py-24 text-lg">
          Loading...
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          <AnimatePresence>
            {events.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="md:col-span-2 lg:col-span-3 flex flex-col items-center justify-center py-24 text-white/20 gap-4"
              >
                <span className="text-6xl">🏁</span>
                <p className="text-lg">No successful events yet.</p>
              </motion.div>
            )}
            {events.map((ev) => (
              <EventCard
                key={ev.id}
                event={ev}
                onDetails={(e) => setDetailEvent(e)}
                onStats={(e) =>
                  navigate(`/statistics/${e.event_uid}`, {
                    state: { event: e },
                  })
                }
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {detailEvent && (
          <DetailModal
            event={detailEvent}
            onClose={() => setDetailEvent(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SuccessfulEvents;
