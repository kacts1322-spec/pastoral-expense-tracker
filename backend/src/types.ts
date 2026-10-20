/**
 * 개별 목회비 실제 지출 내역 (문자 추출 또는 직접 입력)
 * - 복잡한 카테고리나 메모를 제거하고 딱 [일시, 사용처, 금액]과 자동이체 대체 연결 정보만 유지합니다.
 */
export interface ExpenseItem {
  id: string;
  /** 정렬용 전체 일시 (예: "2026-10-10 19:30") */
  dateTime: string;
  /** 화면 표시용 일시 (예: "10/10 19:30") */
  displayDate: string;
  /** 소속 연도 (예: "2026") - 연 단위 목회비 집계를 위함 */
  year: string;
  /** 사용처 (예: "카페하루") */
  merchant: string;
  /** 실제 결제 금액 (원) */
  amount: number;
  /** 원본 문자 */
  rawSms?: string;
  /**
   * 이 실제 내역이 대체한 '자동이체 예정 항목'의 ID
   * - 달러 결제 등 매달 금액이 바뀌는 자동이체의 경우, 실제 문자가 오면 체크해서 예정 항목을 대체합니다.
   */
  replacedScheduledId?: string;
}

/**
 * 자동이체 예정 항목
 * - 아직 빠져나가지 않은 금액을 미리 입력해 예산에서 차감해 두고,
 *   아래 실제 사용내역에서 체크하면 그 실제 금액으로 대체됩니다.
 */
export interface ScheduledExpense {
  id: string;
  /** 소속 연도 (예: "2026") */
  year: string;
  /** 자동이체 예정 항목명 (예: "해외 달러 구독", "통신비") */
  title: string;
  /** 예상 금액 (원) */
  estimatedAmount: number;
  /**
   * 아래 실제 사용내역 중 어떤 내역으로 대체되었는지 저장하는 ID
   * - 값이 있으면 이미 실제 내역으로 대체된 상태이므로 예상 금액(estimatedAmount)은 예산에서 중복 차감하지 않습니다.
   */
  replacedByExpenseId?: string;
}

/**
 * 앱 설정 (연간 예산 및 문자 추출 키워드)
 */
export interface AppSettings {
  /** 연간 목회비 총 예산 (기본: 3,000,000원) */
  yearlyBudget: number;
  /** 문자 추출 키워드 (기본: ["하나7693"]) */
  targetKeywords: string[];
}

export interface DatabaseSchema {
  settings: AppSettings;
  expenses: ExpenseItem[];
  scheduledExpenses: ScheduledExpense[];
}
