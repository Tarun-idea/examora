import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDeterministicQuestionOrder,
  calculateRemainingSeconds,
  formatCountdownTimer,
  evaluateProgrammingSubmission,
  classifyViolationRisk,
  mergeStudentListsCrossDevice,
  verifyCrossDeviceStudentLogin,
  mergeAuthoritativeAdminState,
} from './examLogic.ts';
import {
  createHardCProgramsDrafts,
  createMediumCProgramsDrafts,
  formatQuestionPromptForDisplay,
  isCleanReadableText,
  sanitizeExtractedText,
  parseQuestionsFromText,
  parseQuestionsFromCsv,
} from './questionPaperParser.ts';

test('getDeterministicQuestionOrder returns same order on repeated calls (refresh safe) and differs across students', () => {
  const qIds = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
  const orderA1 = getDeterministicQuestionOrder(qIds, 'student-1', 'exam-101');
  const orderA2 = getDeterministicQuestionOrder(qIds, 'student-1', 'exam-101');
  const orderB = getDeterministicQuestionOrder(qIds, 'student-2', 'exam-101');

  assert.deepEqual(orderA1, orderA2);
  assert.equal(orderA1.length, qIds.length);
  assert.deepEqual([...orderA1].sort(), [...qIds].sort());
  assert.notDeepEqual(orderA1, orderB);
});

test('calculateRemainingSeconds respects exam duration and caps late joiners at scheduled deadline', () => {
  const startIso = '2026-11-05T10:00:00.000Z';
  const startMs = new Date(startIso).getTime();
  // 90 mins exam, 30 mins elapsed -> 60 mins (3600s) left
  const remNormal = calculateRemainingSeconds(
    startIso,
    90,
    startMs + 30 * 60 * 1000
  );
  assert.equal(remNormal, 3600);

  // Late student starts at 10:40, but hard exam window ends at 11:30 (only 50 mins left instead of 90)
  const lateStartIso = '2026-11-05T10:40:00.000Z';
  const deadlineIso = '2026-11-05T11:30:00.000Z';
  const remLate = calculateRemainingSeconds(
    lateStartIso,
    90,
    new Date(lateStartIso).getTime(),
    deadlineIso
  );
  assert.equal(remLate, 50 * 60);
});

test('formatCountdownTimer formats seconds into HH:MM:SS', () => {
  assert.equal(formatCountdownTimer(5075), '01:24:35');
  assert.equal(formatCountdownTimer(0), '00:00:00');
});

test('evaluateProgrammingSubmission executes Python and JS against sample & hidden test cases', () => {
  const testCases = [
    { id: 'tc1', input: '10 20', expectedOutput: '30', isHidden: false },
    { id: 'tc2', input: '100 250', expectedOutput: '350', isHidden: true },
  ];

  const pyRes = evaluateProgrammingSubmission(
    'a, b = map(int, input().split())\nprint(a + b)',
    'python',
    testCases,
    20
  );
  assert.equal(pyRes.awardedMarks, 20);
  assert.equal(pyRes.results.every((r) => r.passed), true);

  const jsRes = evaluateProgrammingSubmission(
    'const [a, b] = input.trim().split(/\\s+/).map(Number); console.log(a + b);',
    'javascript',
    testCases,
    20
  );
  assert.equal(jsRes.awardedMarks, 20);

  const cRes = evaluateProgrammingSubmission(
    '#include <stdio.h>\nint main() { int a, b; scanf("%d %d", &a, &b); printf("%d\\n", a + b); return 0; }',
    'c',
    testCases,
    20
  );
  assert.equal(cRes.awardedMarks, 20);

  const cppRes = evaluateProgrammingSubmission(
    '#include <iostream>\nusing namespace std;\nint main() { int a, b; cin >> a >> b; cout << a + b; return 0; }',
    'cpp',
    testCases,
    20
  );
  assert.equal(cppRes.awardedMarks, 20);

  const javaRes = evaluateProgrammingSubmission(
    'import java.util.*; public class Main { public static void main(String[] args) { Scanner s = new Scanner(System.in); System.out.println(s.nextInt() + s.nextInt()); } }',
    'java',
    testCases,
    20
  );
  assert.equal(javaRes.awardedMarks, 20);
});

test('classifyViolationRisk returns Low, Medium, High accurately', () => {
  assert.equal(classifyViolationRisk(1).label, 'Low (1x)');
  assert.equal(classifyViolationRisk(2).label, 'Medium (2x)');
  assert.equal(classifyViolationRisk(4).label, 'High (4x)');
});

