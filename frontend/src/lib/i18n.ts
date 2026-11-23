export type Lang = 'en' | 'bn';
// Coverage: navigation, core labels, statuses, report types, risk wording and disclaimers. Extend as the UI grows.
export const dict = {
  en: { overview: 'Overview', review: 'Evidence review', reports: 'Reports', map: 'Area map', volunteers: 'Volunteer network', myTasks: 'My tasks', integrity: 'Data integrity', telecom: 'Telecom ledger', analytics: 'Analytics', alerts: 'Community alerts', settings: 'Settings', simulator: 'Simulator (dev)',
    signIn: 'Sign in', signOut: 'Sign out', language: 'বাংলা', approve: 'Approve', reject: 'Reject', reopen: 'Reopen', verify: 'Verify', accept: 'Accept', decline: 'Decline', markCleaned: 'Mark cleaned', submit: 'Submit', loading: 'Loading...', empty: 'Nothing here yet. This is a genuine empty state.',
    reportHazard: 'Report a hazard', standing_water: 'Standing water', hotspot: 'Mosquito hotspot', drainage: 'Blocked drain', other: 'Other',
    NEW: 'Awaiting review', APPROVED: 'Approved', ASSIGNED: 'Assigned', ACCEPTED: 'Accepted', CLEANED: 'Cleaned', VERIFIED: 'Verified', REJECTED: 'Rejected', REOPENED: 'Reopened',
    estimate: 'Estimate only. Not a confirmed outbreak or breeding site.', awaiting: 'Your report is awaiting human review.' },
  bn: { overview: 'সারসংক্ষেপ', review: 'প্রমাণ পর্যালোচনা', reports: 'রিপোর্ট', map: 'এলাকার মানচিত্র', volunteers: 'স্বেচ্ছাসেবক নেটওয়ার্ক', myTasks: 'আমার কাজ', integrity: 'তথ্যের নির্ভরযোগ্যতা', telecom: 'টেলিকম খতিয়ান', analytics: 'বিশ্লেষণ', alerts: 'কমিউনিটি সতর্কতা', settings: 'সেটিংস', simulator: 'সিমুলেটর (ডেভ)',
    signIn: 'সাইন ইন', signOut: 'সাইন আউট', language: 'English', approve: 'অনুমোদন', reject: 'প্রত্যাখ্যান', reopen: 'পুনরায় খুলুন', verify: 'যাচাই', accept: 'গ্রহণ', decline: 'অস্বীকার', markCleaned: 'পরিষ্কার হয়েছে', submit: 'জমা দিন', loading: 'লোড হচ্ছে...', empty: 'এখনও কিছু নেই। এটি একটি প্রকৃত ফাঁকা অবস্থা।',
    reportHazard: 'ঝুঁকি রিপোর্ট করুন', standing_water: 'জমে থাকা পানি', hotspot: 'মশার প্রজননস্থল', drainage: 'বন্ধ নালা', other: 'অন্যান্য',
    NEW: 'পর্যালোচনার অপেক্ষায়', APPROVED: 'অনুমোদিত', ASSIGNED: 'নিয়োগ দেওয়া হয়েছে', ACCEPTED: 'গৃহীত', CLEANED: 'পরিষ্কার', VERIFIED: 'যাচাইকৃত', REJECTED: 'প্রত্যাখ্যাত', REOPENED: 'পুনরায় খোলা',
    estimate: 'শুধুমাত্র অনুমান। নিশ্চিত প্রাদুর্ভাব বা প্রজননস্থল নয়।', awaiting: 'আপনার রিপোর্ট মানব পর্যালোচনার অপেক্ষায় আছে।' },
} as const;
export type Key = keyof (typeof dict)['en'];
