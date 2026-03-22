import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getUserRole } from "../../utils/role";
import heroImage from "../../assets/images/hero.jpg";
import event1 from "../../assets/images/event1.jpg";
import event2 from "../../assets/images/event2.jpg";
import event3 from "../../assets/images/event3.jpg";
import event4 from "../../assets/images/event4.png";

const Home = () => {
  const navigate = useNavigate();
  const aboutRef = useRef(null);
  const heroSlides = [heroImage, event1, event2, event3, event4];
  const [activeSlide, setActiveSlide] = useState(0);
  const [hideExploreButton, setHideExploreButton] = useState(false);

  const scrollToAbout = () => {
    aboutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % heroSlides.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [heroSlides.length]);

  useEffect(() => {
    let isMounted = true;

    const resolveRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (!user?.email) {
        setHideExploreButton(false);
        return;
      }

      const role = await getUserRole(user.email);
      if (!isMounted) return;

      setHideExploreButton(role === "management" || role === "admin");
    };

    resolveRole();

    return () => {
      isMounted = false;
    };
  }, []);

  const faqItems = [
    {
      question: "How do I start booking an event?",
      answer:
        "Open Events, select any available event, review the details, and continue to the booking flow. You can complete the full journey from selection to confirmation in a few guided steps.",
    },
    {
      question: "Why can't I proceed to payment for some events?",
      answer:
        "Before payment, Evenify checks your profile completeness and event eligibility. If your details are incomplete or not eligible for that event, update your Profile and try again.",
    },
    {
      question: "What happens when an event is marked as Free?",
      answer:
        "Free events skip online payment and directly create your ticket after confirmation. You can still track everything from My Tickets like any other booking.",
    },
    {
      question: "Where do I find my tickets after booking?",
      answer:
        "Go to My Tickets to view all bookings. Each ticket shows event details, booking status, and your ticket ID in one place.",
    },
    {
      question:
        "What if payment is successful but my ticket status looks delayed?",
      answer:
        "Wait briefly and refresh My Tickets first. If status still looks incorrect, contact Support with your event name and payment reference so the team can verify quickly.",
    },
    {
      question: "Can I edit my phone or other profile details later?",
      answer:
        "Yes. Use the Profile page to update fields like phone and role-related details. Keeping profile data accurate helps reduce booking and access issues.",
    },
    {
      question: "Who can use Evenify?",
      answer:
        "Evenify supports two roles on the client side: Student and Guest. The platform experience adapts based on your account type while keeping the same booking flow.",
    },
    {
      question: "How do I get faster support resolution?",
      answer:
        "Share the exact page name, event title, and a short issue description on the Support page. Adding relevant timing details helps the support team resolve issues faster.",
    },
  ];

  return (
    <div className="relative w-full overflow-x-hidden bg-gradient-to-b from-[#28070d] via-[#141825] to-[#040406] text-white">
      {/* ===== Animated Glow Background ===== */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[760px] h-[760px] bg-[#4b0b1b]/60 rounded-full blur-[165px] top-[-280px] left-[-280px]"
          animate={{ scale: [1, 1.13, 1], opacity: [0.5, 0.82, 0.5] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[620px] h-[620px] bg-[#681126]/50 rounded-full blur-[150px] bottom-[-250px] right-[-230px]"
          animate={{ scale: [1.08, 0.96, 1.08], opacity: [0.42, 0.74, 0.42] }}
          transition={{ duration: 8.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[460px] h-[460px] bg-[#7a2d12]/45 rounded-full blur-[130px] bottom-[18%] left-[10%]"
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.58, 0.3] }}
          transition={{ duration: 6.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* ================= HERO SECTION ================= */}
      <section className="relative min-h-screen w-full flex items-center justify-center text-center px-4 z-10 overflow-hidden">
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

        <div className="relative z-20">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <motion.h1
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
              className="text-5xl md:text-7xl font-extrabold tracking-wide"
            >
              Smart Event Booking
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mt-6 max-w-3xl mx-auto text-lg md:text-xl text-gray-100"
            >
              Discover campus events, reserve your seat in seconds, and track
              every booking with confidence. One clean flow from Events to
              Payment to My Tickets.
            </motion.p>
          </motion.div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {!hideExploreButton && (
              <motion.button
                onClick={() => navigate("/events")}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="px-10 py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 rounded-full text-lg font-semibold shadow-2xl"
              >
                Explore Events
              </motion.button>
            )}

            <motion.button
              onClick={scrollToAbout}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="group px-7 py-3.5 rounded-full border border-white/45 bg-gradient-to-r from-white/15 to-white/5 text-white font-semibold inline-flex items-center gap-3 shadow-lg"
            >
              Discover More
              <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 border border-white/35 overflow-hidden">
                <motion.span
                  animate={{ y: [-2, 2, -2], opacity: [0.7, 1, 0.7] }}
                  transition={{
                    duration: 1.1,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="text-base leading-none"
                >
                  ▾
                </motion.span>
                <motion.span
                  animate={{ y: [6, 10, 6], opacity: [0.25, 0.65, 0.25] }}
                  transition={{
                    duration: 1.1,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="absolute text-xs leading-none"
                >
                  ▾
                </motion.span>
              </span>
            </motion.button>
          </div>
        </div>
      </section>

      {/* ================= ABOUT SECTION ================= */}
      <section
        ref={aboutRef}
        className="relative pt-16 pb-8 text-center px-6 z-10"
      >
        <h2 className="text-4xl md:text-5xl font-bold mb-6">About Evenify</h2>
        <p className="max-w-4xl mx-auto text-lg md:text-xl text-gray-200 leading-relaxed">
          Evenify is a student-first event experience platform built to make
          discovery, booking, payment, and ticket tracking simple and reliable.
          From the Home page to Events, Event Details, Student Details, Payment,
          My Tickets, Profile, and Support, every page is connected in one
          smooth journey so users can focus on attending great events instead of
          dealing with complex steps.
        </p>
        <p className="max-w-4xl mx-auto mt-5 text-base md:text-lg text-gray-300 leading-relaxed">
          Whether you sign in as a Student or a Guest, the platform adapts your
          experience with relevant actions, transparent status updates, and
          responsive support guidance whenever you need help.
        </p>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="relative pt-4 pb-16 z-10">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8 px-6">
          {[
            {
              title: "Secure Login",
              desc: "Trusted sign-in flow designed for clean, role-aware access.",
            },
            {
              title: "Fast Booking Journey",
              desc: "Move from event discovery to confirmation in just a few steps.",
            },
            {
              title: "Clear Ticket Tracking",
              desc: "Monitor booking and payment status anytime in My Tickets.",
            },
          ].map((feature, index) => (
            <motion.div
              key={index}
              whileHover={{ y: -10, scale: 1.03 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="p-8 bg-white/10 backdrop-blur-md rounded-2xl shadow-lg border border-white/15"
            >
              <h3 className="text-2xl font-semibold mb-4">{feature.title}</h3>
              <p className="text-gray-300">{feature.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8 px-6 mt-8">
          {[
            {
              title: "Live Event Availability",
              desc: "Event visibility and status are synced in real time, so ended or unavailable events are handled automatically.",
            },
            {
              title: "Guided Support",
              desc: "Dedicated Support guidance helps you resolve login, booking, payment, and ticket issues with clear issue reporting.",
            },
          ].map((feature, index) => (
            <motion.div
              key={`extra-${index}`}
              whileHover={{ y: -10, scale: 1.03 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="p-8 bg-white/10 backdrop-blur-md rounded-2xl shadow-lg border border-white/15"
            >
              <h3 className="text-2xl font-semibold mb-4">{feature.title}</h3>
              <p className="text-gray-300">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ================= FAQ SECTION ================= */}
      <section className="relative py-24 z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold">
              Frequently Asked Questions
            </h2>
            <p className="mt-4 max-w-3xl mx-auto text-gray-300 text-base md:text-lg leading-relaxed">
              Quick guidance for the most common platform questions. Use this
              section to understand the booking flow, ticket visibility, payment
              updates, profile actions, and support steps.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {faqItems.map((item, index) => (
              <motion.div
                key={item.question}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
                className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-6 shadow-lg"
              >
                <h3 className="text-xl font-semibold text-white mb-3">
                  {item.question}
                </h3>
                <p className="text-gray-200 leading-relaxed">{item.answer}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
