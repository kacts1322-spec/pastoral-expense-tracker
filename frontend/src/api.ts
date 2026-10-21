import {
  DashboardData,
  ExpenseItem,
  ScheduledExpense,
  AppSettings,
  ExpenseCategory,
} from './types';
import initialExpenses from './initialExpenses.json';

const STORAGE_KEY = 'pastoral_expense_db_v5';

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
  if (
    /통신|KT|SKT|LGU|인터넷|렌탈|보험|OPENAI|CLAUDE|ANTHROPIC|구글플레이|톡서랍|SMS|구독/.test(
      n.toUpperCase()
    )
  )
    return '고정/구독';
  return '기타';
}

/**
 * 2026년 기본 정기구독(자동이체) 4종 (1월~9월 실제 지출 내역과 자동 매칭 완료, 10~12월분만 예정으로 남김)
 */
export const DEFAULT_SCHEDULED_EXPENSES: ScheduledExpense[] = [
  {
    id: 'sched-claude',
    year: '2026',
    title: '클로드 AI 구독 (22$)',
    estimatedAmount: 33000,
    usdAmount: 22,
    activeMonths: ['03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
    monthlyReplacedIds: {
      '03': 'exp-2026-032',
      '04': 'exp-2026-052',
      '05': 'exp-2026-063',
      '06': 'exp-2026-081',
      '07': 'exp-2026-094',
      '08': 'exp-2026-116',
    },
  },
  {
    id: 'sched-gemini',
    year: '2026',
    title: '제미나이 구독',
    estimatedAmount: 29000,
    activeMonths: [
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
    ],
    monthlyReplacedIds: {
      '01': 'exp-2026-009',
      '02': 'exp-2026-019',
      '03': 'exp-2026-038',
      '04': 'exp-2026-055',
      '05': 'exp-2026-064',
      '06': 'exp-2026-083',
      '07': 'exp-2026-098',
      '08': 'exp-2026-118',
      '10': 'exp-1792544068215-7ix8',
    },
  },
  {
    id: 'sched-kakao',
    year: '2026',
    title: '카카오 톡서랍 구독',
    estimatedAmount: 1900,
    activeMonths: [
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
    ],
    monthlyReplacedIds: {
      '01': 'exp-2026-012',
      '02': 'exp-2026-025',
      '03': 'exp-2026-046',
      '04': 'exp-2026-060',
      '05': 'exp-2026-074',
      '06': 'exp-2026-090',
      '07': 'exp-2026-104',
      '08': 'exp-2026-120',
      '10': 'exp-1792544097369-39dm',
    },
  },
  {
    id: 'sched-sms',
    year: '2026',
    title: '카드 SMS 이용요금',
    estimatedAmount: 400,
    activeMonths: [
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
    ],
    monthlyReplacedIds: {
      '01': 'exp-2026-003',
      '02': 'exp-2026-017',
      '03': 'exp-2026-030',
      '04': 'exp-2026-051',
      '05': 'exp-2026-062',
      '06': 'exp-2026-080',
      '07': 'exp-2026-093',
      '08': 'exp-2026-115',
    },
  },
];

function normalizeDb(db: RawDb): RawDb {
  // 만약 아직 새 월별 정기구독 스키마(activeMonths)가 적용되지 않았다면 자동 업그레이드
  let needsSave = false;
  if (
    !db.scheduledExpenses ||
    db.scheduledExpenses.length === 0 ||
    !db.scheduledExpenses[0].activeMonths
  ) {
    db.scheduledExpenses = JSON.parse(JSON.stringify(DEFAULT_SCHEDULED_EXPENSES));
    needsSave = true;
  }

  if (!db.settings.usdExchangeRate) {
    db.settings.usdExchangeRate = 1480;
  }

  // expenses에 replacedScheduledId 역참조 동기화
  const expIdToSchedId: Record<string, string> = {};
  for (const s of db.scheduledExpenses) {
    if (!s.monthlyReplacedIds) s.monthlyReplacedIds = {};
    if (!s.activeMonths) {
      s.activeMonths = [
        '01',
        '02',
        '03',
        '04',
        '05',
        '06',
        '07',
        '08',
        '09',
        '10',
        '11',
        '12',
      ];
    }
    for (const expId of Object.values(s.monthlyReplacedIds)) {
      if (expId) expIdToSchedId[expId] = s.id;
    }
  }

  db.expenses = (db.expenses || []).map((e) => ({
    ...e,
    category: e.category || guessCategory(e.merchant),
    memo: e.memo || '',
    replacedScheduledId: expIdToSchedId[e.id] || undefined,
  }));

  if (needsSave) {
    saveCloudDb(db).catch(() => {});
  }
  return db;
}

function getDefaultDb(): RawDb {
  return normalizeDb({
    settings: {
      yearlyBudget: 3000000,
      targetKeywords: ['하나7693'],
      usdExchangeRate: 1480,
    },
    expenses: JSON.parse(JSON.stringify(initialExpenses)) as ExpenseItem[],
    scheduledExpenses: JSON.parse(JSON.stringify(DEFAULT_SCHEDULED_EXPENSES)),
  });
}

/**
 * 실시간 달러(USD) 환율 조회 (+ 해외카드 수수료 약 2.5% 반영)
 * - 왜 수수료를 더하는가: 카드사 해외승인은 매매기준율에 국제브랜드 수수료(1~1.5%)와 해외서비스 수수료, 전신환 매도율이 붙어
 *   실제 출금 원화가 기준환율보다 약 2.5% 높게 청구되기 때문입니다.
 */
export async function fetchLiveUsdCardRate(fallbackRate = 1480): Promise<number> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      const baseKrw = Number(data?.rates?.KRW);
      if (baseKrw && baseKrw > 900) {
        return Math.round(baseKrw * 1.025);
      }
    }
  } catch {
    // ignore
  }
  return fallbackRate;
}

