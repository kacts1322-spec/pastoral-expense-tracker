export interface ExpenseItem {
  id: string;
  dateTime: string;
  displayDate: string;
  year: string;
  merchant: string;
  amount: number;
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
  serverInfo?: {
    localIp: string;
    port: number;
  };
}
