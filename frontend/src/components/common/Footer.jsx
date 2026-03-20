import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getUserRole } from "../../utils/role";
import {
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaXTwitter,
} from "react-icons/fa6";
import { FiMail, FiMapPin, FiPhoneCall } from "react-icons/fi";

const Footer = () => {
  const [role, setRole] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const resolveRole = async (authUser) => {
      if (!authUser?.email) {
        if (isMounted) setRole(null);
        return;
      }

      const resolvedRole = await getUserRole(authUser.email);
      if (isMounted) setRole(resolvedRole);
    };

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => resolveRole(session?.user ?? null));

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        resolveRole(session?.user ?? null);
      },
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const defaultQuickLinks = [
    { label: "Home", to: "/" },
    { label: "Events", to: "/events" },
    { label: "My Tickets", to: "/my-tickets" },
    { label: "Support", to: "/support" },
    { label: "Profile", to: "/profile" },
  ];

  const managementQuickLinks = [
    { label: "Creator", to: "/creator" },
    { label: "Successful", to: "/successful" },
    { label: "Cancelled", to: "/cancelled" },
  ];

  const adminQuickLinks = [
    { label: "Dashboard", to: "/dashboard" },
    { label: "Students", to: "/students" },
    { label: "Guest", to: "/guests" },
    { label: "Management", to: "/managements" },
  ];

  const quickLinks =
    role === "management"
      ? managementQuickLinks
      : role === "admin"
        ? adminQuickLinks
        : defaultQuickLinks;

  const showPrimaryActions = role !== "management" && role !== "admin";

  const socials = [
    {
      label: "Instagram",
      icon: FaInstagram,
      href: "https://www.instagram.com/mr_tuhin_0_1/",
    },
    {
      label: "Facebook",
      icon: FaFacebookF,
      href: "https://www.facebook.com/tuhin.kumar.77128",
    },
    { label: "X", icon: FaXTwitter, href: "https://x.com/tuhin151kumar" },
    {
      label: "LinkedIn",
      icon: FaLinkedinIn,
      href: "https://www.linkedin.com/in/tuhin-kumar/",
    },
  ];

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-black text-slate-200">
      <div className="relative max-w-7xl mx-auto px-6 py-16">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <motion.h3
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.45 }}
              className="text-3xl md:text-4xl font-extrabold tracking-tight"
            >
              <span className="bg-gradient-to-r from-rose-400 via-amber-300 to-cyan-300 bg-clip-text text-transparent">
                Evenify
              </span>
            </motion.h3>
            <p className="mt-4 max-w-md text-sm md:text-base leading-relaxed text-slate-300/90">
              Discover events, book in minutes, and manage tickets in one smooth
              flow. Built for the campus community with speed, reliability, and
              a modern experience.
            </p>

            {showPrimaryActions && (
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/events"
                  className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-sm font-semibold text-white shadow-2xl transition hover:opacity-90"
                >
                  Explore Events
                </Link>
                <Link
                  to="/support"
                  className="rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Contact Support
                </Link>
              </div>
            )}
          </div>

          <div className="lg:col-span-3">
            <h4 className="text-sm uppercase tracking-[0.18em] text-slate-400 font-semibold">
              Quick Links
            </h4>
            <ul className="mt-4 space-y-3">
              {quickLinks.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="group inline-flex items-center text-sm md:text-base text-slate-200/90 transition hover:text-white"
                  >
                    <span className="h-[2px] w-0 rounded-full bg-gradient-to-r from-rose-400 to-cyan-300 transition-all duration-300 group-hover:w-5" />
                    <span className="ml-0 transition-all duration-300 group-hover:ml-2">
                      {item.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-4">
            <h4 className="text-sm uppercase tracking-[0.18em] text-slate-400 font-semibold">
              Reach Us
            </h4>

            <div className="mt-4 space-y-3 text-sm md:text-base text-slate-200/90">
              <p className="flex items-start gap-3">
                <FiMail className="mt-0.5 text-rose-300" />
                <span>support@evenify.app</span>
              </p>
              <p className="flex items-start gap-3">
                <FiPhoneCall className="mt-0.5 text-cyan-300" />
                <span>+91 98765 43210</span>
              </p>
              <a
                href="https://maps.google.com/?q=Somaiya+Vidyavihar+University+Mumbai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 transition hover:text-white"
              >
                <FiMapPin className="mt-0.5 text-amber-300" />
                <span>Somaiya Campus, Mumbai</span>
              </a>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {socials.map((item) => {
                const Icon = item.icon;
                return (
                  <motion.a
                    key={item.label}
                    whileHover={{ y: -3, scale: 1.06 }}
                    whileTap={{ scale: 0.98 }}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={item.label}
                    className="h-10 w-10 rounded-xl border border-white/15 bg-white/5 text-slate-100 grid place-items-center transition hover:bg-white/15"
                  >
                    <Icon />
                  </motion.a>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full border-t border-white/10" />
      <div className="w-full px-6 py-6 text-center text-sm md:text-base text-slate-300">
        © {new Date().getFullYear()} Evenify. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
