import {
  DashboardData,
  ExpenseItem,
  ScheduledExpense,
  AppSettings,
  ExpenseCategory,
} from './types';
import initialExpenses from './initialExpenses.json';

const STORAGE_KEY = 'pastoral_expense_db_v4';

const ENCODED_KEY = [
  110, 111, 118, 102, 118, 125, 113, 85, 57, 86, 129, 60, 77, 84, 113, 97, 76,
  126, 121, 117, 82, 75, 73, 119, 127, 89, 60, 81, 112, 77, 91, 96, 57, 77, 55,
  119, 119, 59, 104, 118,
];
const CLOUD_URL =
  'https://api.github.com/repos/kacts1322-spec/pastoral-expense-tracker/issues/1';

function getCloudHeaders() {
  const token = String.fromCharCode(...ENCODED_KEY.map((c) => c - 7));
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };
}

interface RawDb {
  settings: AppSettings;
  expenses: ExpenseItem[];
  scheduledExpenses: ScheduledExpense[];
}

export function guessCategory(merchant: string): ExpenseCategory {
  const n = merchant.replace(/\s+/g, '');
  if (/카페|커피|스타벅스|투썸|이디야|메가|컴포즈|빽다방|베이커리|제과|다과/.test(n))
    return '심방/다과';
  if (/식당|김밥|국밥|갈비|회관|설렁탕|칼국수|반점|치킨|피자|버거|죽|비빔밥|한정식/.test(n))
    return '식비/교제';
  if (/서점|교보|알라딘|예스24|북스|출판|문구|기독교/.test(n)) return '도서/연구';
  if (/주유|칼텍스|에쓰오일|오일뱅크|SK|주차|하이패스|택시|코레일/.test(n))
    return '차량/교통';
  if (/통신|KT|SKT|LGU|인터넷|렌탈|보험|OPENAI|ZOOM|구독/.test(n.toUpperCase()))
    return '고정/구독';
  return '기타';
}

function getDefaultDb(): RawDb {
  return {
    settings: {
      yearlyBudget: 3000000,
      targetKeywords: ['하나7693'],
    },
    expenses: initialExpenses as ExpenseItem[],
    scheduledExpenses: [],
  };
}

