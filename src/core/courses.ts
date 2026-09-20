// Courses: the files-and-validation half. Rows live in db.ts; this module owns the directory
// under ~/.devcoach/courses/<id>/, the one document each course keeps there (index.html), and
// every check that keeps a model-written path or file from doing harm.
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  COURSE_DOCUMENT_NAME,
  COURSES_DIR,
  deleteCourseRows,
  getCourseRow,
  getCourseSteps,
  hasActiveCourse as hasActiveCourseRow,
  insertCourse,
  insertCourseStep,
  listCourseRows,
  MAX_COURSE_DOCUMENT_BYTES,
  shiftCourseStepsFrom,
  touchCourse,
  updateCourseStatus,
  updateCourseStepStatus,
  withTransaction,
} from "./db";
import type {
  Course,
  CourseStatus,
  CourseStep,
  CourseStepKind,
  CourseStepStatus,
  CourseWithSteps,
  Prerequisite,
} from "./models";
import { slugify } from "./share";

export const COURSE_ID_RE = /^[a-z0-9-]+$/;
export const DOCUMENT_NAME = COURSE_DOCUMENT_NAME;

export class CourseError extends Error {}

function assertId(id: string): void {
  if (!COURSE_ID_RE.test(id)) throw new CourseError(`Invalid course id '${id}'`);
}

/** The course's directory — only ever built from a validated id, so it cannot escape COURSES_DIR. */
export function courseDir(id: string): string {
  assertId(id);
  return join(COURSES_DIR, id);
}

export function documentPath(id: string): string {
  return join(courseDir(id), DOCUMENT_NAME);
}

/**
 * The validated path of the course document, or null when there is none worth serving: it must
 * sit under the course directory, be a regular file (never a symlink — the file is re-checked on
 * every read because a registered document can be swapped later) and stay within the size cap.
 */
export function courseDocument(id: string): string | null {
  const path = documentPath(id);
  if (!path.startsWith(courseDir(id) + sep)) return null;
  try {
    const st = lstatSync(path);
    if (!st.isFile() || st.size > MAX_COURSE_DOCUMENT_BYTES) return null;
    return path;
  } catch {
    return null;
  }
}

function uniqueId(db: DatabaseSync, title: string): string {
  const base = slugify(title, "course");
  let id = base;
  for (let n = 2; getCourseRow(db, id) !== null || existsSync(join(COURSES_DIR, id)); n++) {
    id = `${base}-${n}`;
  }
  return id;
}

export interface NewCourse {
  title: string;
  topic_id: string;
  goal?: string | null;
  lesson_id?: string | null;
  prerequisites?: Prerequisite[];
}

export function createCourse(db: DatabaseSync, input: NewCourse): CourseWithSteps {
  const now = new Date().toISOString();
  const course: Course = {
    id: uniqueId(db, input.title),
    lesson_id: input.lesson_id ?? null,
    topic_id: input.topic_id,
    title: input.title,
    goal: input.goal ?? null,
    prerequisites: input.prerequisites ?? [],
    status: "active",
    created_at: now,
    updated_at: now,
    completed_at: null,
  };
  insertCourse(db, course);
  mkdirSync(courseDir(course.id), { recursive: true });
  return { ...course, steps: [] };
}

export function getCourse(db: DatabaseSync, id: string): CourseWithSteps | null {
  if (!COURSE_ID_RE.test(id)) return null;
  const course = getCourseRow(db, id);
  return course ? { ...course, steps: getCourseSteps(db, id) } : null;
}

export function listCourses(
  db: DatabaseSync,
  f: { status?: string | null; lesson_id?: string | null } = {},
): CourseWithSteps[] {
  return listCourseRows(db, f).map((c) => ({ ...c, steps: getCourseSteps(db, c.id) }));
}

export interface NewStep {
  title: string;
  kind: CourseStepKind;
  anchor: string;
  /** Insert after this step (0 = first); omitted = append. */
  after?: number | null;
}

