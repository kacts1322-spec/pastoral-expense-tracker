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
} from 'lucide-react';
import { api } from './api';
import {
  DashboardData,
  ExpenseCategory,
  EXPENSE_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_BAR_COLORS,
  ExpenseItem,
} from './types';

type ActiveTab = 'list' | 'analysis' | 'scheduled';

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

  // 검색 및 분류 필터
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
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

  // 자동이체 예정 추가/수정 상태
  const [showAddSched, setShowAddSched] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedAmount, setSchedAmount] = useState('');
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
    // 1) 아이폰 단축어로 ?sms=문자내용 이 넘어왔을 때 클라우드 DB에 즉시 저장
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

    // 2) 홈 화면에 추가한 앱을 다시 열 때마다 클라우드에서 최신 내역 자동 동기화
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

  // 검색 및 분류 필터링된 내역
  const filteredExpenses = useMemo(() => {
    if (!data) return [];
    return data.expenses.filter((item) => {
      const cat = item.category || '기타';
      const matchCat = selectedCategory === '전체' || cat === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        item.merchant.toLowerCase().includes(q) ||
        (item.memo || '').toLowerCase().includes(q) ||
        item.displayDate.includes(q) ||
        String(item.amount).includes(q);
      return matchCat && matchSearch;
    });
  }, [data, selectedCategory, searchQuery]);

  // 사용내역 분석 데이터 계산 (분류별 / 월별 / 자주 간 사용처 TOP 5)
  const analysisData = useMemo(() => {
    if (!data) return null;
    const total = data.actualSpent || 1;

    // 1) 분류별 집계
    const byCategoryMap: Record<ExpenseCategory, { amount: number; count: number }> = {
      '심방/다과': { amount: 0, count: 0 },
      '식비/교제': { amount: 0, count: 0 },
      '도서/연구': { amount: 0, count: 0 },
      '차량/교통': { amount: 0, count: 0 },
      '고정/구독': { amount: 0, count: 0 },
      기타: { amount: 0, count: 0 },
    };

    // 2) 월별 집계
    const byMonthMap: Record<string, number> = {};

    // 3) 사용처별 집계
    const byMerchantMap: Record<string, { amount: number; count: number }> = {};

    for (const exp of data.expenses) {
      const cat = (exp.category || '기타') as ExpenseCategory;
      if (!byCategoryMap[cat]) byCategoryMap[cat] = { amount: 0, count: 0 };
      byCategoryMap[cat].amount += exp.amount;
      byCategoryMap[cat].count += 1;

      const mm = exp.displayDate.split('/')[0] || '10';
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

  // 1. 문자 붙여넣기 등록
  const handleAddSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsInput.trim()) return;
    await api.submitSms(smsInput, false);
    setSmsInput('');
    setShowSmsBox(false);
    await loadData();
  };

  // 2. 수동 내역 추가
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

  // 3. 내역 수정 시작 & 저장
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

  // 4. 1년 예산 저장
  const handleSaveBudget = async () => {
    const num = Number(budgetText.replace(/,/g, ''));
    if (!isNaN(num) && num >= 0) {
      await api.updateSettings({ yearlyBudget: num });
      setEditingBudget(false);
      await loadData();
    }
  };

  // 5. 자동이체 예정 추가 / 수정
  const handleAddScheduled = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedTitle.trim() || !schedAmount) return;
    await api.addScheduled(schedTitle.trim(), Number(schedAmount), '2026');
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

  // 6. 실제 내역으로 자동이체 예정 금액 대체 토글
  const handleToggleReplaceScheduled = async (
    expenseId: string,
    currentReplacedId?: string
  ) => {
    if (!data) return;

    if (currentReplacedId) {
      await api.replaceScheduledWithExpense(expenseId, null);
      await loadData();
      return;
    }

    const pendingList = data.scheduledExpenses.filter((s) => !s.replacedByExpenseId);
    if (pendingList.length === 0) {
      alert('대체할 자동이체 예정 내역이 없습니다.');
      return;
    }

    if (pendingList.length === 1) {
      await api.replaceScheduledWithExpense(expenseId, pendingList[0].id);
      await loadData();
    }
  };

  // 7. 보고서 복사 & 엑셀 다운로드
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

  const pendingScheduledList = data.scheduledExpenses.filter(
    (s) => !s.replacedByExpenseId
  );

  const totalBudget = data.yearlyBudget || 1;
  const usedPercent = Math.min(
    100,
    Math.max(0, ((data.actualSpent + data.pendingScheduledSpent) / totalBudget) * 100)
  );

  return (
    <div className="min-h-screen bg-[#f2f4f6] pb-20">
      <div className="max-w-md mx-auto px-4 pt-5 space-y-4">
        {/* 1. 상단 카드: 남은 목회비 현황 */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">
              2026년 남은 목회비
            </span>
            <button
              onClick={loadData}
              className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100"
              title="동기화 새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>

          <div className="mt-0.5 text-[32px] leading-tight font-extrabold tracking-tight text-slate-900">
            {data.remainingBudget.toLocaleString()}원
          </div>

          {/* 진행률 게이지 */}
          <div className="mt-4 w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              style={{ width: `${usedPercent}%` }}
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
            />
          </div>

          {/* 3줄 요약 */}
          <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">1년 예산</span>
              {!editingBudget ? (
                <button
                  onClick={() => {
                    setBudgetText(String(data.yearlyBudget));
                    setEditingBudget(true);
                  }}
                  className="font-semibold text-slate-700 inline-flex items-center gap-1.5"
                >
                  <span>{data.yearlyBudget.toLocaleString()}원</span>
                  <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={budgetText}
                    onChange={(e) => setBudgetText(e.target.value)}
                    className="w-32 px-2.5 py-1 text-base border border-slate-300 rounded-lg text-right"
                  />
                  <button
                    onClick={handleSaveBudget}
                    className="p-1.5 bg-blue-600 text-white rounded-lg"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingBudget(false)}
                    className="p-1.5 bg-slate-200 text-slate-600 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">실제 사용 ({data.expenses.length}건)</span>
              <span className="font-bold text-slate-900">
                {data.actualSpent.toLocaleString()}원
              </span>
            </div>

            <div
              onClick={() => setActiveTab('scheduled')}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="text-slate-500 underline decoration-dotted">
                자동이체 예정 ({pendingScheduledList.length}건 대기)
              </span>
              <span className="font-bold text-amber-600">
                {data.pendingScheduledSpent.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>

        {/* 2. 토스 스타일 3탭 스위치 (화면이 복잡해지지 않게 탭으로 분리) */}
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
            <span>자동이체예정</span>
          </button>
        </div>

        {/* ================= [탭 1: 사용내역] ================= */}
        {activeTab === 'list' && (
          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
            {/* 상단 버튼 바 */}
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

            {/* 문자 붙여넣기 창 */}
            {showSmsBox && (
              <form
                onSubmit={handleAddSms}
                className="p-3.5 bg-slate-50 rounded-2xl space-y-2.5"
              >
                <textarea
                  rows={3}
                  value={smsInput}
                  onChange={(e) => setSmsInput(e.target.value)}
                  placeholder="[Web발신] 하나7693승인 김*욱 6,600원 일시불 10/10 19:30  카페하루"
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

            {/* 검색창 & 분류 필터 칩 */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="사용처, 메모, 날짜 검색"
                  className="w-full pl-9 pr-3 py-2 text-base bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
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
                  const isReplacing = Boolean(item.replacedScheduledId);
                  const linkedSched = data.scheduledExpenses.find(
                    (s) => s.id === item.replacedScheduledId
                  );
                  const cat = (item.category || '기타') as ExpenseCategory;

                  if (isEditing) {
                    return (
                      <div
                        key={item.id}
                        className="py-3.5 space-y-2 bg-slate-50 p-3 rounded-2xl my-1"
                      >
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
                            placeholder="금액"
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
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>{item.displayDate}</span>
                          {item.memo && (
                            <span className="text-slate-500 truncate">· {item.memo}</span>
                          )}
                        </div>
                      </div>

                      {/* 오른쪽: 금액 + 자동이체 대체 체크 + 삭제 */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="text-right">
                          <div className="text-[15px] font-extrabold text-slate-900">
                            {item.amount.toLocaleString()}원
                          </div>

                          {/* 자동이체 대체 버튼/드롭다운 */}
                          <div className="mt-1 flex justify-end">
                            {isReplacing ? (
                              <button
                                onClick={() =>
                                  handleToggleReplaceScheduled(
                                    item.id,
                                    item.replacedScheduledId
                                  )
                                }
                                className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-bold"
                              >
                                ✓ {linkedSched ? linkedSched.title : '대체됨'}
                              </button>
                            ) : pendingScheduledList.length === 1 ? (
                              <button
                                onClick={() => handleToggleReplaceScheduled(item.id)}
                                className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold"
                              >
                                ⬜ 자동이체 대체
                              </button>
                            ) : pendingScheduledList.length > 1 ? (
                              <select
                                value=""
                                onChange={async (e) => {
                                  if (e.target.value) {
                                    await api.replaceScheduledWithExpense(
                                      item.id,
                                      e.target.value
                                    );
                                    await loadData();
                                  }
                                }}
                                className="text-[11px] bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5"
                              >
                                <option value="">⬜ 자동이체 대체</option>
                                {pendingScheduledList.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.title} ({s.estimatedAmount.toLocaleString()}원)
                                  </option>
                                ))}
                              </select>
                            ) : null}
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

            {/* 하단 보고서 복사 & 엑셀 다운로드 버튼 */}
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
            {/* 1. 분류별 지출 분석 카드 */}
            <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                항목별 사용 분석
              </h2>

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

            {/* 2. 월별 지출 추이 카드 */}
            <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-slate-900">월별 지출 합계</h2>
              {analysisData.months.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  데이터가 없습니다.
                </div>
              ) : (
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
              )}
            </div>

            {/* 3. 자주 이용한 사용처 TOP 5 */}
            <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                자주 사용한 곳 TOP 5
              </h2>
              {analysisData.topMerchants.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  데이터가 없습니다.
                </div>
              ) : (
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
              )}
            </div>
          </div>
        )}

        {/* ================= [탭 3: 자동이체 예정] ================= */}
        {activeTab === 'scheduled' && (
          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">자동이체 예정</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  실제 빠져나간 뒤 [사용내역] 탭에서 체크하면 실제 금액으로 대체됩니다.
                </p>
              </div>
              <button
                onClick={() => setShowAddSched(!showAddSched)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                추가
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
                  placeholder="내역 이름 (예: 달러 구독료)"
                  className="w-full px-3.5 py-2.5 text-base bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={schedAmount}
                    onChange={(e) => setSchedAmount(e.target.value)}
                    placeholder="예상 금액 (원)"
                    className="flex-1 px-3.5 py-2.5 text-base bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl shrink-0"
                  >
                    저장
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-slate-100">
              {data.scheduledExpenses.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  등록된 자동이체 예정 내역이 없습니다.
                </div>
              ) : (
                data.scheduledExpenses.map((sched) => {
                  const replacedExp = data.expenses.find(
                    (e) => e.id === sched.replacedByExpenseId
                  );

                  return (
                    <div
                      key={sched.id}
                      className="py-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm font-bold truncate ${
                            replacedExp
                              ? 'line-through text-slate-400'
                              : 'text-slate-800'
                          }`}
                        >
                          {sched.title}
                        </div>
                        {replacedExp && (
                          <div className="text-xs font-semibold text-emerald-600 mt-0.5">
                            ✓ {replacedExp.merchant} (
                            {replacedExp.amount.toLocaleString()}원) 대체됨
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {editingSchedId === sched.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editSchedAmount}
                              onChange={(e) => setEditSchedAmount(e.target.value)}
                              className="w-24 px-2 py-1 text-base border border-slate-300 rounded-lg text-right"
                            />
                            <button
                              onClick={() => handleSaveScheduledAmount(sched.id)}
                              className="p-1.5 bg-blue-600 text-white rounded-lg"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`text-sm font-extrabold ${
                              replacedExp
                                ? 'line-through text-slate-300'
                                : 'text-amber-600'
                            }`}
                          >
                            {sched.estimatedAmount.toLocaleString()}원
                          </span>
                        )}

                        {!replacedExp && editingSchedId !== sched.id && (
                          <button
                            onClick={() => {
                              setEditingSchedId(sched.id);
                              setEditSchedAmount(String(sched.estimatedAmount));
                            }}
                            className="p-1 text-slate-400"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

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
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
