export interface ParsedSmsResult {
  isValid: boolean;
  isMatchedFilter: boolean;
  filterFailReason?: string;
  dateTime: string;      // 예: "2026-10-10 19:30"
  displayDate: string;   // 예: "10/10 19:30"
  year: string;          // 예: "2026"
  amount: number;        // 예: 6600
  merchant: string;      // 예: "카페하루"
  rawSms: string;
}

/**
 * 여러 개의 문자가 한 번에 붙여넣기 되었을 때 개별 문자 단위로 분리하는 함수
 */
export function splitBulkSmsText(bulkText: string): string[] {
  if (!bulkText || !bulkText.trim()) return [];

  const chunksByHeader = bulkText
    .split(/(?=\[(?:Web|웹|국외)발신\])/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const results: string[] = [];

  for (const chunk of chunksByHeader) {
    const lines = chunk
      .replace(/^\[(?:Web|웹|국외)발신\]\s*/i, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const linesWithBothDateAndAmount = lines.filter(
      (line) => /\d{1,2}\/\d{1,2}/.test(line) && /[\d,]+\s*원/.test(line)
    );

    if (linesWithBothDateAndAmount.length > 1) {
      for (const line of linesWithBothDateAndAmount) {
        results.push(`[Web발신]\n${line}`);
      }
    } else {
      results.push(chunk);
    }
  }

  return results;
}

/**
 * 단일 카드/은행 SMS 문자를 분석하여 [일시, 금액, 사용처] 딱 3가지만 추출하는 핵심 파서
 *
 * 예시:
 * [Web발신]
 * 하나7693승인 김*욱 6,600원 일시불 10/10 19:30  카페하루
 */
export function parseSingleSms(
  rawSms: string,
  options?: {
    targetKeywords?: string[];
    referenceYear?: number;
  }
): ParsedSmsResult {
  const cleanedRaw = rawSms.trim();
  const currentYear = String(options?.referenceYear ?? new Date().getFullYear());

  const emptyResult: ParsedSmsResult = {
    isValid: false,
    isMatchedFilter: false,
    dateTime: '',
    displayDate: '',
    year: currentYear,
    amount: 0,
    merchant: '',
    rawSms: cleanedRaw,
  };

  if (!cleanedRaw) {
    return { ...emptyResult, filterFailReason: '빈 문자입니다.' };
  }

  // 1. 특정 키워드(예: "하나7693") 포함 여부 확인
  if (options?.targetKeywords && options.targetKeywords.length > 0) {
    const hasKeyword = options.targetKeywords.some((kw) => {
      const trimmedKw = kw.trim();
      if (!trimmedKw) return true;
      const normalizedSms = cleanedRaw.replace(/\s+/g, '');
      const normalizedKw = trimmedKw.replace(/\s+/g, '');
      return normalizedSms.includes(normalizedKw);
    });

    if (!hasKeyword) {
      return {
        ...emptyResult,
        filterFailReason: `키워드(${options.targetKeywords.join(', ')}) 불일치`,
      };
    }
  }

  // 2. 전처리: [Web발신] 및 누적 금액 제거
  const body = cleanedRaw
    .replace(/\[(?:Web|웹|국외)발신\]/gi, ' ')
    .replace(/누적\s*:?\s*[\d,]+\s*원?/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();

  const isCancel = /취소/.test(body);

  // 3. 금액 추출 ("6,600원" -> 6600)
  const amountMatch = body.match(/([+-]?[\d,]+)\s*원/);
  if (!amountMatch) {
    return {
      ...emptyResult,
      isMatchedFilter: true,
      filterFailReason: '금액(~원)을 찾을 수 없습니다.',
    };
  }

  const parsedNumber = parseInt(amountMatch[1].replace(/,/g, ''), 10);
  if (isNaN(parsedNumber)) {
    return {
      ...emptyResult,
      isMatchedFilter: true,
      filterFailReason: '금액 변환 실패',
    };
  }
  const finalAmount = isCancel && parsedNumber > 0 ? -parsedNumber : parsedNumber;

  // 4. 일시 추출 ("10/10 19:30")
  const dateTimeRegex = /(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])(?!\d)(?:\s+([012]?\d:[0-5]\d))?/;
  const dateMatch = body.match(dateTimeRegex);

  let monthStr = '';
  let dayStr = '';
  let timeStr = '00:00';

  if (dateMatch) {
    monthStr = dateMatch[1].padStart(2, '0');
    dayStr = dateMatch[2].padStart(2, '0');
    timeStr = dateMatch[3] ? dateMatch[3].padStart(5, '0') : '00:00';
  } else {
    const now = new Date();
    monthStr = String(now.getMonth() + 1).padStart(2, '0');
    dayStr = String(now.getDate()).padStart(2, '0');
    timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  const displayDate = `${monthStr}/${dayStr} ${timeStr}`;
  const fullDateTime = `${currentYear}-${monthStr}-${dayStr} ${timeStr}`;

  // 5. 사용처 추출 ("카페하루")
  let merchant = '';
  if (dateMatch && dateMatch.index !== undefined) {
    const afterDateText = body.slice(dateMatch.index + dateMatch[0].length).trim();
    const cleanedAfterDate = afterDateText
      .replace(/([+-]?[\d,]+)\s*원/g, ' ')
      .replace(/\b(?:일시불|할부|\d+개월|승인|취소|출금|체크)\b/g, ' ')
      .trim();

    if (cleanedAfterDate) {
      merchant = cleanedAfterDate;
    }
  }

  if (!merchant) {
    merchant = body
      .replace(/(?:하나|신한|국민|KB|우리|농협|NH|현대|삼성|롯데|BC|비씨|기업|IBK|카카오|토스)\s*\d*\s*(?:승인|취소|출금|체크)?/g, ' ')
      .replace(/[가-힣]\*[가-힣a-zA-Z0-9]+/g, ' ')
      .replace(/([+-]?[\d,]+)\s*원/g, ' ')
      .replace(dateTimeRegex, ' ')
      .replace(/\b(?:일시불|할부|\d+개월|승인|취소|출금|체크)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  merchant = merchant.replace(/\s+/g, ' ').trim() || '기타사용처';

  return {
    isValid: true,
    isMatchedFilter: true,
    dateTime: fullDateTime,
    displayDate,
    year: currentYear,
    amount: finalAmount,
    merchant,
    rawSms: cleanedRaw,
  };
}
