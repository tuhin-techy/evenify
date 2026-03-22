import { useState, useEffect, useRef } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getUserRole } from "../../utils/role";
import heroBg from "../../assets/images/hero.jpg";
import event1 from "../../assets/images/event1.jpg";
import event2 from "../../assets/images/event2.jpg";
import event3 from "../../assets/images/event3.jpg";
import event4 from "../../assets/images/event4.png";

const isGmailOnly = (e) => /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(e);
const isSomaiyaOnly = (e) => /^[a-zA-Z0-9._%+-]+@somaiya\.edu$/.test(e);
const isAllowedLogin = (e) => isGmailOnly(e) || isSomaiyaOnly(e);
const isAllowedDomain = (e) =>
  e.endsWith("@gmail.com") || e.endsWith("@somaiya.edu");

const Login = () => {
  const navigate = useNavigate();
  const heroSlides = [heroBg, event1, event2, event3, event4];
  const [activeSlide, setActiveSlide] = useState(0);

  const [isSignup, setIsSignup] = useState(false);
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [emailFormatErr, setEmailFormatErr] = useState("");
  const [emailDbStatus, setEmailDbStatus] = useState(null);
  const [otp, setOtp] = useState("");
  const [otpErr, setOtpErr] = useState("");
  const [resendUsed, setResendUsed] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [genError, setGenError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleBtnWidth, setGoogleBtnWidth] = useState(320);
  const debounceRef = useRef(null);
  const emailCheckSeqRef = useRef(0);
  const googleWrapRef = useRef(null);

  useEffect(() => {
    const updateGoogleWidth = () => {
      const vw = window.innerWidth;
      const horizontalSpace = vw < 640 ? 170 : 180;
      const next = Math.max(200, Math.min(320, vw - horizontalSpace));
      setGoogleBtnWidth(next);
    };

    updateGoogleWidth();
    window.addEventListener("resize", updateGoogleWidth);
    return () => window.removeEventListener("resize", updateGoogleWidth);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % heroSlides.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [heroSlides.length]);

  // Clear lingering focus from Google button iframe when returning from popup.
  useEffect(() => {
    const clearGoogleFocus = () => {
      const activeEl = document.activeElement;
      if (
        googleWrapRef.current &&
        activeEl &&
        googleWrapRef.current.contains(activeEl)
      ) {
        activeEl.blur();
      }
    };

    const onWindowFocus = () => window.setTimeout(clearGoogleFocus, 0);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        window.setTimeout(clearGoogleFocus, 0);
      }
    };

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // ── Real-time email validation + debounced DB check ──
  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase();
    setEmailDbStatus(null);
    setGenError("");

    if (!normalizedEmail) {
      setEmailFormatErr("");
      return;
    }

    if (isSignup) {
      if (!isGmailOnly(normalizedEmail)) {
        setEmailFormatErr("Only @gmail.com is allowed for sign up");
        return;
      }
    } else {
      if (!isAllowedLogin(normalizedEmail)) {
        setEmailFormatErr("Only @gmail.com or @somaiya.edu is allowed");
        return;
      }
    }
    setEmailFormatErr("");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setEmailDbStatus("checking");
    const checkSeq = ++emailCheckSeqRef.current;
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("login")
        .select("email")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (emailCheckSeqRef.current !== checkSeq) return;
      setEmailDbStatus(data ? "exists" : "not_exists");
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email, isSignup]);

  // ── Resend cooldown countdown ──
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const normalizedEmail = email.trim().toLowerCase();

  // ── Derived email status message ──
  const emailStatus = (() => {
    if (!normalizedEmail || emailFormatErr) return null;
    if (emailDbStatus === "checking")
      return { type: "info", msg: "Checking..." };
    if (isSignup) {
      if (emailDbStatus === "exists")
        return { type: "error", msg: "User already exists. Please login." };
      if (emailDbStatus === "not_exists")
        return { type: "success", msg: "Email available! You can proceed." };
    } else {
      if (emailDbStatus === "not_exists") {
        return isSomaiyaOnly(normalizedEmail)
          ? {
              type: "error",
              msg: "Contact college administrator regarding this.",
            }
          : { type: "error", msg: "No account found. Please sign up first." };
      }
      if (emailDbStatus === "exists")
        return {
          type: "success",
          msg: "Account found! We'll send you an OTP.",
        };
    }
    return null;
  })();

  const canProceed = isSignup
    ? isGmailOnly(normalizedEmail) && emailDbStatus === "not_exists"
    : isAllowedLogin(normalizedEmail) && emailDbStatus === "exists";

  // ── Core OTP sender ──
  const sendOtpToEmail = async (targetEmail, shouldCreateUser) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail.toLowerCase(),
      options: { shouldCreateUser },
    });
    if (error) throw error;
  };

  // ── Send OTP (from email step) ──
  const handleSendOtp = async () => {
    if (!canProceed || otpLoading) return;
    setGenError("");
    setOtpErr("");
    setOtp("");
    setOtpLoading(true);
    try {
      await sendOtpToEmail(normalizedEmail, isSignup);
      setStep("otp");
      setResendUsed(false);
      setResendCooldown(60); // disable resend for 60s from first send
    } catch (err) {
      setGenError(err.message || "Failed to send OTP. Try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Resend OTP ──
  const handleResendOtp = async () => {
    if (otpLoading || resendUsed || resendCooldown > 0) return;
    setOtpErr("");
    setOtp("");
    setGenError("");
    setOtpLoading(true);
    try {
      await sendOtpToEmail(normalizedEmail, isSignup);
      setResendUsed(true);
      setResendCooldown(60); // disable again for 60s after resend
    } catch (err) {
      setOtpErr(err.message || "Failed to resend OTP. Try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Verify OTP ──
  const handleVerifyOtp = async () => {
    setOtpErr("");
    if (!otp || otp.trim().length < 6) {
      setOtpErr("Enter the 6-digit OTP from your email.");
      return;
    }
    setOtpLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: otp.trim(),
        type: "email",
      });
      if (error) {
        setOtpErr("Invalid or expired OTP. Try again.");
        setOtpLoading(false);
        return;
      }

      if (isSignup) {
        await supabase
          .from("login")
          .upsert({ email: normalizedEmail }, { onConflict: "email" });
        await supabase
          .from("outsiders")
          .upsert({ email: normalizedEmail }, { onConflict: "email" });
      }
      navigate("/", { replace: true });
    } catch (err) {
      setOtpErr(err.message || "OTP verification failed.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Google sign-in ──
  const handleGoogleSuccess = async (response) => {
    if (googleLoading) return;
    setGoogleLoading(true);
    setGenError("");
    try {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
      });
      if (error) throw error;

      const userEmail = data.user.email.toLowerCase();
      const name =
        data.user.user_metadata?.name ??
        data.user.user_metadata?.full_name ??
        "";
      const photo =
        data.user.user_metadata?.avatar_url ??
        data.user.user_metadata?.picture ??
        "";

      if (!isAllowedDomain(userEmail)) {
        await supabase.auth.signOut();
        setGenError("Only @gmail.com and @somaiya.edu accounts are allowed.");
        setGoogleLoading(false);
        return;
      }

      if (userEmail.endsWith("@somaiya.edu")) {
        const role = await getUserRole(userEmail);
        if (role === "denied") {
          await supabase.auth.signOut();
          setGenError(
            "Access denied. Your Somaiya email is not registered. Contact college administrator.",
          );
          setGoogleLoading(false);
          return;
        }
        const tableMap = {
          student: "students",
          management: "management",
          admin: "admin",
        };
        const table = tableMap[role];
        const updates = [
          supabase
            .from("login")
            .upsert({ email: userEmail }, { onConflict: "email" }),
        ];
        if (table) {
          updates.push(
            supabase
              .from(table)
              .update({ name, photo_url: photo })
              .eq("email", userEmail),
          );
        }
        await Promise.all(updates);
      } else {
        const updates = [
          supabase
            .from("outsiders")
            .upsert(
              { email: userEmail, name, photo_url: photo },
              { onConflict: "email" },
            ),
          supabase
            .from("login")
            .upsert({ email: userEmail }, { onConflict: "email" }),
        ];
        if (photo) {
          updates.push(
            supabase.auth.updateUser({
              data: { avatar_url: photo, picture: photo },
            }),
          );
        }
        await Promise.all(updates);
      }
      navigate("/", { replace: true });
    } catch (err) {
      setGenError(err.message || "Google sign-in failed. Try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const switchMode = () => {
    setIsSignup((prev) => !prev);
    setStep("email");
    setEmail("");
    setEmailFormatErr("");
    setEmailDbStatus(null);
    setOtp("");
    setOtpErr("");
    setGenError("");
  };

  const statusColor = {
    info: "text-blue-500",
    success: "text-green-600",
    error: "text-red-500",
  };
  const statusIcon = { info: "⏳ ", success: "✅ ", error: "❌ " };

  // ════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════
  return (
    <div className="min-h-screen relative overflow-hidden">
      {heroSlides.map((slide, index) => (
        <div
          key={slide}
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 ease-linear ${
            index === activeSlide ? "opacity-100" : "opacity-0"
          }`}
          style={{ backgroundImage: `url(${slide})` }}
        />
      ))}

      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2.8px]" />

      <div className="relative z-20 min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="bg-white/95 backdrop-blur p-10 rounded-2xl shadow-2xl w-full max-w-md"
        >
          <h2 className="text-3xl font-bold text-center mb-6 text-gray-900">
            {isSignup ? "Create Account" : "Login"}
          </h2>

          {genError && (
            <p className="text-red-600 text-center mb-4 text-sm font-medium bg-red-50 border border-red-200 px-4 py-2 rounded-lg">
              {genError}
            </p>
          )}

          {/* Google Login - Hidden after OTP is sent */}
          {step === "email" && (
            <>
              <div className="mb-6 rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-gray-50 to-rose-50/40 p-4 shadow-md">
                <div className="mb-3">
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      Continue with Google
                    </p>
                    <p className="text-xs text-gray-600">
                      Fast sign-in for Gmail and Somaiya accounts
                    </p>
                  </div>
                </div>

                <div
                  ref={googleWrapRef}
                  className="w-full max-w-[340px] mx-auto flex justify-center overflow-hidden rounded-xl border border-white/70 bg-white p-2 shadow-inner"
                >
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() =>
                      setGenError("Google login failed. Try again.")
                    }
                    useOneTap
                    theme="filled_black"
                    shape="pill"
                    size="large"
                    text="continue_with"
                    width={googleBtnWidth}
                    logo_alignment="left"
                  />
                </div>
              </div>

              <div className="flex items-center my-6">
                <div className="flex-grow h-px bg-gray-300" />
                <span className="px-3 text-gray-500 text-sm">OR</span>
                <div className="flex-grow h-px bg-gray-300" />
              </div>
            </>
          )}

          {/* ── STEP 1: Email ── */}
          {step === "email" && (
            <div className="space-y-4">
              <div>
                <input
                  type="email"
                  placeholder={
                    isSignup
                      ? "Email (@gmail.com only)"
                      : "Email (@gmail.com or @somaiya.edu)"
                  }
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition
                    ${
                      emailFormatErr || emailStatus?.type === "error"
                        ? "border-red-400 focus:ring-red-400"
                        : emailStatus?.type === "success"
                          ? "border-green-400 focus:ring-green-400"
                          : "border-gray-300 focus:ring-purple-500"
                    }`}
                />
                {(emailFormatErr || emailStatus) && (
                  <div
                    className={`mt-2 rounded-lg border px-3 py-2 ${
                      emailFormatErr
                        ? "border-red-200 bg-red-50"
                        : emailStatus?.type === "success"
                          ? "border-green-200 bg-green-50"
                          : emailStatus?.type === "info"
                            ? "border-blue-200 bg-blue-50"
                            : "border-red-200 bg-red-50"
                    }`}
                  >
                    <p
                      className={`text-sm font-medium ${
                        emailFormatErr
                          ? "text-red-700"
                          : emailStatus?.type === "success"
                            ? "text-green-700"
                            : emailStatus?.type === "info"
                              ? "text-blue-700"
                              : "text-red-700"
                      }`}
                    >
                      {emailFormatErr
                        ? `❌ ${emailFormatErr}`
                        : `${statusIcon[emailStatus.type]}${emailStatus.msg}`}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={handleSendOtp}
                disabled={!canProceed || otpLoading}
                className={`w-full py-3 rounded-lg font-semibold transition
                  ${
                    !canProceed || otpLoading
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-700 text-white"
                  }`}
              >
                {otpLoading ? "Sending OTP..." : "Send OTP"}
              </button>
            </div>
          )}

          {/* ── STEP 2: OTP ── */}
          {step === "otp" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 text-center">
                A 6-digit OTP was sent to{" "}
                <strong className="text-gray-700">{email}</strong>.
              </p>

              {/* OTP info message */}
              {!resendUsed && (
                <p className="text-xs text-blue-600 text-center">
                  OTP sent successfully. It will be valid for{" "}
                  <strong>{resendCooldown}</strong>{" "}
                  {resendCooldown === 1 ? "second" : "seconds"}.
                </p>
              )}
              {resendUsed && resendCooldown > 0 && (
                <p className="text-xs text-blue-600 text-center">
                  OTP resent successfully. This OTP is valid for{" "}
                  <strong>{resendCooldown}</strong>{" "}
                  {resendCooldown === 1 ? "second" : "seconds"}.
                </p>
              )}

              <div>
                <input
                  type="text"
                  placeholder="● ● ● ● ● ●"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, ""));
                    setOtpErr("");
                  }}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-center text-2xl tracking-widest transition
                    ${otpErr ? "border-red-400 focus:ring-red-400" : "border-gray-300 focus:ring-purple-500"}`}
                  autoFocus
                />
                {otpErr && (
                  <p className="text-red-500 text-xs mt-1 text-center">
                    {otpErr}
                  </p>
                )}
              </div>

              <button
                onClick={handleVerifyOtp}
                disabled={otpLoading}
                className={`w-full py-3 rounded-lg font-semibold transition text-white
                  ${otpLoading ? "bg-gray-300 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"}`}
              >
                {otpLoading
                  ? "Verifying..."
                  : isSignup
                    ? "Verify & Create Account"
                    : "Verify & Login"}
              </button>

              <div className="flex justify-between items-center text-sm">
                <button
                  onClick={() => {
                    setStep("email");
                    setOtp("");
                    setOtpErr("");
                  }}
                  className="text-gray-500 hover:text-gray-700 hover:underline"
                >
                  ← Change email
                </button>
                <button
                  onClick={handleResendOtp}
                  disabled={otpLoading || resendUsed || resendCooldown > 0}
                  className="text-purple-600 hover:underline font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {resendUsed && resendCooldown === 0
                    ? "Resend OTP used"
                    : "Resend OTP"}
                </button>
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-gray-600 text-base">
            {isSignup ? "Already have an account?" : "New user?"}{" "}
            <button
              onClick={switchMode}
              className="text-purple-600 font-semibold hover:underline"
            >
              {isSignup ? "Login" : "Sign Up"}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
