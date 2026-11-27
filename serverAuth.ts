import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';

export const DEFAULT_OWNER_ADMIN_EMAIL = 'tarunkumarv2008@gmail.com';
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000; // Persistent until explicit logout (365 days)
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_MAX_FAILURES = 8;

interface StoredAdminAuth {
  passwordHash: string;
  salt: string;
  recoveryEmail: string;
  updatedAt: number;
}

interface ActiveOtpChallenge {
  otpHash: string;
  salt: string;
  targetEmail: string;
  expiresAt: number;
  attemptsRemaining: number;
  cooldownUntil: number;
}

export interface AdminSession {
  token: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

interface StoredAdminSession {
  tokenHash: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

interface LoginAttemptRecord {
  failures: number;
  resetAt: number;
}

function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function hashSecret(value: string, salt: string): string {
  return crypto.scryptSync(value, salt, 64).toString('hex');
}

function timingSafeHexEquals(hexA: string, hexB: string): boolean {
  try {
    const bufA = Buffer.from(hexA, 'hex');
    const bufB = Buffer.from(hexB, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function isValidEmailFormat(email?: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) && trimmed.length <= 160;
}

export function maskEmailAddress(email: string): string {
  const clean = email.trim().toLowerCase();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 1) return clean;
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***${domain}`;
}

function encodeMimeMessageBase64Url(
  to: string,
  subject: string,
  htmlBody: string
): string {
  const encodedSubject = Buffer.from(subject, 'utf8').toString('base64');
  const mimeMessage = [
    `To: ${to}`,
    `Subject: =?utf-8?B?${encodedSubject}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
  ].join('\r\n');

  return Buffer.from(mimeMessage, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildOtpEmailHtml(recipientEmail: string, otpCode: string): string {
  return `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border-radius: 16px; border: 1px solid #DCE7FF; background-color: #F8FAFF; color: #0B1B3D;">
      <div style="font-size: 20px; font-weight: 800; color: #4F46E5; margin-bottom: 8px;">
        ExamFlow Administrator Password Reset
      </div>
      <p style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 18px;">
        A password reset was requested for the ExamFlow Administrator account associated with <strong>${recipientEmail}</strong>.
      </p>
      <div style="background-color: #FFFFFF; border: 2px solid #4F46E5; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 18px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748B; font-weight: 700; margin-bottom: 6px;">
          One-Time Verification Code
        </div>
        <div style="font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #1E1B4B; font-family: monospace;">
          ${otpCode}
        </div>
      </div>
      <p style="font-size: 12px; color: #64748B; line-height: 1.5; margin: 0;">
        This code expires in <strong>10 minutes</strong> and can only be used once. If you did not request this password reset, you can safely ignore this email—your password has not been changed.
      </p>
    </div>
  `;
}

export class ServerAdminAuthService {
  private authFilePath: string;
  private sessionsFilePath: string;
  private revokedFilePath: string;
  private fallbackSigningKey: Buffer;
  private stored: StoredAdminAuth | null = null;
  private sessions = new Map<string, StoredAdminSession>();
  private revokedSessionIds = new Set<string>();
  private activeOtp: ActiveOtpChallenge | null = null;
  private loginFailures = new Map<string, LoginAttemptRecord>();

  constructor(dataDir: string) {
    this.authFilePath = path.join(dataDir, 'examflow_admin_auth.json');
    this.sessionsFilePath = path.join(dataDir, 'examflow_admin_sessions.json');
    this.revokedFilePath = path.join(dataDir, 'examflow_revoked_sessions.json');
    this.fallbackSigningKey = crypto.randomBytes(32);
    this.loadFromDisk();
    this.loadSessionsFromDisk();
    this.loadRevokedFromDisk();
  }

  private getSessionSigningKey(): Buffer {
    const envSecret = (process.env.SESSION_SECRET || '').trim();
    const envPass = this.getEnvPasswordOverride() || '';
    const storedMaterial = this.stored
      ? `${this.stored.passwordHash}:${this.stored.salt}`
      : '';
    const material = envSecret || storedMaterial || envPass;
    if (!material) {
      return this.fallbackSigningKey;
    }
    return crypto
      .createHmac('sha256', 'examflow-persistent-session-key-v1')
      .update(material)
      .digest();
  }

  private getCredentialFingerprint(): string {
    const envPass = this.getEnvPasswordOverride() || '';
    const storedMaterial = this.stored
      ? `${this.stored.passwordHash}:${this.stored.salt}:${this.stored.updatedAt}`
      : '';
    const material = storedMaterial || envPass || 'ephemeral';
    return crypto
      .createHash('sha256')
      .update(`pwd-fp:${material}`)
      .digest('hex')
      .slice(0, 16);
  }

  private loadRevokedFromDisk() {
    try {
      if (!fs.existsSync(this.revokedFilePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.revokedFilePath, 'utf8'));
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === 'string' && id.trim()) {
            this.revokedSessionIds.add(id.trim());
          }
        }
      }
    } catch {
      // ignore malformed file
    }
  }

