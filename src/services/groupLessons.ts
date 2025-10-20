import { FilterQuery, Types } from "mongoose";
import Lesson, { LessonDoc } from "../models/Lesson";
import Group from "../models/Group";

export type GroupLike = {
  _id: Types.ObjectId | string;
  memberIds?: Array<Types.ObjectId | string>;
};

export type FetchGroupLessonsParams = {
  group: GroupLike;
  match?: FilterQuery<LessonDoc>;
  limitToMembers?: Array<Types.ObjectId | string>;
};

function toObjectIds(values?: Array<Types.ObjectId | string>): Types.ObjectId[] {
  if (!values) return [];
  return values.map((val) => (val instanceof Types.ObjectId ? val : new Types.ObjectId(val)));
}

export async function fetchGroupLessonsForGroup({
  group,
  match,
  limitToMembers,
}: FetchGroupLessonsParams) {
  const groupId = group._id instanceof Types.ObjectId ? group._id : new Types.ObjectId(group._id);
  const memberIds = toObjectIds(group.memberIds);
  const scopedMemberIds = limitToMembers ? toObjectIds(limitToMembers) : memberIds;

  const filter: FilterQuery<LessonDoc> = {
    type: "group",
    ...(match ?? {}),
  };

  const hasGroupConstraint = filter.groupId !== undefined || filter.$or !== undefined;
  if (!hasGroupConstraint) {
    const orClauses: FilterQuery<LessonDoc>[] = [{ groupId }];
    if (scopedMemberIds.length > 0) {
      orClauses.push({
        groupId: { $exists: false },
        studentId: { $in: scopedMemberIds },
      });
    }
    if (orClauses.length === 1) {
      filter.groupId = groupId;
    } else {
      filter.$or = orClauses;
    }
  }

  if (scopedMemberIds.length > 0) {
    if (filter.studentId) {
      filter.$and = filter.$and ?? [];
      filter.$and.push({ studentId: { $in: scopedMemberIds } });
    } else {
      filter.studentId = { $in: scopedMemberIds };
    }
  }

  const lessons = await Lesson.find(filter).lean();

  const missing = lessons.filter((l) => !l.groupId && l.studentId);
  if (missing.length > 0 && scopedMemberIds.length > 0) {
    const missingStudentIds = Array.from(new Set(missing.map((l) => String(l.studentId))));
    const otherGroups = await Group.find(
      {
        _id: { $ne: groupId },
        active: true,
        memberIds: { $in: missingStudentIds.map((id) => new Types.ObjectId(id)) },
      },
      { memberIds: 1 }
    ).lean();

    const conflictStudentIds = new Set<string>();
    for (const g of otherGroups) {
      for (const id of (g.memberIds as any[]) ?? []) {
        conflictStudentIds.add(String(id));
      }
    }

    const assignableIds = missing
      .filter((l) => !conflictStudentIds.has(String(l.studentId)))
      .map((l) => l._id)
      .filter(Boolean);

    if (assignableIds.length > 0) {
      await Lesson.updateMany({ _id: { $in: assignableIds } }, { $set: { groupId } });
      const allowed = new Set(assignableIds.map((id: any) => String(id)));
      for (const lesson of lessons) {
        if (!lesson.groupId && allowed.has(String(lesson._id))) {
          (lesson as any).groupId = groupId;
        }
      }
    }
  }

  return lessons;
}