test('mergeStudentListsCrossDevice merges Admin-registered students across devices and respects deletions', () => {
  const deviceAStudents = [
    {
      id: 'stu-2025pecai',
      studentId: '2025PECAI',
      name: 'Student 2025PECAI',
      email: '2025pecai@student.edu',
      password: '123',
      status: 'Active' as const,
      updatedAtMs: 1000,
    },
    {
      id: 'stu-new',
      studentId: '2025PECAI02',
      name: 'Arun Kumar',
      email: 'arun@student.edu',
      password: '123',
      status: 'Active' as const,
      updatedAtMs: 2000,
    },
  ];
  const deviceBStudents: typeof deviceAStudents = [];

  const merged = mergeStudentListsCrossDevice(deviceBStudents, deviceAStudents, []);
  assert.equal(merged.length, 2);

  // Student 2025pecai can login on Device B with password '123', their Student ID, or blank password
  const loginWith123 = verifyCrossDeviceStudentLogin('2025pecai', '123', merged);
  assert.equal(loginWith123.success, true);
  assert.equal(loginWith123.student?.studentId, '2025PECAI');

  const loginWithId = verifyCrossDeviceStudentLogin('2025pecai02', '2025pecai02', merged);
  assert.equal(loginWithId.success, true);

  // Unregistered student ID is rejected
  const unregistered = verifyCrossDeviceStudentLogin('unknown999', '123', merged);
  assert.equal(unregistered.success, false);
});

test('mergeAuthoritativeAdminState keeps Admin data permanent across devices and prevents student or fresh-device overwrites', () => {
  const permanentAdminState = {
    students: [
      {
        id: 'stu-2025pecai',
        studentId: '2025PECAI',
        name: 'Student 2025PECAI',
        email: '2025pecai@student.edu',
        password: '123',
        status: 'Active' as const,
        updatedAtMs: 5000,
      },
    ],
    subjects: [{ id: 'sub-101', code: 'CS101', name: 'C Programming' }],
    exams: [{ id: 'exam-101', title: 'Midterm Assessment' }],
    questions: [{ id: 'q-101', examId: 'exam-101', text: 'Print Hello World' }],
    deletedIds: ['stu-removed'],
    adminUpdatedAt: 5000,
  };

  // 1. A student device syncing must NEVER alter Admin students, subjects, exams, or questions
  const afterStudentSync = mergeAuthoritativeAdminState(
    permanentAdminState,
    {
      students: [],
      subjects: [],
      exams: [],
      questions: [],
      deletedIds: [],
      adminUpdatedAt: 99999,
    },
    'student'
  );
  assert.equal(afterStudentSync.students.length, 1);
  assert.equal(afterStudentSync.subjects.length, 1);
  assert.equal(afterStudentSync.exams.length, 1);
  assert.equal(afterStudentSync.questions.length, 1);

  // 2. A fresh uninitialized browser booting with adminUpdatedAt: 0 must NEVER overwrite saved Admin state
  const afterFreshDeviceBoot = mergeAuthoritativeAdminState(
    permanentAdminState,
    {
      students: [],
      subjects: [],
      exams: [],
      questions: [],
      adminUpdatedAt: 0,
    },
    'admin'
  );
  assert.equal(afterFreshDeviceBoot.subjects.length, 1);
  assert.equal(afterFreshDeviceBoot.exams.length, 1);

  // 3. Only an explicit newer Admin modification (adminUpdatedAt > 5000) updates the permanent Admin state
  const afterAdminAddStudent = mergeAuthoritativeAdminState(
    permanentAdminState,
    {
      students: [
        ...permanentAdminState.students,
        {
          id: 'stu-2025pecai99',
          studentId: '2025PECAI99',
          name: 'New Student 99',
          email: 'stu99@student.edu',
          password: '123',
          status: 'Active' as const,
          updatedAtMs: 6000,
        },
      ],
      adminUpdatedAt: 6000,
    },
    'admin'
  );
  assert.equal(afterAdminAddStudent.students.length, 2);
  assert.equal(afterAdminAddStudent.adminUpdatedAt, 6000);
});

test('UI_THEME_TEMPLATES enforces single permanent Amethyst & Cobalt (Purple & Royal Blue) theme', async () => {
  const { UI_THEME_TEMPLATES, resolveUiTheme, DEFAULT_UI_THEME } = await import(
    './uiThemes.ts'
  );
  assert.equal(UI_THEME_TEMPLATES.length, 1);
  assert.equal(UI_THEME_TEMPLATES[0].id, 'amethyst-cobalt');
  assert.equal(UI_THEME_TEMPLATES[0].name, 'Amethyst & Cobalt');

  const resolved = resolveUiTheme('any-other-theme');
  assert.equal(resolved.id, DEFAULT_UI_THEME);
  assert.equal(resolved.isLight, false);
});

