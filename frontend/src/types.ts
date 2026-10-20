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
  replacedScheduledId?: string;
}

export interface ScheduledExpense {
  id: string;
  year: string;
  title: string;
  estimatedAmount: number;
  replacedByExpenseId?: string;
}

export interface AppSettings {
  yearlyBudget: number;
  targetKeywords: string[];
}

export interface DashboardData {
  year: string;
  yearlyBudget: number;
  actualSpent: number;
  pendingScheduledSpent: number;
  remainingBudget: number;
  expenses: ExpenseItem[];
  scheduledExpenses: ScheduledExpense[];
  settings: AppSettings;
}
