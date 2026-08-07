import dotenv from 'dotenv';
dotenv.config({ path: '.env.test', override: true });

import { beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';

beforeEach(async () => {
  await prisma.$transaction([
    prisma.activityLogEntry.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.task.deleteMany(),
    prisma.todoList.deleteMany(),
    prisma.project.deleteMany(),
    prisma.folder.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});