test('evaluateProgrammingSubmission executes all 3 C programs from Hard_C-programs PDF accurately', () => {
  // 1. Move All Zeros to the End
  const moveZerosCode = `#include <stdio.h>
int main() {
  int n, a[100], i, j = 0;
  scanf("%d", &n);
  for(i = 0; i < n; i++) scanf("%d", &a[i]);
  for(i = 0; i < n; i++) {
    if(a[i] != 0) a[j++] = a[i];
  }
  while(j < n) a[j++] = 0;
  for(i = 0; i < n; i++) printf("%d ", a[i]);
  return 0;
}`;
  const moveZerosRes = evaluateProgrammingSubmission(
    moveZerosCode,
    'c',
    [
      { id: 'tc-1', input: '6 0 1 0 3 12 0', expectedOutput: '1 3 12 0 0 0', isHidden: false },
      { id: 'tc-2', input: '5 / 1 2 3 4 5', expectedOutput: '1 2 3 4 5', isHidden: true },
      { id: 'tc-3', input: '5 / 0 0 1 2 3', expectedOutput: '1 2 3 0 0', isHidden: true },
      { id: 'tc-4', input: '4 / 0 0 0 0', expectedOutput: '0 0 0 0', isHidden: true },
    ],
    20
  );
  assert.equal(moveZerosRes.awardedMarks, 20);
  assert.equal(moveZerosRes.results.every((r) => r.passed), true);

  // 2. Check Whether Two Strings Are Anagrams
  const anagramCode = `#include <stdio.h>
#include <string.h>
int main() {
  char a[100], b[100];
  int count[26] = {0};
  int i;
  scanf("%99s", a);
  scanf("%99s", b);
  if(strlen(a) != strlen(b)) { printf("Not Anagram"); return 0; }
  for(i = 0; a[i] != '\\0'; i++) {
    count[a[i] - 'a']++;
    count[b[i] - 'a']--;
  }
  for(i = 0; i < 26; i++) {
    if(count[i] != 0) { printf("Not Anagram"); return 0; }
  }
  printf("Anagram");
  return 0;
}`;
  const anagramRes = evaluateProgrammingSubmission(
    anagramCode,
    'c',
    [
      { id: 'tc-1', input: 'listen Silent', expectedOutput: 'Anagram', isHidden: false },
      { id: 'tc-2', input: 'race / care', expectedOutput: 'Anagram', isHidden: true },
      { id: 'tc-3', input: 'hello / world', expectedOutput: 'Not Anagram', isHidden: true },
      { id: 'tc-4', input: 'abc / abcd', expectedOutput: 'Not Anagram', isHidden: true },
      { id: 'tc-5', input: 'aabb / bbaa', expectedOutput: 'Anagram', isHidden: true },
    ],
    20
  );
  assert.equal(anagramRes.awardedMarks, 20);
  assert.equal(anagramRes.results.every((r) => r.passed), true);

  // 3. Rotate an Array by K Positions
  const rotateCode = `#include <stdio.h>
int main() {
  int n, a[100], temp[100];
  int k, i;
  scanf("%d", &n);
  for(i = 0; i < n; i++) scanf("%d", &a[i]);
  scanf("%d", &k);
  k = k % n;
  for(i = 0; i < n; i++) temp[(i + k) % n] = a[i];
  for(i = 0; i < n; i++) printf("%d ", temp[i]);
  return 0;
}`;
  const rotateRes = evaluateProgrammingSubmission(
    rotateCode,
    'c',
    [
      { id: 'tc-1', input: '5 1 2 3 4 5 2', expectedOutput: '4 5 1 2 3', isHidden: false },
      { id: 'tc-2', input: '4 / 1 2 3 4 / 1', expectedOutput: '4 1 2 3', isHidden: true },
      { id: 'tc-3', input: '3 / 1 2 3 / 3', expectedOutput: '1 2 3', isHidden: true },
      { id: 'tc-4', input: '3 / 1 2 3 / 5', expectedOutput: '2 3 1', isHidden: true },
    ],
    20
  );
  assert.equal(rotateRes.awardedMarks, 20);
  assert.equal(rotateRes.results.every((r) => r.passed), true);
});

test('evaluateProgrammingSubmission executes all 12 C programs from medium_c_programs PDF (Set 1, Set 2, Set 3) accurately', () => {
  // Set 1 - 1. Find the Area of a Circle
  const circleCode = `#include <stdio.h>
int main() {
  float r, area;
  scanf("%f", &r);
  area = 3.14 * r * r;
  printf("Area = %.2f", area);
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      circleCode,
      'c',
      [
        { id: 'tc-1', input: '5', expectedOutput: 'Area = 78.50', isHidden: false },
        { id: 'tc-2', input: '10', expectedOutput: 'Area = 314.00', isHidden: true },
      ],
      10
    ).awardedMarks,
    10
  );

  // Set 1 - 2. Print Number Triangle
  const triangleCode = `#include <stdio.h>
int main() {
  int i, j;
  for(i = 1; i <= 5; i++) {
    for(j = 1; j <= i; j++)
      printf("%d ", j);
    printf("\\n");
  }
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      triangleCode,
      'c',
      [
        { id: 'tc-1', input: '-', expectedOutput: '1 / 1 2 / 1 2 3 / 1 2 3 4 / 1 2 3 4 5', isHidden: false },
      ],
      10
    ).awardedMarks,
    10
  );

  // Set 1 - a. Sum of Two Numbers
  const sumTwoCode = `#include <stdio.h>
int main() {
  int a,b;
  scanf("%d%d",&a,&b);
  printf("%d",a+b);
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      sumTwoCode,
      'c',
      [
        { id: 'tc-1', input: '10 20', expectedOutput: '30', isHidden: false },
        { id: 'tc-2', input: '25 75', expectedOutput: '100', isHidden: true },
      ],
      10
    ).awardedMarks,
    10
  );

  // Set 1 - b. Find the Last Digit
  const lastDigitCode = `#include <stdio.h>
int main() {
  int n;
  scanf("%d",&n);
  printf("%d",n%10);
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      lastDigitCode,
      'c',
      [
        { id: 'tc-1', input: '1234', expectedOutput: '4', isHidden: false },
        { id: 'tc-2', input: '987', expectedOutput: '7', isHidden: true },
      ],
      10
    ).awardedMarks,
    10
  );

  // Set 2 - 3. Check Even or Odd
  const evenOddCode = `#include <stdio.h>
int main() {
  int n;
  scanf("%d", &n);
  if(n % 2 == 0) printf("Even");
  else printf("Odd");
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      evenOddCode,
      'c',
      [
        { id: 'tc-1', input: '4', expectedOutput: 'Even', isHidden: false },
        { id: 'tc-2', input: '7', expectedOutput: 'Odd', isHidden: true },
      ],
      10
    ).awardedMarks,
    10
  );

  // Set 2 - 4. Print Star Pattern
  const starCode = `#include <stdio.h>
