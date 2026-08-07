import { createApp } from './app.js';
import { env } from './lib/env.js';
import { startRecurrenceScheduler } from './services/recurrence.service.js';
import { startDueSoonScheduler } from './services/notification.service.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`Shadow Tasks API listening on http://localhost:${env.port}`);
});

startRecurrenceScheduler();
startDueSoonScheduler();
