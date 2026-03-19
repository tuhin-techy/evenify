import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";

const INITIAL_FORM = {
  id_card_number: "",
  email: "",
  phone: "",
};

const toHighQualityImageUrl = (url) => {
  const raw = (url || "").trim();
  if (!raw) return "";

  // Common Google-hosted thumbnails: bump requested size for sharper modal preview.
  let upgraded = raw.replace(/=s\d+(-c)?/gi, "=s2048");
  upgraded = upgraded.replace(/[?&]sz=\d+/gi, "?sz=2048");

  return upgraded;
};

const Managements = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const [searchField, setSearchField] = useState("name");
  const [searchText, setSearchText] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("insert");
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const fetchManagements = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");

    const { data, error: qErr } = await supabase
      .from("management")
      .select("id, id_card_number, name, email, phone, photo_url, created_at")
      .order("created_at", { ascending: false });

    if (qErr) {
      setError(qErr.message || "Failed to load management records.");
      if (!silent) setLoading(false);
      return;
    }

    setRows(data || []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchManagements();
  }, [fetchManagements]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-management-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "management" },
        () => {
          fetchManagements({ silent: true });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchManagements]);

  const validateField = (name, value) => {
    if (name === "id_card_number") {
      if (!value.trim()) return "ID Card is required.";
      if (!/^\d{1,10}$/.test(value))
        return "ID Card must be digits only (max 10).";
      if (value.length !== 10) return "ID Card must be exactly 10 digits.";
      const normalizedId = value.trim();
      const duplicateId = rows.some(
        (r) =>
          String(r.id_card_number || "").trim() === normalizedId &&
          r.id !== editingId,
      );
      if (duplicateId) return "This ID card number is already registered.";
    }

    if (name === "email") {
      if (!value.trim()) return "Email is required.";
      if (!/^[a-zA-Z0-9._%+-]+@somaiya\.edu$/i.test(value.trim())) {
        return "Email must be a valid @somaiya.edu address.";
      }
      const normalizedEmail = value.trim().toLowerCase();
      const duplicateEmail = rows.some(
        (r) =>
          (r.email || "").trim().toLowerCase() === normalizedEmail &&
          r.id !== editingId,
      );
      if (duplicateEmail) return "This email is already registered.";
    }

    if (name === "phone") {
      if (!value) return "";
      if (!/^\d{1,10}$/.test(value))
        return "Phone must be digits only (max 10).";
      if (value.length !== 10) return "Phone must be exactly 10 digits.";
      const normalizedPhone = value.trim();
      const duplicatePhone = rows.some(
        (r) => (r.phone || "").trim() === normalizedPhone && r.id !== editingId,
      );
      if (duplicatePhone) return "This phone number is already registered.";
    }

    return "";
  };

  const validateAll = (data) => {
    const next = {
      id_card_number: validateField("id_card_number", data.id_card_number),
      email: validateField("email", data.email),
      phone: validateField("phone", data.phone),
    };

    setFormErrors(next);
    return Object.values(next).every((v) => !v);
  };

  const handleSearchChange = (value) => {
    if (searchField === "id_card_number" || searchField === "phone") {
      setSearchText(value.replace(/\D/g, "").slice(0, 10));
      return;
    }
    setSearchText(value);
  };

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const val = (r[searchField] || "").toString().toLowerCase();
      return val.includes(q);
    });
  }, [rows, searchText, searchField]);

  const openInsert = () => {
    setFormMode("insert");
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEdit = (row) => {
    setFormMode("update");
    setEditingId(row.id);
    setFormData({
      id_card_number: row.id_card_number || "",
      email: row.email || "",
      phone: row.phone || "",
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setSaving(false);
    setFormErrors({});
  };

  const buildPayload = (data) => {
    return {
      id_card_number: data.id_card_number.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim() ? data.phone.trim() : null,
    };
  };

  const saveForm = async () => {
    const ok = validateAll(formData);
    if (!ok) return;

    const payload = buildPayload(formData);

    const idDup = rows.some(
      (r) =>
        String(r.id_card_number || "").trim() === payload.id_card_number &&
        r.id !== editingId,
    );
    const emailDup = rows.some(
      (r) =>
        (r.email || "").trim().toLowerCase() === payload.email.toLowerCase() &&
        r.id !== editingId,
    );
    const phoneDup = payload.phone
      ? rows.some(
          (r) => (r.phone || "").trim() === payload.phone && r.id !== editingId,
        )
      : false;

    if (idDup || emailDup || phoneDup) {
      if (idDup)
        setFormErrors((p) => ({
          ...p,
          id_card_number: "This ID card number is already registered.",
        }));
      if (emailDup)
        setFormErrors((p) => ({
          ...p,
          email: "This email is already registered.",
        }));
      if (phoneDup)
        setFormErrors((p) => ({
          ...p,
          phone: "This phone number is already registered.",
        }));
      return;
    }

    setSaving(true);
    setError("");

    if (formMode === "insert") {
      const { error: insErr } = await supabase
        .from("management")
        .insert(payload);
      if (insErr) {
        setSaving(false);
        setError(insErr.message || "Insert failed.");
        return;
      }
    } else {
      const { data: updatedRow, error: updErr } = await supabase
        .from("management")
        .update(payload)
        .eq("id", editingId)
        .select("id, id_card_number, name, email, phone, photo_url, created_at")
        .maybeSingle();

      if (updErr) {
        setSaving(false);
        setError(updErr.message || "Update failed.");
        return;
      }

      if (!updatedRow) {
        setSaving(false);
        setError("Update failed.");
        return;
      }

      setRows((prev) =>
        prev.map((r) => (r.id === updatedRow.id ? { ...r, ...updatedRow } : r)),
      );
    }

    await fetchManagements({ silent: true });
    setSaving(false);
    setIsFormOpen(false);
  };

  const requestDelete = (row) => {
    setDeleteTarget(row);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    setSaving(true);
    setError("");

    const { error: delErr } = await supabase
      .from("management")
      .delete()
      .eq("id", deleteTarget.id);

    setSaving(false);
    if (delErr) {
      setError(delErr.message || "Delete failed.");
      return;
    }

    await fetchManagements({ silent: true });
    setIsDeleteOpen(false);
    setDeleteTarget(null);
  };

  const searchPlaceholder = useMemo(() => {
    if (searchField === "name") return "Search by Name";
    if (searchField === "email") return "Search by Email";
    if (searchField === "id_card_number") return "Search by ID Card (digits)";
    if (searchField === "phone") return "Search by Phone (digits)";
    return "Search management";
  }, [searchField]);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden pt-28 pb-20 px-6 bg-gradient-to-br from-zinc-900 via-rose-950 to-orange-950 text-white">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute w-[540px] h-[540px] rounded-full bg-rose-500/20 blur-[130px] top-[-170px] left-[-190px]" />
        <div className="absolute w-[500px] h-[500px] rounded-full bg-orange-500/20 blur-[120px] bottom-[-150px] right-[-160px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center text-5xl md:text-6xl font-extrabold tracking-tight mb-10"
        >
          Managements
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 md:p-5 mb-6 shadow-2xl">
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <input
                value={searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="flex-1 px-4 py-3 rounded-xl bg-black/30 border border-white/20 text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />

              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
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
                      Search Field
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {[
                        ["name", "Name"],
                        ["email", "Email"],
                        ["id_card_number", "ID Card"],
                        ["phone", "Phone"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setSearchField(value);
                            setSearchText("");
                          }}
                          className={`px-3 py-1.5 rounded-full border text-sm ${searchField === value ? "bg-cyan-500/35 border-cyan-300 text-white" : "bg-white/10 border-white/20"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchText("");
                        setSearchField("name");
                      }}
                      className="px-4 py-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition font-semibold"
                    >
                      Clear Filters
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-red-100">
              {error}
            </div>
          )}

          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
            {loading ? (
              <div className="py-20 text-center text-white/65 text-lg">
                Loading management records...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-center">
                  <thead className="bg-white/10 border-b border-white/20">
                    <tr className="text-sm uppercase tracking-wider text-white/75">
                      <th className="px-4 py-4 font-semibold">Actions</th>
                      <th className="px-4 py-4 font-semibold">SrNo.</th>
                      <th className="px-4 py-4 font-semibold">ID Card</th>
                      <th className="px-4 py-4 font-semibold">Name</th>
                      <th className="px-4 py-4 font-semibold">Email</th>
                      <th className="px-4 py-4 font-semibold">Phone</th>
                      <th className="px-4 py-4 font-semibold text-center">
                        Photo
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-14 text-center text-white/60"
                        >
                          {rows.length === 0
                            ? "No management records found."
                            : "No management records match the current filters."}
                        </td>
                      </tr>
                    )}

                    {filteredRows.map((row, idx) => (
                      <tr
                        key={row.id}
                        className="border-b border-white/10 hover:bg-white/5 transition"
                      >
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-center justify-center gap-3 text-xl">
                            <button
                              type="button"
                              title="Edit"
                              onClick={() => openEdit(row)}
                              className="hover:scale-110 transition"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              onClick={() => requestDelete(row)}
                              className="hover:scale-110 transition"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top font-semibold">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {row.id_card_number || "-"}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {row.name || "-"}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {row.email || "-"}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {row.phone || "-"}
                        </td>
                        <td className="px-4 py-4 align-top text-center">
                          <button
                            type="button"
                            onClick={() => {
                              if (!row.photo_url) return;
                              setPhotoPreviewUrl(
                                toHighQualityImageUrl(row.photo_url),
                              );
                              setIsPhotoOpen(true);
                            }}
                            className={`text-2xl ${row.photo_url ? "hover:scale-110" : "opacity-30 cursor-not-allowed"} transition`}
                            title={row.photo_url ? "View Photo" : "No Photo"}
                          >
                            👤
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={openInsert}
        className="fixed bottom-8 right-8 z-40 w-16 h-16 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 text-4xl font-semibold shadow-2xl"
      >
        +
      </motion.button>

      <AnimatePresence>
        {isPhotoOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center"
            onClick={() => setIsPhotoOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-white/20 rounded-2xl p-4 w-full max-w-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xl font-bold">Management Photo</h3>
                <button
                  type="button"
                  onClick={() => setIsPhotoOpen(false)}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition"
                >
                  Close
                </button>
              </div>
              <img
                src={photoPreviewUrl}
                alt="Management"
                className="w-auto h-auto max-w-full max-h-[78vh] object-contain rounded-xl bg-black/30 mx-auto"
                referrerPolicy="no-referrer"
                decoding="async"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDeleteOpen && (
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
              className="w-full max-w-md bg-slate-900 border border-white/20 rounded-2xl p-6"
            >
              <h3 className="text-xl font-bold mb-3">Confirm Delete</h3>
              <p className="text-white/75 mb-6">
                Are you sure to delete this record from the table?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteOpen(false);
                    setDeleteTarget(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
                  disabled={saving}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="px-4 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 transition font-semibold"
                  disabled={saving}
                >
                  {saving ? "Deleting..." : "Yes"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-white/20 rounded-2xl p-6"
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <p className="text-xs uppercase tracking-widest text-white/45 mb-1">
                    Management Table
                  </p>
                  <h3 className="text-2xl font-bold">
                    {formMode === "insert"
                      ? "Insert Management"
                      : "Update Management"}
                  </h3>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <InputField
                  label="ID Card"
                  value={formData.id_card_number}
                  onChange={(v) => {
                    const clean = v.replace(/\D/g, "").slice(0, 10);
                    const next = { ...formData, id_card_number: clean };
                    setFormData(next);
                    setFormErrors((p) => ({
                      ...p,
                      id_card_number: validateField("id_card_number", clean),
                    }));
                  }}
                  error={formErrors.id_card_number}
                  placeholder="Enter ID card number"
                />

                <InputField
                  label="Phone"
                  value={formData.phone}
                  onChange={(v) => {
                    const clean = v.replace(/\D/g, "").slice(0, 10);
                    const next = { ...formData, phone: clean };
                    setFormData(next);
                    setFormErrors((p) => ({
                      ...p,
                      phone: validateField("phone", clean),
                    }));
                  }}
                  error={formErrors.phone}
                  placeholder="Enter phone number"
                />

                <InputField
                  label="Email"
                  value={formData.email}
                  onChange={(v) => {
                    const next = { ...formData, email: v.trimStart() };
                    setFormData(next);
                    setFormErrors((p) => ({
                      ...p,
                      email: validateField("email", next.email),
                    }));
                  }}
                  error={formErrors.email}
                  placeholder="Enter somaiya email"
                />
              </div>

              <div className="mt-7 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition"
                  disabled={saving}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={saveForm}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:opacity-90 transition font-semibold"
                  disabled={saving}
                >
                  {saving
                    ? formMode === "insert"
                      ? "Inserting..."
                      : "Updating..."
                    : formMode === "insert"
                      ? "Insert"
                      : "Update"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const InputField = ({ label, value, onChange, error, placeholder }) => (
  <div>
    <label className="text-sm font-semibold text-white/80 mb-1.5 block">
      {label}
    </label>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-4 py-2.5 rounded-xl border bg-white/10 text-white placeholder:text-white/45 focus:outline-none focus:ring-2 ${
        error
          ? "border-red-400/60 focus:ring-red-400"
          : "border-white/20 focus:ring-cyan-400"
      }`}
    />
    {error && <p className="text-red-300 text-xs mt-1">{error}</p>}
  </div>
);

export default Managements;