int main() {
  int i,j;
  for(i=1;i<=3;i++) {
    for(j=1;j<=3;j++)
      printf("* ");
    printf("\\n");
  }
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      starCode,
      'c',
      [
        { id: 'tc-1', input: '-', expectedOutput: '* * * / * * * / * * *', isHidden: false },
      ],
      10
    ).awardedMarks,
    10
  );

  // Set 2 - c. Reverse a Number
  const reverseNumCode = `#include <stdio.h>
int main() {
  int n,rev=0;
  scanf("%d",&n);
  while(n>0) {
    rev=rev*10+n%10;
    n=n/10;
  }
  printf("%d",rev);
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      reverseNumCode,
      'c',
      [
        { id: 'tc-1', input: '12345', expectedOutput: '54321', isHidden: false },
        { id: 'tc-2', input: '908', expectedOutput: '809', isHidden: true },
      ],
      10
    ).awardedMarks,
    10
  );

  // Set 2 - d. Print Multiplication Table
  const multTableCode = `#include <stdio.h>
int main() {
  int n,i;
  scanf("%d",&n);
  for(i=1;i<=10;i++)
    printf("%d\\n",n*i);
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      multTableCode,
      'c',
      [
        { id: 'tc-1', input: '5', expectedOutput: '5 10 15 20 25 30 35 40 45 50', isHidden: false },
        { id: 'tc-2', input: '2', expectedOutput: '2 4 6 8 10 12 14 16 18 20', isHidden: true },
      ],
      10
    ).awardedMarks,
    10
  );

  // Set 3 - 5. Print Numbers from 1 to 10
  const oneToTenCode = `#include <stdio.h>
int main() {
  int i;
  for(i = 1; i <= 10; i++)
    printf("%d ", i);
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      oneToTenCode,
      'c',
      [
        { id: 'tc-1', input: '-', expectedOutput: '1 2 3 4 5 6 7 8 9 10', isHidden: false },
      ],
      10
    ).awardedMarks,
    10
  );

  // Set 3 - 6. Find Sum of Array Elements
  const arraySumCode = `#include <stdio.h>
int main() {
  int a[5], i, sum = 0;
  for(i = 0; i < 5; i++) scanf("%d", &a[i]);
  for(i = 0; i < 5; i++) sum = sum + a[i];
  printf("Sum = %d", sum);
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      arraySumCode,
      'c',
      [
        { id: 'tc-1', input: '10 20 30 40 50', expectedOutput: 'Sum = 150', isHidden: false },
        { id: 'tc-2', input: '1 2 3 4 5', expectedOutput: 'Sum = 15', isHidden: true },
      ],
      10
    ).awardedMarks,
    10
  );

  // Set 3 - e. Find the Length of a String
  const strLenCode = `#include <stdio.h>
int main() {
  char str[100];
  int i=0;
  scanf("%99s",str);
  while(str[i]!='\\0')
    i++;
  printf("%d",i);
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      strLenCode,
      'c',
      [
        { id: 'tc-1', input: 'Hello', expectedOutput: '5', isHidden: false },
        { id: 'tc-2', input: 'Programming', expectedOutput: '11', isHidden: true },
      ],
      10
    ).awardedMarks,
    10
  );

  // Set 3 - f. Print Fibonacci Series
  const fibSeriesCode = `#include <stdio.h>
