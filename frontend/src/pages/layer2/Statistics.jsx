import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

const toDomainType = (email = "") => {
  const e = email.toLowerCase();
  if (e.endsWith("@somaiya.edu")) return "insider";
  if (e.endsWith("@gmail.com")) return "outsider";
  return "other";
};

const fmtCurrency = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const CircularProgress = ({ booked, total }) => {
  const safeTotal = Math.max(Number(total || 0), 0);
  const safeBooked = Math.max(Number(booked || 0), 0);
  const ratio = safeTotal > 0 ? Math.min(safeBooked / safeTotal, 1) : 0;
  const pct = Math.round(ratio * 100);

  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;

  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 flex flex-col items-center justify-center shadow-xl">
      <h3 className="text-sm tracking-widest uppercase text-white/60 mb-4">
        Booking Progress
      </h3>
      <div className="relative w-44 h-44">
        <svg className="absolute inset-0 -rotate-90" width="176" height="176">
          <circle
            cx="88"
            cy="88"
            r={radius}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="12"
            fill="none"
          />
          <circle
            cx="88"
            cy="88"
            r={radius}
            stroke="url(#grad)"
            strokeWidth="12"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-3xl font-bold">
            {safeBooked}/{safeTotal || 0}
          </p>
          <p className="text-xs text-white/60">{pct}% Filled</p>
        </div>
      </div>
    </div>
  );
};

const NotesModal = ({ notes, onClose }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center"
  >
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      className="w-full max-w-xl bg-white text-gray-900 rounded-2xl shadow-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">Ticket Notes</h3>
        <button
          onClick={onClose}
          className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
        >
          Close
        </button>
      </div>
      <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap leading-relaxed text-sm">
        {notes}
      </div>
    </motion.div>
  </motion.div>
);

