import React, { useState } from 'react';
import {
  Users,
  CheckCircle2,
  Calendar,
  Activity,
  Plus,
  BarChart3,
  ArrowRight,
  Code2,
  Database,
  Calculator,
  PlayCircle,
  Trophy,
  FileCheck2,
  Target,
  Award,
  BookOpen,
  ShieldAlert,
  ClipboardCheck,
  Rocket,
} from 'lucide-react';
import { examStore } from '../../services/examStore.ts';

interface AdminDashboardProps {
  onNavigate: (tab: string) => void;
  onOpenCreateExam: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onNavigate,
  onOpenCreateExam,
}) => {
  const state = examStore.getState();
  const [timeframe, setTimeframe] = useState<'6m' | '1y'>('6m');

  const totalStudents = state.students.length;
  const totalSubjects = state.subjects.length;
  const totalExams = state.exams.length;
  const totalQuestions = state.questions.length;
  const totalAttempts = state.attempts.length;
  const passedAttempts = state.attempts.filter((a) => a.passed).length;
  const publishedAttemptsCount = state.attempts.filter(
    (a) => a.status === 'published'
  ).length;
  const proctoredExamsCount = state.exams.filter(
    (e) => e.webcamProctoring
  ).length;

  const passRate =
    totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0;

  const progressPercentage = Math.min(
    100,
    (totalSubjects > 0 ? 25 : 0) +
      (totalStudents > 0 ? 25 : 0) +
      (totalExams > 0 ? 25 : 0) +
      (totalQuestions > 0 ? 25 : 0)
  );

  const subjectsBarPct =
    totalSubjects > 0 ? Math.min(100, totalSubjects * 25) : 0;
  const questionsBarPct =
    totalQuestions > 0 ? Math.min(100, totalQuestions * 10) : 0;
  const proctoringBarPct =
    totalExams > 0 ? Math.round((proctoredExamsCount / totalExams) * 100) : 0;
  const evaluationBarPct =
    totalAttempts > 0
      ? Math.round((publishedAttemptsCount / totalAttempts) * 100)
      : 0;

  const orderedAttempts = [...state.attempts].reverse();
  const chartValues = (() => {
    if (orderedAttempts.length === 0) return [0, 0, 0, 0, 0, 0];
    if (timeframe === '6m') {
      const recent = orderedAttempts.slice(-6);
      return Array.from({ length: 6 }, (_, i) => {
        const item = recent[Math.min(i, recent.length - 1)];
        return item ? item.percentage : 0;
      });
    }
    return Array.from({ length: 6 }, (_, bucketIdx) => {
      const start = Math.floor((bucketIdx * orderedAttempts.length) / 6);
      const end = Math.max(
        start + 1,
        Math.floor(((bucketIdx + 1) * orderedAttempts.length) / 6)
      );
      const slice = orderedAttempts.slice(start, Math.min(end, orderedAttempts.length));
      if (slice.length === 0) {
        return orderedAttempts[orderedAttempts.length - 1]?.percentage ?? 0;
      }
      const sum = slice.reduce((acc, item) => acc + item.percentage, 0);
      return Math.round(sum / slice.length);
    });
  })();

  const chartX = [24, 114, 206, 298, 390, 480];
  const chartY = chartValues.map((pct) =>
    Math.round(125 - (Math.max(0, Math.min(100, pct)) / 100) * 95)
  );
  const linePath = chartX
    .map((x, idx) => `${idx === 0 ? 'M' : 'L'} ${x} ${chartY[idx]}`)
    .join(' ');
  const areaPath = `${linePath} L 480 135 L 24 135 Z`;

  const getExamIcon = (subjectName: string) => {
    const lower = subjectName.toLowerCase();
    if (lower.includes('python') || lower.includes('algo') || lower.includes('java')) {
      return <Code2 className="w-4 h-4 text-purple-400" />;
    }
    if (lower.includes('math')) {
      return <Calculator className="w-4 h-4 text-emerald-400" />;
    }
    return <Database className="w-4 h-4 text-cyan-400" />;
  };

  const quickModules = [
    {
      label: 'New Exam',
      sub: 'Schedule paper',
      icon: Trophy,
      color: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
      action: onOpenCreateExam,
    },
    {
      label: 'Questions',
      sub: `${totalQuestions} items`,
      icon: Code2,
      color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30',
      action: () => onNavigate('admin-questions'),
    },
    {
      label: 'Subjects',
      sub: `${totalSubjects} active`,
      icon: BookOpen,
      color: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
      action: () => onNavigate('admin-subjects'),
    },
    {
      label: 'Students',
      sub: `${totalStudents} enrolled`,
      icon: Users,
      color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30',
      action: () => onNavigate('admin-students'),
    },
    {
      label: 'Certificates',
      sub: `${state.certificates.length} issued`,
      icon: Award,
      color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
      action: () => onNavigate('admin-certificates'),
    },
    {
      label: 'Violations',
      sub: 'Proctor logs',
      icon: ShieldAlert,
      color: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
      action: () => onNavigate('admin-violations'),
    },
  ];

  const readinessBars = [
    {
      label: `Subjects & Cohorts (${totalSubjects} Active)`,
      pct: subjectsBarPct,
      gradient: 'linear-gradient(90deg, #8B5CF6 0%, #A855F7 100%)',
      tab: 'admin-subjects',
    },
    {
      label: `MCQ, Descriptive & Coding Bank (${totalQuestions} Items)`,
      pct: questionsBarPct,
      gradient: 'linear-gradient(90deg, #3B82F6 0%, #22D3EE 100%)',
      tab: 'admin-questions',
    },
    {
      label: `Proctoring & Violation Lockdown (${proctoredExamsCount}/${totalExams} Exams)`,
      pct: proctoringBarPct,
      gradient: 'linear-gradient(90deg, #6366F1 0%, #38BDF8 100%)',
      tab: 'admin-exams',
    },
    {
      label: `Published Evaluations & Certificates (${publishedAttemptsCount}/${totalAttempts})`,
      pct: evaluationBarPct,
      gradient: 'linear-gradient(90deg, #C026D3 0%, #9333EA 100%)',
      tab: 'admin-evaluations',
    },
  ];

  const featuredExam = state.exams[0];

  return (
    <div className="space-y-6 max-w-[1440px] w-full mx-auto">
      {/* Greeting Header (Exact Match to Screenshot 2) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Welcome back, {state.currentUser.name || 'Admin'}!
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Keep going! Manage examinations, track live progress, and ensure proctored excellence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenCreateExam}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] hover:from-[#9333EA] hover:to-[#6366F1] text-white text-xs font-bold shadow-[0_0_22px_-3px_rgba(124,58,237,0.65)] transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Create Examination
          </button>
          <button
            type="button"
            onClick={() => onNavigate('admin-students')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#141842] hover:bg-[#1D225C] border border-purple-400/35 text-slate-100 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Users className="w-4 h-4 text-purple-300" />
            Manage Students
          </button>
        </div>
      </div>

      {/* 4 Cosmic KPI Metric Cards (Exact Match to Screenshot 2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('admin-students')}
          className="rounded-2xl bg-[#0E1132] border border-purple-500/30 hover:border-purple-400/50 p-5 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              Total Students
            </span>
            <span className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-400/30 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-purple-400" />
            </span>
          </div>
          <div className="text-3xl font-black text-white font-mono tabular-nums mt-3">
            {totalStudents}
          </div>
          <div className="text-[11px] font-bold text-emerald-400 mt-2">
            ↑ {totalStudents} Active Roster
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('admin-exams')}
          className="rounded-2xl bg-[#0E1132] border border-purple-500/30 hover:border-purple-400/50 p-5 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              Examinations
            </span>
            <span className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-amber-400" />
            </span>
          </div>
          <div className="text-3xl font-black text-white font-mono tabular-nums mt-3">
            {totalExams}
          </div>
          <div className="text-[11px] font-bold text-emerald-400 mt-2">
            ↑ {totalSubjects} Subject{totalSubjects === 1 ? '' : 's'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('admin-evaluations')}
          className="rounded-2xl bg-[#0E1132] border border-purple-500/30 hover:border-purple-400/50 p-5 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              Total Attempts
            </span>
            <span className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
            </span>
          </div>
          <div className="text-3xl font-black text-white font-mono tabular-nums mt-3">
            {totalAttempts}
          </div>
          <div className="text-[11px] font-bold text-emerald-400 mt-2">
            ↑ {totalQuestions} Question{totalQuestions === 1 ? '' : 's'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('admin-leaderboard')}
          className="rounded-2xl bg-[#0E1132] border border-purple-500/30 hover:border-purple-400/50 p-5 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              Accuracy &amp; Pass Rate
            </span>
            <span className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
              <Target className="w-4 h-4 text-emerald-400" />
            </span>
          </div>
          <div className="text-3xl font-black text-white font-mono tabular-nums mt-3">
            {passRate}%
          </div>
          <div className="text-[11px] font-bold text-emerald-400 mt-2 font-mono">
            ↑ {state.certificates.length} Certified
          </div>
        </button>
      </div>

      {/* Middle Row: Your Platform Progress + Featured Next Examination */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Readiness & Setup Progress */}
        <div className="lg:col-span-8 rounded-2xl bg-[#0E1132] border border-purple-500/30 p-6">
          <h2 className="text-base font-extrabold text-white mb-5">
            Your Platform Progress
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-4 flex flex-col items-center justify-center text-center">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <defs>
                    <linearGradient id="amethystDonutGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#A855F7" />
                      <stop offset="55%" stopColor="#7C3AED" />
                      <stop offset="100%" stopColor="#6366F1" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    stroke="rgba(139, 92, 246, 0.2)"
                    strokeWidth="9"
                    fill="none"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    stroke="url(#amethystDonutGrad)"
                    strokeWidth="9"
                    strokeDasharray="314"
                    strokeDashoffset={314 - (314 * progressPercentage) / 100}
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
                <span className="absolute text-2xl font-black text-white font-mono tabular-nums">
                  {progressPercentage}%
                </span>
              </div>
              <div className="text-xs font-bold text-slate-200 mt-3">
                Overall Readiness
              </div>
              <div className="text-[11px] font-bold text-emerald-400 mt-0.5">
                ↑ Live Sync Active
              </div>
            </div>

            <div className="md:col-span-8 space-y-4">
              {readinessBars.map((bar) => (
                <button
                  key={bar.label}
                  type="button"
                  onClick={() => onNavigate(bar.tab)}
                  className="w-full text-left group cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200 group-hover:text-purple-300 transition-colors mb-1.5">
                    <span>{bar.label}</span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {bar.pct}%
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#1C2152] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${bar.pct}%`,
                        backgroundImage: bar.gradient,
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Featured Examination Card (Exact Match to Screenshot 2 Right Card) */}
        <div
          className="lg:col-span-4 rounded-2xl border border-purple-500/35 p-6 flex flex-col justify-between items-center text-center gap-5"
          style={{
            background:
              'radial-gradient(circle at 50% 25%, rgba(124, 58, 237, 0.24), transparent 68%), #0E1132',
          }}
        >
          <div className="flex-1 flex flex-col items-center justify-center pt-3">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-400/40 shadow-[0_0_28px_rgba(245,158,11,0.3)] flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">
              {featuredExam ? featuredExam.title : 'No Examination Scheduled'}
            </h3>
            {featuredExam ? (
              <div className="text-xl font-black text-white font-mono tabular-nums tracking-tight mt-2">
                {featuredExam.scheduledDate} • {featuredExam.startTime}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-2">
                Create your first examination paper to assign it to Sections A–L.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              featuredExam ? onNavigate('admin-exams') : onOpenCreateExam()
            }
            className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] hover:from-[#9333EA] hover:to-[#6366F1] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_22px_-3px_rgba(124,58,237,0.6)] transition-all cursor-pointer"
          >
            <span>
              {featuredExam ? 'View Details' : 'Schedule Examination'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Analytics Chart + Quick Actions & Modules */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Platform Performance Trend */}
        <div className="lg:col-span-7 rounded-2xl bg-[#0E1132] border border-purple-500/30 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-extrabold text-white">
                Platform Performance Trend
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Live examination accuracy across {totalAttempts} recorded submission{totalAttempts === 1 ? '' : 's'} ({passRate}% pass rate)
              </p>
            </div>
            <select
              aria-label="Chart Timeframe"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as '6m' | '1y')}
              className="text-xs font-bold text-slate-100 bg-[#141842] border border-purple-500/30 rounded-xl px-3.5 py-2 focus:outline-none"
            >
              <option value="6m">Live Submissions</option>
              <option value="1y">Full Academic Year</option>
            </select>
          </div>

          <div className="relative h-44 w-full pt-2">
            <svg viewBox="0 0 500 150" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="amethystAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A855F7" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line
                x1="0"
                y1="30"
                x2="500"
                y2="30"
                stroke="rgba(168,85,247,0.16)"
                strokeDasharray="3 4"
              />
              <line
                x1="0"
                y1="78"
                x2="500"
                y2="78"
                stroke="rgba(168,85,247,0.16)"
                strokeDasharray="3 4"
              />
              <line
                x1="0"
                y1="125"
                x2="500"
                y2="125"
                stroke="rgba(168,85,247,0.22)"
              />
              <path d={areaPath} fill="url(#amethystAreaGrad)" />
              <path
                d={linePath}
                fill="none"
                stroke="#A855F7"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {chartX.map((cx, idx) => (
                <circle
                  key={cx}
                  cx={cx}
                  cy={chartY[idx]}
                  r="4"
                  fill="#080B24"
                  stroke="#C084FC"
                  strokeWidth="2.2"
                />
              ))}
            </svg>
            <div className="flex justify-between text-[11px] text-slate-400 font-mono tabular-nums mt-1 px-2">
              {orderedAttempts.length > 0 ? (
                chartValues.map((val, idx) => (
                  <span key={`pt-${timeframe}-${idx}`}>
                    {timeframe === '1y' ? `P${idx + 1}` : `#${idx + 1}`} ({val}%)
                  </span>
                ))
              ) : (
                <span className="w-full text-center text-slate-500">
                  Score trajectory updates automatically once students submit examinations
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions & Modules */}
        <div className="lg:col-span-5 rounded-2xl bg-[#0E1132] border border-purple-500/30 p-6 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold text-white">
                Quick Actions &amp; Modules
              </h2>
              <span className="text-xs font-bold text-purple-300">
                {totalSubjects + totalExams} Active
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {quickModules.map((mod) => {
                const Icon = mod.icon;
                return (
                  <button
                    key={mod.label}
                    type="button"
                    onClick={mod.action}
                    className="p-3.5 rounded-2xl bg-[#131742] hover:bg-[#1C225C] border border-purple-500/25 hover:border-purple-400/50 flex flex-col items-center text-center gap-2 cursor-pointer transition-colors"
                  >
                    <div
                      className={`w-10 h-10 rounded-full border flex items-center justify-center ${mod.color}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white leading-none">
                        {mod.label}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {mod.sub}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('admin-evaluations')}
            className="w-full py-2.5 px-4 rounded-xl bg-[#141842] hover:bg-[#1D225C] border border-purple-400/30 text-xs font-bold text-purple-300 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Open Evaluation Station</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Scheduled Examinations Table & Live Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-2xl bg-[#0E1132] border border-purple-500/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-white">
                Scheduled Examinations
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('admin-exams')}
              className="inline-flex items-center gap-1 text-xs font-bold text-purple-300 hover:text-purple-200 cursor-pointer"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-purple-500/20 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 pr-3">Examination</th>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Date &amp; Time</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 pl-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/15 text-xs">
                {state.exams.length > 0 ? (
                  state.exams.slice(0, 5).map((exam) => (
                    <tr
                      key={exam.id}
                      onClick={() => onNavigate('admin-exams')}
                      className="hover:bg-[#141842] transition-colors cursor-pointer"
                    >
                      <td className="py-3 pr-3 font-semibold text-slate-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#141842] border border-purple-500/25 flex items-center justify-center shrink-0">
                            {getExamIcon(exam.subjectName)}
                          </div>
                          <span className="truncate max-w-[165px]">{exam.title}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                        {exam.subjectName}
                      </td>
                      <td className="py-3 px-3 text-slate-300 font-mono tabular-nums whitespace-nowrap">
                        <div>{exam.scheduledDate}</div>
                        <div className="text-[10px] text-slate-400">{exam.startTime}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {exam.durationMinutes}m
                      </td>
                      <td className="py-3 pl-3 text-right whitespace-nowrap">
                        <span
                          className={`text-[11px] font-bold ${
                            exam.status === 'Published' ||
                            exam.status === 'Results Published'
                              ? 'text-purple-300'
                              : exam.status === 'Scheduled'
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {exam.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-slate-400">
                      No examinations created yet.{' '}
                      <button
                        type="button"
                        onClick={onOpenCreateExam}
                        className="text-purple-300 font-semibold underline cursor-pointer"
                      >
                        Create Examination
                      </button>{' '}
                      to schedule your first live assessment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-[#0E1132] border border-purple-500/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-white">
                Recent Activity
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('admin-evaluations')}
              className="inline-flex items-center gap-1 text-xs font-bold text-purple-300 hover:text-purple-200 cursor-pointer"
            >
              Evaluations <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-purple-500/15">
            {state.activities.length > 0 ? (
              state.activities.slice(0, 5).map((act) => (
                <div
                  key={act.id}
                  className="py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        act.type === 'student'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : act.type === 'exam'
                          ? 'bg-purple-500/15 text-purple-300'
                          : act.type === 'result'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-[#141842] text-slate-300'
                      }`}
                    >
                      {act.type === 'student' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : act.type === 'exam' ? (
                        <PlayCircle className="w-3.5 h-3.5" />
                      ) : act.type === 'result' ? (
                        <Trophy className="w-3.5 h-3.5" />
                      ) : (
                        <FileCheck2 className="w-3.5 h-3.5" />
                      )}
                    </span>
                    <span className="font-medium text-slate-200 truncate">
                      {act.text}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap shrink-0">
                    {act.timeAgo}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No activity recorded yet. Actions taken in the console appear here in real time.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