int main() {
  int n,a=0,b=1,c,i;
  scanf("%d",&n);
  for(i=1;i<=n;i++) {
    printf("%d ",a);
    c=a+b;
    a=b;
    b=c;
  }
  return 0;
}`;
  assert.equal(
    evaluateProgrammingSubmission(
      fibSeriesCode,
      'c',
      [
        { id: 'tc-1', input: '6', expectedOutput: '0 1 1 2 3 5', isHidden: false },
        { id: 'tc-2', input: '5', expectedOutput: '0 1 1 2 3', isHidden: true },
      ],
      10
    ).awardedMarks,
    10
  );
});

test('questionPaperParser analyzes Input/Output formats, synthesizes test cases, and generates starter code skeletons (never solution code)', () => {
  const hardDrafts = createHardCProgramsDrafts();
  assert.equal(hardDrafts.length, 3);

  for (const q of hardDrafts) {
    assert.equal(q.type, 'programming');
    assert.equal(q.programmingLanguage, 'c');
    assert.ok(q.inputFormat.length > 10);
    assert.ok(q.outputFormat.length > 10);
    assert.ok(q.testCases.length >= 3);
    assert.ok(q.starterCode.includes('// TODO:'));
    // Starter code skeleton must NOT pass test cases on its own
    const starterEval = evaluateProgrammingSubmission(
      q.starterCode,
      q.programmingLanguage,
      q.testCases,
      q.marks
    );
    assert.equal(starterEval.awardedMarks, 0);
  }

  const mediumDrafts = createMediumCProgramsDrafts();
  assert.equal(mediumDrafts.length, 12);

  for (const q of mediumDrafts) {
    assert.equal(q.type, 'programming');
    assert.equal(q.programmingLanguage, 'c');
    assert.ok(q.inputFormat.length > 5);
    assert.ok(q.outputFormat.length > 5);
    assert.ok(q.testCases.length >= 1);
    assert.ok(q.starterCode.includes('// TODO:'));
    const starterEval = evaluateProgrammingSubmission(
      q.starterCode,
      q.programmingLanguage,
      q.testCases,
      q.marks
    );
    assert.equal(starterEval.awardedMarks, 0);
  }
});

test('mergeSharedPlatformState preserves Draft status on exams with questions and strips purged legacy IDs', async () => {
  const { mergeSharedPlatformState } = await import('../services/examStore.ts');
  const merged = mergeSharedPlatformState(
    {
      exams: [
        {
          id: 'exam-draft-1',
          title: 'Technical skill - 1',
          subjectId: 'sub-1',
          subjectName: 'C Programming',
          description: 'Draft exam hidden from students',
          scheduledDate: '2026-11-10',
          startTime: '10:00',
          durationMinutes: 90,
          totalMarks: 20,
          passingMarks: 10,
          instructions: 'Instructions',
          status: 'Draft',
          assignedStudentIds: [],
          assignedCohorts: ['A', 'L'],
          webcamProctoring: true,
          updatedAtMs: 1794085000000,
        },
      ],
      questions: [
        {
          id: 'q-valid-1',
          examId: 'exam-draft-1',
          subjectId: 'sub-1',
          type: 'mcq',
          text: 'Valid question for draft exam',
          marks: 20,
          difficulty: 'Medium',
          options: [
            { id: 'opt-a', label: 'A', text: '1' },
            { id: 'opt-b', label: 'B', text: '2' },
            { id: 'opt-c', label: 'C', text: '3' },
            { id: 'opt-d', label: 'D', text: '4' },
          ],
          correctOptionId: 'opt-a',
          updatedAtMs: 1794085000000,
        },
        {
          id: 'q-1793854326823-a32',
          examId: 'exam-draft-1',
          subjectId: 'sub-1',
          type: 'programming',
          text: 'Legacy broken question',
          marks: 15,
          difficulty: 'Hard',
          updatedAtMs: 1794085000000,
        },
      ],
    },
    {}
  );

  const draftExam = merged.exams.find((e) => e.id === 'exam-draft-1');
  assert.ok(draftExam);
  assert.equal(draftExam.status, 'Draft');
  assert.equal(merged.questions.some((q) => q.id === 'q-1793854326823-a32'), false);
  assert.equal(merged.questions.some((q) => q.id === 'q-valid-1'), true);
});

test('normalizeAndDedupeSections and mergeSharedPlatformState preserve cleared or individual student assignments without forcing Section A', async () => {
  const { normalizeAndDedupeSections, mergeSharedPlatformState } = await import(
    '../services/examStore.ts'
  );
  assert.deepEqual(normalizeAndDedupeSections([]), []);
  assert.deepEqual(normalizeAndDedupeSections(undefined), ['A']);

  const merged = mergeSharedPlatformState(
    {
      students: [
        {
          id: 'stu-a1',
          studentId: '2025PECA1',
          name: 'Student A1',
          email: 'a1@student.edu',
          department: 'AI & DS',
          year: 'Year 1',
          section: 'A',
          status: 'Active',
          createdAt: '2026-11-10',
          updatedAtMs: 1000,
        },
        {
          id: 'stu-a2',
          studentId: '2025PECA2',
          name: 'Student A2',
          email: 'a2@student.edu',
          department: 'AI & DS',
          year: 'Year 1',
          section: 'A',
          status: 'Active',
          createdAt: '2026-11-10',
          updatedAtMs: 1000,
        },
      ],
      exams: [
        {
          id: 'exam-custom-assign',
          title: 'Custom Matrix Exam',
          subjectId: 'sub-1',
          subjectName: 'C Programming',
          description: 'Only stu-a1 is assigned',
          scheduledDate: '2026-11-10',
          startTime: '10:00',
          durationMinutes: 60,
          totalMarks: 50,
          passingMarks: 25,
          instructions: 'Instructions',
          status: 'Published',
          assignedStudentIds: ['stu-a1'],
          assignedCohorts: [],
          webcamProctoring: true,
          updatedAtMs: 2000,
        },
      ],
    },
    {}
  );

  const customExam = merged.exams.find((e) => e.id === 'exam-custom-assign');
  assert.ok(customExam);
  assert.deepEqual(customExam.assignedCohorts, []);
  assert.deepEqual(customExam.assignedStudentIds, ['stu-a1']);
});

test('formatQuestionPromptForDisplay preserves user-typed multi-line code as-is and formats flattened single-line C code into multi-line structure', () => {
  // 1. User-typed multi-line MCQ with C code in Question Box
  const userTypedMultiLine = `What will be the output of the following C code?