/**
 * Registers the next step. The document must already exist and contain `id="<anchor>"`: the
 * steps are an index over sections the AI has actually written, never promises.
 */
export function addStep(db: DatabaseSync, courseId: string, input: NewStep): CourseStep {
  // Everything inside the write transaction (BEGIN IMMEDIATE): the snapshot the checks read is
  // the one the insert lands on, so two writers cannot both pass the anchor check. The unique
  // index on (course_id, anchor) is the backstop.
  return withTransaction(db, () => {
    const course = getCourse(db, courseId);
    if (!course) throw new CourseError(`Course '${courseId}' not found`);
    const count = course.steps.length;
    const after = input.after ?? count;
    if (!Number.isInteger(after) || after < 0 || after > count) {
      throw new CourseError(
        `'after' must be between 0 and ${count} (the course has ${count} steps)`,
      );
    }
    const doc = courseDocument(courseId);
    if (!doc) {
      throw new CourseError(
        `Course '${courseId}' has no document yet — write ${documentPath(courseId)} first`,
      );
    }
    const html = readFileSync(doc, "utf8");
    // A real attribute boundary (whitespace before `id=`), not `data-id=` or `xml:id=`.
    if (!new RegExp(`\\sid=["']${input.anchor}["']`).test(html)) {
      throw new CourseError(`No element with id="${input.anchor}" in ${doc}`);
    }
    if (course.steps.some((s) => s.anchor === input.anchor)) {
      throw new CourseError(`Step anchor '${input.anchor}' is already registered`);
    }
    const step: CourseStep = {
      course_id: courseId,
      position: after + 1,
      title: input.title,
      kind: input.kind,
      anchor: input.anchor,
      status: "todo",
      done_at: null,
    };
    if (after < count) shiftCourseStepsFrom(db, courseId, after + 1);
    insertCourseStep(db, step);
    touchCourse(db, courseId, new Date().toISOString());
    return step;
  });
}

/** A step's status; the course completes itself once every step is done or skipped. */
export function setStepStatus(
  db: DatabaseSync,
  courseId: string,
  position: number,
  status: CourseStepStatus,
): CourseWithSteps | null {
  const now = new Date().toISOString();
  return withTransaction(db, () => {
    const ok = updateCourseStepStatus(
      db,
      courseId,
      position,
      status,
      status === "done" ? now : null,
    );
    if (!ok) return null;
    const steps = getCourseSteps(db, courseId);
    const finished = steps.length > 0 && steps.every((s) => s.status !== "todo");
    const course = getCourseRow(db, courseId);
    if (course && finished && course.status === "active") {
      updateCourseStatus(db, courseId, "completed", now);
    } else if (course && !finished && course.status === "completed") {
      updateCourseStatus(db, courseId, "active", now);
    } else {
      touchCourse(db, courseId, now);
    }
    return getCourse(db, courseId);
  });
}

export function setCourseStatus(
  db: DatabaseSync,
  courseId: string,
  status: CourseStatus,
): CourseWithSteps | null {
  if (!COURSE_ID_RE.test(courseId)) return null;
  return updateCourseStatus(db, courseId, status, new Date().toISOString())
    ? getCourse(db, courseId)
    : null;
}

/** Rows and directory go together; the directory is only ever the validated one. */
export function deleteCourse(db: DatabaseSync, courseId: string): boolean {
  if (!COURSE_ID_RE.test(courseId)) return false;
  const removed = deleteCourseRows(db, courseId);
  rmSync(courseDir(courseId), { recursive: true, force: true });
  return removed;
}

export function hasActiveCourse(db: DatabaseSync): boolean {
  return hasActiveCourseRow(db);
}

export function progress(course: CourseWithSteps): { done: number; total: number } {
  return {
    done: course.steps.filter((s) => s.status !== "todo").length,
    total: course.steps.length,
  };
}
