import React from 'react';

interface InstitutionalHeaderBrandProps {
  logoUrl?: string;
  arenaSubtitle?: string;
  compact?: boolean;
  large?: boolean;
  heroHeader?: boolean;
  workspaceHeader?: boolean;
}

export const InstitutionalHeaderBrand: React.FC<InstitutionalHeaderBrandProps> = ({
  logoUrl,
  arenaSubtitle,
  compact = false,
  large = false,
  heroHeader = false,
  workspaceHeader = false,
}) => {
  const effectiveLogo =
    logoUrl && logoUrl.trim() ? logoUrl : '/assets/panimalar-crest.png';

  return (
    <div
      className={`flex items-center ${
        heroHeader
          ? 'gap-4 sm:gap-6'
          : large
            ? 'gap-4 sm:gap-5'
            : 'gap-3 sm:gap-4'
      } shrink-0 select-none`}
    >
      {/* Panimalar Crest + Institutional Lockup */}
      <div
        className={`flex items-center ${
          heroHeader
            ? 'gap-3 sm:gap-4'
            : large
              ? 'gap-3.5 sm:gap-4'
              : 'gap-2.5 sm:gap-3'
        }`}
      >
        <img
          src={effectiveLogo}
          alt="Panimalar Engineering College Emblem"
          decoding="async"
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.src.endsWith('/assets/panimalar-crest.png')) {
              target.src = '/assets/panimalar-crest.png';
            }
          }}
          className={`${
            workspaceHeader
              ? 'w-[78px] h-[80px]'
              : heroHeader
                ? 'w-[164px] h-[140px]'
                : large
                  ? 'w-14 h-14 sm:w-16 sm:h-16'
                  : compact
                    ? 'w-10 h-10'
                    : 'w-11 h-11'
          } object-contain shrink-0`}
        />

        <div
          className={`flex flex-col justify-center leading-tight ${
            workspaceHeader ? 'ml-[-7px]' : ''
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span
              className={`${
                heroHeader
                  ? 'text-base sm:text-xl'
                  : large
                    ? 'text-base sm:text-lg'
                    : compact
                      ? 'text-xs sm:text-[15px]'
                      : 'text-sm sm:text-[16px]'
              } font-black tracking-wide text-white uppercase leading-none`}
            >
              PANIMALAR
            </span>
            <span
              className={`${
                heroHeader
                  ? 'text-[11px] sm:text-[13px] text-white'
                  : large
                    ? 'text-[11px] sm:text-xs text-slate-200'
                    : compact
                      ? 'text-[10px] text-slate-200'
                      : 'text-[10px] sm:text-[11px] text-slate-200'
              } font-extrabold tracking-wider uppercase leading-none`}
            >
              ENGINEERING COLLEGE
            </span>
          </div>

          <div
            className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${
              heroHeader ? 'mt-1.5 text-[10px] sm:text-[11px]' : 'mt-1 text-[10px]'
            } leading-none`}
          >
            <span
              className={`inline-block bg-[#C62828] text-white font-bold ${
                heroHeader ? 'px-2 py-[3px] rounded-[2px]' : 'px-1.5 py-[2px] rounded-[3px]'
              } tracking-tight`}
            >
              An Autonomous Institution
            </span>
            <span
              className={`${
                heroHeader ? 'text-slate-200' : 'text-slate-300'
              } hidden sm:inline`}
            >
              Affiliated to Anna University, Chennai
            </span>
          </div>

          <div
            className={`${
              heroHeader
                ? 'text-[11px] sm:text-xs mt-1.5'
                : 'text-[10px] sm:text-[11px] mt-1'
            } font-bold text-cyan-400 tracking-wide leading-none`}
          >
            Department of AI and Data Science
          </div>
        </div>
      </div>

      {/* ExamFlow Wordmark */}
      <div className={`hidden sm:flex flex-col justify-center shrink-0 ${heroHeader ? 'pl-1.5' : 'pl-1'}`}>
        <div
          className={`${
            heroHeader
              ? 'text-xl sm:text-[26px]'
              : large
                ? 'text-xl sm:text-2xl'
                : compact
                  ? 'text-lg sm:text-xl'
                  : 'text-lg sm:text-[22px]'
          } font-black tracking-tight text-white leading-none`}
        >
          Exam
          <span className="bg-gradient-to-r from-purple-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Flow
          </span>
        </div>
        {arenaSubtitle && (
          <div className="text-[10px] sm:text-[11px] mt-0.5 font-medium text-slate-400 leading-none">
            {arenaSubtitle}
          </div>
        )}
      </div>
    </div>
  );
};
