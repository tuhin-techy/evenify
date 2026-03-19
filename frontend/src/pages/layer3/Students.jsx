import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";

const DEPARTMENT_OPTIONS = ["School", "Sports", "Science", "Commerce", "Arts"];

const PROGRAM_LEVEL_OPTIONS = [
  "11th",
  "12th",
  "Undergraduate (UG)",
  "Postgraduate (PG)",
  "Diploma",
  "Postgraduate Diploma (PGD)",
  "Doctor of Philosophy (PhD)",
];

const INITIAL_FORM = {
  id_card_number: "",
  email: "",
  department: "",
  program_level: "",
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

const Students = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const [searchField, setSearchField] = useState("name");
  const [searchText, setSearchText] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const isProgramFilterLocked =
    departmentFilter === "School" || departmentFilter === "Sports";

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("insert"); // insert | update
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const fetchStudents = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");

    const { data, error: qErr } = await supabase
      .from("students")
      .select(
        "id, id_card_number, name, email, department, program_level, phone, photo_url, created_at",
      )
      .order("created_at", { ascending: false });

    if (qErr) {
      setError(qErr.message || "Failed to load students.");
      if (!silent) setLoading(false);
      return;
    }

    setRows(data || []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-students-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students" },
        () => {
          fetchStudents({ silent: true });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchStudents]);

  useEffect(() => {
    if (isProgramFilterLocked && programFilter !== "all") {
      setProgramFilter("all");
    }
  }, [isProgramFilterLocked, programFilter]);

  const isProgramDisabled =
    formData.department === "School" || formData.department === "Sports";

  const validateField = (name, value, data = formData) => {
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

    if (name === "department") {
      if (!value) return "Department is required.";
    }

    if (name === "program_level") {
      const disableProgram =
        data.department === "School" || data.department === "Sports";
      if (!disableProgram && !value) return "Program Level is required.";
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
      id_card_number: validateField(
        "id_card_number",
        data.id_card_number,
        data,
      ),
      email: validateField("email", data.email, data),
      department: validateField("department", data.department, data),
      program_level: validateField("program_level", data.program_level, data),
      phone: validateField("phone", data.phone, data),
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
    let list = [...rows];

    if (departmentFilter !== "all") {
      list = list.filter((r) => (r.department || "") === departmentFilter);
    }

    if (programFilter !== "all") {
      list = list.filter((r) => (r.program_level || "") === programFilter);
    }

    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const val = (r[searchField] || "").toString().toLowerCase();
        return val.includes(q);
      });
    }

    return list;
  }, [rows, departmentFilter, programFilter, searchText, searchField]);

  const departmentFilterOptions = useMemo(() => {
    const available = new Set(
      rows.map((r) => (r.department || "").trim()).filter(Boolean),
    );
    return DEPARTMENT_OPTIONS.filter((opt) => available.has(opt));
  }, [rows]);

  const programFilterOptions = useMemo(() => {
    const available = new Set(
      rows.map((r) => (r.program_level || "").trim()).filter(Boolean),
    );
    return PROGRAM_LEVEL_OPTIONS.filter((opt) => available.has(opt));
  }, [rows]);

  useEffect(() => {
    if (
      departmentFilter !== "all" &&
      !departmentFilterOptions.includes(departmentFilter)
    ) {
      setDepartmentFilter("all");
    }
  }, [departmentFilter, departmentFilterOptions]);

  useEffect(() => {
    if (
      programFilter !== "all" &&
      !programFilterOptions.includes(programFilter)
    ) {
      setProgramFilter("all");
    }
  }, [programFilter, programFilterOptions]);

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
      department: row.department || "",
      program_level: row.program_level || "",
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
    const normalizedId = data.id_card_number.trim();
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedDept = data.department;
    const normalizedProgram =
      normalizedDept === "School" || normalizedDept === "Sports"
        ? null
        : data.program_level;
    const normalizedPhone = data.phone.trim() ? data.phone.trim() : null;

    return {
      id_card_number: normalizedId,
      email: normalizedEmail,
      department: normalizedDept,
      program_level: normalizedProgram,
      phone: normalizedPhone,
    };
  };

  const saveForm = async () => {
    const ok = validateAll(formData);
    if (!ok) return;

    const payload = buildPayload(formData);

    // Duplicate guard before saving
    const idDup = rows.some(
      (r) =>
        String(r.id_card_number) === payload.id_card_number &&
        r.id !== editingId,
    );
    const emailDup = rows.some(
      (r) =>
        r.email?.toLowerCase() === payload.email.toLowerCase() &&
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
      const { error: insErr } = await supabase.from("students").insert(payload);
      if (insErr) {
        setSaving(false);
        setError(insErr.message || "Insert failed.");
        return;
      }
    } else {
      const { data: updatedRow, error: updErr } = await supabase
        .from("students")
        .update(payload)
        .eq("id", editingId)
        .select(
          "id, id_card_number, name, email, department, program_level, phone, photo_url, created_at",
        )
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

    await fetchStudents({ silent: true });
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
      .from("students")
      .delete()
      .eq("id", deleteTarget.id);

    setSaving(false);
    if (delErr) {
      setError(delErr.message || "Delete failed.");
      return;
    }

    await fetchStudents({ silent: true });
    setIsDeleteOpen(false);
    setDeleteTarget(null);
  };

  const searchPlaceholder = useMemo(() => {
    if (searchField === "name") return "Search by Name";
    if (searchField === "email") return "Search by Email";
    if (searchField === "id_card_number") return "Search by ID Card (digits)";
    if (searchField === "phone") return "Search by Phone (digits)";
    return "Search students";
  }, [searchField]);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden pt-28 pb-20 px-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-cyan-950 text-white">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute w-[540px] h-[540px] rounded-full bg-cyan-500/20 blur-[130px] top-[-170px] left-[-190px]" />
        <div className="absolute w-[500px] h-[500px] rounded-full bg-indigo-500/20 blur-[120px] bottom-[-150px] right-[-160px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center text-5xl md:text-6xl font-extrabold tracking-tight mb-10"
        >
          Students
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

                  <div>
                    <h4 className="text-sm uppercase tracking-widest text-white/60 mb-2">
                      Department
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {departmentFilterOptions.map((opt) => {
                        const selected = departmentFilter === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              setDepartmentFilter((prev) =>
                                prev === opt ? "all" : opt,
                              )
                            }
                            className={`px-3 py-1.5 rounded-full border text-sm ${selected ? "bg-blue-500/35 border-blue-300 text-white" : "bg-white/10 border-white/20"}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm uppercase tracking-widest text-white/60 mb-2">
                      Program Level
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {programFilterOptions.map((opt) => {
                        const selected = programFilter === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            disabled={isProgramFilterLocked}
                            onClick={() =>
                              setProgramFilter((prev) =>
                                prev === opt ? "all" : opt,
                              )
                            }
                            className={`px-3 py-1.5 rounded-full border text-sm transition ${selected ? "bg-fuchsia-500/35 border-fuchsia-300 text-white" : "bg-white/10 border-white/20"} ${isProgramFilterLocked ? "opacity-45 cursor-not-allowed" : ""}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchText("");
                        setDepartmentFilter("all");
                        setProgramFilter("all");
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
                Loading students...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-center">
                  <thead className="bg-white/10 border-b border-white/20">
                    <tr className="text-sm uppercase tracking-wider text-white/75">
                      <th className="px-4 py-4 font-semibold">Actions</th>
                      <th className="px-4 py-4 font-semibold">SrNo.</th>
                      <th className="px-4 py-4 font-semibold">ID Card</th>
                      <th className="px-4 py-4 font-semibold">Name</th>
                      <th className="px-4 py-4 font-semibold">Email</th>
                      <th className="px-4 py-4 font-semibold">Department</th>
                      <th className="px-4 py-4 font-semibold">Program Level</th>
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
                          colSpan={9}
                          className="px-4 py-14 text-center text-white/60"
                        >
                          {rows.length === 0
                            ? "No student records found."
                            : "No student records match the current filters."}
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
                          {row.department || "-"}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {row.program_level || "-"}
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
        className="fixed bottom-8 right-8 z-40 w-16 h-16 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 text-4xl font-semibold shadow-2xl"
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
                <h3 className="text-xl font-bold">Student Photo</h3>
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
                alt="Student"
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
                    Students Table
                  </p>
                  <h3 className="text-2xl font-bold">
                    {formMode === "insert"
                      ? "Insert Student"
                      : "Update Student"}
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
                      id_card_number: validateField(
                        "id_card_number",
                        clean,
                        next,
                      ),
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
                      phone: validateField("phone", clean, next),
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
                      email: validateField("email", next.email, next),
                    }));
                  }}
                  error={formErrors.email}
                  placeholder="Enter somaiya email"
                />

                <SelectField
                  label="Department"
                  value={formData.department}
                  onChange={(v) => {
                    const resetProgram = v === "School" || v === "Sports";
                    const next = {
                      ...formData,
                      department: v,
                      program_level: resetProgram ? "" : formData.program_level,
                    };
                    setFormData(next);
                    setFormErrors((p) => ({
                      ...p,
                      department: validateField("department", v, next),
                      program_level: validateField(
                        "program_level",
                        next.program_level,
                        next,
                      ),
                    }));
                  }}
                  error={formErrors.department}
                  options={DEPARTMENT_OPTIONS}
                  placeholder="Choose department"
                />

                <SelectField
                  label="Program Level"
                  value={formData.program_level}
                  onChange={(v) => {
                    const next = { ...formData, program_level: v };
                    setFormData(next);
                    setFormErrors((p) => ({
                      ...p,
                      program_level: validateField("program_level", v, next),
                    }));
                  }}
                  error={formErrors.program_level}
                  options={PROGRAM_LEVEL_OPTIONS}
                  placeholder={
                    isProgramDisabled
                      ? "Program level not required"
                      : "Choose program level"
                  }
                  disabled={isProgramDisabled}
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
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:opacity-90 transition font-semibold"
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

const SelectField = ({
  label,
  value,
  onChange,
  error,
  options,
  placeholder,
  disabled = false,
}) => (
  <div>
    <label className="text-sm font-semibold text-white/80 mb-1.5 block">
      {label}
    </label>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full appearance-none pr-11 pl-4 py-2.5 rounded-xl border bg-white/10 text-white shadow-inner shadow-black/10 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 ${
          error
            ? "border-red-400/60 focus:ring-red-400"
            : "border-white/20 hover:border-white/35 focus:ring-cyan-400"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <option value="" className="text-slate-100 bg-slate-950">
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt} className="text-slate-100 bg-slate-950">
            {opt}
          </option>
        ))}
      </select>

      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/70">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 9L12 15L18 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
    {error && <p className="text-red-300 text-xs mt-1">{error}</p>}
  </div>
);

export default Students;