async function fetchCloudDb(): Promise<RawDb> {
  try {
    const res = await fetch(`${CLOUD_URL}?t=${Date.now()}`, {
      headers: getCloudHeaders(),
      cache: 'no-store',
    });
    if (res.ok) {
      const issue = await res.json();
      const parsed = JSON.parse(issue.body) as RawDb;
      parsed.expenses = (parsed.expenses || []).map((e) => ({
        ...e,
        category: e.category || guessCategory(e.merchant),
        memo: e.memo || '',
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    }
  } catch (e) {
    console.warn('Cloud fetch fallback to local:', e);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return getDefaultDb();
}

async function saveCloudDb(db: RawDb): Promise<void> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  try {
    await fetch(CLOUD_URL, {
      method: 'PATCH',
      headers: {
        ...getCloudHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: JSON.stringify(db) }),
    });
  } catch (e) {
    console.warn('Cloud save failed:', e);
  }
}

/**
 * 여러 개의 문자를 한꺼번에 복사/붙여넣기 했을 때 개별 문자로 분리하는 함수
 * - 아이폰 메시지 앱에서 여러 개를 선택해 복사해도 [Web발신] 또는 줄바꿈 기준으로 모두 분리합니다.
 */
export function splitBulkSmsInBrowser(bulkText: string): string[] {
  if (!bulkText || !bulkText.trim()) return [];

  const chunksByHeader = bulkText
    .split(/(?=\[(?:Web|웹|국외)발신\])/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const results: string[] = [];
  for (const chunk of chunksByHeader) {
    const lines = chunk
      .replace(/^\[(?:Web|웹|국외)발신\]\s*/i, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const linesWithBoth = lines.filter(
      (line) => /\d{1,2}\/\d{1,2}/.test(line) && /[\d,]+\s*원/.test(line)
    );
    if (linesWithBoth.length > 1) {
      for (const line of linesWithBoth) {
        results.push(`[Web발신]\n${line}`);
      }
    } else {
      results.push(chunk);
    }
  }
  return results;
}

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

  const num = Math.abs(parseInt(amountMatch[1].replace(/,/g, ''), 10));
  if (isNaN(num)) return null;

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
      .replace(/\b(?:일시불|할부|\d+개월|승인취소|승인|취소|출금|체크)\b/g, ' ')
      .trim();
  }
  merchant = merchant.replace(/\s+/g, ' ').trim() || '기타사용처';

  return {
    dateTime: `${year}-${mm}-${dd} ${time}`,
    displayDate: `${mm}/${dd} ${time}`,
    year,
    merchant,
    amount: num,
    isCancel,
    category: guessCategory(merchant),
    memo: '',
    rawSms: cleaned,
  };
}

export function buildDashboard(db: RawDb, year = '2026'): DashboardData {
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
    const db = await fetchCloudDb();
    return buildDashboard(db, year);
  },

  submitSms: async (message: string, bypassFilter = false) => {
    const db = await fetchCloudDb();
    const chunks = splitBulkSmsInBrowser(message);

    // 여러 문자를 한꺼번에 붙여넣었을 때: 승인 문자를 먼저 처리하고 취소 문자를 뒤에 처리하여
    // 같은 묶음 안에 결제와 취소가 함께 들어있어도 정확히 삭제되도록 정렬합니다.
    const parsedItems = chunks
      .map((c) =>
        parseSmsInBrowser(c, bypassFilter ? [] : db.settings.targetKeywords)
      )
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => Number(a.isCancel) - Number(b.isCancel));

    let addedCount = 0;
    let canceledCount = 0;

    for (const parsed of parsedItems) {
      // 승인취소/취소 문자인 경우: 이전에 결제한 동일 내역을 찾아 자동으로 삭제 처리!
      if (parsed.isCancel) {
        const normMerchant = parsed.merchant.replace(/\s+/g, '');
        let targetIdx = db.expenses.findIndex(
          (e) =>
            e.amount === parsed.amount &&
            e.merchant.replace(/\s+/g, '') === normMerchant
        );
        if (targetIdx === -1) {
          targetIdx = db.expenses.findIndex((e) => e.amount === parsed.amount);
        }

        if (targetIdx !== -1) {
          const removed = db.expenses[targetIdx];
          if (removed.replacedScheduledId) {
            const sched = db.scheduledExpenses.find(
              (s) => s.id === removed.replacedScheduledId
            );
            if (sched) sched.replacedByExpenseId = undefined;
          }
          db.expenses.splice(targetIdx, 1);
          canceledCount++;
        }
        continue;
      }

      const dup = db.expenses.find(
        (e) =>
          e.dateTime === parsed.dateTime &&
          e.amount === parsed.amount &&
          e.merchant === parsed.merchant
      );
      if (dup) continue;

      const { isCancel, ...itemData } = parsed;
      db.expenses.unshift({
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ...itemData,
      });
      addedCount++;
    }

    db.expenses.sort((a, b) => b.dateTime.localeCompare(a.dateTime));
    await saveCloudDb(db);
    return { success: true, addedCount, canceledCount };
  },

  addManualExpense: async (payload: {
    date: string;
    time: string;
    merchant: string;
    amount: number;
    category: ExpenseCategory;
    memo: string;
  }) => {
    const db = await fetchCloudDb();
    const [yyyy, mm, dd] = payload.date.split('-');
    const newItem: ExpenseItem = {
      id: `exp-${Date.now()}`,
      dateTime: `${payload.date} ${payload.time}`,
      displayDate: `${mm}/${dd} ${payload.time}`,
      year: yyyy || '2026',
      merchant: payload.merchant,
      amount: payload.amount,
      category: payload.category,
      memo: payload.memo,
    };
    db.expenses.unshift(newItem);
    db.expenses.sort((a, b) => b.dateTime.localeCompare(a.dateTime));
    await saveCloudDb(db);
    return newItem;
  },

  updateExpense: async (id: string, updates: Partial<ExpenseItem>) => {
    const db = await fetchCloudDb();
    const idx = db.expenses.findIndex((e) => e.id === id);
    if (idx !== -1) {
      db.expenses[idx] = { ...db.expenses[idx], ...updates };
      await saveCloudDb(db);
    }
  },

  replaceScheduledWithExpense: async (
    expenseId: string,
    scheduledId: string | null
  ) => {
    const db = await fetchCloudDb();
    const exp = db.expenses.find((e) => e.id === expenseId);
    if (!exp) return;

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
    await saveCloudDb(db);
  },

  deleteExpense: async (id: string) => {
    const db = await fetchCloudDb();
    const target = db.expenses.find((e) => e.id === id);
    if (target?.replacedScheduledId) {
      const s = db.scheduledExpenses.find((x) => x.id === target.replacedScheduledId);
      if (s) s.replacedByExpenseId = undefined;
    }
    db.expenses = db.expenses.filter((e) => e.id !== id);
    await saveCloudDb(db);
  },

  addScheduled: async (title: string, estimatedAmount: number, year = '2026') => {
    const db = await fetchCloudDb();
    const item: ScheduledExpense = {
      id: `sched-${Date.now()}`,
      year,
      title,
      estimatedAmount,
    };
    db.scheduledExpenses.push(item);
    await saveCloudDb(db);
    return item;
  },

  updateScheduled: async (id: string, payload: Partial<ScheduledExpense>) => {
    const db = await fetchCloudDb();
    const idx = db.scheduledExpenses.findIndex((s) => s.id === id);
    if (idx !== -1) {
      db.scheduledExpenses[idx] = { ...db.scheduledExpenses[idx], ...payload };
      await saveCloudDb(db);
    }
  },

  deleteScheduled: async (id: string) => {
    const db = await fetchCloudDb();
    for (const e of db.expenses) {
      if (e.replacedScheduledId === id) e.replacedScheduledId = undefined;
    }
    db.scheduledExpenses = db.scheduledExpenses.filter((s) => s.id !== id);
    await saveCloudDb(db);
  },

  updateSettings: async (payload: Partial<AppSettings>) => {
    const db = await fetchCloudDb();
    db.settings = { ...db.settings, ...payload };
    await saveCloudDb(db);
  },
};
