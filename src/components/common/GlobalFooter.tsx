import React from 'react';
import { Zap, Mail, Phone, MapPin } from 'lucide-react';

export const TEAM_MEMBERS = [
  {
    id: 'tm1',
    name: 'Mrs.C.Annapoorani',
    email: 'cvpoorani@gmail.com',
    phone: '+91 9176380194',
  },
  {
    id: 'tm2',
    name: 'Mr. S.VIGNESH',
    email: 'vicky366vj@gmail.com',
    phone: '+91 6381260699',
  },
  {
    id: 'tm3',
    name: 'Mr.Tarunkumar v',
    email: 'taruntk2008@gmail.com',
    phone: '+91 9025846979',
  },
  {
    id: 'tm4',
    name: 'Mr.YOGGESH N',
    email: 'yoggeshnr@gmail.com',
    phone: '+91 9791155317',
  },
  {
    id: 'tm5',
    name: 'Mr.Tamilselvan D',
    email: 'tamil3634786@gmail.com',
    phone: '+91 6384528015',
  },
];

const MENTOR_MEMBERS = TEAM_MEMBERS.slice(0, 2);
const DEVELOPER_MEMBERS = TEAM_MEMBERS.slice(2);

interface GlobalFooterProps {
  className?: string;
}

export const GlobalFooter: React.FC<GlobalFooterProps> = ({ className = '' }) => {
  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <footer
      id="welcome-about-section"
      className={`relative z-10 border-t border-purple-500/15 bg-[#060411] pt-14 pb-10 px-4 sm:px-8 lg:px-10 ${className}`}
    >
      <div className="max-w-[1520px] mx-auto space-y-12">
        {/* ROW 1: Left (Brand & Description) | Right (Created/Developed Credits & Social Icons) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Row 1, Left Column: Brand & About Description */}
          <div className="lg:col-span-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#9333EA] to-[#6366F1] flex items-center justify-center shadow-[0_0_18px_rgba(147,51,234,0.45)] shrink-0">
                <Zap className="w-5 h-5 text-white fill-white" />
              </div>
              <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                ExamFlow
              </span>
            </div>

            <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed max-w-xl">
              ExamFlow is a comprehensive digital examination and automated
              programming evaluation platform engineered to uphold academic
              integrity and streamline university assessments. Featuring a
              3-strike fullscreen proctoring lockdown, a real-time
              multi-language code execution sandbox (C, C++, Python, Java,
              JavaScript, and SQL), randomized per-candidate question banks,
              and automated merit certificate generation with one-click
              Section A–L single-PDF group downloads, ExamFlow empowers
              faculty and students in one unified arena.
            </p>
          </div>

          {/* Row 1, Right Column: Credits */}
          <div className="lg:col-span-6 flex flex-col justify-center space-y-5 lg:pt-8">
            <div className="text-xs sm:text-[13px] text-purple-300/95 space-y-2">
              <div>
                <strong className="text-white font-extrabold">
                  Created &amp; Designed By:
                </strong>{' '}
                TarunKumar V &amp; Team
              </div>
              <div>
                <strong className="text-white font-extrabold">
                  Developed By:
                </strong>{' '}
                5-Member Student Development Team — Department of AI &amp; Data
                Science, Panimalar Engineering College (2025–2026)
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2: Left (CONTACT US + Mentored By) | Right (Developed By) — Unboxed Normal Team Entries */}
        <div
          id="welcome-contact-section"
          className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start pt-2"
        >
          {/* Row 2, Left Column: CONTACT US + Mentored By */}
          <div className="lg:col-span-6 space-y-5">
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-white">
                CONTACT US
              </h3>
              <div className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-300">
                <MapPin className="w-4 h-4 text-[#A855F7] shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  Department of AI &amp; Data Science, Panimalar Engineering
                  College, Chennai
                </span>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              <div className="text-sm sm:text-base font-extrabold text-white">
                Mentored By:
              </div>

              <div className="space-y-4">
                {MENTOR_MEMBERS.map((member) => (
                  <div key={member.id} className="space-y-1">
                    <div className="text-sm font-normal text-white">
                      {member.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />
                        <span>{member.email}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-mono">
                        <Phone className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />
                        <span>{member.phone}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2, Right Column: Developed By */}
          <div className="lg:col-span-6 space-y-4">
            <div className="text-sm sm:text-base font-extrabold text-white">
              Developed By:
            </div>

            <div className="space-y-4">
              {DEVELOPER_MEMBERS.map((member) => (
                <div key={member.id} className="space-y-1">
                  <div className="text-sm font-normal text-white">
                    {member.name}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />
                      <span>{member.email}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      <Phone className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />
                      <span>{member.phone}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ROW 3: Bottom Bar — Left (Below Mentored By: Copyright) | Right (Below Developed By: Legal Links) */}
        <div className="border-t border-white/10 pt-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center text-xs text-slate-400">
          {/* Below Row 2 Left Column (Mentored By) */}
          <div className="lg:col-span-6 text-left">
            © 2026 ExamFlow Technologies Inc. All rights reserved.
          </div>

          {/* Below Row 2 Right Column (Developed By) */}
          <div className="lg:col-span-6 flex flex-wrap items-center justify-start lg:justify-end gap-6">
            <button
              type="button"
              onClick={() => scrollToSection('welcome-about-section')}
              className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('welcome-about-section')}
              className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('welcome-about-section')}
              className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              Cookie Settings
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
