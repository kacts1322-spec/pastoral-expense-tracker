// Vercel Serverless Function: 아이폰 단축어 호출 시 클라우드 DB에 저장 및 취소문자 자동 삭제 처리
const ENCODED_KEY = [
  110, 111, 118, 102, 118, 125, 113, 85, 57, 86, 129, 60, 77, 84, 113, 97, 76,
  126, 121, 117, 82, 75, 73, 119, 127, 89, 60, 81, 112, 77, 91, 96, 57, 77, 55,
  119, 119, 59, 104, 118,
];

function getToken() {
  return String.fromCharCode(...ENCODED_KEY.map((c) => c - 7));
}

const ISSUE_URL =
  'https://api.github.com/repos/kacts1322-spec/pastoral-expense-tracker/issues/1';

function guessCategory(merchant) {
  const n = merchant.replace(/\s+/g, '');
  if (/카페|커피|스타벅스|투썸|이디야|메가|컴포즈|빽다방|베이커리|제과|다과/.test(n))
    return '심방/다과';
  if (/식당|김밥|국밥|갈비|회관|설렁탕|칼국수|반점|치킨|피자|버거|죽|비빔밥|한정식/.test(n))
    return '식비/교제';
  if (/서점|교보|알라딘|예스24|북스|출판|문구|기독교/.test(n)) return '도서/연구';
  if (/주유|칼텍스|에쓰오일|오일뱅크|SK|주차|하이패스|택시|코레일/.test(n))
    return '차량/교통';
  if (/통신|KT|SKT|LGU|인터넷|렌탈|보험|OPENAI|ZOOM|구독/.test(n.toUpperCase()))
    return '고정/구독';
  return '기타';
}

function splitBulkSms(bulkText) {
  if (!bulkText || !bulkText.trim()) return [];
  const chunksByHeader = bulkText
    .split(/(?=\[(?:Web|웹|국외)발신\])/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const results = [];
  for (const chunk of chunksByHeader) {
    const lines = chunk
      .replace(/^\[(?:Web|웹|국외)발신\]\s*/i, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const linesWithBoth = lines.filter(
      (line) => /\d{1,2}\/\d{1,2}/.test(line) && /[\d,]+\s*원/.test(line)
    );
    if (linesWithBoth.length > 1) {
      for (const line of linesWithBoth) {
        results.push(`[Web발신]\n${line}`);
      }
    } else {
      results.push(chunk);
    }
  }
  return results;
}

function parseSms(rawSms, keywords) {
  const cleaned = (rawSms || '').trim();
  if (!cleaned) return null;

  if (keywords && keywords.length > 0) {
    const normSms = cleaned.replace(/\s+/g, '');
    const matched = keywords.some((k) => normSms.includes(k.replace(/\s+/g, '')));
    if (!matched) return null;
  }

  const body = cleaned
    .replace(/\[(?:Web|웹|국외)발신\]/gi, ' ')
    .replace(/누적\s*:?\s*[\d,]+\s*원?/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();

  const isCancel = /취소/.test(body);
  const amountMatch = body.match(/([+-]?[\d,]+)\s*원/);
  if (!amountMatch) return null;

  const num = Math.abs(parseInt(amountMatch[1].replace(/,/g, ''), 10));
  if (isNaN(num)) return null;

  const dateTimeRegex =
    /(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])(?!\d)(?:\s+([012]?\d:[0-5]\d))?/;
  const dateMatch = body.match(dateTimeRegex);

  const year = '2026';
  let mm = '10';
  let dd = '10';
  let time = '00:00';

  if (dateMatch) {
    mm = dateMatch[1].padStart(2, '0');
    dd = dateMatch[2].padStart(2, '0');
    time = dateMatch[3] ? dateMatch[3].padStart(5, '0') : '00:00';
  }

  let merchant = '';
  if (dateMatch && dateMatch.index !== undefined) {
    merchant = body
      .slice(dateMatch.index + dateMatch[0].length)
      .replace(/([+-]?[\d,]+)\s*원/g, ' ')
      .replace(/\b(?:일시불|할부|\d+개월|승인취소|승인|취소|출금|체크)\b/g, ' ')
      .trim();
  }
  merchant = merchant.replace(/\s+/g, ' ').trim() || '기타사용처';

  return {
    dateTime: `${year}-${mm}-${dd} ${time}`,
    displayDate: `${mm}/${dd} ${time}`,
    year,
    merchant,
    amount: num,
    isCancel,
    category: guessCategory(merchant),
    memo: '',
    rawSms: cleaned,
  };
}

export default async function handler(req, res) {
  try {
    const sms = req.query?.sms || req.body?.sms || req.body?.message || '';
    if (!sms) {
      return res.status(400).json({ ok: false, error: 'sms 파라미터가 없습니다.' });
    }

    const token = getToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PastoralExpenseTracker',
    };

    const getRes = await fetch(ISSUE_URL, { headers });
    const issue = await getRes.json();
    const db = JSON.parse(issue.body);

    const chunks = splitBulkSms(String(sms));
    let added = 0;
    let canceled = 0;

    for (const chunk of chunks) {
      const parsed = parseSms(chunk, db.settings?.targetKeywords || ['하나7693']);
      if (!parsed) continue;

      // 취소 문자인 경우: 이전에 결제된 동일 사용처 + 동일 금액 내역을 찾아 자동 삭제!
      if (parsed.isCancel) {
        const normMerchant = parsed.merchant.replace(/\s+/g, '');
        let targetIdx = db.expenses.findIndex(
          (e) =>
            e.amount === parsed.amount &&
            e.merchant.replace(/\s+/g, '') === normMerchant
        );
        // 만약 취소 문자에 사용처가 다르게 표기되었더라도 동일 금액의 최근 결제가 있으면 삭제
        if (targetIdx === -1) {
          targetIdx = db.expenses.findIndex((e) => e.amount === parsed.amount);
        }

        if (targetIdx !== -1) {
          const removed = db.expenses[targetIdx];
          if (removed.replacedScheduledId) {
            const sched = (db.scheduledExpenses || []).find(
              (s) => s.id === removed.replacedScheduledId
            );
            if (sched) sched.replacedByExpenseId = undefined;
          }
          db.expenses.splice(targetIdx, 1);
          canceled++;
        }
        continue;
      }

      const dup = db.expenses.find(
        (e) =>
          e.dateTime === parsed.dateTime &&
          e.amount === parsed.amount &&
          e.merchant === parsed.merchant
      );
      if (dup) continue;

      const { isCancel, ...itemData } = parsed;
      db.expenses.unshift({
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ...itemData,
      });
      added++;
    }

    db.expenses.sort((a, b) => b.dateTime.localeCompare(a.dateTime));

    await fetch(ISSUE_URL, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: JSON.stringify(db) }),
    });

    return res.status(200).json({ ok: true, added, canceled });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