  private saveRevokedToDisk() {
    try {
      this.ensureParentDir();
      const recent = Array.from(this.revokedSessionIds).slice(-200);
      fs.writeFileSync(
        this.revokedFilePath,
        JSON.stringify(recent, null, 2),
        'utf8'
      );
    } catch {
      // ignore fs errors on read-only mounts
    }
  }

  private ensureParentDir() {
    try {
      const dir = path.dirname(this.authFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // ignore read-only mount errors
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.authFilePath)) {
        const raw = fs.readFileSync(this.authFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed.passwordHash === 'string' &&
          typeof parsed.salt === 'string'
        ) {
          this.stored = {
            passwordHash: parsed.passwordHash,
            salt: parsed.salt,
            recoveryEmail: isValidEmailFormat(parsed.recoveryEmail)
              ? parsed.recoveryEmail.trim().toLowerCase()
              : DEFAULT_OWNER_ADMIN_EMAIL,
            updatedAt: Number(parsed.updatedAt || Date.now()),
          };
        }
      }
    } catch {
      this.stored = null;
    }
  }

  private saveToDisk() {
    if (!this.stored) return;
    try {
      this.ensureParentDir();
      fs.writeFileSync(
        this.authFilePath,
        JSON.stringify(this.stored, null, 2),
        'utf8'
      );
    } catch {
      // ignore fs errors on read-only mounts
    }
  }

  private loadSessionsFromDisk() {
    try {
      if (!fs.existsSync(this.sessionsFilePath)) return;
      const raw = fs.readFileSync(this.sessionsFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const now = Date.now();
      for (const item of parsed) {
        if (
          item &&
          typeof item.tokenHash === 'string' &&
          /^[a-f0-9]{64}$/i.test(item.tokenHash) &&
          typeof item.email === 'string' &&
          typeof item.expiresAt === 'number' &&
          item.expiresAt > now
        ) {
          this.sessions.set(item.tokenHash, {
            tokenHash: item.tokenHash,
            email: item.email,
            createdAt: Number(item.createdAt || now),
            expiresAt: item.expiresAt,
          });
        }
      }
    } catch {
      // ignore malformed session store
    }
  }

  private saveSessionsToDisk() {
    try {
      this.ensureParentDir();
      const now = Date.now();
      const active: StoredAdminSession[] = [];
      for (const [hash, rec] of this.sessions.entries()) {
        if (rec.expiresAt > now) {
          active.push(rec);
        } else {
          this.sessions.delete(hash);
        }
      }
      // Cap stored sessions to most recent 50 to prevent unbounded growth
      const trimmed = active
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50);
      fs.writeFileSync(
        this.sessionsFilePath,
        JSON.stringify(trimmed, null, 2),
        'utf8'
      );
    } catch {
      // ignore fs errors on read-only mounts
    }
  }

