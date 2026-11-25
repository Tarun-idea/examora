import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  X,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { examStore } from '../../services/examStore.ts';
import {
  getLoadedFirebaseModule,
  loadFirebaseModule,
  preloadFirebaseModule,
} from '../../services/firebaseLoader.ts';

interface ChangeAdminPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangeAdminPasswordModal: React.FC<ChangeAdminPasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const defaultAdminEmail =
    examStore.getState().settings.adminEmail || 'tarunkumarv2008@gmail.com';

  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Server-backed Email OTP state (never stores or renders raw OTP on screen)
  const [otpEmail, setOtpEmail] = useState(defaultAdminEmail);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [otpSentToMasked, setOtpSentToMasked] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setOtpEmail(
      examStore.getState().settings.adminEmail || 'tarunkumarv2008@gmail.com'
    );
    examStore
      .fetchAdminAuthStatus()
      .then((status) => {
        setSmtpConfigured(status.smtpConfigured);
        if (status.cooldownSecondsRemaining > 0) {
          setResendCooldown(status.cooldownSecondsRemaining);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && mode === 'otp') {
      preloadFirebaseModule();
    }
  }, [isOpen, mode]);

  const isResendCoolingDown = resendCooldown > 0;
  useEffect(() => {
    if (!isResendCoolingDown) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isResendCoolingDown]);

  if (!isOpen) return null;

  const handleRequestSmtpOtp = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsSendingEmail(true);
    try {
      const res = await examStore.requestAdminOtpViaSmtp(
        otpEmail.trim() || defaultAdminEmail
      );
      if (!res.success) {
        if (res.cooldownSeconds && res.cooldownSeconds > 0) {
          setResendCooldown(res.cooldownSeconds);
        }
        setErrorMessage(res.error || 'Could not dispatch OTP email.');
        return;
      }
      setOtpSentToMasked(res.maskedEmail || otpEmail.trim());
      setResendCooldown(res.cooldownSeconds || 60);
      setOtpInput('');
      setSuccessMessage(
        `6-digit verification code sent to ${res.maskedEmail || otpEmail}. Check your inbox and enter it below.`
      );
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleRequestGoogleOtp = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsSendingEmail(true);
    try {
      const loadedFb = getLoadedFirebaseModule();
      const signInResult = loadedFb
        ? await loadedFb.googleSignIn()
        : await (await loadFirebaseModule()).googleSignIn();
      if (!signInResult?.accessToken) {
        setErrorMessage('Google sign-in did not complete with Gmail permission.');
        return;
      }
      const res = await examStore.requestAdminOtpViaVerifiedGoogle(
        otpEmail.trim() || defaultAdminEmail,
        signInResult.accessToken
      );
      if (!res.success) {
        if (res.cooldownSeconds && res.cooldownSeconds > 0) {
          setResendCooldown(res.cooldownSeconds);
        }
        setErrorMessage(res.error || 'Google verification failed.');
        return;
      }
      setOtpSentToMasked(res.maskedEmail || otpEmail.trim());
      setResendCooldown(res.cooldownSeconds || 60);
      setOtpInput('');
      setSuccessMessage(
        `6-digit verification code sent to ${res.maskedEmail || otpEmail}. Check your Gmail inbox and enter it below.`
      );
    } catch (err: any) {
      const code = err?.code;
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        setErrorMessage(
          'Google sign-in popup was closed before completing verification. Click again when ready.'
        );
      } else if (code === 'auth/popup-blocked') {
        setErrorMessage(
          'Browser blocked the Google sign-in popup. Please allow popups and try again.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMessage(
          'This domain is not authorized for Google popups. Please use SMTP email OTP or Current Password mode.'
        );
      } else {
        setErrorMessage('Failed to verify Google account. Please try again.');
      }
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    if (newPassword.length < 8) {
      setErrorMessage('New Administrator password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res =
        mode === 'password'
          ? await examStore.changeAdminPasswordAsync(
              currentPassword,
              newPassword,
              confirmPassword
            )
          : await examStore.verifyAdminOtpAndResetPassword(
              otpInput.trim(),
              newPassword,
              confirmPassword
            );

      if (res.success) {
        setSuccessMessage(
          mode === 'password'
            ? 'Administrator password successfully updated on the server!'
            : 'Administrator password reset via verified email OTP! Please sign in again with your new password.'
        );
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setOtpSentToMasked(null);
        setOtpInput('');
        setTimeout(() => {
          setSuccessMessage('');
          onClose();
        }, 1800);
      } else {
        setErrorMessage(res.error || 'Failed to update password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl p-6 sm:p-7 relative overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-[#0066FF] flex items-center justify-center shrink-0">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Change Administrator Password
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Verified on the server using your current password or inbox OTP.
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setMode('password');
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'password'
                ? 'bg-white dark:bg-slate-900 text-[#0066FF] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Current Password
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('otp');
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'otp'
                ? 'bg-white dark:bg-slate-900 text-[#0066FF] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Email OTP Verification
          </button>
        </div>

        {/* Success Banner */}
        {successMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'password' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Current Admin Password *
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  placeholder="Enter active password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#0066FF] font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={otpEmail}
                  onChange={(e) => setOtpEmail(e.target.value)}
                  placeholder="Authorized Admin Settings email"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900"
                />
                <button
                  type="button"
                  disabled={isSendingEmail || resendCooldown > 0}
                  onClick={() =>
                    smtpConfigured
                      ? void handleRequestSmtpOtp()
                      : void handleRequestGoogleOtp()
                  }
                  className="px-3 py-2 rounded-xl bg-[#0066FF] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isSendingEmail
                      ? 'Sending...'
                      : resendCooldown > 0
                      ? `${resendCooldown}s`
                      : 'Send OTP'}
                  </span>
                </button>
              </div>

              {otpSentToMasked && (
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-[#0052D4] font-medium">
                  Verification code sent strictly to{' '}
                  <strong className="font-mono">{otpSentToMasked}</strong>. Open
                  your inbox to retrieve the 6-digit code.
                </div>
              )}

              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={6}
                placeholder="Enter 6-digit OTP from your email inbox"
                value={otpInput}
                onChange={(e) =>
                  setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-center font-bold tracking-[0.25em] text-slate-900"
              />
            </div>
          )}

          {/* New Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              New Admin Password * (minimum 8 characters)
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={8}
                placeholder="Enter new administrator password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#0066FF] font-mono"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Confirm New Password *
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                minLength={8}
                placeholder="Re-enter new administrator password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#0066FF] font-mono"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-[#0066FF] hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Updating Key...' : 'Update Password'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
