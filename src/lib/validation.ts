import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Enter a real calendar date.");

const webAddress = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Enter a valid HTTP or HTTPS address.");

export const applicationSchema = z.object({
  company: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(160),
  location: z.string().trim().max(160).optional().default(""),
  url: webAddress.optional().default(""),
  statusId: z.string().trim().min(1).max(100),
  appliedAt: dateOnly,
});

export const applicationPatchSchema = applicationSchema.partial();
export const statusSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  isClosed: z.boolean().default(false),
});
export const statusPatchSchema = statusSchema.partial();
export const noteSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

const backupStatusSchema = z
  .object({
    id: z.string().max(100).optional(),
    name: z.string().max(100),
    color: z.string().max(20).optional(),
    isClosed: z.union([z.boolean(), z.number()]).optional(),
  })
  .passthrough();
const backupApplicationSchema = z
  .object({
    id: z.string().max(100).optional(),
    company: z.string().max(200),
    role: z.string().max(200),
    location: z.string().max(200).optional(),
    url: webAddress.optional(),
    statusId: z.string().max(100).optional(),
    statusName: z.string().max(100).optional(),
    appliedAt: z.string().max(40).optional(),
    createdAt: z.string().max(40).optional(),
    updatedAt: z.string().max(40).optional(),
  })
  .passthrough();
const backupEventSchema = z
  .object({
    applicationId: z.string().max(100),
    type: z.string().max(30),
    message: z.string().max(3000),
    createdAt: z.string().max(40).optional(),
  })
  .passthrough();
export const backupSchema = z
  .object({
    format: z.literal("applyledger"),
    version: z.literal(1),
    statuses: z.array(backupStatusSchema).max(200).default([]),
    applications: z.array(backupApplicationSchema).max(50000),
    events: z.array(backupEventSchema).max(500000).default([]),
  })
  .passthrough();
