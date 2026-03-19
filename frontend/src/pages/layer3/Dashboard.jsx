import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";

const STATUS_LABEL = {
  Ongoing: "Upcoming",
  Successful: "Completed",
  Cancelled: "Cancelled",
};

const Dashboard = () => {
  const [events, setEvents] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  // `statusFilter`: null | Ongoing | Successful | Cancelled
  const [statusFilter, setStatusFilter] = useState(null);
  // `ticketMode`: all | free | paid
  const [ticketMode, setTicketMode] = useState("all");

  const fetchDashboardData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [{ data: evRows, error: evErr }, { data: tRows, error: tErr }] =
        await Promise.all([
          supabase
            .from("events")
            .select(
              "id, event_uid, title, tickets, tickets_booked, status, created_at",
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("tickets")
            .select("id, event_uid, amount, free")
            .order("booked_at", { ascending: false }),
        ]);

      if (evErr) throw evErr;
      if (tErr) throw tErr;

      setEvents(evRows || []);
      setTickets(tRows || []);
    } catch (err) {
      console.error("Dashboard load failed:", err.message || err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          fetchDashboardData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        () => {
          fetchDashboardData({ silent: true });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchDashboardData]);

  const ticketIndex = useMemo(() => {
    const byEvent = new Map();

    for (const t of tickets) {
      const uid = t.event_uid;
      if (!uid) continue;

      if (!byEvent.has(uid)) {
        byEvent.set(uid, {
          freeBooked: 0,
          paidBooked: 0,
          revenue: 0,
        });
      }

      const x = byEvent.get(uid);
      if (t.free) x.freeBooked += 1;
      else {
        x.paidBooked += 1;
        x.revenue += Number(t.amount || 0);
      }
    }

    return byEvent;
  }, [tickets]);

  const pyramidStats = useMemo(() => {
    const upcoming = events.filter((e) => e.status === "Ongoing").length;
    const completed = events.filter((e) => e.status === "Successful").length;
    const cancelled = events.filter((e) => e.status === "Cancelled").length;
    const freeTicketsSold = tickets.filter((t) => !!t.free).length;
    const paidTicketsSold = tickets.filter((t) => !t.free).length;
    const revenue = tickets
      .filter((t) => !t.free)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    return {
      upcoming,
      completed,
      cancelled,
      freeTicketsSold,
      paidTicketsSold,
      revenue,
    };
  }, [events, tickets]);

  const hasSelection = statusFilter !== null || ticketMode !== "all";

  const filteredEvents = useMemo(() => {
    let rows = [...events];
    if (statusFilter) rows = rows.filter((e) => e.status === statusFilter);
    return rows;
  }, [events, statusFilter]);

  const cards = useMemo(() => {
    return filteredEvents.map((ev) => {
      const allocated = Number(ev.tickets || 0);
      const counts = ticketIndex.get(ev.event_uid) || {
        freeBooked: 0,
        paidBooked: 0,
        revenue: 0,
      };

      const totalBooked = counts.freeBooked + counts.paidBooked;
      const bookedForMode =
        ticketMode === "free"
          ? counts.freeBooked
          : ticketMode === "paid"
            ? counts.paidBooked
            : totalBooked;

      const pct =
        allocated > 0 ? Math.min((bookedForMode / allocated) * 100, 100) : 0;

      const hasFree = counts.freeBooked > 0;
      const hasPaid = counts.paidBooked > 0;

      return {
        ...ev,
        allocated,
        bookedForMode,
        pct,
        hasFree,
        hasPaid,
      };
    });
  }, [filteredEvents, ticketIndex, ticketMode]);

  const panelTitle = useMemo(() => {
    const statusText = statusFilter ? STATUS_LABEL[statusFilter] : "All";
    if (ticketMode === "free") return `${statusText} Events • Free Tickets`;
    if (ticketMode === "paid") return `${statusText} Events • Paid Tickets`;
    return `${statusText} Events`;
  }, [statusFilter, ticketMode]);

  const currency = (n) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(n || 0));

  const toggleStatus = (status) => {
    setStatusFilter((prev) => (prev === status ? null : status));
  };

  const toggleTicketMode = (mode) => {
    setTicketMode((prev) => (prev === mode ? "all" : mode));
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden pt-28 pb-20 px-6 bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-950 text-white">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-[-140px] right-[-120px] w-[460px] h-[460px] rounded-full bg-emerald-500/15 blur-[130px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center text-5xl md:text-6xl font-extrabold tracking-tight mb-12"
        >
          Event Dashboard
        </motion.h1>

        {loading ? (
          <div className="py-24 text-center text-white/60 text-lg">
            Loading dashboard...
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="max-w-6xl mx-auto mb-12 space-y-6">
              <div className="flex justify-center">
                <PyramidBox
                  title="Revenue"
                  value={currency(pyramidStats.revenue)}
                  active={false}
                  color="from-amber-400/35 to-orange-500/35"
                  size="large"
                  clickable={false}
                />
              </div>

              <div className="flex justify-center gap-6 flex-wrap">
                <PyramidBox
                  title="Free Tickets Sold"
                  value={pyramidStats.freeTicketsSold}
                  active={ticketMode === "free"}
                  color="from-cyan-400/35 to-sky-500/35"
                  onClick={() => toggleTicketMode("free")}
                  size="medium"
                />
                <PyramidBox
                  title="Paid Tickets Sold"
                  value={pyramidStats.paidTicketsSold}
                  active={ticketMode === "paid"}
                  color="from-[#ffb6c1]/45 to-[#ff8fab]/55"
                  onClick={() => toggleTicketMode("paid")}
                  size="medium"
                />
              </div>

              <div className="flex justify-center gap-6 flex-wrap">
                <PyramidBox
                  title="Upcoming"
                  value={pyramidStats.upcoming}
                  active={statusFilter === "Ongoing"}
                  color="from-emerald-400/35 to-green-500/35"
                  onClick={() => toggleStatus("Ongoing")}
                  size="small"
                />
                <PyramidBox
                  title="Completed"
                  value={pyramidStats.completed}
                  active={statusFilter === "Successful"}
                  color="from-blue-400/35 to-indigo-500/35"
                  onClick={() => toggleStatus("Successful")}
                  size="small"
                />
                <PyramidBox
                  title="Cancelled"
                  value={pyramidStats.cancelled}
                  active={statusFilter === "Cancelled"}
                  color="from-red-500/45 to-red-700/55"
                  onClick={() => toggleStatus("Cancelled")}
                  size="small"
                />
              </div>
            </div>

            <div className="max-w-7xl mx-auto">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                  {panelTitle}
                </h2>
                <AnimatePresence>
                  {hasSelection && (
                    <motion.button
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      onClick={() => {
                        setStatusFilter(null);
                        setTicketMode("all");
                      }}
                      className="px-4 py-2 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 transition"
                    >
                      Clear Selection
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {cards.length === 0 && (
                  <div className="col-span-full text-center py-16 bg-white/5 border border-white/15 rounded-2xl text-white/60">
                    No events found for current selection.
                  </div>
                )}

                {cards.map((event) => (
                  <motion.div
                    key={event.id}
                    whileHover={{ scale: 1.03 }}
                    className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-2xl"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h3 className="text-xl font-bold leading-snug flex-1 min-w-0">
                        {event.title}
                      </h3>
                      <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border border-cyan-300/40 bg-cyan-500/20 text-cyan-100">
                        {event.event_uid || "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mb-2 text-sm text-white/80">
                      <span>
                        Tickets: <strong>{event.bookedForMode}</strong> /{" "}
                        {event.allocated}
                      </span>
                      <span className="font-bold text-base">
                        {Math.round(event.pct)}%
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden mb-4">
                      <div
                        className={`h-full ${
                          ticketMode === "free"
                            ? "bg-emerald-400"
                            : ticketMode === "paid"
                              ? "bg-pink-400"
                              : "bg-gradient-to-r from-cyan-400 to-blue-500"
                        }`}
                        style={{ width: `${event.pct}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {event.hasFree && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/25 border border-emerald-400/40 text-emerald-200">
                          Free
                        </span>
                      )}
                      {event.hasPaid && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-pink-500/25 border border-pink-400/40 text-pink-200">
                          Paid
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

const PyramidBox = ({
  title,
  value,
  active,
  onClick,
  color,
  size = "small",
  clickable = true,
}) => {
  const boxClasses = `${
    size === "large"
      ? "w-[300px] md:w-[360px]"
      : size === "medium"
        ? "w-[260px] md:w-[300px]"
        : "w-[240px] md:w-[270px]"
  } rounded-2xl p-6 md:p-7 text-center border transition-all duration-250 ${
    active
      ? "border-white/55 shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
      : "border-white/20"
  } bg-gradient-to-br ${color} backdrop-blur-xl`;

  if (!clickable) {
    return (
      <motion.div whileHover={{ scale: 1.04 }} className={boxClasses}>
        <p className="text-base md:text-lg uppercase tracking-wider text-white/80 mb-2 font-semibold">
          {title}
        </p>
        <p className="text-4xl md:text-5xl font-extrabold leading-tight">
          {value}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={boxClasses}
      type="button"
    >
      <p className="text-base md:text-lg uppercase tracking-wider text-white/80 mb-2 font-semibold">
        {title}
      </p>
      <p className="text-4xl md:text-5xl font-extrabold leading-tight">
        {value}
      </p>
    </motion.button>
  );
};

export default Dashboard;
