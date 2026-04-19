import { useState } from "react";
import { motion } from "framer-motion";
import heroBg from "../../assets/images/hero.jpg";
import event1 from "../../assets/images/event1.jpg";
import event2 from "../../assets/images/event2.jpg";
import event3 from "../../assets/images/event3.jpg";
import event4 from "../../assets/images/event4.png";
import { useEffect } from "react";

const Support = () => {
  const [bgError, setBgError] = useState(false);
  const heroSlides = [heroBg, event1, event2, event3, event4];
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % heroSlides.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [heroSlides.length]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
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

      <div className="relative z-20 py-28 text-center px-6">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-5xl md:text-6xl font-extrabold"
        >
          Support & Contact
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mt-5 max-w-4xl mx-auto text-white/85 text-base md:text-lg leading-relaxed"
        >
          Need help on Evenify? Our support team can assist with events,
          bookings, payments, ticket status, and profile-related issues for
          quick and reliable resolution.
        </motion.p>
      </div>

      <div className="relative z-20 max-w-6xl mx-auto px-6 -mt-20 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 md:p-10 border border-white/30 text-gray-900"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            When You Should Contact Support 💬
          </h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            We recommend contacting support whenever your flow breaks at any
            step in the platform. This includes issues from login and profile
            setup to event discovery, booking, payment, and ticket tracking. Our
            team can help you verify records, understand event status,
            troubleshoot errors, and clarify policy-based concerns so your event
            experience remains smooth and predictable.
          </p>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="rounded-2xl border border-purple-100 bg-purple-50/70 p-5">
              <h3 className="font-semibold text-purple-900 mb-2">
                Platform Flow Assistance 🧭
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                Help with Home, Events, Event Details, Payment, My Tickets,
                Login, and Profile pages when behavior is unexpected or
                information does not match what you expect.
              </p>
            </div>
            <div className="rounded-2xl border border-pink-100 bg-pink-50/70 p-5">
              <h3 className="font-semibold text-pink-900 mb-2">
                Account & Access Guidance 🔐
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                Help with authentication, role-based access visibility,
                account-related issues, and resolving permission or sign-in
                barriers.
              </p>
            </div>
          </div>

          <h3 className="text-xl font-semibold mb-3">
            Common Support Topics 📌
          </h3>
          <ul className="list-disc list-inside space-y-2 text-gray-700 leading-relaxed mb-8">
            <li>🎟️ Ticket booking or payment related issues</li>
            <li>🔑 Login / authentication problems</li>
            <li>
              💸 Refund (only on cancellation of event) or event status concerns
            </li>
            <li>🛠️ Any technical issues faced on the platform</li>
            <li>🎫 Unable to view booked tickets in "My Tickets"</li>
            <li>⏳ Payment marked pending even after transaction success</li>
            <li>🗓️ Event schedule mismatch between listing and details page</li>
            <li>👤 Profile details not updating as expected</li>
            <li>🧑‍🎓 Role/access confusion between Student and Guest accounts</li>
            <li>🖼️ Photo, content, or loading-related display issues</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3">Contact Information 📞</h3>
          <p className="text-gray-700 leading-relaxed mb-4">
            For assistance, please use the official support channels below and
            share complete issue details such as page name, event name, date,
            and a short description of what happened.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">
                Support Email 📧
              </p>
              <p className="font-semibold text-gray-900 break-all">
                support@evenify.help
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">
                Contact Number ☎️
              </p>
              <p className="font-semibold text-gray-900">+91 9073185624</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">
                Availability 🕒
              </p>
              <p className="font-semibold text-gray-900">
                Mon-Sat, 10:00 AM - 6:00 PM
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Support;
