import express, { Request, Response } from 'express';
import cors from 'cors';
import os from 'os';
import path from 'path';
import { storageService } from './services/storageService';
import { parseSingleSms, splitBulkSmsText } from './services/smsParser';
import { ExpenseItem, ScheduledExpense } from './types';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function getLocalNetworkIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

/**
 * 1. 연간 목회비 현황 조회 API (기본 1년 300만 원)
 * GET /api/dashboard?year=2026
 */
app.get('/api/dashboard', (req: Request, res: Response) => {
  try {
    const db = storageService.readDb();
    const year = (req.query.year as string) || String(new Date().getFullYear());

    const yearlyBudget = db.settings.yearlyBudget;
    const expenses = db.expenses.filter((e) => e.year === year);
    const scheduledExpenses = db.scheduledExpenses.filter((s) => s.year === year);

    // 실제 빠져나간 금액 합계
    const actualSpent = expenses.reduce((sum, item) => sum + item.amount, 0);

    // 아직 실제 내역으로 대체되지 않은(!replacedByExpenseId) 자동이체 예정 금액 합계
    const pendingScheduledSpent = scheduledExpenses
      .filter((s) => !s.replacedByExpenseId)
      .reduce((sum, item) => sum + item.estimatedAmount, 0);

    // 남은 목회비 = 1년 예산(300만 원) - (실제 사용액 + 아직 안 빠져나간 자동이체 예정액)
    const remainingBudget = yearlyBudget - (actualSpent + pendingScheduledSpent);

    res.json({
      year,
      yearlyBudget,
      actualSpent,
      pendingScheduledSpent,
      remainingBudget,
      expenses,
      scheduledExpenses,
      settings: db.settings,
      serverInfo: {
        localIp: getLocalNetworkIp(),
        port: PORT,
      },
    });
  } catch (error) {
    console.error('[GET /api/dashboard] 오류:', error);
    res.status(500).json({ error: '데이터 조회 실패' });
  }
});

/**
 * 2. 아이폰 단축어 & 문자 붙여넣기 등록 API
 * POST /api/sms/webhook
 */
const handleSmsWebhook = (req: Request, res: Response) => {
  try {
    const rawMessage =
      (req.body?.message as string) ||
      (req.body?.text as string) ||
      (req.query?.message as string) ||
      '';
    const bypassFilter = Boolean(req.body?.bypassFilter);

    if (!rawMessage.trim()) {
      res.status(400).json({ success: false, message: '문자 내용이 비어 있습니다.' });
      return;
    }

    const db = storageService.readDb();
    const chunks = splitBulkSmsText(rawMessage);
    const addedItems: ExpenseItem[] = [];

    for (const chunk of chunks) {
      const parsed = parseSingleSms(chunk, {
        targetKeywords: bypassFilter ? [] : db.settings.targetKeywords,
      });

      if (!parsed.isMatchedFilter || !parsed.isValid) continue;

      const duplicate = storageService.findDuplicateExpense(
        parsed.dateTime,
        parsed.amount,
        parsed.merchant
      );
      if (duplicate) continue;

      const newItem: ExpenseItem = {
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        dateTime: parsed.dateTime,
        displayDate: parsed.displayDate,
        year: parsed.year,
        merchant: parsed.merchant,
        amount: parsed.amount,
        rawSms: parsed.rawSms,
      };

      storageService.addExpense(newItem);
      addedItems.push(newItem);
    }

    res.json({
      success: true,
      addedCount: addedItems.length,
      addedItems,
      message:
        addedItems.length > 0
          ? `${addedItems.length}건 등록 완료!`
          : '새로 추가된 문자가 없습니다 (중복 또는 키워드 불일치).',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '문자 처리 오류' });
  }
};

app.post('/api/sms/webhook', handleSmsWebhook);
app.get('/api/sms/webhook', handleSmsWebhook);

/**
 * 3. 실제 사용 내역에서 체크하여 자동이체 예정 항목 대체하기 API
 * POST /api/expenses/:id/replace-scheduled
 * body: { scheduledId: string | null }
 */
app.post('/api/expenses/:id/replace-scheduled', (req: Request, res: Response) => {
  try {
    const { scheduledId } = req.body;
    storageService.linkExpenseToScheduled(req.params.id, scheduledId || null);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message || '대체 연결 실패' });
  }
});

/**
 * 4. 내역 수정 / 삭제
 */
app.put('/api/expenses/:id', (req: Request, res: Response) => {
  const updated = storageService.updateExpense(req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ error: '내역 없음' });
    return;
  }
  res.json(updated);
});

app.delete('/api/expenses/:id', (req: Request, res: Response) => {
  storageService.deleteExpense(req.params.id);
  res.json({ success: true });
});

/**
 * 5. 자동이체 예정 항목 추가 / 수정 / 삭제
 */
app.post('/api/scheduled-expenses', (req: Request, res: Response) => {
  const { year, title, estimatedAmount } = req.body;
  if (!title || estimatedAmount === undefined) {
    res.status(400).json({ error: '항목명과 예정 금액을 입력해 주세요.' });
    return;
  }
  const newItem: ScheduledExpense = {
    id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    year: year || String(new Date().getFullYear()),
    title: String(title).trim(),
    estimatedAmount: Number(estimatedAmount),
  };
  res.status(201).json(storageService.addScheduledExpense(newItem));
});

app.put('/api/scheduled-expenses/:id', (req: Request, res: Response) => {
  const updated = storageService.updateScheduledExpense(req.params.id, req.body);
  res.json(updated);
});

app.delete('/api/scheduled-expenses/:id', (req: Request, res: Response) => {
  storageService.deleteScheduledExpense(req.params.id);
  res.json({ success: true });
});

/**
 * 6. 연간 예산 및 키워드 설정 변경
 */
app.put('/api/settings', (req: Request, res: Response) => {
  res.json(storageService.updateSettings(req.body));
});

const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));
app.get('*', (req: Request, res: Response, next) => {
  if (req.path.startsWith('/api')) {
    next();
    return;
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('Server is running.');
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