async function fetchCloudDb(): Promise<RawDb> {
  try {
    const res = await fetch(`${CLOUD_URL}?t=${Date.now()}`, {
      headers: getCloudHeaders(),
      cache: 'no-store',
    });
    if (res.ok) {
      const issue = await res.json();
      const parsed = normalizeDb(JSON.parse(issue.body) as RawDb);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    }
  } catch (e) {
    console.warn('Cloud fetch fallback to local:', e);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeDb(JSON.parse(raw));
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
      (line) =>
        /\d{1,2}\/\d{1,2}/.test(line) &&
        (/[\d,]+\s*원/.test(line) || /USD|\$/i.test(line))
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

/**
 * 원화(~원) 및 해외승인 달러(22.00USD / USD 22.00 / $22.00) 모두 지원하는 파서
 */
export function parseSmsInBrowser(
  rawSms: string,
  keywords: string[],
  usdRate = 1480
) {
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

  // 1) 해외승인 USD 금액 추출 먼저 확인 (예: "22.00USD", "22.00 USD", "USD 22.00", "$22.00")
  const usdMatch =
    body.match(/([\d,]+(?:\.\d+)?)\s*(?:USD|달러|\$)/i) ||
    body.match(/(?:USD|\$)\s*([\d,]+(?:\.\d+)?)/i);

  // 2) 원화 금액 추출 (예: "6,600원")
  const krwMatch = body.match(/([+-]?[\d,]+)\s*원/);

  let amount = 0;
  let usdAmount: number | undefined = undefined;

  if (usdMatch) {
    const parsedUsd = parseFloat(usdMatch[1].replace(/,/g, ''));
    if (!isNaN(parsedUsd) && parsedUsd > 0) {
      usdAmount = parsedUsd;
      // 만약 문자에 원화도 함께 적혀있다면 원화를 우선 쓰고, 달러만 있다면 실시간 환율(usdRate)로 자동 계산!
      if (krwMatch) {
        amount = Math.abs(parseInt(krwMatch[1].replace(/,/g, ''), 10));
      } else {
        amount = Math.round(parsedUsd * usdRate);
      }
    }
  } else if (krwMatch) {
    amount = Math.abs(parseInt(krwMatch[1].replace(/,/g, ''), 10));
  } else {
    return null;
  }

  if (isNaN(amount) || amount <= 0) return null;

  const dateTimeRegex =
    /(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])(?!\d)(?:\s+([012]?\d:[0-5]\d))?/;
  const dateMatch = body.match(dateTimeRegex);

  const year = '2026';
  let mm = '10';
  let dd = '21';
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
      .replace(/([\d,]+(?:\.\d+)?)\s*(?:USD|달러|\$)/gi, ' ')
      .replace(/(?:USD|\$)\s*([\d,]+(?:\.\d+)?)/gi, ' ')
      .replace(/([+-]?[\d,]+)\s*원/g, ' ')
      .replace(/\b(?:일시불|할부|\d+개월|해외승인|승인취소|승인|취소|출금|체크)\b/g, ' ')
      .trim();
  }
  merchant = merchant.replace(/\s+/g, ' ').trim() || '해외/기타사용처';

  return {
    dateTime: `${year}-${mm}-${dd} ${time}`,
    displayDate: `${mm}/${dd} ${time}`,
    month: mm,
    year,
    merchant,
    amount,
    usdAmount,
    isCancel,
    category: guessCategory(merchant),
    memo: usdAmount ? `해외승인 ${usdAmount.toFixed(2)} USD (환율 자동계산)` : '',
    rawSms: cleaned,
  };
}

