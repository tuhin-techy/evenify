import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getUserRole } from "../../utils/role";

const ROLE_TABLE = {
  student: "students",
  outsider: "outsiders",
  management: "management",
  admin: "admin",
};

const PHOTO_SELECT_BY_ROLE = {
  student: "photo_url",
  outsider: "photo_url",
  management: "photo_url",
  admin: "photo_url",
};

const roleCacheKey = (email) => `role:${(email || "").toLowerCase()}`;

const getCachedRole = (email) => {
  try {
    if (!email) return null;
    return localStorage.getItem(roleCacheKey(email));
  } catch {
    return null;
  }
};

const setCachedRole = (email, role) => {
  try {
    if (!email || !role) return;
    localStorage.setItem(roleCacheKey(email), role);
  } catch {
    // Ignore storage errors and continue with runtime state.
  }
};

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);
  const [logoHovered, setLogoHovered] = useState(false);
  const [dbPhoto, setDbPhoto] = useState(null);
  const [photoImgErr, setPhotoImgErr] = useState(false);
  const normalizePhotoUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    // Incomplete Google photo ID — reconstruct full URL
    return `https://lh3.googleusercontent.com/a/${url}`;
  };

  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef(null);
  const retryRef = useRef(null);
  const hideLoginButton = location.pathname === "/login";

  const toggleMobileMenu = () => {
    setMobileOpen((prev) => {
      const next = !prev;
      if (next) setOpen(false);
      return next;
    });
  };

  const toggleProfileMenu = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) setMobileOpen(false);
      return next;
    });
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Reset image error state when userPhoto changes ──
  const userPhoto = normalizePhotoUrl(
    dbPhoto || user?.user_metadata?.avatar_url || user?.user_metadata?.picture,
  );

  useEffect(() => {
    setPhotoImgErr(false);
  }, [userPhoto]);

  // ── Fetch photo from the correct table using resolved role ──
  const fetchDbPhoto = async (authUser, userRole) => {
    if (!authUser?.email) {
      setDbPhoto(null);
      return null;
    }

    const table = ROLE_TABLE[userRole];
    const selectCols = PHOTO_SELECT_BY_ROLE[userRole] || "photo_url";
    if (!table) {
      setDbPhoto(null);
      return null;
    }

    const { data, error } = await supabase
      .from(table)
      .select(selectCols)
      .eq("email", authUser.email)
      .maybeSingle();

    if (error) {
      console.error("Error fetching photo from", table, error);
      setDbPhoto(null);
      return null;
    }

    const photo = data?.photo_url ?? null;
    setDbPhoto(photo);
    return photo;
  };

  const fetchUserAndRole = async (authUser) => {
    if (!authUser) {
      setUser(null);
      setRole(null);
      setDbPhoto(null);
      setRoleLoading(false);
      return;
    }

    setUser(authUser);

    const cachedRole = getCachedRole(authUser.email);
    if (cachedRole) {
      setRole(cachedRole);
      setRoleLoading(false);
    }

    const r = await getUserRole(authUser.email);
    setRole(r);
    setCachedRole(authUser.email, r);

    // Retry logic: attempt to fetch photo with exponential backoff
    const tryFetch = async (attempt = 0) => {
      if (retryRef.current) clearTimeout(retryRef.current);
      const photo = await fetchDbPhoto(authUser, r);

      // If no photo and haven't exceeded max attempts, retry
      if (!photo && attempt < 3) {
        const delays = [1000, 2500, 5000];
        retryRef.current = setTimeout(
          () => tryFetch(attempt + 1),
          delays[attempt],
        );
      }
    };
    await tryFetch(0);

    setRoleLoading(false);
  };

  useEffect(() => {
    setRoleLoading(true);
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => fetchUserAndRole(session?.user ?? null));

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "TOKEN_REFRESHED") {
          if (session?.user) setUser(session.user);
          return;
        }

        if (event === "SIGNED_OUT") {
          setRoleLoading(false);
          setUser(null);
          setRole(null);
          setDbPhoto(null);
          return;
        }

        setRoleLoading(true);
        if (retryRef.current) clearTimeout(retryRef.current);
        fetchUserAndRole(session?.user ?? null);
      },
    );

    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);

    return () => {
      authListener.subscription.unsubscribe();
      window.removeEventListener("scroll", handleScroll);
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []);

  // ── Real-time photo sync — uses role for correct table ──
  useEffect(() => {
    if (!user?.email || !role) return;

    const table = ROLE_TABLE[role];
    if (!table) return;

    const ch = supabase
      .channel(`navbar-photo-${user.email}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          if (payload.new?.email === user.email) {
            const photo = payload.new.photo_url ?? null;
            setDbPhoto(photo);
            if (photo) setPhotoImgErr(false);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.email, role]);

  const handleLogout = async () => {
    setOpen(false);
    if (retryRef.current) clearTimeout(retryRef.current);
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setDbPhoto(null);
    setPhotoImgErr(false);
    navigate("/");
  };

  const userName =
    user?.user_metadata?.name?.split(" ")[0] ||
    user?.user_metadata?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "User";

  const isClient = role === "student" || role === "outsider";
  const isManagement = role === "management";
  const isAdmin = role === "admin";
  const isLayer2 = isManagement || isAdmin;
  const logoLink = "/";

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 ${
        scrolled
          ? "bg-white/10 backdrop-blur-xl shadow-lg border-b border-white/10"
          : "bg-white/5 backdrop-blur-lg"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center text-white relative">
        {/* ── Logo — left ── */}
        <Link
          to={logoLink}
          className="flex-none text-2xl sm:text-3xl font-bold tracking-wide transition"
        >
          <motion.span
            onHoverStart={() => setLogoHovered(true)}
            onHoverEnd={() => setLogoHovered(false)}
            animate={
              logoHovered
                ? { backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }
                : { backgroundPosition: "0% 50%" }
            }
            transition={
              logoHovered
                ? { duration: 2.2, repeat: Infinity, ease: "linear" }
                : { duration: 0.2 }
            }
            style={{
              color: logoHovered ? "transparent" : "#ffffff",
              backgroundImage:
                "linear-gradient(90deg, #ff5f6d, #ffc371, #ffe66d, #7dffb3, #66d6ff, #8f7dff, #ff7bd5, #ff5f6d)",
              backgroundSize: "300% 100%",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              textShadow: logoHovered
                ? "0 0 18px rgba(255, 140, 200, 0.35)"
                : "none",
            }}
            className="inline-block"
          >
            Evenify
          </motion.span>
        </Link>

        {/* ── Nav Links — absolutely centered ── */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex space-x-8 text-2xl items-center">
          {!user && !roleLoading && (
            <>
              <NavItem to="/" label="Home" />
              <NavItem to="/events" label="Events" />
              <NavItem to="/support" label="Support" />
            </>
          )}
          {user && isClient && (
            <>
              <NavItem to="/" label="Home" />
              <NavItem to="/events" label="Events" />
              <NavItem to="/my-tickets" label="My Tickets" />
              <NavItem to="/support" label="Support" />
            </>
          )}
          {user && isManagement && (
            <>
              <NavItem to="/creator" label="Creator" />
              <NavItem to="/successful" label="Successful" />
              <NavItem to="/cancelled" label="Cancelled" />
            </>
          )}
          {user && isAdmin && (
            <>
              <NavItem to="/dashboard" label="Dashboard" />
              <NavItem to="/students" label="Student" />
              <NavItem to="/guests" label="Guest" />
              <NavItem to="/managements" label="Management" />
            </>
          )}
          {user && role === "denied" && (
            <span className="text-red-400 text-sm font-semibold">
              Access Denied
            </span>
          )}
        </div>

        {/* ── Right side ── */}
        <div
          className="flex-none ml-auto flex items-center gap-2 sm:gap-3"
          ref={dropdownRef}
        >
          <button
            onClick={toggleMobileMenu}
            className="md:hidden w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center"
            aria-label="Toggle navigation menu"
          >
            <span className="text-xl leading-none">
              {mobileOpen ? "✕" : "☰"}
            </span>
          </button>

          {!user && !roleLoading && !hideLoginButton && (
            <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}>
              <Link
                to="/login"
                className="px-5 py-2 sm:px-8 sm:py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full text-base sm:text-xl font-semibold hover:opacity-90 transition"
              >
                Login
              </Link>
            </motion.div>
          )}

          {user && (
            <div className="relative">
              {location.pathname === "/profile" ? (
                <div className="hidden md:flex items-center gap-3 px-2 sm:px-4 py-2 opacity-0 pointer-events-none select-none">
                  <div className="w-11 h-11 rounded-full" />
                  <span className="hidden sm:inline text-lg font-semibold">
                    Hello, {userName}
                  </span>
                </div>
              ) : (
                <button
                  onClick={toggleProfileMenu}
                  className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 bg-white/10 backdrop-blur-md rounded-full hover:bg-white/20 transition border border-white/10"
                >
                  {userPhoto && !photoImgErr ? (
                    <img
                      src={userPhoto}
                      alt="avatar"
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-full border border-white/30 object-cover"
                      onError={() => setPhotoImgErr(true)}
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-base font-bold border border-white/30">
                      {userName[0].toUpperCase()}
                    </div>
                  )}
                  <span className="hidden sm:inline text-lg font-semibold">
                    Hello, {userName}
                  </span>
                </button>
              )}

              <AnimatePresence>
                {open && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 mt-3 w-52 border-t border-white/10 bg-black/25 backdrop-blur-2xl backdrop-saturate-150 md:bg-white/10 md:border md:border-white/20 text-white rounded-xl shadow-2xl overflow-hidden"
                  >
                    <div className="px-4 py-2 border-b border-white/10">
                      <span
                        className={`text-sm font-semibold px-3 py-1 rounded-full ${
                          role === "admin"
                            ? "bg-amber-400/40 text-amber-200"
                            : isManagement
                              ? "bg-purple-500/40 text-purple-200"
                              : role === "outsider"
                                ? "bg-blue-500/40 text-blue-200"
                                : "bg-green-500/30 text-green-200"
                        }`}
                      >
                        {role === "management"
                          ? "Management"
                          : role === "admin"
                            ? "Admin"
                            : role === "student"
                              ? "Student"
                              : "Guest"}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        setOpen(false);
                        navigate("/profile");
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-white/20 transition font-medium"
                    >
                      My Profile
                    </button>

                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-3 text-left text-red-400 hover:bg-white/20 transition font-semibold"
                    >
                      Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-white/10 bg-black/40 backdrop-blur-xl"
          >
            <div className="px-4 py-4 space-y-3 text-white">
              {!user && !roleLoading && (
                <>
                  <Link
                    to="/"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Home
                  </Link>
                  <Link
                    to="/events"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Events
                  </Link>
                  <Link
                    to="/support"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Support
                  </Link>
                </>
              )}

              {user && isClient && (
                <>
                  <Link
                    to="/"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Home
                  </Link>
                  <Link
                    to="/events"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Events
                  </Link>
                  <Link
                    to="/my-tickets"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    My Tickets
                  </Link>
                  <Link
                    to="/support"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Support
                  </Link>
                </>
              )}

              {user && isManagement && (
                <>
                  <Link
                    to="/creator"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Creator
                  </Link>
                  <Link
                    to="/successful"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Successful
                  </Link>
                  <Link
                    to="/cancelled"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Cancelled
                  </Link>
                </>
              )}

              {user && isAdmin && (
                <>
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/students"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Student
                  </Link>
                  <Link
                    to="/guests"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Guest
                  </Link>
                  <Link
                    to="/managements"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-lg font-medium"
                  >
                    Management
                  </Link>
                </>
              )}

              {user && (
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      navigate("/profile");
                    }}
                    className="w-full text-left py-2 text-lg font-medium"
                  >
                    My Profile
                  </button>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      handleLogout();
                    }}
                    className="w-full text-left py-2 text-lg font-semibold text-red-300"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

const NavItem = ({ to, label }) => (
  <motion.div whileHover={{ scale: 1.08 }}>
    <Link to={to} className="relative group transition">
      {label}
      <span className="absolute left-0 -bottom-1 h-[2px] w-0 bg-gradient-to-r from-rose-400 to-cyan-300 transition-all duration-300 group-hover:w-full" />
    </Link>
  </motion.div>
);

export default Navbar;