const Statistics = () => {
  const { eventUid: eventUidParam } = useParams();
  const location = useLocation();

  const eventUidFromState =
    location.state?.event?.event_uid || location.state?.event_uid || null;
  const eventUid = eventUidParam || eventUidFromState;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventData, setEventData] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [showRecords, setShowRecords] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [searchField, setSearchField] = useState("name");
  const [search, setSearch] = useState("");
  const [emailDomainFilter, setEmailDomainFilter] = useState("all");

  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [selectedPrograms, setSelectedPrograms] = useState([]);

  const [fareType, setFareType] = useState("all"); // all | free | paid
  const [selectedPaidAmount, setSelectedPaidAmount] = useState(null);

  const [notesOpen, setNotesOpen] = useState(false);
  const [notesText, setNotesText] = useState("");

  const fetchTickets = async (uid) => {
    const { data, error: tErr } = await supabase
      .from("tickets")
      .select("*")
      .eq("event_uid", uid)
      .order("booked_at", { ascending: false });

    console.log("[Statistics] fetchTickets →", {
      uid,
      rowCount: data?.length,
      error: tErr,
    });
    if (tErr) throw tErr;
    setTickets(data || []);
  };

  const fetchAll = async () => {
    if (!eventUid) {
      setError("Missing event UID. Open Statistics from an event card.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: ev, error: eErr } = await supabase
        .from("events")
        .select(
          "event_uid, title, tickets, tickets_booked, free, ticket_price, access, department, program_level",
        )
        .eq("event_uid", eventUid)
        .maybeSingle();

      if (eErr) throw eErr;
      if (!ev) {
        setError("Event not found.");
        setLoading(false);
        return;
      }

      setEventData(ev);
      await fetchTickets(eventUid);
    } catch (err) {
      setError(err.message || "Failed to load statistics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [eventUid]);

  useEffect(() => {
    if (!eventUid) return;

    const ch = supabase
      .channel(`stats-tickets-${eventUid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        (payload) => {
          const newUid = payload.new?.event_uid;
          const oldUid = payload.old?.event_uid;
          if (newUid === eventUid || oldUid === eventUid) {
            fetchTickets(eventUid);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [eventUid]);

  const available = useMemo(() => {
    const depts = [
      ...new Set(
        tickets.map((t) => (t.department || "").trim()).filter(Boolean),
      ),
    ].sort();
    const progs = [
      ...new Set(
        tickets.map((t) => (t.program_level || "").trim()).filter(Boolean),
      ),
    ].sort();
    const paidAmounts = [
      ...new Set(
        tickets
          .filter((t) => !t.free)
          .map((t) => Number(t.amount || 0))
          .filter((n) => Number.isFinite(n) && n >= 0),
      ),
    ].sort((a, b) => a - b);

    const hasInsider = tickets.some((t) => toDomainType(t.email) === "insider");
    const hasOutsider = tickets.some(
      (t) => toDomainType(t.email) === "outsider",
    );

    return {
      hasName: tickets.some((t) => (t.name || "").trim()),
      hasEmail: tickets.some((t) => (t.email || "").trim()),
      hasPhone: tickets.some((t) => (t.phone || "").trim()),
      hasIdCard: tickets.some((t) => (t.id_card_number || "").trim()),
      hasTicketUid: tickets.some((t) => (t.ticket_uid || "").trim()),
      hasTransactionId: tickets.some((t) => (t.transaction_id || "").trim()),
      hasInsider,
      hasOutsider,
      departments: depts,
      programs: progs,
      paidAmounts,
    };
  }, [tickets]);

  useEffect(() => {
    if (fareType !== "paid") {
      setSelectedPaidAmount(null);
      return;
    }
    if (available.paidAmounts.length && selectedPaidAmount == null) {
      setSelectedPaidAmount(available.paidAmounts[0]);
    }
  }, [fareType, available.paidAmounts, selectedPaidAmount]);

  const onSearchChange = (val) => {
    if (searchField === "ticket_uid") {
      const upper = (val || "").toUpperCase();
      if (!upper.startsWith("T-")) {
        setSearch("T-");
        return;
      }
      const suffix = upper.slice(2).replace(/[^A-Z0-9]/g, "");
      setSearch(`T-${suffix}`);
      return;
    }
    if (searchField === "name") {
      setSearch(val.replace(/[^a-zA-Z\s]/g, ""));
      return;
    }
    if (searchField === "phone" || searchField === "id_card_number") {
      setSearch(val.replace(/\D/g, "").slice(0, 10));
      return;
    }
    setSearch(val);
  };

  const filteredRows = useMemo(() => {
    let rows = [...tickets];

    if (selectedDepartments.length) {
      rows = rows.filter((r) =>
        selectedDepartments.includes((r.department || "").trim()),
      );
    }

    if (selectedPrograms.length) {
      rows = rows.filter((r) =>
        selectedPrograms.includes((r.program_level || "").trim()),
      );
    }

    if (fareType === "free") {
      rows = rows.filter((r) => !!r.free);
    } else if (fareType === "paid") {
      rows = rows.filter((r) => !r.free);
      if (selectedPaidAmount != null) {
        rows = rows.filter(
          (r) => Number(r.amount || 0) === Number(selectedPaidAmount),
        );
      }
    }

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const fieldValue = (r[searchField] || "").toString().toLowerCase();
        return fieldValue.includes(q);
      });
    }

    if (searchField === "email" && emailDomainFilter !== "all") {
      rows = rows.filter((r) => toDomainType(r.email) === emailDomainFilter);
    }

    return rows;
  }, [
    tickets,
    selectedDepartments,
    selectedPrograms,
    fareType,
    selectedPaidAmount,
    search,
    searchField,
    emailDomainFilter,
  ]);

  const stats = useMemo(() => {
    const booked = tickets.length;
    const allocated = Number(eventData?.tickets || 0);
    const freeCount = tickets.filter((t) => !!t.free).length;
    const paidCount = tickets.filter((t) => !t.free).length;
    const revenue = tickets.reduce((acc, t) => acc + Number(t.amount || 0), 0);
    return { booked, allocated, freeCount, paidCount, revenue };
  }, [tickets, eventData]);

  const hasBothFareTypes = stats.freeCount > 0 && stats.paidCount > 0;

  useEffect(() => {
    if (!hasBothFareTypes) {
      setFareType("all");
    }
  }, [hasBothFareTypes]);

  const paidSliderIndex = available.paidAmounts.findIndex(
    (x) => x === selectedPaidAmount,
  );
  const paidSliderSafeIndex = paidSliderIndex >= 0 ? paidSliderIndex : 0;

  const searchPlaceholder = useMemo(() => {
    if (searchField === "name") return "Search by Name";
    if (searchField === "email") return "Search by Email";
    if (searchField === "phone") return "Search by Phone (10 digits)";
    if (searchField === "id_card_number")
      return "Search by ID Card (10 digits)";
    if (searchField === "ticket_uid") return "Search by Ticket UID (T-...)";
    if (searchField === "transaction_id") return "Search by Transaction ID";
    return "Search records";
  }, [searchField]);

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 bg-gradient-to-br from-indigo-900 via-black to-fuchsia-900 text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-[560px] h-[560px] bg-cyan-500/20 rounded-full blur-[140px] top-[-160px] left-[-200px]" />
        <div className="absolute w-[500px] h-[500px] bg-pink-500/20 rounded-full blur-[130px] bottom-[-160px] right-[-180px]" />
      </div>

      <div className="relative max-w-7xl mx-auto">
        <div className="mb-6">
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-4xl md:text-5xl font-extrabold tracking-tight text-center mb-4"
          >
            Statistics
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="flex flex-wrap items-start justify-between gap-3"
          >
            <p className="text-[1.9rem] md:text-[2.1rem] font-extrabold text-white">
              {eventData?.title || "—"}
            </p>
            <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <span className="text-white/40 text-sm font-semibold uppercase tracking-widest">
                Event UID
              </span>
              <span className="font-mono text-lg font-bold text-green-300 tracking-widest">
                {eventUid || "—"}
              </span>
            </div>
          </motion.div>
        </div>

        {loading && (
          <div className="py-24 text-center text-white/60 text-lg">
            Loading statistics...
          </div>
        )}

        {!loading && error && (
          <div className="py-16 text-center text-red-300 bg-red-500/10 border border-red-500/30 rounded-2xl">
            {error}
          </div>
        )}

        {!loading && !error && (
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="grid lg:grid-cols-3 gap-6 mb-8">
              <CircularProgress booked={stats.booked} total={stats.allocated} />

              <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-xl min-h-[240px] flex flex-col">
                <h3 className="text-sm tracking-widest uppercase text-white/60 mb-2 text-center">
                  Revenue
                </h3>
                <div className="flex-1 flex items-center justify-center">
                  {stats.booked > 0 ? (
                    <p className="text-6xl font-extrabold text-center leading-none">
                      {stats.paidCount === 0
                        ? "Free"
                        : fmtCurrency(stats.revenue)}
                    </p>
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-xl min-h-[240px] flex flex-col">
                <h3 className="text-sm tracking-widest uppercase text-white/60 mb-4 text-center">
                  Fare Distribution
                </h3>
                {stats.booked === 0 ? (
                  <div className="flex-1" />
                ) : stats.freeCount > 0 && stats.paidCount > 0 ? (
                  <div className="space-y-3 mt-1">
                    <p className="flex items-center gap-3 text-3xl font-bold">
                      <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
                      <span>{stats.paidCount} Paid</span>
                    </p>
                    <p className="flex items-center gap-3 text-3xl font-bold">
                      <span className="w-3 h-3 rounded-full bg-cyan-400 inline-block" />
                      <span>{stats.freeCount} Free</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-white text-4xl font-extrabold mt-2">
                    {stats.paidCount > 0
                      ? `${stats.paidCount} Paid`
                      : `${stats.freeCount} Free`}
                  </p>
                )}
              </div>
            </div>

            {!showRecords ? (
              <div className="text-center mb-10">
                <motion.button
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowRecords(true)}
                  className="px-10 py-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 font-semibold text-lg shadow-2xl"
                >
                  Show Records
                </motion.button>
              </div>
            ) : (
              <>
                <div className="bg-white/10 border border-white/20 rounded-2xl p-4 md:p-5 mb-5 backdrop-blur-xl">
                  <div className="flex flex-col md:flex-row gap-3 md:items-center">
                    <input
                      value={search}
                      onChange={(e) => onSearchChange(e.target.value)}
                      placeholder={searchPlaceholder}
                      className="flex-1 px-4 py-3 rounded-xl bg-black/30 border border-white/20 focus:outline-none focus:ring-2 focus:ring-pink-400"
                    />

                    <button
                      onClick={() => setShowFilters((s) => !s)}
                      className="px-4 py-3 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 transition font-medium"
                    >
                      ⚙ Filters
                    </button>
                  </div>

                  <AnimatePresence>
                    {showFilters && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="mt-4 bg-black/30 border border-white/15 rounded-xl p-4 space-y-5"
                      >
                        <div>
                          <h4 className="text-sm uppercase tracking-widest text-white/60 mb-2">
                            Identity & Contact
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {available.hasName && (
                              <button
                                onClick={() => {
                                  setSearchField("name");
                                  setSearch("");
                                }}
                                className={`px-3 py-1.5 rounded-full border text-sm ${searchField === "name" ? "bg-[#FFB6C1]/45 border-[#FFB6C1] text-white" : "bg-white/10 border-white/20"}`}
                              >
                                Name
                              </button>
                            )}
                            {available.hasEmail && (
                              <button
                                onClick={() => {
                                  setSearchField("email");
                                  setSearch("");
                                }}
                                className={`px-3 py-1.5 rounded-full border text-sm ${searchField === "email" ? "bg-[#FFB6C1]/45 border-[#FFB6C1] text-white" : "bg-white/10 border-white/20"}`}
                              >
                                Email
                              </button>
                            )}
                            {available.hasPhone && (
                              <button
                                onClick={() => {
                                  setSearchField("phone");
                                  setSearch("");
                                }}
                                className={`px-3 py-1.5 rounded-full border text-sm ${searchField === "phone" ? "bg-[#FFB6C1]/45 border-[#FFB6C1] text-white" : "bg-white/10 border-white/20"}`}
                              >
                                Phone
                              </button>
                            )}
                            {available.hasIdCard && (
                              <button
                                onClick={() => {
                                  setSearchField("id_card_number");
                                  setSearch("");
                                }}
                                className={`px-3 py-1.5 rounded-full border text-sm ${searchField === "id_card_number" ? "bg-[#FFB6C1]/45 border-[#FFB6C1] text-white" : "bg-white/10 border-white/20"}`}
                              >
                                ID Card
                              </button>
                            )}
                          </div>

                          {searchField === "email" &&
                            available.hasInsider &&
                            available.hasOutsider && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {["insider", "outsider"].map((d) => (
                                  <button
                                    key={d}
                                    onClick={() =>
                                      setEmailDomainFilter((prev) =>
                                        prev === d ? "all" : d,
                                      )
                                    }
                                    className={`px-3 py-1.5 rounded-full border text-sm ${
                                      emailDomainFilter === d
                                        ? "bg-cyan-500/30 border-cyan-300"
                                        : "bg-white/10 border-white/20"
                                    }`}
                                  >
                                    {d === "insider"
                                      ? "Insider (@somaiya.edu)"
                                      : "Outsider (@gmail.com)"}
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>

                        <div>
                          <h4 className="text-sm uppercase tracking-widest text-white/60 mb-2">
                            Ticket & Payment
                          </h4>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {available.hasTicketUid && (
                              <button
                                onClick={() => {
                                  setSearchField("ticket_uid");
                                  setSearch("T-");
                                }}
                                className={`px-3 py-1.5 rounded-full border text-sm ${searchField === "ticket_uid" ? "bg-yellow-500/40 border-yellow-300 text-white" : "bg-white/10 border-white/20"}`}
                              >
                                Ticket UID
                              </button>
                            )}
                            {available.hasTransactionId && (
                              <button
                                onClick={() => {
                                  setSearchField("transaction_id");
                                  setSearch("");
                                }}
                                className={`px-3 py-1.5 rounded-full border text-sm ${searchField === "transaction_id" ? "bg-yellow-500/40 border-yellow-300 text-white" : "bg-white/10 border-white/20"}`}
                              >
                                Transaction ID
                              </button>
                            )}
                          </div>

                          {hasBothFareTypes && (
                            <div className="flex flex-wrap gap-2">
                              {["free", "paid"].map((f) => (
                                <button
                                  key={f}
                                  onClick={() =>
                                    setFareType((prev) =>
                                      prev === f ? "all" : f,
                                    )
                                  }
                                  className={`px-3 py-1.5 rounded-full border text-sm ${
                                    fareType === f
                                      ? "bg-emerald-500/30 border-emerald-300"
                                      : "bg-white/10 border-white/20"
                                  }`}
                                >
                                  {f === "free" ? "Free" : "Paid"}
                                </button>
                              ))}
                            </div>
                          )}

                          {fareType === "paid" &&
                            available.paidAmounts.length > 1 && (
                              <div className="mt-3">
                                <p className="text-sm text-white/70 mb-2">
                                  Amount:{" "}
                                  <span className="font-semibold">
                                    {fmtCurrency(
                                      selectedPaidAmount ||
                                        available.paidAmounts[0],
                                    )}
                                  </span>
                                </p>
                                <input
                                  type="range"
                                  min={0}
                                  max={Math.max(
                                    available.paidAmounts.length - 1,
                                    0,
                                  )}
                                  step={1}
                                  value={paidSliderSafeIndex}
                                  onChange={(e) => {
                                    const idx = Number(e.target.value);
                                    setSelectedPaidAmount(
                                      available.paidAmounts[idx] ??
                                        available.paidAmounts[0],
                                    );
                                  }}
                                  className="w-40 accent-pink-400"
                                />
                              </div>
                            )}
                        </div>

                        <div>
                          <h4 className="text-sm uppercase tracking-widest text-white/60 mb-2">
                            Audience
                          </h4>
                          {available.departments.length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs text-white/60 mb-2">
                                Department
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {available.departments.map((d) => {
                                  const selected =
                                    selectedDepartments.includes(d);
                                  return (
                                    <button
                                      key={d}
                                      onClick={() =>
                                        setSelectedDepartments((prev) =>
                                          selected
                                            ? prev.filter((x) => x !== d)
                                            : [...prev, d],
                                        )
                                      }
                                      className={`px-3 py-1.5 rounded-full border text-sm ${
                                        selected
                                          ? "bg-blue-500/35 border-blue-300"
                                          : "bg-white/10 border-white/20"
                                      }`}
                                    >
                                      {d}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {available.programs.length > 0 && (
                            <div>
                              <p className="text-xs text-white/60 mb-2">
                                Program Level
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {available.programs.map((p) => {
                                  const selected = selectedPrograms.includes(p);
                                  return (
                                    <button
                                      key={p}
                                      onClick={() =>
                                        setSelectedPrograms((prev) =>
                                          selected
                                            ? prev.filter((x) => x !== p)
                                            : [...prev, p],
                                        )
                                      }
                                      className={`px-3 py-1.5 rounded-full border text-sm ${
                                        selected
                                          ? "bg-fuchsia-500/35 border-fuchsia-300"
                                          : "bg-white/10 border-white/20"
                                      }`}
                                    >
                                      {p}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="bg-white/10 border border-white/20 rounded-2xl overflow-hidden backdrop-blur-xl">
                  <div className="px-4 py-3 border-b border-white/10 text-sm text-white/70">
                    Showing {filteredRows.length} of {tickets.length} records
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-[1350px] w-full text-sm">
                      <thead className="bg-white/5 text-white/80">
                        <tr>
                          <th className="px-4 py-3 text-left">SrNo.</th>
                          <th className="px-4 py-3 text-left">ID Card</th>
                          <th className="px-4 py-3 text-left">Name</th>
                          <th className="px-4 py-3 text-left">Email</th>
                          <th className="px-4 py-3 text-left">Department</th>
                          <th className="px-4 py-3 text-left">Program Level</th>
                          <th className="px-4 py-3 text-left">Ticket UID</th>
                          <th className="px-4 py-3 text-left">
                            Transaction ID
                          </th>
                          <th className="px-4 py-3 text-left">Fare</th>
                          <th className="px-4 py-3 text-left">Phone</th>
                          <th className="px-4 py-3 text-left">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length === 0 && (
                          <tr>
                            <td
                              colSpan={11}
                              className="px-4 py-10 text-center text-white/50"
                            >
                              {tickets.length === 0
                                ? "No ticket records found for this event. If tickets have been booked, check Supabase RLS policies — management users may need a SELECT policy on the tickets table."
                                : "No records matched your filters."}
                            </td>
                          </tr>
                        )}

                        {filteredRows.map((r, i) => (
                          <tr
                            key={r.id}
                            className="border-t border-white/10 hover:bg-white/5"
                          >
                            <td className="px-4 py-3">{i + 1}</td>
                            <td className="px-4 py-3">
                              {r.id_card_number || "—"}
                            </td>
                            <td className="px-4 py-3">{r.name || "—"}</td>
                            <td className="px-4 py-3">{r.email || "—"}</td>
                            <td className="px-4 py-3">{r.department || "—"}</td>
                            <td className="px-4 py-3">
                              {r.program_level || "—"}
                            </td>
                            <td className="px-4 py-3 font-mono">
                              {r.ticket_uid || "—"}
                            </td>
                            <td className="px-4 py-3 font-mono">
                              {r.transaction_id || "—"}
                            </td>
                            <td className="px-4 py-3">
                              {r.free ? (
                                <span className="text-emerald-300 font-medium">
                                  Free
                                </span>
                              ) : (
                                <span>
                                  {fmtCurrency(Number(r.amount || 0))}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">{r.phone || "—"}</td>
                            <td className="px-4 py-3">
                              {r.notes ? (
                                <button
                                  onClick={() => {
                                    setNotesText(r.notes);
                                    setNotesOpen(true);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/30 hover:bg-cyan-500/35 transition"
                                  title="View notes"
                                >
                                  📝
                                </button>
                              ) : (
                                <span className="text-white/40">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-4 py-3 border-t border-white/10 text-xs text-white/50">
                    Last updated from realtime feed • Event UID: {eventUid}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {notesOpen && (
          <NotesModal notes={notesText} onClose={() => setNotesOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Statistics;
