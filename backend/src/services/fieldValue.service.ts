import { z } from 'zod';
import type { FieldType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * Builds a zod schema for a custom field's *value* based on its type (and, for
 * dropdown/multi_select, its current `options`). Used both to validate incoming
 * writes and to keep the set of "what does a valid value look like" rules in one
 * place instead of scattered across routes.
 */
export function valueSchemaForField(type: FieldType, options: unknown) {
  const optionList = Array.isArray(options) ? (options as string[]) : [];

  switch (type) {
    case 'text':
      return z.string().max(2000);
    case 'number':
    case 'currency':
      return z.number().finite();
    case 'email':
      return z.string().email();
    case 'phone':
      return z.string().min(1).max(40);
    case 'url':
      return z.string().url();
    case 'rating':
      return z.number().int().min(1).max(5);
    case 'checkbox':
      return z.boolean();
    case 'date':
      return z.string().datetime();
    case 'dropdown':
      return optionList.length > 0 ? z.enum(optionList as [string, ...string[]]) : z.string();
    case 'multi_select':
      return optionList.length > 0
        ? z.array(z.enum(optionList as [string, ...string[]]))
        : z.array(z.string());
    default:
      return z.unknown();
  }
}

export const FIELD_TYPES: FieldType[] = [
  'text',
  'number',
  'email',
  'phone',
  'currency',
  'rating',
  'checkbox',
  'dropdown',
  'multi_select',
  'date',
  'url',
];

/**
 * Every custom field defined on the task's project, joined with this task's value
 * for it (or null if unset). Always returns the full set of applicable fields so
 * the UI has a stable list to render, rather than only fields someone has touched.
 */
export async function getCustomFieldsForTask(taskId: string, projectId: string) {
  const [definitions, values] = await Promise.all([
    prisma.customFieldDefinition.findMany({ where: { projectId }, orderBy: { position: 'asc' } }),
    prisma.customFieldValue.findMany({ where: { taskId } }),
  ]);
  const valueByFieldId = new Map(values.map((v) => [v.fieldId, v.value]));
  return definitions.map((def) => ({
    id: def.id,
    name: def.name,
    type: def.type,
    options: def.options,
    value: valueByFieldId.get(def.id) ?? null,
  }));
}
