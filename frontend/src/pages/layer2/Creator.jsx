import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";

const departmentsList = ["School", "Science", "Commerce", "Arts", "Sports"];
const programLevelsList = [
  "11th",
  "12th",
  "Undergraduate (UG)",
  "Postgraduate (PG)",
  "Diploma",
  "Postgraduate Diploma (PGD)",
  "Doctor of Philosophy (PhD)",
];

const departmentSendOrder = ["School", "Sports", "Science", "Commerce", "Arts"];
const programLevelSendOrder = [...programLevelsList];

const orderByList = (values = [], order = []) => {
  const unique = [...new Set(values)];
  return [...unique].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    const ra = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const rb = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    return ra - rb;
  });
};

const formatDurationLabel = (duration) => {
  const days = Number(duration || 0);
  return `${days} Day${days === 1 ? "" : "s"}`;
};

// ── Generate 7-char UID (uppercase letters + digits) ──────────────
const genUID = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let uid = "";
  for (let i = 0; i < 7; i++)
    uid += chars[Math.floor(Math.random() * chars.length)];
  return uid;
};

// ── Compute status from date + duration ───────────────────────────
const computeStatus = (date, duration, currentStatus) => {
  if (currentStatus === "Cancelled") return "Cancelled";
  if (!date || !duration) return "Ongoing";
  const end = new Date(date);
  end.setDate(end.getDate() + parseInt(duration));
  return new Date() >= end ? "Successful" : "Ongoing";
};

const isFullyBooked = (event) =>
  Number(event?.tickets_booked || 0) >= Number(event?.tickets || 0);

const normalizeEventVisibility = (event) =>
  isFullyBooked(event) ? { ...event, visibility: "Private" } : event;

/* ─── Read-only summary components ─── */
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

const StepBar = ({ step }) => (
  <div className="flex items-center gap-3 mb-8">
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= 1 ? "bg-purple-500" : "bg-white/20"}`}
    >
      1
    </div>
    <div
      className={`flex-1 h-0.5 transition-colors ${step === 2 ? "bg-purple-500" : "bg-white/20"}`}
    />
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step === 2 ? "bg-pink-500" : "bg-white/20"}`}
    >
      2
    </div>
  </div>
);

