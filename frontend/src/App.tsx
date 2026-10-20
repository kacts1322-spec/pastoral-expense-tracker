import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Check, Trash2, Edit2, X } from 'lucide-react';
import { api } from './api';
import { DashboardData } from './types';

export const App: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);

  // 문자 붙여넣기 입력창 열림 상태
  const [showSmsBox, setShowSmsBox] = useState(false);
  const [smsInput, setSmsInput] = useState('');

  // 1년 예산 수정 상태
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetText, setBudgetText] = useState('3000000');

  // 자동이체 예정 추가 열림 상태
  const [showAddSched, setShowAddSched] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedAmount, setSchedAmount] = useState('');

  // 자동이체 예정 금액 수정 상태
  const [editingSchedId, setEditingSchedId] = useState<string | null>(null);
  const [editSchedAmount, setEditSchedAmount] = useState('');

  const loadData = useCallback(async () => {
    const res = await api.getDashboard('2026');
    setData(res);
  }, []);

  useEffect(() => {
    // 아이폰 단축어로 ?sms=문자내용 이 넘어왔을 때 즉시 자동 등록
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
  }, [loadData]);

  // 1. 문자 붙여넣기 등록
  const handleAddSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsInput.trim()) return;
    await api.submitSms(smsInput, false);
    setSmsInput('');
    setShowSmsBox(false);
    await loadData();
  };

  // 2. 1년 예산 저장
  const handleSaveBudget = async () => {
    const num = Number(budgetText.replace(/,/g, ''));
    if (!isNaN(num) && num >= 0) {
      await api.updateSettings({ yearlyBudget: num });
      setEditingBudget(false);
      await loadData();
    }
  };

  // 3. 자동이체 예정 추가
  const handleAddScheduled = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedTitle.trim() || !schedAmount) return;
    await api.addScheduled(schedTitle.trim(), Number(schedAmount), '2026');
    setSchedTitle('');
    setSchedAmount('');
    setShowAddSched(false);
    await loadData();
  };

  // 4. 자동이체 예정 금액 수정
  const handleSaveScheduledAmount = async (id: string) => {
    const num = Number(editSchedAmount);
    if (!isNaN(num)) {
      await api.updateScheduled(id, { estimatedAmount: num });
      setEditingSchedId(null);
      await loadData();
    }
  };

  // 5. 실제 내역으로 자동이체 예정 금액 대체 토글
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

  // 진행률 바 계산
  const totalBudget = data.yearlyBudget || 1;
  const usedPercent = Math.min(
    100,
    Math.max(0, ((data.actualSpent + data.pendingScheduledSpent) / totalBudget) * 100)
  );

  return (
    <div className="min-h-screen bg-[#f2f4f6] pb-16">
      <div className="max-w-md mx-auto px-4 pt-5 space-y-4">
        {/* 1. 상단 카드: 남은 목회비 (토스 스타일 모바일 카드) */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="text-xs font-semibold text-slate-400">2026년 남은 목회비</div>
          <div className="mt-1 text-[32px] leading-tight font-extrabold tracking-tight text-slate-900">
            {data.remainingBudget.toLocaleString()}원
          </div>

          {/* 심플 게이지 바 */}
          <div className="mt-4 w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              style={{ width: `${usedPercent}%` }}
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
            />
          </div>

          {/* 가로로 찌그러지지 않는 깔끔한 3줄 요약 */}
          <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5 text-sm">
            {/* 1년 예산 */}
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

            {/* 실제 쓴 금액 */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">실제 사용</span>
              <span className="font-bold text-slate-900">
                {data.actualSpent.toLocaleString()}원
              </span>
            </div>

            {/* 자동이체 예정 */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">자동이체 예정</span>
              <span className="font-bold text-amber-600">
                {data.pendingScheduledSpent.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>

        {/* 2. 중단 카드: 자동이체 예정 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">자동이체 예정</h2>
            <button
              onClick={() => setShowAddSched(!showAddSched)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              추가
            </button>
          </div>

          {/* 예정 추가 폼 (버튼 눌렀을 때만 열림, 모바일에서 안 깨지게 세로 배치) */}
          {showAddSched && (
            <form
              onSubmit={handleAddScheduled}
              className="mt-3 p-3.5 bg-slate-50 rounded-2xl space-y-2.5"
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

          {/* 자동이체 예정 리스트 */}
          <div className="mt-3 divide-y divide-slate-100">
            {data.scheduledExpenses.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">
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
                          replacedExp ? 'line-through text-slate-400' : 'text-slate-800'
                        }`}
                      >
                        {sched.title}
                      </div>
                      {replacedExp && (
                        <div className="text-xs font-semibold text-emerald-600 mt-0.5">
                          ✓ {replacedExp.merchant} ({replacedExp.amount.toLocaleString()}원) 대체됨
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
                            replacedExp ? 'line-through text-slate-300' : 'text-amber-600'
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

        {/* 3. 하단 카드: 사용 내역 (모바일 최적화 리스트 형태) */}
        <div className="bg-white rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              사용 내역 ({data.expenses.length})
            </h2>
            <button
              onClick={() => setShowSmsBox(!showSmsBox)}
              className="inline-flex items-center gap-1 px-3.5 py-2 rounded-full bg-blue-600 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              문자 붙여넣기
            </button>
          </div>

          {/* 문자 붙여넣기 입력창 */}
          {showSmsBox && (
            <form
              onSubmit={handleAddSms}
              className="mt-3 p-3.5 bg-slate-50 rounded-2xl space-y-2.5"
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
                  내역에 넣기
                </button>
              </div>
            </form>
          )}

          {/* 모바일에서 글자가 절대 깨지지 않는 토스식 2줄 리스트 */}
          <div className="mt-3 divide-y divide-slate-100">
            {data.expenses.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                아직 사용 내역이 없습니다.
              </div>
            ) : (
              data.expenses.map((item) => {
                const isReplacing = Boolean(item.replacedScheduledId);
                const linkedSched = data.scheduledExpenses.find(
                  (s) => s.id === item.replacedScheduledId
                );

                return (
                  <div
                    key={item.id}
                    className="py-3.5 flex items-center justify-between gap-3"
                  >
                    {/* 왼쪽: 사용처 (크게) + 일시 (아래에 작게) */}
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold text-slate-900 truncate">
                        {item.merchant}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {item.displayDate}
                      </div>
                    </div>

                    {/* 오른쪽: 금액 + 자동이체 대체 버튼 + 삭제 */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-[15px] font-extrabold text-slate-900">
                          {item.amount.toLocaleString()}원
                        </div>

                        {/* 자동이체 대체 체크/버튼 (금액 바로 아래에 깔끔하게 배치) */}
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
                              ✓ {linkedSched ? linkedSched.title : '자동이체 대체됨'}
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
        </div>
      </div>
    </div>
  );
};