#include <stdio.h>
int main() {
    int y = 10000;
    int y = 34;
    printf("Hello World! %d\\n", y);
    return 0;
}`;
  assert.equal(formatQuestionPromptForDisplay(userTypedMultiLine), userTypedMultiLine);

  // 2. Flattened single-line C code from legacy or single-line PDF extraction
  const flattenedSingleLine =
    'What will be the output of the following C code? #include <stdio.h> int main() { int y = 10000; int y = 34; printf("Hello World! %d\\n", y); return 0; }';
  const formatted = formatQuestionPromptForDisplay(flattenedSingleLine);
  assert.ok(formatted.includes('What will be the output of the following C code?\n\n#include <stdio.h>\nint main() {'));
  assert.ok(formatted.includes('    int y = 10000;\n    int y = 34;\n    printf("Hello World! %d\\n", y);\n    return 0;\n}'));
});

test('parseQuestionsFromText and parseQuestionsFromCsv accurately parse MCQs containing multi-line C code and options', () => {
  const sampleMcqWithCodeText = `
Q1. [MCQ] [10 Marks] [Difficulty: Easy] What will be the output of the following C code?
#include <stdio.h>
int main() {
    int y = 10000;
    int y = 34;
    printf("Hello World! %d\\n", y);
    return 0;
}
A) Compile time error
B) Hello World! 34
C) Hello World! 1000
D) Hello World! followed by a junk value
Answer: A
Explanation: Redefinition of variable y in the same scope causes a compile time error.
`;

  const parsedFromText = parseQuestionsFromText(sampleMcqWithCodeText);
  assert.equal(parsedFromText.length, 1);
  assert.equal(parsedFromText[0].type, 'mcq');
  assert.equal(parsedFromText[0].optA, 'Compile time error');
  assert.equal(parsedFromText[0].optB, 'Hello World! 34');
  assert.equal(parsedFromText[0].optC, 'Hello World! 1000');
  assert.equal(parsedFromText[0].optD, 'Hello World! followed by a junk value');
  assert.equal(parsedFromText[0].correctOpt, 'opt-a');
  assert.ok(parsedFromText[0].text.includes('#include <stdio.h>\nint main() {'));
  assert.ok(parsedFromText[0].text.includes('    int y = 10000;'));

  // Multi-line quoted CSV cell containing C code
  const csvWithMultiLineCode = `Type,Marks,Difficulty,QuestionText,OptionA,OptionB,OptionC,OptionD,CorrectOption,ExplanationOrRubric
mcq,10,Easy,"What will be the output of the following C code?
#include <stdio.h>
int main() {
    int y = 10000;
    int y = 34;
    printf(""Hello World! %d\\n"", y);
    return 0;
}",Compile time error,Hello World! 34,Hello World! 1000,Hello World! followed by a junk value,A,Variable y is redefined`;

  const parsedFromCsv = parseQuestionsFromCsv(csvWithMultiLineCode);
  assert.equal(parsedFromCsv.length, 1);
  assert.equal(parsedFromCsv[0].type, 'mcq');
  assert.equal(parsedFromCsv[0].optA, 'Compile time error');
  assert.equal(parsedFromCsv[0].correctOpt, 'opt-a');
  assert.ok(parsedFromCsv[0].text.includes('#include <stdio.h>\nint main() {'));
});

