import fs from 'fs';
import path from 'path';
import { DatabaseSchema, ExpenseItem, ScheduledExpense, AppSettings } from '../types';

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE_PATH = path.join(DATA_DIR, 'db.json');

/**
 * 초기 데이터베이스 기본값
 * - 1년 예산 300만 원(3,000,000원) 기준
 * - 보내주신 카페하루 문자 1건 + 달러 결제 예시 내역 1건 + 자동이체 예정 1건을 넣어 바로 체크 테스트가 가능하게 구성
 */
function getInitialDatabase(): DatabaseSchema {
  return {
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
}

export class StorageService {
  private ensureDbFile(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(DB_FILE_PATH)) {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(getInitialDatabase(), null, 2), 'utf-8');
      }
    } catch (error) {
      console.error('[StorageService] 초기화 오류:', error);
    }
  }

  public readDb(): DatabaseSchema {
    this.ensureDbFile();
    try {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);

      // 이전 버전(월별 예산 스키마) 파일이 남아있다면 새 연 단위 스키마로 자동 마이그레이션
      if (!parsed.settings || typeof parsed.settings.yearlyBudget !== 'number') {
        const fresh = getInitialDatabase();
        this.writeDb(fresh);
        return fresh;
      }
      return parsed as DatabaseSchema;
    } catch (error) {
      return getInitialDatabase();
    }
  }

  public writeDb(data: DatabaseSchema): void {
    this.ensureDbFile();
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  }

  public findDuplicateExpense(dateTime: string, amount: number, merchant: string): ExpenseItem | undefined {
    const db = this.readDb();
    return db.expenses.find(
      (item) =>
        item.dateTime === dateTime &&
        item.amount === amount &&
        item.merchant.replace(/\s+/g, '') === merchant.replace(/\s+/g, '')
    );
  }

  public addExpense(item: ExpenseItem): ExpenseItem {
    const db = this.readDb();
    db.expenses.unshift(item);
    db.expenses.sort((a, b) => b.dateTime.localeCompare(a.dateTime));
    this.writeDb(db);
    return item;
  }

  public updateExpense(id: string, updates: Partial<ExpenseItem>): ExpenseItem | null {
    const db = this.readDb();
    const index = db.expenses.findIndex((e) => e.id === id);
    if (index === -1) return null;

    const updated: ExpenseItem = {
      ...db.expenses[index],
      ...updates,
      id,
    };
    db.expenses[index] = updated;
    db.expenses.sort((a, b) => b.dateTime.localeCompare(a.dateTime));
    this.writeDb(db);
    return updated;
  }

  public deleteExpense(id: string): boolean {
    const db = this.readDb();
    const target = db.expenses.find((e) => e.id === id);
    if (!target) return false;

    // 만약 삭제하는 내역이 어떤 자동이체 예정 항목을 대체하고 있었다면, 그 예정 항목의 대체 상태도 풀어줍니다.
    if (target.replacedScheduledId) {
      const sched = db.scheduledExpenses.find((s) => s.id === target.replacedScheduledId);
      if (sched) {
        sched.replacedByExpenseId = undefined;
      }
    }

    db.expenses = db.expenses.filter((e) => e.id !== id);
    this.writeDb(db);
    return true;
  }

  public addScheduledExpense(item: ScheduledExpense): ScheduledExpense {
    const db = this.readDb();
    db.scheduledExpenses.push(item);
    this.writeDb(db);
    return item;
  }

  public updateScheduledExpense(id: string, updates: Partial<ScheduledExpense>): ScheduledExpense | null {
    const db = this.readDb();
    const index = db.scheduledExpenses.findIndex((s) => s.id === id);
    if (index === -1) return null;

    db.scheduledExpenses[index] = {
      ...db.scheduledExpenses[index],
      ...updates,
      id,
    };
    this.writeDb(db);
    return db.scheduledExpenses[index];
  }

  public deleteScheduledExpense(id: string): boolean {
    const db = this.readDb();
    // 연결된 실제 내역이 있다면 연결 해제
    for (const exp of db.expenses) {
      if (exp.replacedScheduledId === id) {
        exp.replacedScheduledId = undefined;
      }
    }
    const before = db.scheduledExpenses.length;
    db.scheduledExpenses = db.scheduledExpenses.filter((s) => s.id !== id);
    if (db.scheduledExpenses.length === before) return false;
    this.writeDb(db);
    return true;
  }

  /**
   * 아래 실제 사용내역(expenseId)을 체크하여 자동이체 예정 항목(scheduledId)을 대체하거나 해제하는 핵심 함수
   * - 달러 결제처럼 매달 실제 빠져나가는 원화 금액이 다를 때,
   *   실제 카드 문자가 찍힌 내역을 선택하면 예정 금액 대신 실제 금액으로 자동 대체됩니다.
   */
  public linkExpenseToScheduled(expenseId: string, scheduledId: string | null): void {
    const db = this.readDb();
    const expense = db.expenses.find((e) => e.id === expenseId);
    if (!expense) throw new Error('실제 사용 내역을 찾을 수 없습니다.');

    // 1. 기존에 이 실제 내역이 연결되어 있던 예정 항목이 있다면 먼저 해제
    if (expense.replacedScheduledId) {
      const prevSched = db.scheduledExpenses.find((s) => s.id === expense.replacedScheduledId);
      if (prevSched) {
        prevSched.replacedByExpenseId = undefined;
      }
      expense.replacedScheduledId = undefined;
    }

    // 2. 새로운 자동이체 예정 항목과 연결 (대체)
    if (scheduledId) {
      const targetSched = db.scheduledExpenses.find((s) => s.id === scheduledId);
      if (!targetSched) throw new Error('자동이체 예정 항목을 찾을 수 없습니다.');

      // 만약 그 예정 항목에 이미 다른 내역이 연결되어 있었다면 해제
      if (targetSched.replacedByExpenseId) {
        const prevExp = db.expenses.find((e) => e.id === targetSched.replacedByExpenseId);
        if (prevExp) {
          prevExp.replacedScheduledId = undefined;
        }
      }

      targetSched.replacedByExpenseId = expense.id;
      expense.replacedScheduledId = targetSched.id;
    }

    this.writeDb(db);
  }

  public updateSettings(newSettings: Partial<AppSettings>): AppSettings {
    const db = this.readDb();
    db.settings = {
      ...db.settings,
      ...newSettings,
    };
    this.writeDb(db);
    return db.settings;
  }
}

export const storageService = new StorageService();
