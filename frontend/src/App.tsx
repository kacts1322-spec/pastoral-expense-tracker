import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Check,
  Trash2,
  Edit2,
  X,
  Search,
  Copy,
  Download,
  RefreshCw,
  BarChart3,
  ListFilter,
  CalendarClock,
  DollarSign,
} from 'lucide-react';
import { api, fetchLiveUsdCardRate } from './api';
import {
  DashboardData,
  ExpenseCategory,
  EXPENSE_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_BAR_COLORS,
  ExpenseItem,
} from './types';

type ActiveTab = 'list' | 'analysis' | 'scheduled';

const ALL_MONTHS = [
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

export const App: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('list');
  const [isSyncing, setIsSyncing] = useState(false);

  // 문자 붙여넣기 / 직접 추가 모달 상태
  const [showSmsBox, setShowSmsBox] = useState(false);
  const [smsInput, setSmsInput] = useState('');
  const [showManualBox, setShowManualBox] = useState(false);
  const [manualDate, setManualDate] = useState('2026-10-21');
  const [manualTime, setManualTime] = useState('12:00');
  const [manualMerchant, setManualMerchant] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualCategory, setManualCategory] = useState<ExpenseCategory>('심방/다과');
  const [manualMemo, setManualMemo] = useState('');

  // 검색 및 분류/월별 필터
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [selectedMonth, setSelectedMonth] = useState<string>('전체');
  const [copyToast, setCopyToast] = useState('');

  // 내역 수정 상태
  const [editingExpId, setEditingExpId] = useState<string | null>(null);
  const [editMerchant, setEditMerchant] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('심방/다과');
  const [editMemo, setEditMemo] = useState('');

  // 1년 예산 수정 상태
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetText, setBudgetText] = useState('3000000');

  // 정기구독 추가/수정 상태
  const [showAddSched, setShowAddSched] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedAmount, setSchedAmount] = useState('');
  const [schedStartMonth, setSchedStartMonth] = useState('10');
  const [editingSchedId, setEditingSchedId] = useState<string | null>(null);
  const [editSchedAmount, setEditSchedAmount] = useState('');

  const loadData = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await api.getDashboard('2026');
      setData(res);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const smsFromUrl = params.get('sms');
    if (smsFromUrl) {
      api.submitSms(smsFromUrl, false).then(() => {
        window.history.replaceState({}, '', window.location.pathname);
        loadData();
      });
    } else {
      loadData();
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', loadData);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', loadData);
    };
  }, [loadData]);

  // 검색, 분류, 월별 필터링된 내역
  const filteredExpenses = useMemo(() => {
    if (!data) return [];
    return data.expenses.filter((item) => {
      const cat = item.category || '기타';
      const mm = item.displayDate.split('/')[0]?.padStart(2, '0') || '';
      const matchCat = selectedCategory === '전체' || cat === selectedCategory;
      const matchMonth = selectedMonth === '전체' || mm === selectedMonth;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        item.merchant.toLowerCase().includes(q) ||
        (item.memo || '').toLowerCase().includes(q) ||
        item.displayDate.includes(q) ||
        String(item.amount).includes(q);
      return matchCat && matchMonth && matchSearch;
    });
  }, [data, selectedCategory, selectedMonth, searchQuery]);

  // 사용내역 분석 데이터 계산
  const analysisData = useMemo(() => {
    if (!data) return null;
    const total = data.actualSpent || 1;

    const byCategoryMap: Record<ExpenseCategory, { amount: number; count: number }> = {
      '심방/다과': { amount: 0, count: 0 },
      '식비/교제': { amount: 0, count: 0 },
      '도서/연구': { amount: 0, count: 0 },
      '차량/교통': { amount: 0, count: 0 },
      '고정/구독': { amount: 0, count: 0 },
      기타: { amount: 0, count: 0 },
    };

    const byMonthMap: Record<string, number> = {};
    const byMerchantMap: Record<string, { amount: number; count: number }> = {};

    for (const exp of data.expenses) {
      const cat = (exp.category || '기타') as ExpenseCategory;
      if (!byCategoryMap[cat]) byCategoryMap[cat] = { amount: 0, count: 0 };
      byCategoryMap[cat].amount += exp.amount;
      byCategoryMap[cat].count += 1;

      const mm = exp.displayDate.split('/')[0]?.padStart(2, '0') || '10';
      byMonthMap[mm] = (byMonthMap[mm] || 0) + exp.amount;

      const mName = exp.merchant.trim();
      if (!byMerchantMap[mName]) byMerchantMap[mName] = { amount: 0, count: 0 };
      byMerchantMap[mName].amount += exp.amount;
      byMerchantMap[mName].count += 1;
    }

    const categories = EXPENSE_CATEGORIES.map((cat) => ({
      category: cat,
      amount: byCategoryMap[cat].amount,
      count: byCategoryMap[cat].count,
      percent:
        data.actualSpent > 0
          ? Math.round((byCategoryMap[cat].amount / total) * 100)
          : 0,
    })).sort((a, b) => b.amount - a.amount);

    const months = Object.entries(byMonthMap)
      .map(([month, amount]) => ({
        month: `${Number(month)}월`,
        rawMonth: month,
        amount,
      }))
      .sort((a, b) => a.rawMonth.localeCompare(b.rawMonth));

    const topMerchants = Object.entries(byMerchantMap)
      .map(([merchant, info]) => ({
        merchant,
        amount: info.amount,
        count: info.count,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return { categories, months, topMerchants };
  }, [data]);

  const handleAddSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsInput.trim()) return;
    await api.submitSms(smsInput, false);
    setSmsInput('');
    setShowSmsBox(false);
    await loadData();
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualMerchant.trim() || !manualAmount) return;
    await api.addManualExpense({
      date: manualDate,
      time: manualTime,
      merchant: manualMerchant.trim(),
      amount: Number(manualAmount),
      category: manualCategory,
      memo: manualMemo.trim(),
    });
    setManualMerchant('');
    setManualAmount('');
    setManualMemo('');
    setShowManualBox(false);
    await loadData();
  };

  const startEditExpense = (item: ExpenseItem) => {
    setEditingExpId(item.id);
    setEditMerchant(item.merchant);
    setEditAmount(String(item.amount));
    setEditCategory(item.category || '기타');
    setEditMemo(item.memo || '');
  };

  const handleSaveExpenseEdit = async (id: string) => {
    await api.updateExpense(id, {
      merchant: editMerchant.trim(),
      amount: Number(editAmount),
      category: editCategory,
      memo: editMemo.trim(),
    });
    setEditingExpId(null);
    await loadData();
  };

  const handleSaveBudget = async () => {
    const num = Number(budgetText.replace(/,/g, ''));
    if (!isNaN(num) && num >= 0) {
      await api.updateSettings({ yearlyBudget: num });
      setEditingBudget(false);
      await loadData();
    }
  };

  const handleAddScheduled = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedTitle.trim() || !schedAmount) return;
    await api.addScheduled(
      schedTitle.trim(),
      Number(schedAmount),
      schedStartMonth
    );
    setSchedTitle('');
    setSchedAmount('');
    setShowAddSched(false);
    await loadData();
  };

  const handleSaveScheduledAmount = async (id: string) => {
    const num = Number(editSchedAmount);
    if (!isNaN(num)) {
      await api.updateScheduled(id, { estimatedAmount: num });
      setEditingSchedId(null);
      await loadData();
    }
  };

  const handleRefreshUsdRate = async () => {
    const liveRate = await fetchLiveUsdCardRate(1480);
    await api.updateSettings({ usdExchangeRate: liveRate });
    await loadData();
  };

  const handleCopyReport = async () => {
    const total = filteredExpenses.reduce((s, i) => s + i.amount, 0);
    const lines = [
      `[2026년 목회비 사용 내역]`,
      `총 ${filteredExpenses.length}건 / 합계 ${total.toLocaleString()}원`,
      `------------------------`,
      ...filteredExpenses.map(
        (item, idx) =>
          `${idx + 1}. ${item.displayDate} | ${item.merchant} | ${item.amount.toLocaleString()}원${
            item.memo ? ` (${item.memo})` : ''
          }`
      ),
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopyToast('복사 완료!');
    setTimeout(() => setCopyToast(''), 2000);
  };

  const handleDownloadCsv = () => {
    const headers = ['일시', '사용처', '금액', '분류', '메모'];
    const rows = filteredExpenses.map((i) => [
      i.dateTime,
      `"${i.merchant}"`,
      i.amount,
      i.category || '기타',
      `"${i.memo || ''}"`,
    ]);
    const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '목회비내역_2026.csv';
    a.click();
  };

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        불러오는 중...
      </div>
    );
  }

  const totalBudget = data.yearlyBudget || 1;
  const actualPercent = Math.min(
    100,
    Math.max(0, (data.actualSpent / totalBudget) * 100)
  );
  const schedPercent = Math.min(
    100 - actualPercent,
    Math.max(0, (data.remainingYearScheduledSpent / totalBudget) * 100)
  );

  return (
    <div className="min-h-screen bg-[#f2f4f6] pb-20">
      <div className="max-w-md mx-auto px-4 pt-5 space-y-4">
        {/* 1. 상단 카드: 실사용 가능 목회비 vs 현재 남은 목회비 */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
              연말까지 남은 구독료 제외 · 실사용 가능 목회비
            </span>
            <button
              onClick={loadData}
              className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100"
              title="동기화 새로고침"
            >
              <RefreshCw
                className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : ''}`}
              />
            </button>
          </div>

          {/* 가장 중요한 숫자: 올해 말까지 마음 놓고 쓸 수 있는 실사용 가능 목회비 */}
          <div className="mt-2 text-[34px] leading-tight font-extrabold tracking-tight text-slate-900">
            {data.realAvailableBudget.toLocaleString()}원
          </div>
          <p className="text-xs text-slate-400 mt-1">
            현재 잔액({data.remainingBudget.toLocaleString()}원)에서 12월까지 나갈 구독료(
            {data.remainingYearScheduledSpent.toLocaleString()}원)를 미리 뺀 금액입니다.
          </p>

          {/* 2단 게이지 바 (파랑: 실제 지출 / 주황: 연말까지 남은 구독료) */}
          <div className="mt-4 w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
            <div
              style={{ width: `${actualPercent}%` }}
              className="h-full bg-blue-600 transition-all duration-300"
            />
            <div
              style={{ width: `${schedPercent}%` }}
              className="h-full bg-amber-400 transition-all duration-300"
            />
          </div>

          {/* 4줄 상세 요약 */}
          <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5 text-sm">
            {/* 현재 남은 목회비 (장부상 잔액) */}
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">현재 남은 목회비 (장부 잔액)</span>
              <span className="font-extrabold text-blue-600 text-base">
                {data.remainingBudget.toLocaleString()}원
              </span>
            </div>

            {/* 12월까지 나갈 남은 구독료 */}
            <div
              onClick={() => setActiveTab('scheduled')}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="text-slate-500 underline decoration-dotted">
                12월까지 나갈 남은 구독료
              </span>
              <span className="font-bold text-amber-600">
                -{data.remainingYearScheduledSpent.toLocaleString()}원
              </span>
            </div>

            {/* 현재까지 실제 사용 */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">현재까지 실제 사용 ({data.expenses.length}건)</span>
              <span className="font-bold text-slate-700">
                {data.actualSpent.toLocaleString()}원
              </span>
            </div>

            {/* 1년 총 예산 */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs">1년 총 예산</span>
              {!editingBudget ? (
                <button
                  onClick={() => {
                    setBudgetText(String(data.yearlyBudget));
                    setEditingBudget(true);
                  }}
                  className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1"
                >
                  <span>{data.yearlyBudget.toLocaleString()}원</span>
                  <Edit2 className="w-3 h-3 text-slate-400" />
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={budgetText}
                    onChange={(e) => setBudgetText(e.target.value)}
                    className="w-28 px-2 py-0.5 text-base border border-slate-300 rounded-lg text-right"
                  />
                  <button
                    onClick={handleSaveBudget}
                    className="p-1 bg-blue-600 text-white rounded-lg"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingBudget(false)}
                    className="p-1 bg-slate-200 text-slate-600 rounded-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. 토스 스타일 3탭 스위치 */}
        <div className="bg-slate-200/80 p-1 rounded-2xl grid grid-cols-3 gap-1 text-xs font-bold">
          <button
            onClick={() => setActiveTab('list')}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition ${
              activeTab === 'list'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            <span>사용내역</span>
          </button>

          <button
            onClick={() => setActiveTab('analysis')}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition ${
              activeTab === 'analysis'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>내역분석</span>
          </button>

          <button
            onClick={() => setActiveTab('scheduled')}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition ${
              activeTab === 'scheduled'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500'
            }`}
          >
            <CalendarClock className="w-4 h-4" />
            <span>정기구독·예정</span>
          </button>
        </div>

        {/* ================= [탭 1: 사용내역] ================= */}
        {activeTab === 'list' && (
          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">
                사용 내역 ({filteredExpenses.length})
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setShowManualBox(!showManualBox);
                    setShowSmsBox(false);
                  }}
                  className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold"
                >
                  + 직접입력
                </button>
                <button
                  onClick={() => {
                    setShowSmsBox(!showSmsBox);
                    setShowManualBox(false);
                  }}
                  className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  문자 붙여넣기
                </button>
              </div>
            </div>

            {/* 문자 붙여넣기 창 (원화 및 22.00USD 해외승인 모두 지원) */}
            {showSmsBox && (
              <form
                onSubmit={handleAddSms}
                className="p-3.5 bg-slate-50 rounded-2xl space-y-2.5"
              >
                <div className="text-xs text-slate-500">
                  일반 원화 문자와 해외승인(<strong>22.00USD</strong> 등) 문자 모두 자동으로 환율 계산되어 등록됩니다.
                </div>
                <textarea
                  rows={3}
                  value={smsInput}
                  onChange={(e) => setSmsInput(e.target.value)}
                  placeholder={`[Web발신]\n하나7693 해외승인 김*욱 22.00USD 10/23 09:15 ANTHROPIC* CLAUDE SUB`}
                  className="w-full p-3 text-base bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSmsBox(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-500"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl"
                  >
                    등록하기
                  </button>
                </div>
              </form>
            )}

            {/* 수동 직접 입력 창 */}
            {showManualBox && (
              <form
                onSubmit={handleAddManual}
                className="p-3.5 bg-slate-50 rounded-2xl space-y-2.5"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="px-3 py-2 text-base bg-white border border-slate-200 rounded-xl"
                  />
                  <input
                    type="time"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    className="px-3 py-2 text-base bg-white border border-slate-200 rounded-xl"
                  />
                </div>
                <input
                  type="text"
                  value={manualMerchant}
                  onChange={(e) => setManualMerchant(e.target.value)}
                  placeholder="사용처 (예: 카페하루)"
                  className="w-full px-3.5 py-2 text-base bg-white border border-slate-200 rounded-xl"
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    placeholder="금액 (원)"
                    className="px-3.5 py-2 text-base bg-white border border-slate-200 rounded-xl"
                    required
                  />
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value as ExpenseCategory)}
                    className="px-3 py-2 text-base bg-white border border-slate-200 rounded-xl"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={manualMemo}
                  onChange={(e) => setManualMemo(e.target.value)}
                  placeholder="메모 (선택)"
                  className="w-full px-3.5 py-2 text-base bg-white border border-slate-200 rounded-xl"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManualBox(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-500"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl"
                  >
                    추가하기
                  </button>
                </div>
              </form>
            )}

            {/* 검색창 + 월별 선택 + 분류 필터 */}
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="사용처, 메모, 금액 검색"
                    className="w-full pl-9 pr-3 py-2 text-base bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-2 text-xs font-bold bg-slate-100 text-slate-700 rounded-xl"
                >
                  <option value="전체">전체 월</option>
                  {ALL_MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {Number(m)}월
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {['전체', ...EXPENSE_CATEGORIES].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* 내역 리스트 */}
            <div className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  내역이 없습니다.
                </div>
              ) : (
                filteredExpenses.map((item) => {
                  const isEditing = editingExpId === item.id;
                  const linkedSched = data.scheduledExpenses.find(
                    (s) => s.id === item.replacedScheduledId
                  );
                  const expMonthNum = Number(item.displayDate.split('/')[0] || 10);
                  const cat = (item.category || '기타') as ExpenseCategory;

                  if (isEditing) {
                    return (
                      <div
                        key={item.id}
                        className="py-3.5 space-y-2 bg-slate-50 p-3 rounded-2xl my-1"
                      >
                        <div className="text-xs font-bold text-blue-600">
                          내역 및 확정 원화 금액 수정
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={editMerchant}
                            onChange={(e) => setEditMerchant(e.target.value)}
                            className="px-2.5 py-1.5 text-base bg-white border rounded-xl font-bold"
                            placeholder="사용처"
                          />
                          <input
                            type="number"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className="px-2.5 py-1.5 text-base bg-white border rounded-xl text-right font-bold"
                            placeholder="금액(원)"
                          />
                        </div>
                        <div className="flex gap-2">
                          <select
                            value={editCategory}
                            onChange={(e) =>
                              setEditCategory(e.target.value as ExpenseCategory)
                            }
                            className="px-2.5 py-1.5 text-sm bg-white border rounded-xl"
                          >
                            {EXPENSE_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={editMemo}
                            onChange={(e) => setEditMemo(e.target.value)}
                            placeholder="메모 입력"
                            className="flex-1 px-2.5 py-1.5 text-base bg-white border rounded-xl"
                          />
                        </div>
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setEditingExpId(null)}
                            className="px-3 py-1 text-xs text-slate-500"
                          >
                            취소
                          </button>
                          <button
                            onClick={() => handleSaveExpenseEdit(item.id)}
                            className="px-3.5 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg"
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="py-3.5 flex items-center justify-between gap-3"
                    >
                      {/* 왼쪽: 사용처 + 분류/일시/메모 */}
                      <div
                        onClick={() => startEditExpense(item)}
                        className="min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[15px] font-bold text-slate-900 truncate">
                            {item.merchant}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-md border font-semibold shrink-0 ${
                              CATEGORY_COLORS[cat] || CATEGORY_COLORS['기타']
                            }`}
                          >
                            {cat}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>{item.displayDate}</span>
                          {item.memo && (
                            <span className="text-slate-500 truncate">· {item.memo}</span>
                          )}
                          {item.usdAmount && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">
                              💲{item.usdAmount.toFixed(2)} USD (터치해 원화확정)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 오른쪽: 금액 + 월별 구독 대체 선택창 + 삭제 */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="text-right">
                          <div
                            onClick={() => startEditExpense(item)}
                            className="text-[15px] font-extrabold text-slate-900 cursor-pointer"
                          >
                            {item.amount.toLocaleString()}원
                          </div>

                          {/* 어느 정기구독의 해당 월(expMonthNum)을 대체할지 자유롭게 선택 */}
                          <div className="mt-1 flex justify-end">
                            <select
                              value={item.replacedScheduledId || ''}
                              onChange={async (e) => {
                                const val = e.target.value || null;
                                await api.replaceScheduledWithExpense(item.id, val);
                                await loadData();
                              }}
                              className={`text-[11px] rounded-md px-1.5 py-0.5 font-bold max-w-[140px] truncate ${
                                linkedSched
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              <option value="">⬜ {expMonthNum}월 구독대체</option>
                              {data.scheduledExpenses.map((s) => (
                                <option key={s.id} value={s.id}>
                                  ✓ {expMonthNum}월 {s.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <button
                          onClick={async () => {
                            await api.deleteExpense(item.id);
                            await loadData();
                          }}
                          className="p-1.5 text-slate-300 hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 하단 보고서 복사 & 엑셀 다운로드 */}
            {filteredExpenses.length > 0 && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={handleCopyReport}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copyToast || '보고서 텍스트 복사'}</span>
                </button>
                <button
                  onClick={handleDownloadCsv}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>엑셀(CSV) 저장</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= [탭 2: 사용내역 분석] ================= */}
        {activeTab === 'analysis' && analysisData && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900">항목별 사용 분석</h2>
              <div className="space-y-3">
                {analysisData.categories.map((c) => (
                  <div key={c.category} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">
                        {c.category}{' '}
                        <span className="text-slate-400 font-normal">
                          ({c.count}건 · {c.percent}%)
                        </span>
                      </span>
                      <span className="font-extrabold text-slate-900">
                        {c.amount.toLocaleString()}원
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${c.percent}%` }}
                        className={`h-full rounded-full ${
                          CATEGORY_BAR_COLORS[c.category]
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-slate-900">월별 지출 합계</h2>
              <div className="divide-y divide-slate-100">
                {analysisData.months.map((m) => (
                  <div
                    key={m.rawMonth}
                    className="py-2.5 flex items-center justify-between text-sm"
                  >
                    <span className="font-bold text-slate-700">{m.month}</span>
                    <span className="font-extrabold text-slate-900">
                      {m.amount.toLocaleString()}원
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                자주 사용한 곳 TOP 5
              </h2>
              <div className="divide-y divide-slate-100">
                {analysisData.topMerchants.map((m, idx) => (
                  <div
                    key={m.merchant}
                    className="py-2.5 flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-slate-800">{m.merchant}</span>
                      <span className="text-xs text-slate-400">{m.count}회</span>
                    </div>
                    <span className="font-extrabold text-slate-900">
                      {m.amount.toLocaleString()}원
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= [탭 3: 정기구독 · 자동이체 예정 (월별 반복)] ================= */}
        {activeTab === 'scheduled' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    매월 반복 정기구독 · 자동이체
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    초록색은 실제 내역으로 결제 완료된 달이고, 주황색은 연말까지 앞으로 나갈 달입니다.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddSched(!showAddSched)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  구독 추가
                </button>
              </div>

              {showAddSched && (
                <form
                  onSubmit={handleAddScheduled}
                  className="p-3.5 bg-slate-50 rounded-2xl space-y-2.5"
                >
                  <input
                    type="text"
                    value={schedTitle}
                    onChange={(e) => setSchedTitle(e.target.value)}
                    placeholder="구독 이름 (예: ChatGPT 구독)"
                    className="w-full px-3.5 py-2.5 text-base bg-white border border-slate-200 rounded-xl"
                  />
                  <div className="flex gap-2">
                    <select
                      value={schedStartMonth}
                      onChange={(e) => setSchedStartMonth(e.target.value)}
                      className="px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl font-semibold"
                    >
                      {ALL_MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {Number(m)}월부터~12월
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={schedAmount}
                      onChange={(e) => setSchedAmount(e.target.value)}
                      placeholder="월 예상금액(원)"
                      className="flex-1 px-3.5 py-2.5 text-base bg-white border border-slate-200 rounded-xl"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2.5 bg-amber-500 text-white text-xs font-bold rounded-xl shrink-0"
                    >
                      저장
                    </button>
                  </div>
                </form>
              )}

              {/* 각 정기구독별 1월~12월 월별 체크 현황 */}
              <div className="space-y-4">
                {data.scheduledExpenses.map((sched) => {
                  const active = sched.activeMonths || [];
                  const replacedMap = sched.monthlyReplacedIds || {};
                  const pendingMonths = active.filter((m) => !replacedMap[m]);
                  const remainingSubTotal =
                    pendingMonths.length * sched.estimatedAmount;

                  return (
                    <div
                      key={sched.id}
                      className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-extrabold text-slate-900">
                            {sched.title}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            월 예상{' '}
                            {editingSchedId === sched.id ? (
                              <span className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  value={editSchedAmount}
                                  onChange={(e) => setEditSchedAmount(e.target.value)}
                                  className="w-20 px-1.5 py-0.5 text-sm bg-white border rounded"
                                />
                                <button
                                  onClick={() => handleSaveScheduledAmount(sched.id)}
                                  className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[11px]"
                                >
                                  저장
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingSchedId(sched.id);
                                  setEditSchedAmount(String(sched.estimatedAmount));
                                }}
                                className="font-bold text-slate-700 underline decoration-dotted"
                              >
                                {sched.estimatedAmount.toLocaleString()}원 ✏️
                              </button>
                            )}{' '}
                            · 남은 {pendingMonths.length}개월 ={' '}
                            <strong className="text-amber-600">
                              {remainingSubTotal.toLocaleString()}원 예정
                            </strong>
                          </div>
                        </div>

                        <button
                          onClick={async () => {
                            await api.deleteScheduled(sched.id);
                            await loadData();
                          }}
                          className="p-1 text-slate-300 hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 1월 ~ 12월 월별 배지 그리드 */}
                      <div className="grid grid-cols-6 gap-1.5">
                        {ALL_MONTHS.map((m) => {
                          const isActive = active.includes(m);
                          const replacedExpId = replacedMap[m];
                          const replacedExp = replacedExpId
                            ? data.expenses.find((e) => e.id === replacedExpId)
                            : undefined;

                          if (replacedExp) {
                            return (
                              <button
                                key={m}
                                onClick={async () => {
                                  await api.replaceScheduledWithExpense(
                                    replacedExp.id,
                                    null
                                  );
                                  await loadData();
                                }}
                                className="py-1.5 px-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-bold text-center"
                                title={`${Number(m)}월 실제 결제: ${replacedExp.amount.toLocaleString()}원 (터치 시 대체 해제)`}
                              >
                                <div>✓ {Number(m)}월</div>
                                <div className="text-[9px] font-normal truncate">
                                  {(replacedExp.amount / 1000).toFixed(1)}천
                                </div>
                              </button>
                            );
                          }

                          if (isActive) {
                            return (
                              <button
                                key={m}
                                onClick={async () => {
                                  await api.toggleScheduledMonth(sched.id, m);
                                  await loadData();
                                }}
                                className="py-1.5 px-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-[11px] font-bold text-center"
                                title="터치하면 이 달의 예정에서 제외합니다"
                              >
                                <div>{Number(m)}월</div>
                                <div className="text-[9px] font-normal">예정</div>
                              </button>
                            );
                          }

                          return (
                            <button
                              key={m}
                              onClick={async () => {
                                await api.toggleScheduledMonth(sched.id, m);
                                await loadData();
                              }}
                              className="py-1.5 px-1 rounded-lg bg-white border border-slate-200 text-slate-300 text-[11px] text-center"
                              title="터치하면 이 달을 구독 예정에 추가합니다"
                            >
                              <div>{Number(m)}월</div>
                              <div className="text-[9px]">-</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 해외승인(USD) 자동 환율 계산 안내 및 설정 카드 */}
            <div className="bg-white rounded-3xl p-5 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  <span>해외승인(USD) 문자 자동 환율 계산</span>
                </div>
                <button
                  onClick={handleRefreshUsdRate}
                  className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold"
                >
                  실시간 환율 갱신
                </button>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                문자에 <strong>22.00USD</strong> 처럼 달러로 찍혀 오면, 현재 환율(카드 해외수수료 포함{' '}
                <strong>1$ = {(data.settings.usdExchangeRate || 1480).toLocaleString()}원</strong>
                )을 자동 곱해서 원화로 넣어줍니다. 추후 카드 명세서에서 확정된 원화 금액으로 1초 만에 수정하실 수 있습니다.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
