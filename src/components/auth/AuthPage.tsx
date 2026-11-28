import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Settings,
  UserCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Send,
  KeyRound,
  RefreshCw,
  X,
  Zap,
  Trophy,
} from 'lucide-react';
import { examStore } from '../../services/examStore.ts';
import {
  getLoadedFirebaseModule,
  loadFirebaseModule,
  preloadFirebaseModule,
} from '../../services/firebaseLoader.ts';
import { InstitutionalHeaderBrand } from '../common/InstitutionalHeaderBrand.tsx';

function suggestCorrectedEmail(rawEmail: string): string | null {
  const clean = rawEmail.trim().toLowerCase();
  const match = clean.match(/^([^@\s]+)@([a-z0-9.-]+)$/);
  if (!match) return null;
  const [, local, domain] = match;
  const gmailTypos = new Set([
    'gmai.com',
    'gmial.com',
    'gmal.com',
    'gamil.com',
    'gmali.com',
    'gmail.co',
    'gmail.con',
    'gmail.cm',
    'gmail.om',
    'gnail.com',
  ]);
  if (gmailTypos.has(domain)) {
    return `${local}@gmail.com`;
  }
  return null;
}

interface AuthPageProps {
  initialRole?: 'admin' | 'student';
  onBackToWelcome: () => void;
  onSuccess: (role: 'admin' | 'student') => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialRole = 'admin',
  onBackToWelcome,
  onSuccess,
}) => {
  const state = examStore.getState();
  const collegeLogoUrl = state.settings.collegeLogoUrl || '';
  const institutionName = state.settings.institutionName;
  const activeSettingsAdminEmail =
    state.settings.adminEmail || 'tarunkumarv2008@gmail.com';

  const [role, setRole] = useState<'admin' | 'student'>(initialRole);
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Server Admin Auth Status (first-run setup detection + SMTP availability)
  const [needsInitialSetup, setNeedsInitialSetup] = useState<boolean>(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean>(false);
  const [maskedAdminEmail, setMaskedAdminEmail] = useState<string>('ta***@gmail.com');

  // First-Run Initial Admin Setup state
  const [setupEmail, setSetupEmail] = useState<string>(activeSettingsAdminEmail);
  const [setupPassword, setSetupPassword] = useState<string>('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState<string>('');

  // Secure 2-Step Forgot Password / Email OTP flow (Administrator only — NEVER displays OTP on screen)
  const [forgotStep, setForgotStep] = useState<'none' | 'request' | 'verify'>('none');
  const [recoveryEmailInput, setRecoveryEmailInput] = useState<string>(
    activeSettingsAdminEmail
  );
  const [sentMaskedEmail, setSentMaskedEmail] = useState<string>('');
  const [enteredOtp, setEnteredOtp] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [otpSuccessMsg, setOtpSuccessMsg] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<boolean>(false);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // Sync role and clear stale messages when initialRole prop changes
  useEffect(() => {
    setRole(initialRole);
    setError(null);
    setOtpSuccessMsg(null);
    setForgotStep('none');
  }, [initialRole]);

  // Preload Firebase Auth asynchronously ONLY when entering Forgot Password flow
  useEffect(() => {
    if (forgotStep === 'request' || forgotStep === 'verify') {
      preloadFirebaseModule();
    }
  }, [forgotStep]);

  // Fetch server Admin auth status on mount
  useEffect(() => {
    let active = true;
    examStore
      .fetchAdminAuthStatus()
      .then((status) => {
        if (!active) return;
        setNeedsInitialSetup(status.needsInitialSetup);
        setSmtpConfigured(status.smtpConfigured);
        setMaskedAdminEmail(status.maskedRecoveryEmail);
        if (status.cooldownSecondsRemaining > 0) {
          setResendCooldown(status.cooldownSecondsRemaining);
        }
      })
      .catch(() => {
        // Keep safe defaults if status request fails transiently
      });
    return () => {
      active = false;
    };
  }, []);

  // Keep recoveryEmailInput synced when settings.adminEmail updates from remote sync
  useEffect(() => {
    if (activeSettingsAdminEmail) {
      setRecoveryEmailInput((prev) => prev || activeSettingsAdminEmail);
      setSetupEmail((prev) => prev || activeSettingsAdminEmail);
    }
  }, [activeSettingsAdminEmail]);

  // 60-second resend countdown timer (single clean interval while active)
  const isResendCoolingDown = resendCooldown > 0;
  useEffect(() => {
    if (!isResendCoolingDown) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isResendCoolingDown]);

  const handleRoleSwitch = (nextRole: 'admin' | 'student') => {
    setRole(nextRole);
    setError(null);
    setOtpSuccessMsg(null);
    setForgotStep('none');
    setIdentifier('');
    setPassword('');
  };

  const handleInitialAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOtpSuccessMsg(null);
    if (setupPassword.length < 8) {
      setError('Administrator password must be at least 8 characters long.');
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setError('Password and confirmation do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await examStore.setupInitialAdminPassword(
        setupEmail.trim(),
        setupPassword,
        setupConfirmPassword
      );
      if (!res.success) {
        setError(res.error || 'Initial setup failed.');
        return;
      }
      setNeedsInitialSetup(false);
      setSetupPassword('');
      setSetupConfirmPassword('');
      onSuccess('admin');
    } catch {
      setError('Unable to complete setup right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOtpSuccessMsg(null);

    if (!identifier.trim()) {
      setError(
        role === 'admin'
          ? 'Please enter the Administrator username or email.'
          : 'Please enter your registered Student ID or Email.'
      );
      return;
    }

    if (!password.trim()) {
      setError(
        role === 'admin'
          ? 'Please enter your Administrator password.'
          : 'Please enter your Student password.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await examStore.loginWithRemoteSync(identifier, password, role);
      if (!res.success) {
        setError(res.error || 'Authentication failed.');
        return;
      }
      onSuccess(role);
    } catch {
      setError('Unable to sign in right now. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenForgot = () => {
    if (role !== 'admin') return;
    preloadFirebaseModule();
    setForgotStep('request');
    setRecoveryEmailInput(activeSettingsAdminEmail);
    setEnteredOtp('');
    setNewPassword('');
    setConfirmNewPassword('');
    setError(null);
    setOtpSuccessMsg(null);
  };

  const handleSendOtpViaSmtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setOtpSuccessMsg(null);
    const cleanEmail = recoveryEmailInput.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter your authorized Administrator email address.');
      return;
    }
    const typoSuggestion = suggestCorrectedEmail(cleanEmail);
    if (typoSuggestion) {
      setRecoveryEmailInput(typoSuggestion);
      setError(
        `We corrected the email spelling to ${typoSuggestion}. Click "Send 6-Digit Code to Inbox" again to send.`
      );
      return;
    }

    setSendingEmail(true);
    try {
      const res = await examStore.requestAdminOtpViaSmtp(cleanEmail);
      if (!res.success) {
        if (res.cooldownSeconds && res.cooldownSeconds > 0) {
          setResendCooldown(res.cooldownSeconds);
        }
        setError(res.error || 'Could not send verification email.');
        return;
      }
      setSentMaskedEmail(res.maskedEmail || maskedAdminEmail);
      setResendCooldown(res.cooldownSeconds || 60);
      setEnteredOtp('');
      setForgotStep('verify');
      setOtpSuccessMsg(
        `A 6-digit verification code has been sent to ${
          res.maskedEmail || maskedAdminEmail
        }. Please check your email inbox (valid for ${res.expiresInMinutes || 10} minutes).`
      );
    } catch {
      setError('Could not reach the email verification service. Please try again.');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSendOtpViaVerifiedGoogle = async () => {
    setError(null);
    setOtpSuccessMsg(null);
    const cleanEmail = recoveryEmailInput.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter your authorized Administrator email address first.');
      return;
    }
    const typoSuggestion = suggestCorrectedEmail(cleanEmail);
    const targetEmail = typoSuggestion || cleanEmail;
    if (typoSuggestion) {
      setRecoveryEmailInput(typoSuggestion);
    }

    setSendingEmail(true);
    try {
      const loadedFb = getLoadedFirebaseModule();
      const signInResult = loadedFb
        ? await loadedFb.googleSignIn()
        : await (await loadFirebaseModule()).googleSignIn();
      if (!signInResult?.accessToken) {
        setError(
          'Google account verification was cancelled or did not return Gmail permission.'
        );
        return;
      }

      const res = await examStore.requestAdminOtpViaVerifiedGoogle(
        targetEmail,
        signInResult.accessToken
      );
      if (!res.success) {
        if (res.cooldownSeconds && res.cooldownSeconds > 0) {
          setResendCooldown(res.cooldownSeconds);
        }
        setError(res.error || 'Google verification failed.');
        return;
      }

      setSentMaskedEmail(res.maskedEmail || maskedAdminEmail);
      setResendCooldown(res.cooldownSeconds || 60);
      setEnteredOtp('');
      setForgotStep('verify');
      setOtpSuccessMsg(
        `Verified! A 6-digit reset code was emailed to ${
          res.maskedEmail || maskedAdminEmail
        }. Open your Gmail inbox and enter the code below.`
      );
    } catch (err: any) {
      const code = err?.code;
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        setError(
          'Google sign-in window was closed before verification completed. Click again when ready.'
        );
      } else if (code === 'auth/popup-blocked') {
        setError(
          'Browser blocked the Google sign-in popup. Please allow popups for this site and click again.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setError(
          'This preview domain is not authorized for Google popups. Use the "Send 6-Digit Code to Inbox" button above instead.'
        );
      } else if (code === 'auth/network-request-failed') {
        setError(
          'Network error while connecting to Google sign-in. Please check your internet connection and retry.'
        );
      } else {
        setError(
          'Unable to verify Google account. Only the authorized Administrator email can request a reset code.'
        );
      }
    } finally {
      setSendingEmail(false);
    }
  };

  const handleVerifyOtpAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanOtp = enteredOtp.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setError('Please enter the exact 6-digit verification code from your email inbox.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New Administrator password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await examStore.verifyAdminOtpAndResetPassword(
        cleanOtp,
        newPassword,
        confirmNewPassword
      );
      if (!res.success) {
        setError(res.error || 'Invalid or expired verification code.');
        return;
      }
      setEnteredOtp('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPassword('');
      setForgotStep('none');
      setOtpSuccessMsg(
        'Administrator password has been updated securely! Please sign in with your new password.'
      );
    } catch {
      setError('Could not verify your reset code right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07081B] text-slate-50 grid grid-cols-1 lg:grid-cols-2">
      {/* Left Cosmic Branding Pane (Exact Match to Screenshot 3) */}
      <div
        className="p-8 sm:p-12 lg:p-14 border-b lg:border-b-0 lg:border-r border-purple-500/25 flex flex-col justify-between gap-10"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 25% 15%, rgba(99, 102, 241, 0.24), transparent 62%), linear-gradient(160deg, #0D1036 0%, #11103E 55%, #0A0D2B 100%)',
        }}
      >
        <div className="space-y-6">
          <InstitutionalHeaderBrand
            logoUrl={collegeLogoUrl}
            arenaSubtitle={institutionName}
            compact
          />

          <div>
            <button
              type="button"
              onClick={onBackToWelcome}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#161948] hover:bg-[#1E225E] border border-purple-400/35 text-xs font-bold text-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Welcome Page
            </button>
          </div>

          <div className="border-t border-purple-500/20 pt-8 space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#18164A] border border-purple-400/35 text-xs font-bold text-slate-200">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>Learn • Practice • Compete</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-black tracking-tight leading-[1.05]">
              <span className="block text-white">Dream Big.</span>
              <span className="block bg-gradient-to-r from-[#A855F7] via-[#8B5CF6] to-[#38BDF8] bg-clip-text text-transparent">
                Crack It.
              </span>
            </h1>

            <p className="text-sm text-slate-300 max-w-md leading-relaxed">
              Conduct high-integrity university examinations, coding competitions,
              and real-time evaluations in one unified platform.
            </p>

            <div className="space-y-3.5 pt-2">
              <div className="flex items-center gap-3 text-xs sm:text-sm font-medium text-slate-200">
                <span className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
                <span>Multiple Question Types (MCQ, Descriptive &amp; Coding)</span>
              </div>
              <div className="flex items-center gap-3 text-xs sm:text-sm font-medium text-slate-200">
                <span className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
                <span>Real-Time Fullscreen &amp; Tab-Switch Monitoring</span>
              </div>
              <div className="flex items-center gap-3 text-xs sm:text-sm font-medium text-slate-200">
                <span className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
                  <Trophy className="w-3.5 h-3.5" />
                </span>
                <span>Instant Evaluation &amp; Verifiable Certificates</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-purple-500/20 pt-6">
          <div className="rounded-2xl bg-[#0D1033]/85 border border-purple-500/30 p-4 flex items-start gap-3 text-xs text-slate-300 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong className="text-white font-bold">
                Role-Restricted Authentication:
              </strong>{' '}
              Only authorized Administrator credentials can access the Admin Console.
              Students must sign in using their registered Student ID.
            </span>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Pane (Exact Match to Screenshot 3) */}
      <div className="p-8 sm:p-12 lg:p-16 bg-[#07081B] flex flex-col items-center justify-center">
        <div className="w-full max-w-md">
          {/* Centered Icon + Heading */}
          <div className="flex flex-col items-center text-center mb-7">
            <div className="w-14 h-14 rounded-2xl bg-[#181442] border border-purple-400/40 shadow-[0_0_24px_rgba(124,58,237,0.35)] flex items-center justify-center text-purple-300 mb-4">
              <GraduationCap className="w-7 h-7" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {role === 'admin' && needsInitialSetup
                ? 'Set Up Admin Security'
                : forgotStep !== 'none'
                ? 'Administrator Password Reset'
                : 'Welcome Back!'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5">
              {role === 'admin'
                ? needsInitialSetup
                  ? 'Create your private Administrator password to secure ExamFlow'
                  : 'Enter your Administrator username or email and password'
                : 'Enter your registered Student ID and password'}
            </p>
          </div>

          {/* Segmented Role Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#0D102D] rounded-2xl border border-purple-500/30">
            <button
              type="button"
              onClick={() => handleRoleSwitch('admin')}
              className={`flex items-center justify-center gap-2.5 py-3 px-3 rounded-xl text-left transition-all cursor-pointer ${
                role === 'admin'
                  ? 'bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] text-white shadow-[0_0_22px_-3px_rgba(124,58,237,0.65)]'
                  : 'text-slate-300 hover:text-white hover:bg-purple-500/10'
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <div>
                <div className="text-xs font-extrabold leading-none">Admin</div>
                <div className={`text-[10px] mt-1 leading-none ${role === 'admin' ? 'text-purple-100' : 'text-slate-400'}`}>
                  Manage Exams
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleRoleSwitch('student')}
              className={`flex items-center justify-center gap-2.5 py-3 px-3 rounded-xl text-left transition-all cursor-pointer ${
                role === 'student'
                  ? 'bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] text-white shadow-[0_0_22px_-3px_rgba(124,58,237,0.65)]'
                  : 'text-slate-300 hover:text-white hover:bg-purple-500/10'
              }`}
            >
              <UserCheck className="w-4 h-4 shrink-0" />
              <div>
                <div className="text-xs font-extrabold leading-none">Student</div>
                <div className={`text-[10px] mt-1 leading-none ${role === 'student' ? 'text-purple-100' : 'text-slate-400'}`}>
                  Take Exams
                </div>
              </div>
            </button>
          </div>

              {error && (
                <div className="mt-5 p-3.5 rounded-xl bg-red-500/12 border border-red-500/35 text-red-200 text-xs font-medium flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                    <span>{error}</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss error"
                    onClick={() => setError(null)}
                    className="text-red-300/80 hover:text-white p-0.5 rounded cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {otpSuccessMsg && (
                <div className="mt-5 p-3.5 rounded-xl bg-emerald-500/12 border border-emerald-500/35 text-emerald-200 text-xs font-medium flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                    <span>{otpSuccessMsg}</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss notice"
                    onClick={() => setOtpSuccessMsg(null)}
                    className="text-emerald-300/80 hover:text-white p-0.5 rounded cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {role === 'admin' && needsInitialSetup ? (
                /* One-Time First-Run Administrator Password Claim Form */
                <form onSubmit={handleInitialAdminSetup} className="mt-6 space-y-4">
                  <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/25 text-xs text-slate-200 leading-relaxed flex items-start gap-2.5">
                    <KeyRound className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>First-Time Security Setup:</strong> Set your private
                      Administrator password below. It is hashed securely on the
                      server and never stored in plain text.
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="setup-admin-email"
                      className="block text-xs font-semibold text-slate-300 mb-1.5"
                    >
                      Authorized Admin Email (for Login &amp; Password Reset)
                    </label>
                    <input
                      id="setup-admin-email"
                      type="email"
                      required
                      value={setupEmail}
                      onChange={(e) => setSetupEmail(e.target.value)}
                      placeholder="tarunkumarv2008@gmail.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-[#0F172A] text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="setup-admin-pass"
                      className="block text-xs font-semibold text-slate-300 mb-1.5"
                    >
                      New Administrator Password (min 8 characters)
                    </label>
                    <input
                      id="setup-admin-pass"
                      type="password"
                      required
                      minLength={8}
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-[#0F172A] text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="setup-admin-confirm"
                      className="block text-xs font-semibold text-slate-300 mb-1.5"
                    >
                      Confirm Administrator Password
                    </label>
                    <input
                      id="setup-admin-confirm"
                      type="password"
                      required
                      minLength={8}
                      value={setupConfirmPassword}
                      onChange={(e) => setSetupConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-[#0F172A] text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {isSubmitting
                      ? 'Securing Administrator Account...'
                      : 'Save Admin Password & Sign In'}
                  </button>
                </form>
              ) : forgotStep === 'none' ? (
                /* Standard Login Form */
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div>
                    <label
                      htmlFor="auth-identifier"
                      className="block text-xs font-semibold text-slate-300 mb-1.5"
                    >
                      {role === 'admin'
                        ? 'Admin Username or Email'
                        : 'Student ID or Email'}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-identifier"
                        type="text"
                        value={identifier}
                        onChange={(e) => {
                          setIdentifier(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder={
                          role === 'admin'
                            ? 'admin or your Admin Settings email'
                            : 'Enter your registered Student ID'
                        }
                        autoComplete="username"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-700 bg-[#0F172A] text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="auth-password"
                      className="block text-xs font-semibold text-slate-300 mb-1.5"
                    >
                      {role === 'admin' ? 'Password' : 'Password (or Student ID)'}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder={
                          role === 'admin'
                            ? 'Enter Administrator password'
                            : 'Enter your assigned Student password'
                        }
                        autoComplete="current-password"
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-700 bg-[#0F172A] text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none transition-colors"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <label className="inline-flex items-center gap-2 text-slate-300 font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-slate-600 accent-sky-500"
                      />
                      Remember Me
                    </label>
                    {role === 'admin' ? (
                      <button
                        type="button"
                        onClick={handleOpenForgot}
                        className="font-semibold text-sky-400 hover:text-sky-300 cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        Need help? Contact Department Admin
                      </span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] hover:from-[#9333EA] hover:to-[#6366F1] disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_24px_-3px_rgba(124,58,237,0.65)] transition-all cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    {isSubmitting ? 'Verifying & Signing In...' : 'Login'}
                  </button>
                </form>
              ) : forgotStep === 'request' ? (
                /* Step 1: Secure Email OTP Request */
                <form onSubmit={handleSendOtpViaSmtp} className="mt-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-sm font-bold text-white">
                      Step 1: Send Reset Code to Admin Email
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotStep('none');
                        setError(null);
                      }}
                      className="text-xs font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      Back to Login
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/25 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      For security, 6-digit reset codes are generated strictly on
                      the server and sent only to your authorized Admin email inbox (
                      <span className="font-mono text-sky-300">{maskedAdminEmail}</span>
                      ). Codes are never displayed on this screen.
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="recovery-admin-email"
                      className="block text-xs font-semibold text-slate-300 mb-1.5"
                    >
                      Authorized Administrator Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="recovery-admin-email"
                        type="email"
                        required
                        value={recoveryEmailInput}
                        onChange={(e) => {
                          setRecoveryEmailInput(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Enter your authorized Admin Settings email"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-700 bg-[#0F172A] text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {smtpConfigured ? (
                    <div className="space-y-2.5">
                      <button
                        type="submit"
                        disabled={sendingEmail || resendCooldown > 0}
                        className="w-full py-3 px-5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        {sendingEmail
                          ? 'Sending Code to Inbox...'
                          : resendCooldown > 0
                          ? `Wait ${resendCooldown}s to Send`
                          : 'Send 6-Digit Code to Inbox'}
                      </button>

                      <button
                        type="button"
                        disabled={sendingEmail || resendCooldown > 0}
                        onClick={handleSendOtpViaVerifiedGoogle}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#162032] hover:bg-[#1E293B] border border-slate-700 disabled:opacity-60 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Or Verify Authorized Google Account &amp; Send via Gmail
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={sendingEmail || resendCooldown > 0}
                      onClick={handleSendOtpViaVerifiedGoogle}
                      className="w-full py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      {sendingEmail
                        ? 'Verifying Admin Google Account...'
                        : resendCooldown > 0
                        ? `Wait ${resendCooldown}s to Send`
                        : 'Verify Admin Google Account & Send OTP'}
                    </button>
                  )}

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setForgotStep('verify');
                      }}
                      className="text-xs font-semibold text-slate-400 hover:text-sky-300 underline cursor-pointer"
                    >
                      Already received the 6-digit code in your inbox? Enter it here
                    </button>
                  </div>
                </form>
              ) : (
                /* Step 2: Enter Code from Email Inbox & Set New Password */
                <form onSubmit={handleVerifyOtpAndReset} className="mt-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-sm font-bold text-white">
                      Step 2: Check Email &amp; Reset Password
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotStep('none');
                        setError(null);
                      }}
                      className="text-xs font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      Back to Login
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-between gap-3 text-xs">
                    <div className="text-slate-300 leading-relaxed">
                      Enter the 6-digit code delivered to{' '}
                      <span className="font-mono font-bold text-sky-300">
                        {sentMaskedEmail || maskedAdminEmail}
                      </span>
                      .
                    </div>
                    <button
                      type="button"
                      disabled={sendingEmail || resendCooldown > 0}
                      onClick={() =>
                        smtpConfigured
                          ? void handleSendOtpViaSmtp()
                          : void handleSendOtpViaVerifiedGoogle()
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#162032] hover:bg-[#1E293B] disabled:opacity-50 border border-slate-700 text-[11px] font-bold text-sky-300 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend'}
                    </button>
                  </div>

                  <div>
                    <label
                      htmlFor="otp-inbox-code"
                      className="block text-xs font-semibold text-slate-300 mb-1.5"
                    >
                      6-Digit Verification Code from Email
                    </label>
                    <input
                      id="otp-inbox-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      value={enteredOtp}
                      onChange={(e) =>
                        setEnteredOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="• • • • • •"
                      className="w-full py-3 px-4 text-center font-mono font-extrabold tracking-[0.4em] text-base rounded-xl border border-slate-700 bg-[#0F172A] text-white focus:outline-none focus:border-sky-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password (min 8 chars)"
                      className="w-full py-2.5 px-3.5 rounded-xl border border-slate-700 bg-[#0F172A] text-xs text-white focus:outline-none focus:border-sky-400"
                    />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full py-2.5 px-3.5 rounded-xl border border-slate-700 bg-[#0F172A] text-xs text-white focus:outline-none focus:border-sky-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isSubmitting
                      ? 'Verifying Code...'
                      : 'Verify Code & Update Password'}
                  </button>
                </form>
              )}

              <div className="mt-7 flex items-center justify-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Your data is safe and secure with ExamFlow</span>
              </div>
        </div>
      </div>
    </div>
  );
};
