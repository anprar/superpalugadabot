import { refreshInbox } from './src/scraper.js';

(async () => {
  try {
    const existingMailbox = {
      email: 'toiziar@mediaholy.com',
      code: '',
      domain: 'mediaholy.com',
      origin: 'imported',
      password: 'test',
      sourceUrl: 'https://mailticking.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any;

    console.log("Starting refreshInbox...");
    const result = await refreshInbox(existingMailbox);
    console.log("Result:", JSON.stringify(result.inboxCache, null, 2));
  } catch (error) {
    console.error("Error:", error);
  }
})();
