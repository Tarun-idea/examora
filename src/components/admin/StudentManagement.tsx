import React, { useState } from 'react';
import {
  Users,
  Plus,
  Search,
  FileSpreadsheet,
  X,
  CheckCircle2,
  Trash2,
  Edit3,
} from 'lucide-react';
import {
  examStore,
  StudentRecord,
  ALL_SECTIONS,
  normalizeSection,
  sortStudentsBySectionAndName,
} from '../../services/examStore.ts';

export const StudentManagement: React.FC = () => {
  const state = examStore.getState();
  const [search, setSearch] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');

  // Modal states
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [showCsvModal, setShowCsvModal] = useState<boolean>(false);
  const [csvText, setCsvText] = useState<string>('');
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // Student form fields (shared by Add & Edit Modal)
  const [studentId, setStudentId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [studentPassword, setStudentPassword] = useState<string>('');
  const [department, setDepartment] = useState<string>(
    'Computer Science & Engineering'
  );
  const [year, setYear] = useState<string>('Year 3');
  const [section, setSection] = useState<string>('A');
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');

  const departments = Array.from(
    new Set(state.students.map((s) => s.department))
  );

  const openAddStudentModal = () => {
    setEditingStudentId(null);
    setStudentId('');
    setName('');
    setEmail('');
    setStudentPassword('');
    setDepartment('Computer Science & Engineering');
    setYear('Year 3');
    setSection('A');
    setStatus('Active');
    setShowAddModal(true);
  };

  const openEditStudentModal = (stu: StudentRecord) => {
    setEditingStudentId(stu.id);
    setStudentId(stu.studentId);
    setName(stu.name);
    setEmail(stu.email);
    setStudentPassword('');
    setDepartment(stu.department || 'Computer Science & Engineering');
    setYear(stu.year || 'Year 3');
    setSection(normalizeSection(stu.section || 'A'));
    setStatus(stu.status || 'Active');
    setShowAddModal(true);
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId.trim()) return;
    const cleanId = studentId.trim().toUpperCase();
    const resolvedName = name.trim() || `Student ${cleanId}`;
    const trimmedPass = studentPassword.trim();

    if (editingStudentId) {
      const updated = examStore.updateStudent(editingStudentId, {
        studentId: cleanId,
        name: resolvedName,
        email:
          email.trim() ||
          `${cleanId.toLowerCase().replace(/[^a-z0-9]/g, '')}@student.edu`,
        department: department.trim() || 'Computer Science & Engineering',
        year,
        section: normalizeSection(section),
        ...(trimmedPass ? { password: trimmedPass } : {}),
        status,
      });
      if (updated) {
        setBannerMsg(
          `Updated & synced student ${updated.name} (Student ID: ${updated.studentId}, Section ${updated.section})${
            trimmedPass ? ' with a new hashed password' : ''
          } across all devices.`
        );
      }
    } else {
      const assignedPass = trimmedPass || cleanId;
      const stu = examStore.addStudent({
        studentId: cleanId,
        name: resolvedName,
        email,
        department,
        year,
        section: normalizeSection(section),
        password: assignedPass,
      });
      setBannerMsg(
        `Registered & synced ${stu.name} (Student ID: ${stu.studentId}, Section ${stu.section}). Password is encrypted on the server and ready for cross-device login.`
      );
    }

    setShowAddModal(false);
    setEditingStudentId(null);
    setStudentId('');
    setName('');
    setEmail('');
    setStudentPassword('');
  };

  const parseCsvRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const handleBulkCsvImport = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed = lines
      .map((line) => parseCsvRow(line))
      .filter((parts, index) => {
        if (parts.length === 0) return false;
        const firstCell = (parts[0] || '').toLowerCase();
        const secondCell = (parts[1] || '').toLowerCase();
        if (
          index === 0 &&
          (firstCell.includes('student id') ||
            firstCell === 'id' ||
            firstCell.includes('reg') ||
            firstCell.includes('roll') ||
            secondCell.includes('full name') ||
            secondCell === 'name')
        ) {
          return false;
        }
        return Boolean(parts[0] || parts[1]);
      })
      .map((parts) => ({
        studentId:
          parts[0] || `STU-2026-${Math.floor(100 + Math.random() * 900)}`,
        name: parts[1] || 'Imported Student',
        email: parts[2] || 'student@student.edu',
        department: parts[3] || 'Computer Science & Engineering',
        year: parts[4] || 'Year 3',
        section: normalizeSection(parts[5] || 'A'),
      }));

    const count = examStore.bulkImportStudents(parsed);
    setShowCsvModal(false);
    setBannerMsg(
      count > 0
        ? `Successfully imported ${count} student account(s) from CSV in Section-wise order.`
        : 'No new students were imported (all listed Student IDs already exist or input was empty).'
    );
  };

  const seenStudentKeys = new Set<string>();
  const filteredStudents = sortStudentsBySectionAndName(
    state.students.filter((stu) => {
      const key = `${stu.id}::${stu.studentId.trim().toUpperCase()}`;
      if (seenStudentKeys.has(stu.id) || seenStudentKeys.has(key)) return false;
      const matchesDept = deptFilter === 'ALL' || stu.department === deptFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        stu.name.toLowerCase().includes(q) ||
        stu.studentId.toLowerCase().includes(q) ||
        stu.email.toLowerCase().includes(q);
      if (matchesDept && matchesSearch) {
        seenStudentKeys.add(stu.id);
        seenStudentKeys.add(key);
        return true;
      }
      return false;
    })
  );

  // Precompute student counts per section for section list divider headers
  const sectionCounts = filteredStudents.reduce<Record<string, number>>(
    (acc, stu) => {
      const sec = normalizeSection(stu.section || 'A');
      acc[sec] = (acc[sec] || 0) + 1;
      return acc;
    },
    {}
  );

  const handleExportCsv = () => {
    const header =
      'Student ID,Full Name,Email,Department,Year,Section,Status\n';
    const rows = filteredStudents
      .map(
        (s) =>
          `"${s.studentId}","${s.name}","${s.email}","${s.department}","${s.year}","${normalizeSection(s.section || 'A')}","${s.status}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'examflow_students_roster.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-[1480px] w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="w-6 h-6 text-purple-400" />
            <h1 className="text-2xl font-extrabold text-white">
              Student Management
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Enrolled students, edit student details, eligibility status, and
            bulk Google Sheets / CSV imports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#131742] hover:bg-[#1B2158] border border-purple-500/35 text-emerald-300 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Google Sheets Export &amp; Tools
          </button>

          <button
            type="button"
            onClick={() => setShowCsvModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#131742] hover:bg-[#1B2158] border border-purple-500/35 text-slate-100 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Import Google Sheets / CSV
          </button>

          <button
            type="button"
            onClick={openAddStudentModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] hover:from-[#8B5CF6] hover:to-[#6366F1] text-white text-xs font-bold shadow-[0_0_20px_rgba(124,58,237,0.45)] transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Student
          </button>
        </div>
      </div>

      {bannerMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{bannerMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="text-xs font-bold text-emerald-300 hover:text-white underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Department Filter Bar */}
      <div className="bg-[#0E1132] rounded-2xl border border-purple-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, student ID, email..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-purple-500/35 bg-[#141946] text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-purple-400"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <label
            htmlFor="dept-filter"
            className="text-xs font-semibold text-slate-300"
          >
            Department:
          </label>
          <select
            id="dept-filter"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-purple-500/35 bg-[#141946] text-xs font-semibold text-white focus:outline-none"
          >
            <option value="ALL" className="bg-[#0E1132] text-white">
              All Departments
            </option>
            {departments.map((d) => (
              <option key={d} value={d} className="bg-[#0E1132] text-white">
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Students Table (Automatically Sorted Section-Wise A→L, Name-Wise A→Z) */}
      <div className="bg-[#0E1132] rounded-2xl border border-purple-500/30 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-purple-500/25 text-[11px] font-extrabold text-slate-300 uppercase bg-[#141946]">
                <th className="py-4 px-5">Student ID</th>
                <th className="py-4 px-5">Full Name</th>
                <th className="py-4 px-5">Email</th>
                <th className="py-4 px-5">Department</th>
                <th className="py-4 px-5">Year &amp; Sec</th>
                <th className="py-4 px-5">Status</th>
                <th className="py-4 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/15 text-xs">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((stu, idx) => {
                  const sec = normalizeSection(stu.section || 'A');
                  const prevSec =
                    idx > 0
                      ? normalizeSection(filteredStudents[idx - 1].section || 'A')
                      : null;
                  const showSectionDivider = sec !== prevSec;
                  return (
                    <React.Fragment key={stu.id}>
                      {showSectionDivider && (
                        <tr className="bg-[#121740] border-y border-purple-500/25">
                          <td
                            colSpan={7}
                            className="py-2.5 px-5 text-[11px] font-extrabold tracking-wide text-purple-200"
                          >
                            Section {sec}
                            <span className="text-slate-400 font-normal ml-2 font-mono tabular-nums">
                              · {sectionCounts[sec] || 0}{' '}
                              {(sectionCounts[sec] || 0) === 1
                                ? 'Student'
                                : 'Students'}
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr className="hover:bg-purple-500/10 transition-colors">
                    <td className="py-4 px-5 font-mono font-extrabold text-cyan-300">
                      {stu.studentId}
                    </td>
                    <td className="py-4 px-5 font-bold text-white">
                      {stu.name}
                    </td>
                    <td className="py-4 px-5 text-slate-300">{stu.email}</td>
                    <td className="py-4 px-5 text-slate-200 font-medium">
                      {stu.department}
                    </td>
                    <td className="py-4 px-5 text-slate-300 font-semibold">
                      {stu.year} ·{' '}
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-400/30 text-purple-200 font-mono font-bold">
                        {stu.section}
                      </span>
                    </td>
                    <td className="py-4 px-5">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                          stu.status === 'Active'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-700/50 text-slate-300 border-slate-600'
                        }`}
                      >
                        {stu.status}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditStudentModal(stu)}
                          aria-label={`Edit ${stu.name}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/35 border border-purple-400/40 text-purple-200 hover:text-white text-xs font-bold cursor-pointer transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => examStore.toggleStudentStatus(stu.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                            stu.status === 'Active'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          }`}
                        >
                          {stu.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            examStore.deleteStudent(stu.id);
                            setBannerMsg(
                              `Deleted student ${stu.name} (${stu.studentId}) from the list.`
                            );
                          }}
                          title={`Delete ${stu.name}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 text-rose-300 hover:text-white text-xs font-bold cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                      </tr>
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-xs text-slate-300"
                  >
                    No students registered yet. Click{' '}
                    <strong className="text-white">Add Student</strong> or{' '}
                    <strong className="text-white">
                      Import Google Sheets / CSV
                    </strong>{' '}
                    to add live student records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Student Details Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#0E1132] rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-purple-500/40">
            <div className="flex items-center justify-between pb-4 border-b border-purple-500/25">
              <h2 className="text-lg font-extrabold text-white">
                {editingStudentId
                  ? 'Edit Student Details'
                  : 'Register New Student'}
              </h2>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingStudentId(null);
                }}
                className="p-2 rounded-xl text-slate-300 hover:bg-purple-500/20 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  Student Registration ID *
                </label>
                <input
                  type="text"
                  required
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="e.g. 2025PECAI or STU-2026-001"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-purple-500/35 bg-[#141946] text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  Full Name (Optional — auto-fills from ID if blank)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sophia Martinez"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-purple-500/35 bg-[#141946] text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  Institutional Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sophia.m@student.edu"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-purple-500/35 bg-[#141946] text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  Department / Program
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Computer Science & Engineering"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-purple-500/35 bg-[#141946] text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  {editingStudentId
                    ? 'Reset Student Password (Leave blank to keep current password)'
                    : 'Student Login Password (Defaults to Student ID if left blank)'}
                </label>
                <input
                  type="text"
                  value={studentPassword}
                  onChange={(e) => setStudentPassword(e.target.value)}
                  placeholder={
                    editingStudentId
                      ? 'Leave blank to keep existing password'
                      : 'Enter initial password (or leave blank for Student ID)'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-purple-500/35 bg-[#141946] text-xs font-mono text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">
                    Academic Year
                  </label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-purple-500/35 bg-[#141946] text-xs text-white"
                  >
                    <option value="Year 1">Year 1</option>
                    <option value="Year 2">Year 2</option>
                    <option value="Year 3">Year 3</option>
                    <option value="Year 4">Year 4</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">
                    Section (A – L)
                  </label>
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-purple-500/35 bg-[#141946] text-xs font-bold text-white"
                  >
                    {ALL_SECTIONS.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-purple-500/20">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingStudentId(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-purple-500/35 bg-[#141946] text-xs font-bold text-slate-200 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] text-white text-xs font-bold shadow-[0_0_20px_rgba(124,58,237,0.45)] cursor-pointer"
                >
                  {editingStudentId
                    ? 'Save Student Changes'
                    : 'Register Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#0E1132] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-purple-500/40">
            <div className="flex items-center justify-between pb-4 border-b border-purple-500/25">
              <h2 className="text-lg font-extrabold text-white">
                Bulk Google Sheets / CSV Student Import
              </h2>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setShowCsvModal(false)}
                className="p-2 rounded-xl text-slate-300 hover:bg-purple-500/20 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBulkCsvImport} className="mt-4 space-y-4">
              <p className="text-xs text-slate-300">
                Paste comma-separated rows:{' '}
                <code className="font-mono text-cyan-300">
                  StudentID, Full Name, Email, Department, Year, Section
                </code>
              </p>
              <textarea
                rows={5}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="STU-2026-001, Student Full Name, student@university.edu, Computer Science & Engineering, Year 3, A"
                className="w-full p-3.5 rounded-xl border border-purple-500/35 bg-[#141946] font-mono text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-purple-400"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCsvModal(false)}
                  className="px-4 py-2 rounded-xl border border-purple-500/35 bg-[#141946] text-xs font-bold text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  Import Rows
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
