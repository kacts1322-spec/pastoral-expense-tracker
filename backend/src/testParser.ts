import { parseSingleSms, splitBulkSmsText } from './services/smsParser';

const sampleSms = `[Web발신]
하나7693승인 김*욱 6,600원 일시불 10/10 19:30  카페하루`;

console.log('--- 1. 사용자 실제 문자 파싱 테스트 ---');
const result = parseSingleSms(sampleSms, {
  targetKeywords: ['하나7693'],
  referenceYear: 2026,
});
console.log(result);

if (
  !result.isValid ||
  !result.isMatchedFilter ||
  result.amount !== 6600 ||
  result.displayDate !== '10/10 19:30' ||
  result.merchant !== '카페하루'
) {
  console.error('❌ 파싱 실패!');
  process.exit(1);
}
console.log('✅ 테스트 1 통과: 금액(6600), 일시(10/10 19:30), 사용처(카페하루) 정확히 추출됨!');

console.log('\n--- 2. 다중 문자 일괄 붙여넣기 분리 및 파싱 테스트 ---');
const bulkSample = `[Web발신]
하나7693승인 김*욱 6,600원 일시불 10/10 19:30  카페하루
[Web발신]
하나7693승인 김*욱 34,000원 일시불 10/12 12:15  한촌설렁탕 누적 450,000원
[Web발신]
신한1234승인 김*욱 15,000원 일시불 10/14 10:00  스타벅스`;

const chunks = splitBulkSmsText(bulkSample);
console.log(`분리된 문자 수: ${chunks.length}건`);
for (const chunk of chunks) {
  const parsed = parseSingleSms(chunk, {
    targetKeywords: ['하나7693'],
    referenceYear: 2026,
  });
  console.log({
    isMatchedFilter: parsed.isMatchedFilter,
    displayDate: parsed.displayDate,
    merchant: parsed.merchant,
    amount: parsed.amount,
    reason: parsed.filterFailReason,
  });
}
