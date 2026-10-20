import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Plus, Check, Edit2 } from 'lucide-react';
import { api } from './api';
import { DashboardData } from './types';

export const App: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [smsInput, setSmsInput] = useState('');
  const [showSmsBox, setShowSmsBox] = useState(false);

  // 1년 예산 수정 상태
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetText, setBudgetText] = useState('3000000');

  // 자동이체 예정 추가 입력창 상태
  const [schedTitle, setSchedTitle] = useState('');
  const [schedAmount, setSchedAmount] = useState('');

  // 자동이체 예정 수정 상태
  const [editingSchedId, setEditingSchedId] = useState<string | null>(null);
  const [editSchedAmount, setEditSchedAmount] = useState('');

  const loadData = useCallback(async () => {
    const res = await api.getDashboard('2026');
    setData(res);
  }, []);

  useEffect(() => {
    // 아이폰 단축어에서 https://내주소.vercel.app/?sms=문자내용 으로 열었을 때 자동 등록
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

  // 2. 1년 예산 수정 저장
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

  // 5. 아래 실제 사용내역에서 체크해서 자동이체 예정 항목 대체하기
  const handleToggleReplaceScheduled = async (
    expenseId: string,
    currentReplacedId?: string
  ) => {
    if (!data) return;

    // 이미 대체 연결된 상태면 체크 해제 (원래대로 복구)
    if (currentReplacedId) {
      await api.replaceScheduledWithExpense(expenseId, null);
      await loadData();
      return;
    }

    // 아직 대체되지 않은 자동이체 예정 항목 찾기
    const pendingList = data.scheduledExpenses.filter((s) => !s.replacedByExpenseId);
    if (pendingList.length === 0) {
      alert('대체할 자동이체 예정 항목이 위에 없습니다.');
      return;
    }

    // 대기 중인 예정 항목이 1개면 바로 그 항목을 대체!
    if (pendingList.length === 1) {
      await api.replaceScheduledWithExpense(expenseId, pendingList[0].id);
      await loadData();
      return;
    }
  };

  if (!data) {
    return <div className="p-8 text-center text-slate-400">불러오는 중...</div>;
  }

  const pendingScheduledList = data.scheduledExpenses.filter(
    (s) => !s.replacedByExpenseId
  );

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* 1. 맨 위: 1년 목회비 현황 (300만 원 기준) */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200">
          <div className="text-sm font-medium text-slate-500">남은 목회비 (2026년)</div>
          <div className="text-3xl sm:text-4xl font-extrabold text-indigo-600 mt-1">
            {data.remainingBudget.toLocaleString()}원
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
            {/* 1년 예산 */}
            <div className="bg-slate-50 p-3 rounded-xl">
              <div className="text-xs text-slate-500">1년 예산</div>
              {!editingBudget ? (
                <button
                  onClick={() => {
                    setBudgetText(String(data.yearlyBudget));
                    setEditingBudget(true);
                  }}
                  className="mt-1 font-bold text-sm sm:text-base text-slate-800 hover:text-indigo-600 inline-flex items-center gap-1"
                >
                  {data.yearlyBudget.toLocaleString()}원
                  <Edit2 className="w-3 h-3 text-slate-400" />
                </button>
              ) : (
                <div className="mt-1 flex items-center justify-center gap-1">
                  <input
                    type="number"
                    value={budgetText}
                    onChange={(e) => setBudgetText(e.target.value)}
                    className="w-24 px-1.5 py-0.5 text-xs border rounded"
                  />
                  <button
                    onClick={handleSaveBudget}
                    className="p-1 bg-indigo-600 text-white rounded"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* 실제 사용 */}
            <div className="bg-slate-50 p-3 rounded-xl">
              <div className="text-xs text-slate-500">실제 사용</div>
              <div className="mt-1 font-bold text-sm sm:text-base text-slate-800">
                {data.actualSpent.toLocaleString()}원
              </div>
            </div>

            {/* 자동이체 예정 */}
            <div className="bg-amber-50 p-3 rounded-xl">
              <div className="text-xs text-amber-800">자동이체 예정</div>
              <div className="mt-1 font-bold text-sm sm:text-base text-amber-900">
                {data.pendingScheduledSpent.toLocaleString()}원
              </div>
            </div>
          </div>
        </div>

        {/* 2. 가운데: 자동이체 예정 (미리 반영) */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 space-y-3">
          <div className="font-bold text-slate-800 text-base">자동이체 예정</div>

          {/* 예정 추가 한 줄 입력 */}
          <form onSubmit={handleAddScheduled} className="flex gap-2">
            <input
              type="text"
              value={schedTitle}
              onChange={(e) => setSchedTitle(e.target.value)}
              placeholder="예: 달러 구독료"
              className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-indigo-500"
            />
            <input
              type="number"
              value={schedAmount}
              onChange={(e) => setSchedAmount(e.target.value)}
              placeholder="예상 금액(원)"
              className="w-32 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-indigo-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl shrink-0"
            >
              추가
            </button>
          </form>

          {/* 예정 목록 */}
          <div className="divide-y divide-slate-100">
            {data.scheduledExpenses.map((sched) => {
              const replacedExp = data.expenses.find(
                (e) => e.id === sched.replacedByExpenseId
              );

              return (
                <div
                  key={sched.id}
                  className="py-2.5 flex items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <span
                      className={`font-semibold ${
                        replacedExp ? 'line-through text-slate-400' : 'text-slate-800'
                      }`}
                    >
                      {sched.title}
                    </span>
                    {replacedExp && (
                      <span className="ml-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                        ✓ {replacedExp.merchant} ({replacedExp.amount.toLocaleString()}원)으로 대체됨
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {editingSchedId === sched.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={editSchedAmount}
                          onChange={(e) => setEditSchedAmount(e.target.value)}
                          className="w-24 px-2 py-1 text-xs border rounded"
                        />
                        <button
                          onClick={() => handleSaveScheduledAmount(sched.id)}
                          className="p-1 bg-indigo-600 text-white rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`font-bold ${
                          replacedExp ? 'line-through text-slate-400' : 'text-amber-700'
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
                        className="p-1 text-slate-400 hover:text-slate-700"
                        title="예상 금액 수정"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={async () => {
                        await api.deleteScheduled(sched.id);
                        await loadData();
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. 맨 아래: 사용 내역 (일시 · 사용처 · 금액 + 자동이체 대체 체크) */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-800 text-base">
              사용 내역 ({data.expenses.length}건)
            </div>
            <button
              onClick={() => setShowSmsBox(!showSmsBox)}
              className="inline-flex items-center gap-1 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl"
            >
              <Plus className="w-4 h-4" />
              문자 붙여넣기
            </button>
          </div>

          {/* 문자 붙여넣기 입력창 */}
          {showSmsBox && (
            <form
              onSubmit={handleAddSms}
              className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2"
            >
              <textarea
                rows={3}
                value={smsInput}
                onChange={(e) => setSmsInput(e.target.value)}
                placeholder="[Web발신] 하나7693승인 김*욱 6,600원 일시불 10/10 19:30  카페하루"
                className="w-full p-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSmsBox(false)}
                  className="px-3 py-1.5 text-xs text-slate-600"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg"
                >
                  등록
                </button>
              </div>
            </form>
          )}

          {/* 내역 표: 일시 | 사용처 | 금액 | 자동이체 대체 */}
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2.5 px-2">일시</th>
                <th className="py-2.5 px-2">사용처</th>
                <th className="py-2.5 px-2 text-right">금액</th>
                <th className="py-2.5 px-2 text-center">자동이체 대체</th>
                <th className="py-2.5 px-1 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {data.expenses.map((item) => {
                const isReplacing = Boolean(item.replacedScheduledId);
                const linkedSched = data.scheduledExpenses.find(
                  (s) => s.id === item.replacedScheduledId
                );

                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    {/* 일시 */}
                    <td className="py-3 px-2 text-xs sm:text-sm text-slate-600 font-mono whitespace-nowrap">
                      {item.displayDate}
                    </td>

                    {/* 사용처 */}
                    <td className="py-3 px-2 font-bold text-slate-900">
                      {item.merchant}
                    </td>

                    {/* 금액 */}
                    <td className="py-3 px-2 text-right font-extrabold text-slate-900 whitespace-nowrap">
                      {item.amount.toLocaleString()}원
                    </td>

                    {/* 자동이체 예정 대체 체크 / 선택 */}
                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      {isReplacing ? (
                        <button
                          onClick={() =>
                            handleToggleReplaceScheduled(item.id, item.replacedScheduledId)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold"
                          title="클릭하면 대체 해제"
                        >
                          ☑ {linkedSched ? linkedSched.title : '대체됨'}
                        </button>
                      ) : pendingScheduledList.length <= 1 ? (
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handleToggleReplaceScheduled(item.id)}
                          className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                          title="체크하면 위 자동이체 예정 금액을 이 금액으로 대체합니다"
                        />
                      ) : (
                        <select
                          value=""
                          onChange={async (e) => {
                            if (e.target.value) {
                              await api.replaceScheduledWithExpense(item.id, e.target.value);
                              await loadData();
                            }
                          }}
                          className="text-xs border border-slate-300 rounded px-1.5 py-1 bg-white text-slate-700"
                        >
                          <option value="">예정 선택...</option>
                          {pendingScheduledList.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title} ({s.estimatedAmount.toLocaleString()}원)
                            </option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* 삭제 */}
                    <td className="py-3 px-1 text-right">
                      <button
                        onClick={async () => {
                          await api.deleteExpense(item.id);
                          await loadData();
                        }}
                        className="p-1 text-slate-300 hover:text-rose-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
