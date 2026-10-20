import { DashboardData, ExpenseItem, ScheduledExpense, AppSettings } from './types';

const STORAGE_KEY = 'pastoral_expense_db_v2';

/**
 * 브라우저(Vercel 배포 환경 등)에서도 동일하게 작동하는 로컬 저장소 및 문자 파서
 * - 왜 필요한가: 깃허브(GitHub)에 올려 버셀(Vercel)로 배포했을 때 별도 유료 DB 서버 설정 없이도
 *   내 아이폰/PC에서 즉시 작동하도록 백엔드 API와 브라우저 저장소를 모두 지원합니다.
 */
function getLocalDb(): {
  settings: AppSettings;
  expenses: ExpenseItem[];
  scheduledExpenses: ScheduledExpense[];
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  const initial = {
    settings: {
      yearlyBudget: 3000000,
      targetKeywords: ['하나7693'],
    },
    expenses: [
      {
        id: 'exp-initial-1',
        dateTime: '2026-10-10 19:30',
        displayDate: '10/10 19:30',
        year: '2026',
        merchant: '카페하루',
        amount: 6600,
        rawSms: '[Web발신]\n하나7693승인 김*욱 6,600원 일시불 10/10 19:30  카페하루',
      },
    ],
    scheduledExpenses: [
      {
        id: 'sched-initial-1',
        year: '2026',
        title: '달러 자동이체 예정 (예시)',
        estimatedAmount: 30000,
      },
    ],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function saveLocalDb(db: ReturnType<typeof getLocalDb>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

/**
 * 클라이언트 내장 문자 추출기 (하나7693 등 문자에서 일시, 금액, 사용처 추출)
 */
export function parseSmsInBrowser(rawSms: string, keywords: string[]) {
  const cleaned = rawSms.trim();
  if (!cleaned) return null;

  if (keywords.length > 0) {
    const normSms = cleaned.replace(/\s+/g, '');
    const matched = keywords.some((k) => normSms.includes(k.replace(/\s+/g, '')));
    if (!matched) return null;
  }

  const body = cleaned
    .replace(/\[(?:Web|웹|국외)발신\]/gi, ' ')
    .replace(/누적\s*:?\s*[\d,]+\s*원?/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();

  const isCancel = /취소/.test(body);
  const amountMatch = body.match(/([+-]?[\d,]+)\s*원/);
  if (!amountMatch) return null;

  const num = parseInt(amountMatch[1].replace(/,/g, ''), 10);
  if (isNaN(num)) return null;
  const amount = isCancel && num > 0 ? -num : num;

  const dateTimeRegex =
    /(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])(?!\d)(?:\s+([012]?\d:[0-5]\d))?/;
  const dateMatch = body.match(dateTimeRegex);

  const year = '2026';
  let mm = '10';
  let dd = '10';
  let time = '00:00';

  if (dateMatch) {
    mm = dateMatch[1].padStart(2, '0');
    dd = dateMatch[2].padStart(2, '0');
    time = dateMatch[3] ? dateMatch[3].padStart(5, '0') : '00:00';
  }

  let merchant = '';
  if (dateMatch && dateMatch.index !== undefined) {
    merchant = body
      .slice(dateMatch.index + dateMatch[0].length)
      .replace(/([+-]?[\d,]+)\s*원/g, ' ')
      .replace(/\b(?:일시불|할부|\d+개월|승인|취소|출금|체크)\b/g, ' ')
      .trim();
  }
  merchant = merchant.replace(/\s+/g, ' ').trim() || '기타사용처';

  return {
    dateTime: `${year}-${mm}-${dd} ${time}`,
    displayDate: `${mm}/${dd} ${time}`,
    year,
    merchant,
    amount,
    rawSms: cleaned,
  };
}

function buildDashboardFromLocal(year = '2026'): DashboardData {
  const db = getLocalDb();
  const yearlyBudget = db.settings.yearlyBudget;
  const expenses = db.expenses.filter((e) => e.year === year);
  const scheduledExpenses = db.scheduledExpenses.filter((s) => s.year === year);

  const actualSpent = expenses.reduce((sum, item) => sum + item.amount, 0);
  const pendingScheduledSpent = scheduledExpenses
    .filter((s) => !s.replacedByExpenseId)
    .reduce((sum, item) => sum + item.estimatedAmount, 0);

  return {
    year,
    yearlyBudget,
    actualSpent,
    pendingScheduledSpent,
    remainingBudget: yearlyBudget - (actualSpent + pendingScheduledSpent),
    expenses,
    scheduledExpenses,
    settings: db.settings,
  };
}

export const api = {
  getDashboard: async (year = '2026'): Promise<DashboardData> => {
    try {
      const res = await fetch(`/api/dashboard?year=${year}`);
      if (res.ok) return await res.json();
    } catch {
      // Vercel 정적 배포 환경일 경우 브라우저 저장소 사용
    }
    return buildDashboardFromLocal(year);
  },

  submitSms: async (message: string, bypassFilter = false) => {
    try {
      const res = await fetch('/api/sms/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, bypassFilter }),
      });
      if (res.ok) return await res.json();
    } catch {
      // fallback
    }

    const db = getLocalDb();
    const chunks = message
      .split(/(?=\[(?:Web|웹|국외)발신\])/i)
      .map((c) => c.trim())
      .filter(Boolean);

    let addedCount = 0;
    for (const chunk of chunks) {
      const parsed = parseSmsInBrowser(
        chunk,
        bypassFilter ? [] : db.settings.targetKeywords
      );
      if (!parsed) continue;
      const dup = db.expenses.find(
        (e) =>
          e.dateTime === parsed.dateTime &&
          e.amount === parsed.amount &&
          e.merchant === parsed.merchant
      );
      if (dup) continue;
      db.expenses.unshift({
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ...parsed,
      });
      addedCount++;
    }
    saveLocalDb(db);
    return { success: true, addedCount, message: `${addedCount}건 등록 완료` };
  },

  replaceScheduledWithExpense: async (
    expenseId: string,
    scheduledId: string | null
  ) => {
    try {
      const res = await fetch(`/api/expenses/${expenseId}/replace-scheduled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledId }),
      });
      if (res.ok) return await res.json();
    } catch {
      // fallback
    }

    const db = getLocalDb();
    const exp = db.expenses.find((e) => e.id === expenseId);
    if (!exp) return { success: false };

    if (exp.replacedScheduledId) {
      const prev = db.scheduledExpenses.find((s) => s.id === exp.replacedScheduledId);
      if (prev) prev.replacedByExpenseId = undefined;
      exp.replacedScheduledId = undefined;
    }

    if (scheduledId) {
      const target = db.scheduledExpenses.find((s) => s.id === scheduledId);
      if (target) {
        if (target.replacedByExpenseId) {
          const oldExp = db.expenses.find((e) => e.id === target.replacedByExpenseId);
          if (oldExp) oldExp.replacedScheduledId = undefined;
        }
        target.replacedByExpenseId = exp.id;
        exp.replacedScheduledId = target.id;
      }
    }
    saveLocalDb(db);
    return { success: true };
  },

  deleteExpense: async (id: string) => {
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (res.ok) return await res.json();
    } catch {
      // fallback
    }
    const db = getLocalDb();
    const target = db.expenses.find((e) => e.id === id);
    if (target?.replacedScheduledId) {
      const s = db.scheduledExpenses.find((x) => x.id === target.replacedScheduledId);
      if (s) s.replacedByExpenseId = undefined;
    }
    db.expenses = db.expenses.filter((e) => e.id !== id);
    saveLocalDb(db);
    return { success: true };
  },

  addScheduled: async (title: string, estimatedAmount: number, year = '2026') => {
    try {
      const res = await fetch('/api/scheduled-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, title, estimatedAmount }),
      });
      if (res.ok) return await res.json();
    } catch {
      // fallback
    }
    const db = getLocalDb();
    const item: ScheduledExpense = {
      id: `sched-${Date.now()}`,
      year,
      title,
      estimatedAmount,
    };
    db.scheduledExpenses.push(item);
    saveLocalDb(db);
    return item;
  },

  updateScheduled: async (id: string, payload: Partial<ScheduledExpense>) => {
    try {
      const res = await fetch(`/api/scheduled-expenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return await res.json();
    } catch {
      // fallback
    }
    const db = getLocalDb();
    const idx = db.scheduledExpenses.findIndex((s) => s.id === id);
    if (idx !== -1) {
      db.scheduledExpenses[idx] = { ...db.scheduledExpenses[idx], ...payload };
      saveLocalDb(db);
    }
    return db.scheduledExpenses[idx];
  },

  deleteScheduled: async (id: string) => {
    try {
      const res = await fetch(`/api/scheduled-expenses/${id}`, { method: 'DELETE' });
      if (res.ok) return await res.json();
    } catch {
      // fallback
    }
    const db = getLocalDb();
    for (const e of db.expenses) {
      if (e.replacedScheduledId === id) e.replacedScheduledId = undefined;
    }
    db.scheduledExpenses = db.scheduledExpenses.filter((s) => s.id !== id);
    saveLocalDb(db);
    return { success: true };
  },

  updateSettings: async (payload: Partial<AppSettings>) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return await res.json();
    } catch {
      // fallback
    }
    const db = getLocalDb();
    db.settings = { ...db.settings, ...payload };
    saveLocalDb(db);
    return db.settings;
  },
};
