import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { env } from './lib/env.js';
import { authRouter } from './routes/auth.routes.js';
import { foldersRouter } from './routes/folders.routes.js';
import { projectsRouter } from './routes/projects.routes.js';
import { listsRouter } from './routes/lists.routes.js';
import { tasksRouter } from './routes/tasks.routes.js';
import { commentsRouter } from './routes/comments.routes.js';
import { attachmentsRouter } from './routes/attachments.routes.js';
import { fieldsRouter } from './routes/fields.routes.js';
import { statusesRouter } from './routes/statuses.routes.js';
import { searchRouter, savedSearchesRouter } from './routes/search.routes.js';
import { projectTemplatesRouter, taskTemplatesRouter } from './routes/templates.routes.js';
import { workspacesRouter } from './routes/workspaces.routes.js';
import { dependenciesRouter } from './routes/dependencies.routes.js';
import { relationsRouter } from './routes/relations.routes.js';
import { recurrenceRouter } from './routes/recurrence.routes.js';
import { timeEntriesRouter } from './routes/time-entries.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { docsRouter } from './routes/docs.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { automationsRouter } from './routes/automations.routes.js';
import { tagsRouter } from './routes/tags.routes.js';

export function createApp() {
  const app = express();

  // The Capacitor Android app serves its webview from https://localhost by default
  // (no server.androidScheme override in capacitor.config.ts), which is a fixed origin
  // distinct from the desktop dev server's origin — both need to be allowed.
  app.use(cors({ origin: [env.corsOrigin, 'https://localhost'], credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use('/uploads', express.static(path.resolve(env.uploadsDir)));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/workspaces', workspacesRouter);
  app.use('/api/v1/folders', foldersRouter);
  app.use('/api/v1/projects', projectsRouter);
  app.use('/api/v1/lists', listsRouter);
  app.use('/api/v1/tasks', tasksRouter);
  app.use('/api/v1/comments', commentsRouter);
  app.use('/api/v1/attachments', attachmentsRouter);
  app.use('/api/v1/fields', fieldsRouter);
  app.use('/api/v1/statuses', statusesRouter);
  app.use('/api/v1/search', searchRouter);
  app.use('/api/v1/saved-searches', savedSearchesRouter);
  app.use('/api/v1/project-templates', projectTemplatesRouter);
  app.use('/api/v1/task-templates', taskTemplatesRouter);
  app.use('/api/v1/dependencies', dependenciesRouter);
  app.use('/api/v1/relations', relationsRouter);
  app.use('/api/v1/recurrence', recurrenceRouter);
  app.use('/api/v1/time-entries', timeEntriesRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/docs', docsRouter);
  app.use('/api/v1/public', publicRouter);
  app.use('/api/v1/automations', automationsRouter);
  app.use('/api/v1/tags', tagsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
  });

  return app;
}