test('sortStudentsBySectionAndName and mergeSharedPlatformState automatically place students in Section-wise (A→L) and Name-wise (A→Z) order by default', async () => {
  const { sortStudentsBySectionAndName, mergeSharedPlatformState } = await import(
    '../services/examStore.ts'
  );

  const unsorted = [
    { id: 's1', studentId: '2025C02', name: 'Zara Khan', section: 'C' },
    { id: 's2', studentId: '2025A03', name: 'Meera Nair', section: 'A' },
    { id: 's3', studentId: '2025B01', name: 'Karthik Raj', section: 'B' },
    { id: 's4', studentId: '2025A01', name: 'Arun Kumar', section: 'Section A' },
    { id: 's5', studentId: '2025A02', name: 'Arun Kumar', section: 'a' },
    { id: 's6', studentId: '2025C01', name: 'Bala Murugan', section: 'C' },
    { id: 's7', studentId: '2025B02', name: 'Ananya Sharma', section: 'B' },
  ];

  const sorted = sortStudentsBySectionAndName(unsorted);
  assert.deepEqual(
    sorted.map((s) => `${s.studentId}:${s.name}`),
    [
      '2025A01:Arun Kumar',
      '2025A02:Arun Kumar',
      '2025A03:Meera Nair',
      '2025B02:Ananya Sharma',
      '2025B01:Karthik Raj',
      '2025C01:Bala Murugan',
      '2025C02:Zara Khan',
    ]
  );

  // Verify mergeSharedPlatformState automatically places a newly added student into their exact Section + Name slot
  const merged = mergeSharedPlatformState(
    {
      students: [
        {
          id: 'stu-c1',
          studentId: '2025C10',
          name: 'Vikram',
          email: 'vikram@student.edu',
          department: 'CSE',
          year: 'Year 1',
          section: 'C',
          status: 'Active',
          createdAt: '2026-11-10',
          updatedAtMs: 1000,
        },
        {
          id: 'stu-a2',
          studentId: '2025A20',
          name: 'Divya',
          email: 'divya@student.edu',
          department: 'CSE',
          year: 'Year 1',
          section: 'A',
          status: 'Active',
          createdAt: '2026-11-10',
          updatedAtMs: 1000,
        },
      ],
    },
    {
      students: [
        {
          id: 'stu-a1',
          studentId: '2025A05',
          name: 'Aarav',
          email: 'aarav@student.edu',
          department: 'CSE',
          year: 'Year 1',
          section: 'A',
          status: 'Active',
          createdAt: '2026-11-11',
          updatedAtMs: 2000,
        },
        {
          id: 'stu-b1',
          studentId: '2025B01',
          name: 'Bhavna',
          email: 'bhavna@student.edu',
          department: 'CSE',
          year: 'Year 1',
          section: 'B',
          status: 'Active',
          createdAt: '2026-11-11',
          updatedAtMs: 2000,
        },
      ],
    }
  );

  assert.deepEqual(
    merged.students.map((s) => `${s.section}:${s.name}`),
    ['A:Aarav', 'A:Divya', 'B:Bhavna', 'C:Vikram']
  );
});

test('isCleanReadableText and sanitizeExtractedText preserve standalone code braces and symbol lines while rejecting binary mojibake', () => {
  assert.equal(isCleanReadableText('{'), true);
  assert.equal(isCleanReadableText('}'), true);
  assert.equal(isCleanReadableText('};'), true);
  assert.equal(isCleanReadableText('* * *'), true);
  assert.equal(isCleanReadableText('\u0000\u0001\u00FF\u00FE\uFFFD'), false);

  const rawCodeMcq = [
    'Q1. [MCQ] [5 Marks] What is the output of this C program?',
    '#include <stdio.h>',
    'int main()',
    '{',
    '    printf("* * *\\n");',
    '    return 0;',
    '}',
    'A) * * *',
    'B) Error',
    'C) Nothing',
    'D) 0',
    'Answer: A',
  ].join('\n');

  const sanitized = sanitizeExtractedText(rawCodeMcq);
  assert.ok(sanitized.includes('\n{\n'));
  assert.ok(sanitized.includes('\n}\n'));

  const parsed = parseQuestionsFromText(sanitized);
  assert.equal(parsed.length, 1);
  assert.ok(parsed[0].text.includes('{'));
  assert.ok(parsed[0].text.includes('}'));
  assert.equal(parsed[0].optA, '* * *');
});