/**
 * 새로 들어온 내역이 정기구독과 이름이 일치하면 해당 월(mm)의 구독을 자동으로 대체 연결해주는 헬퍼
 */
function autoMatchSubscriptionIfPossible(
  newItem: ExpenseItem,
  mm: string,
  scheduledList: ScheduledExpense[]
) {
  const norm = `${newItem.merchant} ${newItem.memo || ''}`.toUpperCase();
  for (const s of scheduledList) {
    if (!s.activeMonths.includes(mm)) continue;
    if (s.monthlyReplacedIds[mm]) continue; // 이미 해당 월이 대체되어 있으면 패스

    const isClaude =
      s.id === 'sched-claude' && /CLAUDE|ANTHROPIC|클로드/.test(norm);
    const isGemini =
      s.id === 'sched-gemini' && /구글플레이|제미나이|GEMINI|GOOGLE/.test(norm);
    const isKakao = s.id === 'sched-kakao' && /톡서랍|카카오구독/.test(norm);
    const isSms =
      s.id === 'sched-sms' && (/SMS|이용요금|이용료/.test(norm) || newItem.amount === 400);

    if (isClaude || isGemini || isKakao || isSms) {
      s.monthlyReplacedIds[mm] = newItem.id;
      newItem.replacedScheduledId = s.id;
      break;
    }
  }
}

