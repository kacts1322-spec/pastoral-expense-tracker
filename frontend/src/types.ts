export type ExpenseCategory =
  | '심방/다과'
  | '식비/교제'
  | '도서/연구'
  | '차량/교통'
  | '고정/구독'
  | '기타';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  '심방/다과',
  '식비/교제',
  '도서/연구',
  '차량/교통',
  '고정/구독',
  '기타',
];

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  '심방/다과': 'bg-amber-50 text-amber-700 border-amber-200',
  '식비/교제': 'bg-orange-50 text-orange-700 border-orange-200',
  '도서/연구': 'bg-blue-50 text-blue-700 border-blue-200',
  '차량/교통': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '고정/구독': 'bg-purple-50 text-purple-700 border-purple-200',
  '기타': 'bg-slate-100 text-slate-600 border-slate-200',
};

export const CATEGORY_BAR_COLORS: Record<ExpenseCategory, string> = {
  '심방/다과': 'bg-amber-500',
  '식비/교제': 'bg-orange-500',
  '도서/연구': 'bg-blue-600',
  '차량/교통': 'bg-emerald-500',
  '고정/구독': 'bg-purple-500',
  '기타': 'bg-slate-400',
};

export interface ExpenseItem {
  id: string;
  dateTime: string;
  displayDate: string;
  year: string;
  merchant: string;
  amount: number;
  category?: ExpenseCategory;
  memo?: string;
  rawSms?: string;
  /**
   * 이 실제 내역이 대체한 정기구독(자동이체) ID
   * - 내역의 월(예: "09")을 기준으로 해당 정기구독의 "09"월분을 대체합니다.
   */
  replacedScheduledId?: string;
  /**
   * 해외승인(USD) 문자인 경우 원본 달러 금액 표시 (예: 22.00)
   * - 실시간 환율로 자동 가계산된 내역임을 표시하고 추후 최종 원화 금액으로 1초 만에 수정할 수 있게 합니다.
   */
  usdAmount?: number;
}

/**
 * 매월 반복되는 정기구독 / 자동이체 항목
 * - 1월~12월 중 활성화된 달(activeMonths)마다 매월 빠져나갈 예정 금액을 관리합니다.
 * - 특정 달에 실제 결제 내역이 체크되어 연결되면(monthlyReplacedExpenseIds[month]),
 *   그 달의 예상 금액은 예정 합계에서 빠지고 아직 안 나간 남은 달(예: 10, 11, 12월)만 예정 합계에 잡힙니다.
 */
export interface ScheduledExpense {
  id: string;
  year: string;
  /** 구독/자동이체 이름 (예: "클로드 AI 구독 (22$)", "제미나이 구독") */
  title: string;
  /** 1개월당 예상 결제 금액 (원) */
  estimatedAmount: number;
  /** 달러 결제인 경우 기본 달러 금액 (예: 22) */
  usdAmount?: number;
  /** 올해 중 이 구독이 유지되는 월 목록 (예: ["01","02",...,"12"]) */
  activeMonths: string[];
  /**
   * 월별로 실제 사용내역으로 대체된 내역 ID 매핑
   * 예: { "08": "exp-2026-094", "09": "exp-2026-116" }
   */
  monthlyReplacedIds: Record<string, string>;
}

export interface AppSettings {
  yearlyBudget: number;
  targetKeywords: string[];
  /** 해외결제(USD) 문자 수신 시 적용할 기준 환율 (실시간 환율 자동 갱신 + 수수료 포함 기본값 1480원) */
  usdExchangeRate?: number;
}

export interface DashboardData {
  year: string;
  yearlyBudget: number;
  /** 현재까지 실제 사용한 금액 합계 */
  actualSpent: number;
  /** 현재 장부상 남은 목회비 (1년 예산 - 실제 사용액) */
  remainingBudget: number;
  /** 올해 말(12월)까지 앞으로 빠져나갈 남은 정기구독/자동이체 예정 총액 */
  remainingYearScheduledSpent: number;
  /**
   * 올해 말까지 실제로 마음 놓고 쓸 수 있는 '실사용 가능 목회비'
   * = 현재 남은 목회비 - 연말까지 빠져나갈 남은 구독료 총액
   */
  realAvailableBudget: number;
  expenses: ExpenseItem[];
  scheduledExpenses: ScheduledExpense[];
  settings: AppSettings;
}