  private getEnvPasswordOverride(): string | null {
    const raw = process.env.ADMIN_INITIAL_PASSWORD;
    if (typeof raw === 'string') {
      const cleaned = raw.trim().replace(/^['"]+|['"]+$/g, '').trim();
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
    return null;
  }

  /**
   * Migrates any legacy plaintext adminPassword once from shared state into a salted scrypt hash.
   * Only runs if no server hash exists yet. Never migrates the insecure 'admin123' default if
   * the user hasn't set a custom password, unless requested explicitly; actually for smooth continuity
   * on an existing saved server state, if a legacy password existed on disk we hash it and immediately
   * strip it from shared state.
   */
  public migrateLegacyAdminCredentials(
    legacyEmail?: string,
    legacyPassword?: string
  ) {
    if (this.stored) {
      if (isValidEmailFormat(legacyEmail)) {
        const normalized = legacyEmail!.trim().toLowerCase();
        if (this.stored.recoveryEmail !== normalized) {
          this.stored.recoveryEmail = normalized;
          this.saveToDisk();
        }
      }
      return;
    }

    const email = isValidEmailFormat(legacyEmail)
      ? legacyEmail!.trim().toLowerCase()
      : DEFAULT_OWNER_ADMIN_EMAIL;

    if (
      typeof legacyPassword === 'string' &&
      legacyPassword.trim().length >= 6 &&
      legacyPassword.trim() !== 'admin123'
    ) {
      const salt = crypto.randomBytes(16).toString('hex');
      this.stored = {
        passwordHash: hashSecret(legacyPassword.trim(), salt),
        salt,
        recoveryEmail: email,
        updatedAt: Date.now(),
      };
      this.saveToDisk();
    }
  }

  public needsInitialSetup(): boolean {
    return !this.stored && !this.getEnvPasswordOverride();
  }

  public isSmtpConfigured(): boolean {
    const user = (process.env.SMTP_USER || '').trim();
    const pass = (process.env.SMTP_PASS || '').trim();
    return Boolean(user && pass);
  }

  public getPrimaryRecoveryEmail(settingsAdminEmail?: string): string {
    if (isValidEmailFormat(settingsAdminEmail)) {
      return settingsAdminEmail!.trim().toLowerCase();
    }
    if (this.stored && isValidEmailFormat(this.stored.recoveryEmail)) {
      return this.stored.recoveryEmail.trim().toLowerCase();
    }
    return DEFAULT_OWNER_ADMIN_EMAIL;
  }

  /**
   * Authorized Administrator emails include the currently configured Admin Settings email
   * AND the default owner email (tarunkumarv2008@gmail.com) so updating the email in Admin Settings
   * works immediately without risking permanent owner lockout.
   */
  public getAuthorizedAdminEmails(settingsAdminEmail?: string): Set<string> {
    const allowed = new Set<string>([DEFAULT_OWNER_ADMIN_EMAIL]);
    if (this.stored && isValidEmailFormat(this.stored.recoveryEmail)) {
      allowed.add(this.stored.recoveryEmail.trim().toLowerCase());
    }
    if (isValidEmailFormat(settingsAdminEmail)) {
      allowed.add(settingsAdminEmail!.trim().toLowerCase());
    }
    return allowed;
  }

  public syncRecoveryEmail(newEmail?: string) {
    if (!isValidEmailFormat(newEmail)) return;
    const normalized = newEmail!.trim().toLowerCase();
    if (this.stored) {
      if (this.stored.recoveryEmail !== normalized) {
        this.stored.recoveryEmail = normalized;
        this.stored.updatedAt = Date.now();
        this.saveToDisk();
      }
    }
  }

  public getPublicStatus(settingsAdminEmail?: string) {
    const primaryEmail = this.getPrimaryRecoveryEmail(settingsAdminEmail);
    return {
      needsInitialSetup: this.needsInitialSetup(),
      smtpConfigured: this.isSmtpConfigured(),
      maskedRecoveryEmail: maskEmailAddress(primaryEmail),
      cooldownSecondsRemaining: this.getOtpCooldownSeconds(),
    };
  }

  public getOtpCooldownSeconds(): number {
    if (!this.activeOtp) return 0;
    const remaining = Math.ceil((this.activeOtp.cooldownUntil - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  }

  public setupInitialPassword(
    email: string,
    newPassword: string,
    confirmPassword: string
  ): { ok: boolean; error?: string; token?: string; email?: string } {
    if (!this.needsInitialSetup()) {
      return {
        ok: false,
        error: 'Administrator password is already configured. Please sign in or use Forgot Password.',
      };
    }

    const cleanEmail = (email || DEFAULT_OWNER_ADMIN_EMAIL).trim().toLowerCase();
    if (!isValidEmailFormat(cleanEmail)) {
      return { ok: false, error: 'Please enter a valid Administrator email address.' };
    }
    if (!newPassword || newPassword.length < 8) {
      return {
        ok: false,
        error: 'Administrator password must be at least 8 characters long.',
      };
    }
    if (newPassword !== confirmPassword) {
      return { ok: false, error: 'Password and confirmation do not match.' };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    this.stored = {
      passwordHash: hashSecret(newPassword, salt),
      salt,
      recoveryEmail: cleanEmail,
      updatedAt: Date.now(),
    };
    this.saveToDisk();

    const session = this.createSession(cleanEmail);
    return { ok: true, token: session.token, email: cleanEmail };
  }

  private isRateLimited(clientKey: string): boolean {
    const rec = this.loginFailures.get(clientKey);
    if (!rec) return false;
    if (Date.now() > rec.resetAt) {
      this.loginFailures.delete(clientKey);
      return false;
    }
    return rec.failures >= LOGIN_MAX_FAILURES;
  }

  private recordLoginFailure(clientKey: string) {
    const now = Date.now();
    const rec = this.loginFailures.get(clientKey);
    if (!rec || now > rec.resetAt) {
      this.loginFailures.set(clientKey, {
        failures: 1,
        resetAt: now + LOGIN_WINDOW_MS,
      });
    } else {
      rec.failures += 1;
    }
  }

  private clearLoginFailures(clientKey: string) {
    this.loginFailures.delete(clientKey);
  }

  private verifyPasswordMatches(rawPassword: string): boolean {
    if (this.stored) {
      const candidate = hashSecret(rawPassword, this.stored.salt);
      return timingSafeHexEquals(candidate, this.stored.passwordHash);
    }

    const envPass = this.getEnvPasswordOverride();
    if (envPass) {
      const salt = 'env-override-constant-salt';
      const candidateHash = hashSecret(rawPassword, salt);
      const expectedHash = hashSecret(envPass, salt);
      return timingSafeHexEquals(candidateHash, expectedHash);
    }

    return false;
  }

  public loginAdmin(
    identifier: string,
    password: string,
    clientKey: string,
    settingsAdminEmail?: string,
    settingsAdminName?: string
  ): { ok: boolean; statusCode?: number; error?: string; token?: string; email?: string } {
    if (this.needsInitialSetup()) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Initial Administrator password setup is required before signing in.',
      };
    }

    if (this.isRateLimited(clientKey)) {
      return {
        ok: false,
        statusCode: 429,
        error: 'Too many failed login attempts. Please wait 15 minutes or reset via verified email OTP.',
      };
    }

    const cleanId = String(identifier || '').trim().toLowerCase();
    const rawPass = String(password || '');
    const trimmedPass = rawPass.trim();
    const authorizedEmails = this.getAuthorizedAdminEmails(settingsAdminEmail);
    const cleanAdminName = String(settingsAdminName || '').trim().toLowerCase();

    const isIdValid =
      cleanId === 'admin' ||
      cleanId === 'admin@examflow.edu' ||
      authorizedEmails.has(cleanId) ||
      (cleanAdminName.length > 0 && cleanId === cleanAdminName);
    const isPassValid =
      rawPass.length > 0 &&
      (this.verifyPasswordMatches(rawPass) ||
        (trimmedPass !== rawPass &&
          trimmedPass.length > 0 &&
          this.verifyPasswordMatches(trimmedPass)));

    if (!isIdValid || !isPassValid) {
      this.recordLoginFailure(clientKey);
      return {
        ok: false,
        statusCode: 401,
        error: !isIdValid
          ? 'Invalid Administrator username or email. Sign in with "admin" or your authorized Admin email.'
          : 'Incorrect Administrator password. Please check your password or use Forgot Password to reset via email OTP.',
      };
    }

    this.clearLoginFailures(clientKey);
    const activeEmail = this.getPrimaryRecoveryEmail(settingsAdminEmail);
    const session = this.createSession(activeEmail);
    return {
      ok: true,
      token: session.token,
      email: activeEmail,
    };
  }

  public createSession(email: string): AdminSession {
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    const jti = crypto.randomBytes(16).toString('hex');
    const payload = {
      jti,
      email,
      iat: now,
      exp: expiresAt,
      fp: this.getCredentialFingerprint(),
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sigHex = crypto
      .createHmac('sha256', this.getSessionSigningKey())
      .update(payloadB64)
      .digest('hex');
    const token = `${payloadB64}.${sigHex}`;
    const tokenHash = hashSessionToken(token);
    const storedSession: StoredAdminSession = {
      tokenHash,
      email,
      createdAt: now,
      expiresAt,
    };
    this.sessions.set(tokenHash, storedSession);
    this.saveSessionsToDisk();
    return {
      token,
      email,
      createdAt: now,
      expiresAt,
    };
  }

  private verifySignedToken(cleanToken: string): AdminSession | null {
    const dotIdx = cleanToken.indexOf('.');
    if (dotIdx <= 0 || dotIdx !== cleanToken.lastIndexOf('.')) return null;
    const payloadB64 = cleanToken.slice(0, dotIdx);
    const sigHex = cleanToken.slice(dotIdx + 1);
    if (!/^[a-f0-9]{64}$/i.test(sigHex)) return null;

    const expectedSig = crypto
      .createHmac('sha256', this.getSessionSigningKey())
      .update(payloadB64)
      .digest('hex');
    if (!timingSafeHexEquals(sigHex.toLowerCase(), expectedSig.toLowerCase())) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8')
      );
      if (
        !parsed ||
        typeof parsed.jti !== 'string' ||
        typeof parsed.email !== 'string' ||
        typeof parsed.exp !== 'number' ||
        typeof parsed.fp !== 'string'
      ) {
        return null;
      }
      if (Date.now() > parsed.exp) return null;
      if (this.revokedSessionIds.has(parsed.jti)) return null;
      if (parsed.fp !== this.getCredentialFingerprint()) return null;

      return {
        token: cleanToken,
        email: parsed.email,
        createdAt: Number(parsed.iat || Date.now()),
        expiresAt: parsed.exp,
      };
    } catch {
      return null;
    }
  }

  public verifyToken(rawToken?: string): AdminSession | null {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const clean = rawToken.trim();
    if (!clean) return null;

    // 1. Verify HMAC-signed cold-start-resilient session token
    if (clean.includes('.')) {
      return this.verifySignedToken(clean);
    }

    // 2. Fallback: verify legacy 64-hex random session token in server map
    if (!/^[a-f0-9]{64}$/i.test(clean)) return null;
    const tokenHash = hashSessionToken(clean);
    const session = this.sessions.get(tokenHash);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(tokenHash);
      this.saveSessionsToDisk();
      return null;
    }
    return {
      token: clean,
      email: session.email,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
  }

  public verifyBearerHeader(authHeader?: string): AdminSession | null {
    if (!authHeader || typeof authHeader !== 'string') return null;
    const match = authHeader.match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
    if (!match) return null;
    return this.verifyToken(match[1]);
  }

  public revokeToken(rawToken?: string) {
    if (!rawToken || typeof rawToken !== 'string') return;
    const clean = rawToken.trim();
    if (!clean) return;
    const tokenHash = hashSessionToken(clean);
    if (this.sessions.delete(tokenHash)) {
      this.saveSessionsToDisk();
    }
    if (clean.includes('.')) {
      const dotIdx = clean.indexOf('.');
      try {
        const parsed = JSON.parse(
          Buffer.from(clean.slice(0, dotIdx), 'base64url').toString('utf8')
        );
        if (parsed && typeof parsed.jti === 'string' && parsed.jti) {
          this.revokedSessionIds.add(parsed.jti);
          this.saveRevokedToDisk();
        }
      } catch {
        // ignore malformed token
      }
    }
  }

  public revokeBearerHeader(authHeader?: string) {
    if (!authHeader || typeof authHeader !== 'string') return;
    const match = authHeader.match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
    if (match) {
      this.revokeToken(match[1]);
    }
  }

  public revokeAllSessions() {
    this.sessions.clear();
    this.saveSessionsToDisk();
  }

  public changePasswordAuthenticated(
    authHeaderOrToken: string | undefined,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
    settingsAdminEmail?: string
  ): { ok: boolean; statusCode?: number; error?: string; token?: string } {
    const session =
      this.verifyBearerHeader(authHeaderOrToken) ||
      this.verifyToken(authHeaderOrToken);
    if (!session) {
      return {
        ok: false,
        statusCode: 401,
        error: 'Your Administrator session has expired. Please sign in again.',
      };
    }
    if (!currentPassword) {
      return { ok: false, statusCode: 400, error: 'Please enter your current Administrator password.' };
    }
    if (!this.verifyPasswordMatches(currentPassword)) {
      return { ok: false, statusCode: 401, error: 'Current Administrator password is incorrect.' };
    }
    if (!newPassword || newPassword.length < 8) {
      return {
        ok: false,
        statusCode: 400,
        error: 'New password must be at least 8 characters long.',
      };
    }
    if (newPassword !== confirmPassword) {
      return {
        ok: false,
        statusCode: 400,
        error: 'New password and confirmation do not match.',
      };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const primaryEmail = this.getPrimaryRecoveryEmail(settingsAdminEmail);
    this.stored = {
      passwordHash: hashSecret(newPassword, salt),
      salt,
      recoveryEmail: primaryEmail,
      updatedAt: Date.now(),
    };
    this.saveToDisk();

    // Rotate sessions so any older compromised token is immediately invalidated
    this.revokeAllSessions();
    const fresh = this.createSession(primaryEmail);
    return { ok: true, token: fresh.token };
  }

  /**
   * Generates a cryptographically random 6-digit OTP and stores ONLY its salted hash in server memory.
   * Returns the raw code ONLY internally for server-side email dispatch — never return this to HTTP clients.
   */
  private issueServerOtp(targetEmail: string): {
    ok: boolean;
    error?: string;
    cooldownSeconds?: number;
    rawOtp?: string;
  } {
    const now = Date.now();
    if (this.activeOtp && now < this.activeOtp.cooldownUntil) {
      const waitSec = Math.ceil((this.activeOtp.cooldownUntil - now) / 1000);
      return {
        ok: false,
        error: `Please wait ${waitSec} second(s) before requesting another verification code.`,
        cooldownSeconds: waitSec,
      };
    }

    const rawOtp = String(crypto.randomInt(100000, 1000000));
    const salt = crypto.randomBytes(16).toString('hex');
    this.activeOtp = {
      otpHash: hashSecret(rawOtp, salt),
      salt,
      targetEmail: targetEmail.trim().toLowerCase(),
      expiresAt: now + OTP_TTL_MS,
      attemptsRemaining: OTP_MAX_ATTEMPTS,
      cooldownUntil: now + OTP_COOLDOWN_MS,
    };

    return { ok: true, rawOtp, cooldownSeconds: 60 };
  }

  /**
   * Primary Delivery Path: Send OTP directly from the Express server using SMTP secrets.
   */
  public async requestOtpViaSmtp(
    requestedEmail: string,
    settingsAdminEmail?: string
  ): Promise<{
    ok: boolean;
    statusCode?: number;
    error?: string;
    maskedEmail?: string;
    expiresInMinutes?: number;
    cooldownSeconds?: number;
  }> {
    if (!this.isSmtpConfigured()) {
      return {
        ok: false,
        statusCode: 503,
        error:
          'Server SMTP email is not configured yet. Please use the Google-Verified Admin option below to receive the OTP in your Gmail inbox.',
      };
    }

    const cleanEmail = String(requestedEmail || '').trim().toLowerCase();
    const authorizedEmails = this.getAuthorizedAdminEmails(settingsAdminEmail);

    if (!isValidEmailFormat(cleanEmail) || !authorizedEmails.has(cleanEmail)) {
      return {
        ok: false,
        statusCode: 403,
        error:
          'Access denied. That email address is not an authorized Administrator email.',
      };
    }

    const issued = this.issueServerOtp(cleanEmail);
    if (!issued.ok || !issued.rawOtp) {
      return {
        ok: false,
        statusCode: 429,
        error: issued.error,
        cooldownSeconds: issued.cooldownSeconds,
      };
    }

    try {
      const stripQuotes = (val?: string) =>
        String(val || '')
          .trim()
          .replace(/^['"]+|['"]+$/g, '')
          .trim();

      const rawHost = stripQuotes(process.env.SMTP_HOST || 'smtp.gmail.com')
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/:\d+$/, '')
        .replace(/^smtp@/i, 'smtp.');
      const host = rawHost || 'smtp.gmail.com';
      const parsedPort = Number(stripQuotes(process.env.SMTP_PORT || '465'));
      const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 465;
      const user = stripQuotes(process.env.SMTP_USER);
      const rawPass = stripQuotes(process.env.SMTP_PASS);
      const pass = host.toLowerCase().includes('gmail')
        ? rawPass.replace(/\s+/g, '')
        : rawPass;
      const from = stripQuotes(process.env.SMTP_FROM) || user;

      const mailOptions = {
        from: `"ExamFlow Security" <${from}>`,
        to: cleanEmail,
        subject: 'ExamFlow Admin Password Reset Verification Code',
        html: buildOtpEmailHtml(cleanEmail, issued.rawOtp),
      };

      const sendWithPort = async (targetPort: number) => {
        const transporter = nodemailer.createTransport({
          host,
          port: targetPort,
          secure: targetPort === 465,
          requireTLS: targetPort === 587,
          auth: { user, pass },
          connectionTimeout: 8000,
          greetingTimeout: 8000,
          socketTimeout: 10000,
        });
        await transporter.sendMail(mailOptions);
      };

      try {
        await sendWithPort(port);
      } catch (primaryErr: any) {
        const isConnErr =
          primaryErr?.code === 'ETIMEDOUT' ||
          primaryErr?.code === 'ECONNECTION' ||
          primaryErr?.code === 'ESOCKET';
        if (isConnErr && host.toLowerCase().includes('gmail') && port === 465) {
          await sendWithPort(587);
        } else {
          throw primaryErr;
        }
      }

      return {
        ok: true,
        maskedEmail: maskEmailAddress(cleanEmail),
        expiresInMinutes: 10,
        cooldownSeconds: 60,
      };
    } catch (err: any) {
      // Clear un-delivered OTP challenge so the user can retry immediately
      this.activeOtp = null;
      const rawMsg = String(err?.message || '');
      let friendlyError =
        rawMsg ||
        'Failed to send OTP via SMTP server. Check SMTP credentials or use Google-Verified Admin delivery.';
      if (err?.code === 'ENOTFOUND' || rawMsg.includes('ENOTFOUND')) {
        friendlyError =
          'Invalid SMTP_HOST secret. For Gmail, set SMTP_HOST to smtp.gmail.com (with a dot, not @) in Settings → Secrets.';
      } else if (
        err?.code === 'EAUTH' ||
        err?.responseCode === 535 ||
        /invalid login|username and password not accepted|badcredentials/i.test(rawMsg)
      ) {
        friendlyError =
          'Gmail rejected SMTP_USER / SMTP_PASS. Make sure SMTP_PASS is a 16-character Google App Password (not your regular Gmail password), or use the Google-Verified Admin button below.';
      } else if (
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNECTION' ||
        err?.code === 'ESOCKET'
      ) {
        friendlyError =
          'Could not connect to the SMTP server within 8 seconds. Check SMTP_HOST (smtp.gmail.com) and SMTP_PORT (465 or 587), or use the Google-Verified Admin button below.';
      }
      return {
        ok: false,
        statusCode: 500,
        error: friendlyError,
      };
    }
  }

  /**
   * Fallback Delivery Path: Verify the signed-in Google OAuth token directly on the server
   * against Google UserInfo API, verify the email belongs to an authorized Administrator,
   * then generate the OTP on the server and dispatch it directly to Gmail API (never exposing the OTP to the browser).
   */
  public async requestOtpViaVerifiedGoogle(
    requestedEmail: string,
    googleAccessToken: string,
    settingsAdminEmail?: string
  ): Promise<{
    ok: boolean;
    statusCode?: number;
    error?: string;
    maskedEmail?: string;
    expiresInMinutes?: number;
    cooldownSeconds?: number;
  }> {
    if (!googleAccessToken || typeof googleAccessToken !== 'string') {
      return {
        ok: false,
        statusCode: 400,
        error: 'Google account verification is required to dispatch the OTP email.',
      };
    }

    // 1. Independently verify the Google token and email ownership on the server
    let verifiedEmail = '';
    let emailVerified = false;
    try {
      const userinfoRes = await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
          },
        }
      );
      if (!userinfoRes.ok) {
        return {
          ok: false,
          statusCode: 401,
          error: 'Google sign-in token could not be verified. Please sign in with your Administrator Google account again.',
        };
      }
      const profile: any = await userinfoRes.json();
      verifiedEmail = String(profile?.email || '').trim().toLowerCase();
      emailVerified = Boolean(profile?.email_verified);
    } catch {
      return {
        ok: false,
        statusCode: 500,
        error: 'Could not reach Google identity service to verify your Administrator account.',
      };
    }

    const authorizedEmails = this.getAuthorizedAdminEmails(settingsAdminEmail);
    const cleanRequested = String(requestedEmail || '').trim().toLowerCase();

    if (!emailVerified || !verifiedEmail || !authorizedEmails.has(verifiedEmail)) {
      return {
        ok: false,
        statusCode: 403,
        error: `Access denied. The signed-in Google account (${maskEmailAddress(
          verifiedEmail || 'unknown'
        )}) is not an authorized Administrator email.`,
      };
    }

    if (cleanRequested && cleanRequested !== verifiedEmail && !authorizedEmails.has(cleanRequested)) {
      return {
        ok: false,
        statusCode: 403,
        error: 'Access denied. The requested email does not match an authorized Administrator email.',
      };
    }

    const targetEmail =
      cleanRequested && authorizedEmails.has(cleanRequested)
        ? cleanRequested
        : verifiedEmail;

    const issued = this.issueServerOtp(targetEmail);
    if (!issued.ok || !issued.rawOtp) {
      return {
        ok: false,
        statusCode: 429,
        error: issued.error,
        cooldownSeconds: issued.cooldownSeconds,
      };
    }

    // 2. Dispatch the email strictly from the server using the verified Gmail API token
    try {
      const rawMime = encodeMimeMessageBase64Url(
        targetEmail,
        'ExamFlow Admin Password Reset Verification Code',
        buildOtpEmailHtml(targetEmail, issued.rawOtp)
      );

      const gmailRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: rawMime }),
        }
      );