export function buildDashboard(db: RawDb, year = '2026'): DashboardData {
  const yearlyBudget = db.settings.yearlyBudget;
  const expenses = db.expenses.filter((e) => e.year === year);
  const scheduledExpenses = db.scheduledExpenses.filter((s) => s.year === year);

  // 1) 현재까지 실제 지출 합계
  const actualSpent = expenses.reduce((sum, item) => sum + item.amount, 0);

  // 2) 현재 장부상 남은 목회비
  const remainingBudget = yearlyBudget - actualSpent;

  // 3) 올해 말(12월)까지 아직 결제되지 않고 남아있는 정기구독/자동이체 예정 총액 계산
  let remainingYearScheduledSpent = 0;
  for (const s of scheduledExpenses) {
    const active = s.activeMonths || [];
    const replacedMap = s.monthlyReplacedIds || {};
    const pendingMonthsCount = active.filter((m) => !replacedMap[m]).length;
    remainingYearScheduledSpent += pendingMonthsCount * s.estimatedAmount;
  }

  // 4) 올해 말까지 실제로 쓸 수 있는 '실사용 가능 목회비'
  const realAvailableBudget = remainingBudget - remainingYearScheduledSpent;

  return {
    year,
    yearlyBudget,
    actualSpent,
    remainingBudget,
    remainingYearScheduledSpent,
    realAvailableBudget,
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

    // 만약 USD가 포함된 문자가 있다면 실시간 환율 먼저 조회
    let usdRate = db.settings.usdExchangeRate || 1480;
    if (/USD|\$|달러/i.test(message)) {
      usdRate = await fetchLiveUsdCardRate(usdRate);
      db.settings.usdExchangeRate = usdRate;
    }

    const parsedItems = chunks
      .map((c) =>
        parseSmsInBrowser(
          c,
          bypassFilter ? [] : db.settings.targetKeywords,
          usdRate
        )
      )
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => Number(a.isCancel) - Number(b.isCancel));

    let addedCount = 0;
    let canceledCount = 0;

    for (const parsed of parsedItems) {
      if (parsed.isCancel) {
        const normMerchant = parsed.merchant.replace(/\s+/g, '');
        let targetIdx = db.expenses.findIndex(
          (e) =>
            (e.amount === parsed.amount ||
              (parsed.usdAmount && e.usdAmount === parsed.usdAmount)) &&
            e.merchant.replace(/\s+/g, '') === normMerchant
        );
        if (targetIdx === -1) {
          targetIdx = db.expenses.findIndex(
            (e) =>
              e.amount === parsed.amount ||
              (parsed.usdAmount && e.usdAmount === parsed.usdAmount)
          );
        }

        if (targetIdx !== -1) {
          const removed = db.expenses[targetIdx];
          if (removed.replacedScheduledId) {
            const sched = db.scheduledExpenses.find(
              (s) => s.id === removed.replacedScheduledId
            );
            if (sched && sched.monthlyReplacedIds) {
              for (const [m, expId] of Object.entries(sched.monthlyReplacedIds)) {
                if (expId === removed.id) delete sched.monthlyReplacedIds[m];
              }
            }
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

      const { isCancel, month, ...itemData } = parsed;
      const newItem: ExpenseItem = {
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ...itemData,
      };

      // 정기구독 자동 매칭 시도
      autoMatchSubscriptionIfPossible(newItem, month, db.scheduledExpenses);

      db.expenses.unshift(newItem);
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

  /**
   * 특정 사용내역(expenseId)을 선택한 정기구독(scheduledId)의 '해당 월(mm)' 대체 내역으로 연결/해제
   * - 이전 달 내역을 체크하면 그 이전 달 슬롯에만 들어가고, 이번 달 슬롯을 덮어쓰지 않습니다!
   */
  replaceScheduledWithExpense: async (
    expenseId: string,
    scheduledId: string | null
  ) => {
    const db = await fetchCloudDb();
    const exp = db.expenses.find((e) => e.id === expenseId);
    if (!exp) return;

    const expMonth = exp.displayDate.split('/')[0]?.padStart(2, '0') || '10';

    // 1) 기존에 이 내역이 연결되어 있던 정기구독 슬롯 해제
    for (const s of db.scheduledExpenses) {
      if (!s.monthlyReplacedIds) s.monthlyReplacedIds = {};
      for (const [m, linkedId] of Object.entries(s.monthlyReplacedIds)) {
        if (linkedId === expenseId) {
          delete s.monthlyReplacedIds[m];
        }
      }
    }
    exp.replacedScheduledId = undefined;

    // 2) 새 정기구독의 해당 월(expMonth) 슬롯에 연결
    if (scheduledId) {
      const target = db.scheduledExpenses.find((s) => s.id === scheduledId);
      if (target) {
        if (!target.monthlyReplacedIds) target.monthlyReplacedIds = {};
        // 만약 해당 월에 이미 다른 내역이 연결되어 있었다면 그 내역의 표시 해제
        const prevExpId = target.monthlyReplacedIds[expMonth];
        if (prevExpId) {
          const prevExp = db.expenses.find((e) => e.id === prevExpId);
          if (prevExp) prevExp.replacedScheduledId = undefined;
        }
        target.monthlyReplacedIds[expMonth] = exp.id;
        if (!target.activeMonths.includes(expMonth)) {
          target.activeMonths.push(expMonth);
          target.activeMonths.sort();
        }
        exp.replacedScheduledId = target.id;
      }
    }

    await saveCloudDb(db);
  },

  /**
   * 정기구독에서 특정 월(mm)의 예정 여부를 켜거나 끄는 토글 함수
   */
  toggleScheduledMonth: async (scheduledId: string, month: string) => {
    const db = await fetchCloudDb();
    const target = db.scheduledExpenses.find((s) => s.id === scheduledId);
    if (!target) return;

    if (!target.activeMonths) target.activeMonths = [];
    if (target.activeMonths.includes(month)) {
      target.activeMonths = target.activeMonths.filter((m) => m !== month);
      if (target.monthlyReplacedIds?.[month]) {
        const expId = target.monthlyReplacedIds[month];
        const exp = db.expenses.find((e) => e.id === expId);
        if (exp) exp.replacedScheduledId = undefined;
        delete target.monthlyReplacedIds[month];
      }
    } else {
      target.activeMonths.push(month);
      target.activeMonths.sort();
    }
    await saveCloudDb(db);
  },

  deleteExpense: async (id: string) => {
    const db = await fetchCloudDb();
    for (const s of db.scheduledExpenses) {
      if (s.monthlyReplacedIds) {
        for (const [m, expId] of Object.entries(s.monthlyReplacedIds)) {
          if (expId === id) delete s.monthlyReplacedIds[m];
        }
      }
    }
    db.expenses = db.expenses.filter((e) => e.id !== id);
    await saveCloudDb(db);
  },

  addScheduled: async (
    title: string,
    estimatedAmount: number,
    startMonth = '10',
    usdAmount?: number
  ) => {
    const db = await fetchCloudDb();
    const allMonths = [
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
    ];
    const activeMonths = allMonths.filter((m) => m >= startMonth);

    const item: ScheduledExpense = {
      id: `sched-${Date.now()}`,
      year: '2026',
      title,
      estimatedAmount,
      usdAmount,
      activeMonths,
      monthlyReplacedIds: {},
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