test('ServerAdminAuthService enforces scrypt hashing, dynamic Admin Settings email, Bearer sessions, and zero-leak OTP reset', async () => {
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const { ServerAdminAuthService } = await import('../../serverAuth.ts');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'examflow-auth-test-'));
  const prevEnvPass = process.env.ADMIN_INITIAL_PASSWORD;
  const prevSmtpUser = process.env.SMTP_USER;
  const prevSmtpPass = process.env.SMTP_PASS;

  try {
    delete process.env.ADMIN_INITIAL_PASSWORD;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const auth = new ServerAdminAuthService(tmpDir);

    // 1. Fresh instance requires one-time initial password setup
    assert.equal(auth.needsInitialSetup(), true);
    const shortPass = auth.setupInitialPassword('tarunkumarv2008@gmail.com', 'short', 'short');
    assert.equal(shortPass.ok, false);

    const setup = auth.setupInitialPassword('tarunkumarv2008@gmail.com', 'StrongInit#2026', 'StrongInit#2026');
    assert.equal(setup.ok, true);
    assert.ok(setup.token && setup.token.length === 64);
    assert.equal(auth.needsInitialSetup(), false);

    // Second setup attempt must be permanently blocked
    const secondSetup = auth.setupInitialPassword('attacker@evil.com', 'HackedPass99', 'HackedPass99');
    assert.equal(secondSetup.ok, false);

    // Stored file must NEVER contain plaintext password
    const savedRaw = fs.readFileSync(path.join(tmpDir, 'examflow_admin_auth.json'), 'utf8');
    assert.equal(savedRaw.includes('StrongInit#2026'), false);

    // 2. Login rejects wrong password & unauthorized email, accepts owner email and dynamic Admin Settings email
    assert.equal(auth.loginAdmin('admin', 'admin123', '127.0.0.1').ok, false);
    assert.equal(auth.loginAdmin('random@evil.com', 'StrongInit#2026', '127.0.0.1').ok, false);

    const loginOk = auth.loginAdmin('tarunkumarv2008@gmail.com', 'StrongInit#2026', '127.0.0.1');
    assert.equal(loginOk.ok, true);
    assert.ok(loginOk.token);

    // Updating Admin Settings email dynamically authorizes the new email alongside owner email
    auth.syncRecoveryEmail('principal.exam@college.edu');
    const customEmailLogin = auth.loginAdmin(
      'principal.exam@college.edu',
      'StrongInit#2026',
      '127.0.0.1',
      'principal.exam@college.edu'
    );
    assert.equal(customEmailLogin.ok, true);
    assert.ok(auth.verifyBearerHeader(`Bearer ${customEmailLogin.token}`));
    assert.equal(auth.verifyBearerHeader('Bearer invalid-token'), null);

    // 3. Unrequested OTP must be rejected
    const unrequested = auth.verifyOtpAndResetPassword('123456', 'NewSecret#99', 'NewSecret#99');
    assert.equal(unrequested.ok, false);

    // Unauthorized email must be rejected by SMTP OTP request (even when SMTP env vars are set)
    process.env.SMTP_USER = 'sender@example.com';
    process.env.SMTP_PASS = 'app-password';
    const unauthorizedOtp = await auth.requestOtpViaSmtp('hacker@evil.com', 'principal.exam@college.edu');
    assert.equal(unauthorizedOtp.ok, false);
    assert.equal(unauthorizedOtp.statusCode, 403);

    // 4. Issued OTP rejects wrong code, accepts exact code, updates password, is one-time use, and revokes old sessions
    const otpCode = auth._issueTestOtpForUnitTests('principal.exam@college.edu');
    assert.match(otpCode, /^\d{6}$/);

    const wrongOtp = auth.verifyOtpAndResetPassword(
      otpCode === '000000' ? '111111' : '000000',
      'ResetSecret#2026',
      'ResetSecret#2026'
    );
    assert.equal(wrongOtp.ok, false);

    const validReset = auth.verifyOtpAndResetPassword(
      otpCode,
      'ResetSecret#2026',
      'ResetSecret#2026',
      'principal.exam@college.edu'
    );
    assert.equal(validReset.ok, true);

    // Old sessions must be revoked immediately after password reset
    assert.equal(auth.verifyBearerHeader(`Bearer ${loginOk.token}`), null);
    assert.equal(auth.verifyBearerHeader(`Bearer ${customEmailLogin.token}`), null);

    // OTP cannot be reused
    const reuseOtp = auth.verifyOtpAndResetPassword(otpCode, 'AnotherPass#1', 'AnotherPass#1');
    assert.equal(reuseOtp.ok, false);

    // Old password rejected, new password accepted
    assert.equal(auth.loginAdmin('admin', 'StrongInit#2026', '127.0.0.1').ok, false);
    const postResetLogin = auth.loginAdmin(
      'principal.exam@college.edu',
      'ResetSecret#2026',
      '127.0.0.1',
      'principal.exam@college.edu'
    );
    assert.equal(postResetLogin.ok, true);

    // 5. Authenticated password change rotates session tokens
    const unauthChange = auth.changePasswordAuthenticated(undefined, 'ResetSecret#2026', 'Rotated#2026', 'Rotated#2026');
    assert.equal(unauthChange.ok, false);
    assert.equal(unauthChange.statusCode, 401);

    const authChange = auth.changePasswordAuthenticated(
      `Bearer ${postResetLogin.token}`,
      'ResetSecret#2026',
      'Rotated#2026',
      'Rotated#2026',
      'principal.exam@college.edu'
    );
    assert.equal(authChange.ok, true);
    assert.ok(authChange.token && authChange.token !== postResetLogin.token);
    assert.equal(auth.verifyBearerHeader(`Bearer ${postResetLogin.token}`), null);
    assert.ok(auth.verifyBearerHeader(`Bearer ${authChange.token}`));
  } finally {
    if (prevEnvPass === undefined) delete process.env.ADMIN_INITIAL_PASSWORD;
    else process.env.ADMIN_INITIAL_PASSWORD = prevEnvPass;
    if (prevSmtpUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = prevSmtpUser;
    if (prevSmtpPass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = prevSmtpPass;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});