      if (gmailRes.status === 401 || gmailRes.status === 403) {
        this.activeOtp = null;
        return {
          ok: false,
          statusCode: 403,
          error:
            'Gmail send permission was not granted. Please click the button again and approve the Gmail permission checkbox in the Google sign-in window.',
        };
      }

      if (!gmailRes.ok) {
        this.activeOtp = null;
        const errBody: any = await gmailRes.json().catch(() => ({}));
        return {
          ok: false,
          statusCode: 500,
          error:
            errBody?.error?.message ||
            'Failed to deliver OTP email to your Gmail inbox. Please try again.',
        };
      }

      return {
        ok: true,
        maskedEmail: maskEmailAddress(targetEmail),
        expiresInMinutes: 10,
        cooldownSeconds: 60,
      };
    } catch {
      this.activeOtp = null;
      return {
        ok: false,
        statusCode: 500,
        error: 'Network error while dispatching verification email via Gmail.',
      };
    }
  }

  /**
   * Verifies the 6-digit code entered by the user from their inbox, updates the scrypt password hash,
   * clears the OTP challenge, and revokes all existing Admin sessions.
   */
  public verifyOtpAndResetPassword(
    otpInput: string,
    newPassword: string,
    confirmPassword: string,
    settingsAdminEmail?: string
  ): { ok: boolean; statusCode?: number; error?: string } {
    const cleanOtp = String(otpInput || '').trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Please enter the exact 6-digit verification code from your email inbox.',
      };
    }

    if (!this.activeOtp) {
      return {
        ok: false,
        statusCode: 400,
        error: 'No active verification code found. Please request a fresh code to your inbox.',
      };
    }

    if (Date.now() > this.activeOtp.expiresAt) {
      this.activeOtp = null;
      return {
        ok: false,
        statusCode: 400,
        error: 'This verification code has expired. Please request a new code.',
      };
    }

    if (this.activeOtp.attemptsRemaining <= 0) {
      this.activeOtp = null;
      return {
        ok: false,
        statusCode: 429,
        error: 'Too many invalid attempts. Please request a fresh verification code.',
      };
    }

    const candidateHash = hashSecret(cleanOtp, this.activeOtp.salt);
    if (!timingSafeHexEquals(candidateHash, this.activeOtp.otpHash)) {
      this.activeOtp.attemptsRemaining -= 1;
      const left = this.activeOtp.attemptsRemaining;
      if (left <= 0) {
        this.activeOtp = null;
        return {
          ok: false,
          statusCode: 429,
          error: 'Invalid verification code. Maximum attempts reached—please request a new code.',
        };
      }
      return {
        ok: false,
        statusCode: 401,
        error: `Invalid verification code. ${left} attempt(s) remaining.`,
      };
    }

    if (!newPassword || newPassword.length < 8) {
      return {
        ok: false,
        statusCode: 400,
        error: 'New password must be at least 8 characters long.',
      };
    }

    if (newPassword !== confirmPassword) {
      return {
        ok: false,
        statusCode: 400,
        error: 'New password and confirmation do not match.',
      };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const primaryEmail = this.getPrimaryRecoveryEmail(
      settingsAdminEmail || this.activeOtp.targetEmail
    );
    this.stored = {
      passwordHash: hashSecret(newPassword, salt),
      salt,
      recoveryEmail: primaryEmail,
      updatedAt: Date.now(),
    };
    this.saveToDisk();

    // One-time use: clear OTP, reset login rate-limits, and revoke all existing Admin sessions immediately
    this.activeOtp = null;
    this.loginFailures.clear();
    this.revokeAllSessions();
    return { ok: true };
  }

  /**
   * Test-only helper for unit tests to exercise OTP verification without real SMTP network calls.
   */
  public _issueTestOtpForUnitTests(targetEmail: string): string {
    const res = this.issueServerOtp(targetEmail);
    if (!res.ok || !res.rawOtp) {
      throw new Error(res.error || 'Failed to issue test OTP');
    }
    return res.rawOtp;
  }
}
