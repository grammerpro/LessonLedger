export const plans = {
  starter: { name: 'Starter', price: 49, courses: 3, lessons: 100, checks: 4, minDays: 7 },
  studio: { name: 'Studio', price: 129, courses: 10, lessons: 500, checks: 16, minDays: 7 },
};
export const limits = {
  uploadBytes: 5 * 1024 * 1024,
  textChars: 180000,
  pdfPages: 80,
  segments: 300,
  checkLessons: 25,
  checkSegments: 100,
  sources: 8,
  sourceBytes: 2 * 1024 * 1024,
  excerptChars: 16000,
  lessonExcerptChars: 10000,
  modelCalls: 20,
  outputTokens: 2400,
  maxCheckUsd: 2,
};
