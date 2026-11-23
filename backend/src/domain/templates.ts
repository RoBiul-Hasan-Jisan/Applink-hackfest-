// Bilingual SMS templates. Language is configurable per deployment: Bangla SMS encoding/segmentation is NOT
// verified with AppLink, so the default is English (see docs/APPLINK_OPEN_QUESTIONS.md #6).
export type Lang = 'en' | 'bn';
type Vars = Record<string, string | number>;
const T = {
  report_received: { en: 'DengueZero: Report {code} received. Reply STATUS {code} anytime. Reply STOP to end updates.', bn: 'DengueZero: রিপোর্ট {code} গৃহীত হয়েছে। অবস্থা জানতে STATUS {code} লিখুন। বন্ধ করতে STOP লিখুন।' },
  report_linked: { en: 'DengueZero: Report {code} received. It looks similar to an existing report and will be reviewed. Reply STOP to end updates.', bn: 'DengueZero: রিপোর্ট {code} গৃহীত হয়েছে। এটি একটি বিদ্যমান রিপোর্টের মতো মনে হচ্ছে, পর্যালোচনা করা হবে।' },
  volunteer_assigned: { en: 'DengueZero task {code}: {type} in {area}. {landmark}Reply ACCEPT {code} to take it.', bn: 'DengueZero কাজ {code}: {area} এলাকায় {type}। {landmark}নিতে ACCEPT {code} লিখুন।' },
  volunteer_reminder: { en: 'DengueZero reminder: task {code} is waiting. Reply ACCEPT {code} or ask your coordinator to reassign.', bn: 'DengueZero অনুস্মারক: কাজ {code} অপেক্ষায় আছে। ACCEPT {code} লিখুন।' },
  resolution_request: { en: 'DengueZero: Report {code} was cleaned and verified. Is it fixed? Reply 1 = Yes, 2 = No, still a problem.', bn: 'DengueZero: রিপোর্ট {code} পরিষ্কার ও যাচাই হয়েছে। সমাধান হয়েছে? ১ = হ্যাঁ, ২ = না।' },
  reopened_ack: { en: 'DengueZero: Report {code} reopened and escalated. We will update you.', bn: 'DengueZero: রিপোর্ট {code} পুনরায় খোলা ও জরুরি করা হয়েছে।' },
  confirmed_thanks: { en: 'DengueZero: Thank you. Report {code} marked resolved.', bn: 'DengueZero: ধন্যবাদ। রিপোর্ট {code} সমাধান হিসেবে চিহ্নিত।' },
  status: { en: 'DengueZero: {code} is {status}.', bn: 'DengueZero: {code} এর অবস্থা {status}।' },
  area_alert: { en: 'DengueZero alert {area}: estimated dengue risk {level} (estimate, not a confirmed outbreak). {tip} Reply STOP to opt out.', bn: 'DengueZero সতর্কতা {area}: ডেঙ্গু ঝুঁকির অনুমান {level} (অনুমান, নিশ্চিত প্রাদুর্ভাব নয়)। {tip} বন্ধ করতে STOP।' },
  opted_out: { en: 'DengueZero: You will no longer receive updates. Reports you made stay active.', bn: 'DengueZero: আপনি আর বার্তা পাবেন না।' },
  erased: { en: 'DengueZero: Your contact number, photos and message history were erased. Past reports remain only as anonymous records.', bn: 'DengueZero: আপনার নম্বর, ছবি ও বার্তার ইতিহাস মুছে ফেলা হয়েছে। পূর্বের রিপোর্ট নামহীন রেকর্ড হিসেবে থাকবে।' },
  not_recognised: { en: 'DengueZero: Command not recognised or not allowed for this number.', bn: 'DengueZero: কমান্ডটি চেনা যায়নি বা এই নম্বরের জন্য অনুমোদিত নয়।' },
  help: { en: 'DengueZero: To report: REPORT WATER <area> [landmark]. Types: WATER, HOTSPOT, DRAIN, OTHER. STOP ends updates; ERASE deletes your data.', bn: 'DengueZero: রিপোর্ট করতে: REPORT WATER <এলাকা>।' },
  area_not_found: { en: 'DengueZero: Area not recognised. Try: REPORT WATER <area name> [landmark].', bn: 'DengueZero: এলাকা চেনা যায়নি।' },
  daily_limit: { en: 'DengueZero: Daily report limit reached. Please try again tomorrow.', bn: 'DengueZero: আজকের রিপোর্ট সীমা পূর্ণ হয়েছে।' },
} as const;
export type TemplateName = keyof typeof T;
export function render(name: TemplateName, lang: Lang, vars: Vars = {}): string {
  return T[name][lang].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}