/* ─── Event Card ─── */
const EventCard = ({
  event,
  onToggleVisibility,
  onDetails,
  onCancelStart,
  onStats,
}) => {
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
      {/* Banner */}
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
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${event.visibility === "Public" ? "bg-green-500/80 text-white" : "bg-gray-600/80 text-white/70"}`}
          >
            {event.visibility === "Public" ? "🌐 Public" : "🔒 Private"}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        <h3 className="text-xl font-bold leading-snug">{event.title}</h3>
        <div className="space-y-1 text-base text-white/70">
          <p>📅 {fmtDate(event.date)}</p>
          <p>⏳ {formatDurationLabel(event.duration)}</p>
          <p>⏰ {fmtTime(event.time)}</p>
          <p>📍 {event.venue}</p>
          <p>🎟 {event.free ? "Free🎉" : `₹${event.ticket_price}`}</p>
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-sm text-white/50">Private</span>
          <button
            onClick={() => onToggleVisibility(event.id, event.visibility)}
            className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${event.visibility === "Public" ? "bg-green-500" : "bg-white/20"}`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300 ${event.visibility === "Public" ? "left-7" : "left-1"}`}
            />
          </button>
          <span className="text-sm text-white/50">Public</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-auto pt-2">
          <button
            onClick={() => onDetails(event)}
            className="flex-1 py-2 text-sm font-medium bg-white/10 border border-white/20 rounded-xl hover:bg-white/20 transition-colors"
          >
            📄 Details
          </button>
          <button
            onClick={() => onCancelStart(event.id)}
            className="flex-1 py-2 text-sm font-medium bg-red-500/20 border border-red-500/30 rounded-xl hover:bg-red-500/40 transition-colors text-red-300"
          >
            🚫 Revoke
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

/* ─── Cancellation Timer Modal ─── */
const CancelTimerModal = ({ onConfirm, onUndo }) => {
  const TOTAL_SECONDS = 15;
  const [seconds, setSeconds] = useState(TOTAL_SECONDS);

  useEffect(() => {
    if (seconds <= 0) {
      onConfirm();
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, onConfirm]);

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = (seconds / TOTAL_SECONDS) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6 text-center"
      >
        <div className="text-4xl">🚫</div>
        <div>
          <h3 className="text-xl font-semibold mb-1">Revoking Event</h3>
          <p className="text-sm text-white/50">
            This event will be permanently cancelled and delisted from all
            layers.
          </p>
        </div>
        <div className="relative w-24 h-24 flex items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" width="96" height="96">
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="6"
            />
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke={seconds > 5 ? "#ef4444" : "#f97316"}
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <span className="text-2xl font-bold">{seconds}</span>
        </div>
        <p className="text-sm text-white/40">
          Event will be revoked when timer ends
        </p>
        <button
          onClick={onUndo}
          className="w-full py-3 bg-white/10 border border-white/20 rounded-full text-base font-medium hover:bg-white/20 hover:scale-105 transition-all"
        >
          ↩ Undo — Keep Event
        </button>
      </motion.div>
    </motion.div>
  );
};

/* ─── Detail / Edit Modal ─── */
const DetailModal = ({ event, onClose, onUpdate, saving }) => {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ ...event });
  const [editErrors, setEditErrors] = useState({});
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showPublicWarning, setShowPublicWarning] = useState(false);
  const [bookedCount, setBookedCount] = useState(
    Number(event?.tickets_booked || 0),
  );
  const fileInputRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const fetchBookedCount = async () => {
      const { count } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("event_uid", event.event_uid);

      if (!isMounted) return;

      // Fallback to events.tickets_booked if count is unavailable.
      setBookedCount(
        typeof count === "number" ? count : Number(event?.tickets_booked || 0),
      );
    };

    fetchBookedCount();

    return () => {
      isMounted = false;
    };
  }, [event.event_uid, event.tickets_booked]);

  const validateEditFieldErrors = (name, form, cur = {}) => {
    const e = { ...cur };
    switch (name) {
      case "image":
        !form.image_url
          ? (e.image = "Banner / Brochure image is required")
          : delete e.image;
        break;
      case "title":
        !String(form.title || "").trim()
          ? (e.title = "Title is required")
          : delete e.title;
        break;
      case "date": {
        const today = new Date().toISOString().split("T")[0];
        if (!form.date) e.date = "Date is required";
        else if (form.date < today) e.date = "Event date cannot be in the past";
        else delete e.date;
        break;
      }
      case "duration":
        !form.duration || parseInt(form.duration, 10) <= 0
          ? (e.duration = "Duration must be greater than 0")
          : delete e.duration;
        break;
      case "time":
        !form.time ? (e.time = "Time is required") : delete e.time;
        break;
      case "venue":
        !String(form.venue || "").trim()
          ? (e.venue = "Venue is required")
          : delete e.venue;
        break;
      case "department":
        !form.department?.length
          ? (e.department = "Select department")
          : delete e.department;
        break;
      case "programLevel": {
        const skip = (form.department || []).some(
          (d) => d === "School" || d === "Sports",
        );
        skip || (form.program_level || []).length
          ? delete e.programLevel
          : (e.programLevel = "Select program level");
        break;
      }
      case "ticket_price":
      case "free":
        !form.free && (!form.ticket_price || parseFloat(form.ticket_price) <= 0)
          ? (e.price = "Enter price or select Free")
          : delete e.price;
        break;
      case "tickets":
        {
          const totalTickets = parseInt(form.tickets, 10);
          if (!form.tickets || Number.isNaN(totalTickets) || totalTickets <= 0)
            e.tickets = "Number of tickets must be greater than 0";
          else if (totalTickets < bookedCount)
            e.tickets = `Total tickets cannot be less than already booked tickets (${bookedCount}).`;
          else delete e.tickets;
        }
        break;
      case "access":
        !form.access ? (e.access = "Select access") : delete e.access;
        break;
      case "description":
        !String(form.description || "").trim()
          ? (e.description = "Description required")
          : delete e.description;
        break;
      default:
        break;
    }
    return e;
  };

  const validateEditField = (name, form = formData) => {
    let next = validateEditFieldErrors(name, form, editErrors);
    if (name === "department") {
      next = validateEditFieldErrors("programLevel", form, next);
    }
    setEditErrors(next);
  };

  const validateEditForm = () => {
    const fields = [
      "image",
      "title",
      "date",
      "duration",
      "time",
      "venue",
      "department",
      "programLevel",
      "ticket_price",
      "free",
      "tickets",
      "access",
      "description",
    ];
    let e = {};
    fields.forEach((f) => {
      e = validateEditFieldErrors(f, formData, e);
    });
    setEditErrors(e);
    return Object.keys(e).length === 0;
  };

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

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (
      (name === "duration" || name === "ticket_price" || name === "tickets") &&
      value < 0
    )
      return;
    const nf = { ...formData, [name]: value };
    setFormData(nf);
    validateEditField(name, nf);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${event.event_uid}_banner.${ext}`;
    const { error } = await supabase.storage
      .from("event-banners")
      .upload(path, file, { upsert: true });
    if (!error) {
      const {
        data: { publicUrl },
      } = supabase.storage.from("event-banners").getPublicUrl(path);
      const nf = { ...formData, image_url: publicUrl };
      setFormData(nf);
      validateEditField("image", nf);
    }
    setUploading(false);
  };

  const addTag = () => {
    const val = tagInput.trim().toLowerCase();
    if (!val) return;
    setFormData((f) => ({ ...f, tags: [...f.tags, val] }));
    setTagInput("");
  };

  const removeTag = (i) => {
    setFormData((f) => {
      const t = [...f.tags];
      t.splice(i, 1);
      return { ...f, tags: t };
    });
  };

  const toggleDepartment = (dep) => {
    setFormData((f) => {
      let upd = [...f.department];
      if (upd.includes(dep)) {
        upd = upd.filter((d) => d !== dep);
      } else if (dep === "School" || dep === "Sports") {
        upd = [dep];
      } else {
        upd = upd.filter((d) => d !== "School" && d !== "Sports");
        upd.push(dep);
      }
      const nf = {
        ...f,
        department: upd,
        program_level: upd.some((d) => d === "School" || d === "Sports")
          ? []
          : f.program_level,
      };
      let ne = validateEditFieldErrors("department", nf, editErrors);
      ne = validateEditFieldErrors("programLevel", nf, ne);
      setEditErrors(ne);
      return nf;
    });
  };

  const toggleProgramLevel = (level) => {
    setFormData((f) => {
      let upd = [...f.program_level];
      upd.includes(level)
        ? (upd = upd.filter((l) => l !== level))
        : upd.push(level);
      const nf = { ...f, program_level: upd };
      setEditErrors(validateEditFieldErrors("programLevel", nf, editErrors));
      return nf;
    });
  };

  const handleSave = async () => {
    if (!validateEditForm()) return;
    const ok = await onUpdate({
      ...formData,
      duration: parseInt(formData.duration, 10),
      tickets: parseInt(formData.tickets, 10),
      tags: (formData.tags || []).map((t) => String(t).toLowerCase()),
    });
    if (ok) setEditing(false);
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
        className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto overscroll-contain"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm uppercase tracking-widest text-white/40 mb-1">
              {editing ? "Make your changes below" : "Full event information"}
            </p>
            <h2 className="text-2xl font-semibold">
              {editing ? "Edit Event" : "Event Details"}
            </h2>
          </div>
          <span className="text-4xl">{editing ? "✏️" : "📄"}</span>
        </div>

        {/* Event UID badge — always visible */}
        <div className="flex items-center gap-3 mb-8 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <span className="text-white/40 text-sm font-semibold uppercase tracking-widest">
            Event UID
          </span>
          <span className="font-mono text-lg font-bold text-purple-300 tracking-widest">
            {event.event_uid}
          </span>
        </div>

        {/* ── VIEW MODE ── */}
        {!editing && (
          <>
            <div className="mb-8 rounded-2xl overflow-hidden border border-white/10 h-64 w-full bg-black/40">
              {formData.image_url ? (
                <img
                  src={formData.image_url}
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
                  <SummaryField label="Event Title" value={formData.title} />
                </div>
                <SummaryField label="Date" value={fmtDate(formData.date)} />
                <SummaryField
                  label="Duration"
                  value={
                    formData.duration
                      ? formatDurationLabel(formData.duration)
                      : ""
                  }
                />
                <SummaryField label="Time" value={fmtTime(formData.time)} />
                <SummaryField label="Venue" value={formData.venue} />
              </div>
            </div>
            <div className="mb-6">
              <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-3 border-b border-white/10">
                Audience
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <SummaryBadges
                  label="Department"
                  items={formData.department}
                  color="purple"
                />
                <SummaryBadges
                  label="Program Level"
                  items={
                    formData.department.some(
                      (d) => d === "School" || d === "Sports",
                    )
                      ? ["Not Applicable"]
                      : formData.program_level
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
                  value={
                    formData.free ? "Free 🎉" : `₹${formData.ticket_price}`
                  }
                />
                <SummaryField label="Total Tickets" value={formData.tickets} />
                <SummaryField label="Access" value={formData.access} />
              </div>
            </div>
            {formData.tags.length > 0 && (
              <div className="mb-6">
                <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-3 border-b border-white/10">
                  Tags
                </p>
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag, i) => (
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
                {formData.description}
              </div>
            </div>
            <>
              {/* Public edit warning */}
              <AnimatePresence>
                {showPublicWarning && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 mb-4"
                  >
                    <span className="text-yellow-400 text-lg mt-0.5">⚠️</span>
                    <p className="text-sm text-yellow-200/90 leading-relaxed">
                      This event is currently{" "}
                      <strong className="text-yellow-200">Public</strong>. To
                      make changes, first toggle the event to{" "}
                      <strong className="text-yellow-200">Private</strong> using
                      the toggle on the event card, then open Details again.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-red-500/30 border border-red-500/30 rounded-full hover:bg-red-500/50 hover:scale-105 transition-all text-red-300"
                >
                  ✕ Close
                </button>
                <div className="flex gap-3 ml-auto">
                  <button
                    onClick={() => {
                      if (formData.visibility === "Public") {
                        setShowPublicWarning(true);
                      } else {
                        setShowPublicWarning(false);
                        setEditing(true);
                      }
                    }}
                    className={`px-6 py-3 rounded-full font-medium hover:scale-105 transition-all ${
                      formData.visibility === "Public"
                        ? "bg-gray-500/40 text-white/40 cursor-not-allowed border border-white/10"
                        : "bg-gradient-to-r from-purple-500 to-pink-500"
                    }`}
                  >
                    ✏️ Update
                  </button>
                </div>
              </div>
            </>{" "}
          </>
        )}

        {/* ── EDIT MODE ── */}
        {editing && (
          <>
            {/* Image */}
            <div
              className="mb-6 relative group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-full h-64 border-2 border-dashed border-white/30 rounded-xl overflow-hidden">
                {formData.image_url ? (
                  <>
                    <img
                      src={formData.image_url}
                      className="w-full h-full object-contain bg-black/40"
                      alt="Preview"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const nf = { ...formData, image_url: null };
                        setFormData(nf);
                        setEditErrors(
                          validateEditFieldErrors("image", nf, editErrors),
                        );
                      }}
                      className="absolute top-2 right-2 hidden group-hover:block"
                    >
                      <span className="bg-black/60 rounded-full p-1.5 block">
                        🗑
                      </span>
                    </button>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-white/40 gap-2">
                    {uploading ? (
                      <span className="text-sm">Uploading...</span>
                    ) : (
                      <>
                        <span className="text-5xl">+</span>
                        <span className="text-sm">
                          Upload Banner / Brochure
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                hidden
              />
              {editErrors.image && (
                <p className="text-red-400 text-sm mt-2">{editErrors.image}</p>
              )}
            </div>

            {/* Basic Details */}
            <div className="mb-6">
              <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-4 border-b border-white/10">
                Basic Details
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <input
                    name="title"
                    placeholder="Title"
                    value={formData.title}
                    onChange={handleChange}
                    className="inputStyle w-full"
                  />
                  {editErrors.title && (
                    <p className="text-red-400 text-sm mt-1">
                      {editErrors.title}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={handleChange}
                    className="inputStyle w-full bg-white/15 border-white/25 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/40 transition-all [color-scheme:dark]"
                  />
                  {editErrors.date && (
                    <p className="text-red-400 text-sm mt-1">
                      {editErrors.date}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    type="number"
                    min="1"
                    name="duration"
                    value={formData.duration}
                    placeholder="Duration (days)"
                    onWheel={(e) => e.currentTarget.blur()}
                    onKeyDown={(e) =>
                      ["e", "E", "+", "-", "."].includes(e.key) &&
                      e.preventDefault()
                    }
                    onChange={handleChange}
                    className="inputStyle w-full"
                  />
                  {editErrors.duration && (
                    <p className="text-red-400 text-sm mt-1">
                      {editErrors.duration}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    type="time"
                    name="time"
                    value={formData.time}
                    onChange={handleChange}
                    className="inputStyle w-full bg-white/15 border-white/25 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/40 transition-all [color-scheme:dark]"
                  />
                  {editErrors.time && (
                    <p className="text-red-400 text-sm mt-1">
                      {editErrors.time}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    name="venue"
                    placeholder="Venue"
                    value={formData.venue}
                    onChange={handleChange}
                    className="inputStyle w-full"
                  />
                  {editErrors.venue && (
                    <p className="text-red-400 text-sm mt-1">
                      {editErrors.venue}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Audience */}
            <div className="mb-6">
              <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-4 border-b border-white/10">
                Audience
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="mb-1">Department</p>
                  <div className="flex flex-wrap gap-2">
                    {departmentsList.map((dep) => (
                      <button
                        type="button"
                        key={dep}
                        onClick={() => toggleDepartment(dep)}
                        className={`px-3 py-1 rounded-full border text-sm transition-colors ${formData.department.includes(dep) ? "bg-purple-500 border-purple-500" : "bg-white/10 border-white/30"}`}
                      >
                        {dep}
                      </button>
                    ))}
                  </div>
                  {editErrors.department && (
                    <p className="text-red-400 text-sm mt-1">
                      {editErrors.department}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="mb-1">Program Level</p>
                  <div className="flex flex-wrap gap-2">
                    {programLevelsList.map((level) => (
                      <button
                        type="button"
                        key={level}
                        disabled={
                          formData.department.includes("School") ||
                          formData.department.includes("Sports")
                        }
                        onClick={() => toggleProgramLevel(level)}
                        className={`px-3 py-1 rounded-full border text-sm transition-colors ${formData.program_level.includes(level) ? "bg-pink-500 border-pink-500" : "bg-white/10 border-white/30"} ${formData.department.includes("School") || formData.department.includes("Sports") ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  {editErrors.programLevel && (
                    <p className="text-red-400 text-sm mt-1">
                      {editErrors.programLevel}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Ticketing & Access */}
            <div className="mb-6">
              <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-4 border-b border-white/10">
                Ticketing & Access
              </p>
              <div className="flex gap-4 items-start mb-4">
                <div className="flex-1">
                  <div
                    className={`flex items-center border rounded-lg px-3 h-11 ${formData.free ? "bg-gray-700/50" : "bg-white/10"}`}
                  >
                    <span className="mr-2 text-lg">₹</span>
                    <input
                      type="number"
                      min="0"
                      name="ticket_price"
                      value={formData.free ? "" : formData.ticket_price}
                      disabled={formData.free}
                      placeholder="Ticket Price"
                      onKeyDown={(e) =>
                        ["e", "E", "+", "-"].includes(e.key) &&
                        e.preventDefault()
                      }
                      onChange={handleChange}
                      className={`bg-transparent flex-1 outline-none text-base ${formData.free ? "opacity-50" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nf = {
                          ...formData,
                          free: !formData.free,
                          ticket_price: !formData.free
                            ? ""
                            : formData.ticket_price,
                        };
                        setFormData(nf);
                        let ne = validateEditFieldErrors(
                          "ticket_price",
                          nf,
                          editErrors,
                        );
                        ne = validateEditFieldErrors("free", nf, ne);
                        setEditErrors(ne);
                      }}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${formData.free ? "bg-green-600" : "bg-green-500/30"}`}
                    >
                      Free
                    </button>
                  </div>
                  {editErrors.price && (
                    <p className="text-red-400 text-sm mt-1">
                      {editErrors.price}
                    </p>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    min={Math.max(1, bookedCount)}
                    name="tickets"
                    value={formData.tickets}
                    placeholder="No. of Tickets"
                    onKeyDown={(e) =>
                      ["e", "E", "+", "-", "."].includes(e.key) &&
                      e.preventDefault()
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={handleChange}
                    className="inputStyle w-full h-11"
                  />
                  {editErrors.tickets && (
                    <p className="text-red-400 text-sm mt-1">
                      {editErrors.tickets}
                    </p>
                  )}
                  {!editErrors.tickets && (
                    <p className="text-white/50 text-xs mt-1">
                      Already booked: {bookedCount}. You can keep the same value
                      or increase it, and can decrease only down to{" "}
                      {bookedCount}.
                    </p>
                  )}
                </div>
              </div>
              <select
                name="access"
                value={formData.access}
                onChange={handleChange}
                className="inputStyle w-full h-12"
              >
                <option
                  value=""
                  style={{ backgroundColor: "#4B5563", color: "white" }}
                >
                  Select Access
                </option>
                <option style={{ backgroundColor: "#4B5563", color: "white" }}>
                  Insider
                </option>
                <option style={{ backgroundColor: "#4B5563", color: "white" }}>
                  Outsider
                </option>
                <option style={{ backgroundColor: "#4B5563", color: "white" }}>
                  Both
                </option>
              </select>
              {editErrors.access && (
                <p className="text-red-400 text-sm mt-1">{editErrors.access}</p>
              )}
            </div>

            {/* Tags */}
            <div className="mb-6">
              <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-4 border-b border-white/10">
                Tags
              </p>
              <div className="flex gap-2 mb-2">
                <input
                  value={tagInput}
                  onChange={(e) =>
                    setTagInput(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Spacebar")
                      e.preventDefault();
                    if (e.key === "Enter") addTag();
                  }}
                  className="inputStyle flex-1"
                  placeholder="Enter tag (letters, numbers, _, no spaces)"
                />
                <button
                  onClick={addTag}
                  className="px-5 bg-purple-500 rounded-lg text-sm"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="bg-teal-500/30 border border-teal-500/50 text-teal-200 px-3 py-1 rounded-full text-base font-medium flex items-center gap-1"
                  >
                    🏷 {tag}
                    <button
                      onClick={() => removeTag(i)}
                      className="ml-1 hover:text-white transition-colors"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="mb-8">
              <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-4 border-b border-white/10">
                Description
              </p>
              <textarea
                name="description"
                maxLength={150}
                value={formData.description}
                onChange={handleChange}
                placeholder="Description (150 character limit)"
                className="inputStyle w-full h-32 resize-none"
              />
              {editErrors.description && (
                <p className="text-red-400 text-sm mt-1">
                  {editErrors.description}
                </p>
              )}
              <p className="text-xs text-white/30 text-right mt-1">
                {formData.description.length}/150
              </p>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => {
                  setEditing(false);
                  setFormData({ ...event });
                }}
                className="px-8 py-3 bg-red-500/30 border border-red-500/30 rounded-full hover:bg-red-500/50 hover:scale-105 transition-all text-red-300"
              >
                ✕ Discard Changes
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-8 py-3 rounded-full font-medium shadow-lg hover:scale-105 transition-all ${saving ? "bg-gray-500 cursor-not-allowed" : "bg-gradient-to-r from-purple-500 to-pink-500"}`}
              >
                {saving ? "Saving..." : "💾 Save Changes"}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

/* ════════════════════════════════
   MAIN CREATOR COMPONENT
════════════════════════════════ */
const Creator = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [events, setEvents] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [errors, setErrors] = useState({});
  const [detailEvent, setDetailEvent] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatorEmail, setCreatorEmail] = useState("");
  const [alertMsg, setAlertMsg] = useState("");

  const [formData, setFormData] = useState({
    image: null,
    imagePreview: null,
    tags: [],
    title: "",
    date: "",
    duration: "",
    time: "",
    venue: "",
    department: [],
    program_level: [],
    ticket_price: "",
    free: false,
    tickets: "",
    access: "",
    description: "",
  });

  const fileInputRef = useRef(null);

  const showAlert = useCallback((msg) => {
    setAlertMsg(msg);
  }, []);

  useEffect(() => {
    if (!alertMsg) return;
    const t = setTimeout(() => setAlertMsg(""), 3800);
    return () => clearTimeout(t);
  }, [alertMsg]);

  const overlayOpen = open || !!detailEvent || !!cancellingId;
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (overlayOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [overlayOpen]);

  // ── Load creator email + events on mount ──
  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setCreatorEmail(user.email);
      await fetchEvents(user.email);
    };
    init();
  }, []);

  useEffect(() => {
    if (!creatorEmail) return;

    const ch = supabase
      .channel(`creator-events-${creatorEmail}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `created_by=eq.${creatorEmail}`,
        },
        async (payload) => {
          const type = payload.eventType;
          const rowNew = payload.new;
          const rowOld = payload.old;

          if (type === "DELETE") {
            const delId = rowOld?.id;
            if (!delId) return;
            setEvents((prev) => prev.filter((ev) => ev.id !== delId));
            setDetailEvent((prev) => (prev?.id === delId ? null : prev));
            return;
          }

          if (!rowNew) return;
          const incoming = normalizeEventVisibility(rowNew);
          const wasOngoing = rowOld?.status === "Ongoing";
          const isOngoing = rowNew?.status === "Ongoing";

          if (type === "INSERT" && isOngoing) {
            setEvents((prev) => [
              incoming,
              ...prev.filter((ev) => ev.id !== incoming.id),
            ]);
          } else if (type === "UPDATE" && isOngoing && wasOngoing) {
            setEvents((prev) =>
              prev.map((ev) =>
                ev.id === incoming.id ? { ...ev, ...incoming } : ev,
              ),
            );
          } else if (type === "UPDATE" && wasOngoing && !isOngoing) {
            setEvents((prev) => prev.filter((ev) => ev.id !== rowNew.id));
          } else if (type === "UPDATE" && !wasOngoing && isOngoing) {
            setEvents((prev) => [
              incoming,
              ...prev.filter((ev) => ev.id !== incoming.id),
            ]);
          }

          setDetailEvent((prev) =>
            prev?.id === incoming.id ? { ...prev, ...incoming } : prev,
          );

          if (isFullyBooked(rowNew) && rowNew.visibility === "Public") {
            await supabase
              .from("events")
              .update({ visibility: "Private" })
              .eq("id", rowNew.id);
            showAlert(
              "All allocated tickets are booked. Event visibility was switched to Private. Increase ticket count in update to enable Public again.",
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [creatorEmail]);

  const fetchEvents = async (email, { silent = false } = {}) => {
    if (!silent) setLoadingEvents(true);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("created_by", email)
      .eq("status", "Ongoing")
      .order("created_at", { ascending: false });
    if (!error && data) {
      const normalized = data.map(normalizeEventVisibility);
      setEvents(normalized);

      const fullPublicIds = data
        .filter((ev) => isFullyBooked(ev) && ev.visibility === "Public")
        .map((ev) => ev.id);

      if (fullPublicIds.length) {
        await supabase
          .from("events")
          .update({ visibility: "Private" })
          .in("id", fullPublicIds);
        showAlert(
          "All allocated tickets are booked. Event visibility was switched to Private. Increase ticket count in update to enable Public again.",
        );
      }
    }
    if (!silent) setLoadingEvents(false);
  };

  /* ── Validation ── */
  const validateFieldErrors = (name, form, cur = {}) => {
    const e = { ...cur };
    switch (name) {
      case "title":
        !form.title.trim() ? (e.title = "Title is required") : delete e.title;
        break;
      case "image":
        !form.imagePreview
          ? (e.image = "Banner / Brochure image is required")
          : delete e.image;
        break;
      case "date": {
        const today = new Date().toISOString().split("T")[0];
        if (!form.date) e.date = "Date is required";
        else if (form.date < today) e.date = "Event date cannot be in the past";
        else delete e.date;
        break;
      }
      case "duration":
        !form.duration || parseInt(form.duration) <= 0
          ? (e.duration = "Duration must be greater than 0")
          : delete e.duration;
        break;
      case "time":
        !form.time ? (e.time = "Time is required") : delete e.time;
        break;
      case "venue":
        !form.venue.trim() ? (e.venue = "Venue is required") : delete e.venue;
        break;
      case "department":
        !form.department.length
          ? (e.department = "Select department")
          : delete e.department;
        break;
      case "programLevel": {
        const skip = form.department.some(
          (d) => d === "School" || d === "Sports",
        );
        skip || form.program_level.length
          ? delete e.programLevel
          : (e.programLevel = "Select program level");
        break;
      }
      case "ticket_price":
      case "free":
        !form.free &&
        (!form.ticket_price ||
          !String(form.ticket_price).trim() ||
          parseFloat(form.ticket_price) <= 0)
          ? (e.price = "Enter price or select Free")
          : delete e.price;
        break;
      case "tickets":
        !form.tickets || parseInt(form.tickets) <= 0
          ? (e.tickets = "Number of tickets must be greater than 0")
          : delete e.tickets;
        break;
      case "access":
        !form.access ? (e.access = "Select access") : delete e.access;
        break;
      case "description":
        !form.description.trim()
          ? (e.description = "Description required")
          : delete e.description;
        break;
      default:
        break;
    }
    return e;
  };

  const validateField = (name, form = formData) => {
    let u = validateFieldErrors(name, form, errors);
    if (name === "department") u = validateFieldErrors("programLevel", form, u);
    setErrors(u);
  };

  const validateStep1 = () => {
    const fields = [
      "image",
      "title",
      "date",
      "duration",
      "time",
      "venue",
      "department",
      "programLevel",
      "ticket_price",
      "free",
      "tickets",
      "access",
      "description",
    ];
    let e = {};
    fields.forEach((f) => {
      e = validateFieldErrors(f, formData, e);
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ── Handlers ── */
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (
      (name === "duration" || name === "ticket_price" || name === "tickets") &&
      value < 0
    )
      return;
    let upd = { ...formData };
    if (name === "ticket_price") {
      value === "0" || parseFloat(value) === 0
        ? (upd = { ...upd, free: true, ticket_price: "" })
        : (upd = { ...upd, ticket_price: value });
    } else {
      upd = { ...upd, [name]: value };
    }
    setFormData(upd);
    validateField(name, upd);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const nf = {
      ...formData,
      image: file,
      imagePreview: URL.createObjectURL(file),
    };
    setFormData(nf);
    validateField("image", nf);
  };

  const addTag = () => {
    const val = tagInput.trim().toLowerCase();
    if (!val) return;
    setFormData({ ...formData, tags: [...formData.tags, val] });
    setTagInput("");
  };

  const removeTag = (i) => {
    const t = [...formData.tags];
    t.splice(i, 1);
    setFormData({ ...formData, tags: t });
  };

  const toggleDepartment = (dep) => {
    let upd = [...formData.department];
    if (upd.includes(dep)) {
      upd = upd.filter((d) => d !== dep);
    } else if (dep === "School" || dep === "Sports") {
      upd = [dep];
    } else {
      upd = upd.filter((d) => d !== "School" && d !== "Sports");
      upd.push(dep);
    }
    const nf = {
      ...formData,
      department: upd,
      program_level: upd.some((d) => d === "School" || d === "Sports")
        ? []
        : formData.program_level,
    };
    setFormData(nf);
    let ne = validateFieldErrors("department", nf, errors);
    ne = validateFieldErrors("programLevel", nf, ne);
    setErrors(ne);
  };

  const toggleProgramLevel = (level) => {
    let upd = [...formData.program_level];
    upd.includes(level)
      ? (upd = upd.filter((l) => l !== level))
      : upd.push(level);
    const nf = { ...formData, program_level: upd };
    setFormData(nf);
    validateField("programLevel", nf);
  };

  const handleNext = () => {
    if (validateStep1()) setStep(2);
  };
  const handleBack = () => setStep(1);

  const handleCreate = async () => {
    setSaving(true);

    // Upload banner image if provided
    let image_url = null;
    const uid = genUID();
    if (formData.image) {
      const ext = formData.image.name.split(".").pop();
      const path = `${uid}_banner.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("event-banners")
        .upload(path, formData.image);
      if (!uploadErr) {
        const {
          data: { publicUrl },
        } = supabase.storage.from("event-banners").getPublicUrl(path);
        image_url = publicUrl;
      }
    }

    const { data, error } = await supabase
      .from("events")
      .insert([
        {
          event_uid: uid,
          visibility: "Private",
          status: "Ongoing",
          title: formData.title,
          date: formData.date,
          duration: parseInt(formData.duration),
          time: formData.time,
          venue: formData.venue,
          department: orderByList(formData.department, departmentSendOrder),
          program_level: orderByList(
            formData.program_level,
            programLevelSendOrder,
          ),
          ticket_price: formData.free
            ? null
            : parseFloat(formData.ticket_price),
          free: formData.free,
          tickets: parseInt(formData.tickets),
          access: formData.access,
          tags: formData.tags,
          description: formData.description,
          image_url,
          created_by: creatorEmail,
        },
      ])
      .select()
      .single();

    setSaving(false);

    if (error) {
      console.error(error);
      return;
    }

    setEvents((prev) => [data, ...prev]);
    setOpen(false);
    setStep(1);
    setFormData({
      image: null,
      imagePreview: null,
      tags: [],
      title: "",
      date: "",
      duration: "",
      time: "",
      venue: "",
      department: [],
      program_level: [],
      ticket_price: "",
      free: false,
      tickets: "",
      access: "",
      description: "",
    });
    setTagInput("");
    setErrors({});
  };

  // ── Toggle visibility in DB ──
  const handleToggleVisibility = async (id, current) => {
    const target = events.find((ev) => ev.id === id);
    if (current === "Private" && target && isFullyBooked(target)) {
      showAlert(
        "All allocated tickets are booked. This event cannot be made Public right now. Increase No. of Tickets in Update to enable Public again.",
      );
      return;
    }

    const next = current === "Public" ? "Private" : "Public";
    const { error } = await supabase
      .from("events")
      .update({ visibility: next })
      .eq("id", id);
    if (!error)
      setEvents((evs) =>
        evs.map((ev) => (ev.id === id ? { ...ev, visibility: next } : ev)),
      );
  };

  const handleCancelStart = (id) => setCancellingId(id);

  // ── Cancel: update status to Cancelled in DB ──
  const handleCancelConfirm = useCallback(async () => {
    const { error } = await supabase
      .from("events")
      .update({ status: "Cancelled" })
      .eq("id", cancellingId);
    if (!error) {
      setEvents((evs) => evs.filter((ev) => ev.id !== cancellingId));
      if (detailEvent?.id === cancellingId) setDetailEvent(null);
    }
    setCancellingId(null);
  }, [cancellingId, detailEvent]);

  const handleCancelUndo = () => setCancellingId(null);

  // ── Update event details in DB ──
  const handleUpdate = async (updated) => {
    const requestedTickets = parseInt(updated.tickets, 10);
    const { count: bookedCount } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_uid", updated.event_uid);

    const booked = Number.isFinite(bookedCount)
      ? bookedCount
      : Number(updated.tickets_booked || 0);

    if (Number.isNaN(requestedTickets) || requestedTickets < booked) {
      showAlert(
        `Cannot save update. Total tickets cannot be less than already booked tickets (${booked}).`,
      );
      return false;
    }

    setSaving(true);
    const { error } = await supabase
      .from("events")
      .update({
        title: updated.title,
        date: updated.date,
        duration: parseInt(updated.duration),
        time: updated.time,
        venue: updated.venue,
        department: orderByList(updated.department, departmentSendOrder),
        program_level: orderByList(
          updated.program_level,
          programLevelSendOrder,
        ),
        ticket_price: updated.free ? null : parseFloat(updated.ticket_price),
        free: updated.free,
        tickets: parseInt(updated.tickets),
        access: updated.access,
        tags: updated.tags,
        description: updated.description,
        image_url: updated.image_url,
      })
      .eq("id", updated.id);

    setSaving(false);
    if (!error) {
      setEvents((evs) =>
        evs.map((ev) => (ev.id === updated.id ? { ...ev, ...updated } : ev)),
      );
      setDetailEvent({ ...updated });
      return true;
    }
    return false;
  };

  const fmtDate = (d) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };
  const fmtTime = (t) => {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    return `${hr % 12 || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  };

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 bg-gradient-to-br from-purple-900 via-black to-pink-900 text-white">
      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[80] max-w-2xl w-[92%] sm:w-auto"
          >
            <div className="bg-yellow-500/15 border border-yellow-400/40 text-yellow-100 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-md text-sm sm:text-base">
              {alertMsg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto mb-10 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-5xl md:text-6xl font-extrabold tracking-tight"
        >
          Event Studio
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-white/40 mt-3 text-lg"
        >
          Events that are currently ongoing and created by management
        </motion.p>
      </div>

      {loadingEvents ? (
        <div className="text-center text-white/40 py-24 text-lg">
          Loading events...
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
                <span className="text-6xl">📭</span>
                <p className="text-lg">
                  No ongoing events. Create your first one!
                </p>
              </motion.div>
            )}
            {events.map((ev) => (
              <EventCard
                key={ev.id}
                event={ev}
                onToggleVisibility={handleToggleVisibility}
                onDetails={(e) => setDetailEvent(e)}
                onCancelStart={handleCancelStart}
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

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-4xl shadow-2xl z-40"
      >
        +
      </motion.button>

      {/* ── Detail Modal ── */}
      <AnimatePresence>
        {detailEvent && (
          <DetailModal
            event={detailEvent}
            onClose={() => setDetailEvent(null)}
            onUpdate={handleUpdate}
            saving={saving}
          />
        )}
      </AnimatePresence>

      {/* ── Cancel Timer Modal ── */}
      <AnimatePresence>
        {cancellingId && (
          <CancelTimerModal
            onConfirm={handleCancelConfirm}
            onUndo={handleCancelUndo}
          />
        )}
      </AnimatePresence>

      {/* ── Create Event Modal ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex justify-center items-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto overscroll-contain"
            >
              <StepBar step={step} />

              {/* ═══ STEP 1 ═══ */}
              {step === 1 && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-sm uppercase tracking-widest text-white/40 mb-1">
                        Fill in the event details
                      </p>
                      <h2 className="text-2xl font-semibold">Create Event</h2>
                    </div>
                    <span className="text-4xl">✏️</span>
                  </div>

                  {/* Image Upload */}
                  <div
                    className="mb-6 relative group cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="w-full h-64 border-2 border-dashed border-white/30 rounded-xl overflow-hidden">
                      {formData.imagePreview ? (
                        <img
                          src={formData.imagePreview}
                          className="w-full h-full object-contain bg-black/40"
                          alt="Preview"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-white/40 gap-2">
                          <span className="text-5xl">+</span>
                          <span className="text-sm">
                            Upload Banner / Brochure
                          </span>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      hidden
                    />
                    {errors.image && (
                      <p className="text-red-400 text-sm mt-2">
                        {errors.image}
                      </p>
                    )}
                  </div>

                  {/* Basic Details */}
                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-4 border-b border-white/10">
                      Basic Details
                    </p>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="md:col-span-2 space-y-1">
                        <input
                          name="title"
                          placeholder="Title"
                          value={formData.title}
                          onChange={handleChange}
                          className="inputStyle w-full"
                        />
                        {errors.title && (
                          <p className="text-red-400 text-sm">{errors.title}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <input
                          type="date"
                          name="date"
                          value={formData.date}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={handleChange}
                          className="inputStyle w-full bg-white/15 border-white/25 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/40 transition-all [color-scheme:dark]"
                        />
                        {errors.date && (
                          <p className="text-red-400 text-sm">{errors.date}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <input
                          type="number"
                          min="1"
                          name="duration"
                          value={formData.duration}
                          placeholder="Duration (days)"
                          onKeyDown={(e) =>
                            ["e", "E", "+", "-", "."].includes(e.key) &&
                            e.preventDefault()
                          }
                          onChange={handleChange}
                          className="inputStyle w-full"
                        />
                        {errors.duration && (
                          <p className="text-red-400 text-sm">
                            {errors.duration}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <input
                          type="time"
                          name="time"
                          value={formData.time}
                          onChange={handleChange}
                          className="inputStyle w-full bg-white/15 border-white/25 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/40 transition-all [color-scheme:dark]"
                        />
                        {errors.time && (
                          <p className="text-red-400 text-sm">{errors.time}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <input
                          name="venue"
                          placeholder="Venue"
                          value={formData.venue}
                          onChange={handleChange}
                          className="inputStyle w-full"
                        />
                        {errors.venue && (
                          <p className="text-red-400 text-sm">{errors.venue}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Audience */}
                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-4 border-b border-white/10">
                      Audience
                    </p>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <p className="mb-1">Department</p>
                        <div className="flex flex-wrap gap-2">
                          {departmentsList.map((dep) => (
                            <button
                              type="button"
                              key={dep}
                              onClick={() => toggleDepartment(dep)}
                              className={`px-3 py-1 rounded-full border text-sm transition-colors ${formData.department.includes(dep) ? "bg-purple-500 border-purple-500" : "bg-white/10 border-white/30"}`}
                            >
                              {dep}
                            </button>
                          ))}
                        </div>
                        {errors.department && (
                          <p className="text-red-400 text-sm">
                            {errors.department}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="mb-1">Program Level</p>
                        <div className="flex flex-wrap gap-2">
                          {programLevelsList.map((level) => (
                            <button
                              type="button"
                              key={level}
                              disabled={
                                formData.department.includes("School") ||
                                formData.department.includes("Sports")
                              }
                              onClick={() => toggleProgramLevel(level)}
                              className={`px-3 py-1 rounded-full border text-sm transition-colors ${formData.program_level.includes(level) ? "bg-pink-500 border-pink-500" : "bg-white/10 border-white/30"} ${formData.department.includes("School") || formData.department.includes("Sports") ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              {level}
                            </button>
                          ))}
                        </div>
                        {errors.programLevel && (
                          <p className="text-red-400 text-sm">
                            {errors.programLevel}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ticketing & Access */}
                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-4 border-b border-white/10">
                      Ticketing & Access
                    </p>
                    <div className="flex gap-4 items-start mb-4">
                      <div className="flex-1">
                        <div
                          className={`relative flex items-center border rounded-lg px-3 h-11 ${formData.free ? "bg-gray-700/50" : "bg-white/10"}`}
                        >
                          <span className="mr-2 text-lg">₹</span>
                          <input
                            type="number"
                            min="0"
                            name="ticket_price"
                            value={formData.free ? "" : formData.ticket_price}
                            disabled={formData.free}
                            placeholder="Ticket Price"
                            onKeyDown={(e) =>
                              ["e", "E", "+", "-"].includes(e.key) &&
                              e.preventDefault()
                            }
                            onChange={handleChange}
                            className={`bg-transparent flex-1 outline-none text-base ${formData.free ? "opacity-50" : ""}`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const nf = {
                                ...formData,
                                free: !formData.free,
                                ticket_price: !formData.free
                                  ? ""
                                  : formData.ticket_price,
                              };
                              setFormData(nf);
                              let ne = validateFieldErrors(
                                "ticket_price",
                                nf,
                                errors,
                              );
                              ne = validateFieldErrors("free", nf, ne);
                              setErrors(ne);
                            }}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${formData.free ? "bg-green-600" : "bg-green-500/30"}`}
                          >
                            Free
                          </button>
                        </div>
                        {errors.price && (
                          <p className="text-red-400 text-sm mt-1">
                            {errors.price}
                          </p>
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          type="number"
                          min="1"
                          name="tickets"
                          value={formData.tickets}
                          placeholder="No. of Tickets"
                          onKeyDown={(e) =>
                            ["e", "E", "+", "-", "."].includes(e.key) &&
                            e.preventDefault()
                          }
                          onChange={handleChange}
                          className="inputStyle w-full h-11"
                        />
                        {errors.tickets && (
                          <p className="text-red-400 text-sm mt-1">
                            {errors.tickets}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <select
                        name="access"
                        value={formData.access}
                        onChange={handleChange}
                        className="inputStyle w-full h-12"
                      >
                        <option
                          value=""
                          style={{ backgroundColor: "#4B5563", color: "white" }}
                        >
                          Select Access
                        </option>
                        <option
                          style={{ backgroundColor: "#4B5563", color: "white" }}
                        >
                          Insider
                        </option>
                        <option
                          style={{ backgroundColor: "#4B5563", color: "white" }}
                        >
                          Outsider
                        </option>
                        <option
                          style={{ backgroundColor: "#4B5563", color: "white" }}
                        >
                          Both
                        </option>
                      </select>
                      {errors.access && (
                        <p className="text-red-400 text-sm">{errors.access}</p>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-4 border-b border-white/10">
                      Tags
                    </p>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={tagInput}
                          onChange={(e) =>
                            setTagInput(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9_]/g, ""),
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Spacebar")
                              e.preventDefault();
                            if (e.key === "Enter") addTag();
                          }}
                          className="inputStyle flex-1"
                          placeholder="Enter tag (letters, numbers, _, no spaces)"
                        />
                        <button
                          onClick={addTag}
                          className="px-5 bg-purple-500 rounded-lg text-sm"
                        >
                          Add
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {formData.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="bg-teal-500/30 border border-teal-500/50 text-teal-200 px-3 py-1 rounded-full text-base font-medium flex items-center gap-1"
                          >
                            🏷 {tag}
                            <button
                              onClick={() => removeTag(i)}
                              className="ml-1 hover:text-white transition-colors"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-4 border-b border-white/10">
                      Description
                    </p>
                    <div className="space-y-1">
                      <textarea
                        name="description"
                        maxLength={150}
                        value={formData.description}
                        onChange={handleChange}
                        placeholder="Description (150 character limit)"
                        className="inputStyle w-full h-32 resize-none"
                      />
                      <div className="flex justify-between items-center">
                        {errors.description ? (
                          <p className="text-red-400 text-sm">
                            {errors.description}
                          </p>
                        ) : (
                          <span />
                        )}
                        <p className="text-xs text-white/30 ml-auto">
                          {formData.description.length}/150
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between mt-8">
                    <button
                      onClick={() => setOpen(false)}
                      className="px-8 py-3 bg-red-500/30 border border-red-500/30 rounded-full hover:bg-red-500/50 hover:scale-105 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleNext}
                      className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-medium shadow-lg hover:scale-105 transition-all"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}

              {/* ═══ STEP 2 — SUMMARY ═══ */}
              {step === 2 && (
                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <p className="text-sm uppercase tracking-widest text-white/40 mb-1">
                        Review before publishing
                      </p>
                      <h2 className="text-2xl font-semibold">Event Summary</h2>
                    </div>
                    <span className="text-4xl">📋</span>
                  </div>

                  <div className="mb-8 rounded-2xl overflow-hidden border border-white/10 h-64 w-full bg-black/40">
                    {formData.imagePreview ? (
                      <img
                        src={formData.imagePreview}
                        className="w-full h-full object-contain"
                        alt="Banner"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-white/20 gap-2">
                        <span className="text-4xl">🖼</span>
                        <span className="text-sm">No banner uploaded</span>
                      </div>
                    )}
                  </div>

                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-3 border-b border-white/10">
                      Basic Details
                    </p>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <SummaryField
                          label="Event Title"
                          value={formData.title}
                        />
                      </div>
                      <SummaryField
                        label="Date"
                        value={fmtDate(formData.date)}
                      />
                      <SummaryField
                        label="Duration"
                        value={
                          formData.duration
                            ? formatDurationLabel(formData.duration)
                            : ""
                        }
                      />
                      <SummaryField
                        label="Time"
                        value={fmtTime(formData.time)}
                      />
                      <SummaryField label="Venue" value={formData.venue} />
                    </div>
                  </div>

                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-3 border-b border-white/10">
                      Audience
                    </p>
                    <div className="grid md:grid-cols-2 gap-4">
                      <SummaryBadges
                        label="Department"
                        items={formData.department}
                        color="purple"
                      />
                      <SummaryBadges
                        label="Program Level"
                        items={
                          formData.department.some(
                            (d) => d === "School" || d === "Sports",
                          )
                            ? ["Not Applicable"]
                            : formData.program_level
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
                        value={
                          formData.free
                            ? "Free 🎉"
                            : `₹${formData.ticket_price}`
                        }
                      />
                      <SummaryField
                        label="Total Tickets"
                        value={formData.tickets}
                      />
                      <SummaryField label="Access" value={formData.access} />
                    </div>
                  </div>

                  {formData.tags.length > 0 && (
                    <div className="mb-6">
                      <p className="text-sm uppercase tracking-widest text-white/50 pb-2 mb-3 border-b border-white/10">
                        Tags
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {formData.tags.map((tag, i) => (
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
                    <div className="text-base text-white/100 bg-white/5 border border-white/10 rounded-xl px-4 py-3 leading-relaxed">
                      {formData.description}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-8">
                    <span className="text-yellow-400 text-base">⚠️</span>
                    <p className="text-base text-yellow-200/90 leading-relaxed">
                      Please review all details carefully. Click{" "}
                      <strong className="text-yellow-200">Back</strong> to make
                      any changes before publishing.
                    </p>
                  </div>

                  <div className="flex justify-between">
                    <button
                      onClick={handleBack}
                      className="px-8 py-3 bg-red-500/30 border border-red-500/30 rounded-full hover:bg-red-500/50 hover:scale-105 transition-all"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={saving}
                      className={`px-8 py-3 rounded-full font-medium shadow-lg hover:scale-105 transition-all ${saving ? "bg-gray-500 cursor-not-allowed" : "bg-gradient-to-r from-purple-500 to-pink-500"}`}
                    >
                      {saving ? "Creating..." : "🚀 Create Event"}
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Creator;
